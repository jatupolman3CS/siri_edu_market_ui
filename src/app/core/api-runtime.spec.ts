import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `API_BASE_URL` is resolved once, when the module is first evaluated, so every case here
 * re-evaluates the module with `vi.resetModules()` and imports it again. The environment object
 * is imported *after* the reset and mutated before `api-runtime` pulls it in, which is how the
 * `environment.apiUrl` branch gets exercised without `vi.mock` on a relative import — the
 * Angular unit-test builder refuses those (see `core/services/auth.service.spec.ts`).
 *
 * What is under test is the removal of the API path base: the API answers at the origin root,
 * so nothing is appended to a resolved origin any more.
 */
type ApiRuntime = typeof import('./api-runtime');

async function loadApiRuntime(opts: {
  apiUrl: string;
  origin?: string | null;
  override?: string;
}): Promise<ApiRuntime> {
  vi.resetModules();
  vi.unstubAllGlobals();

  if (opts.origin === null) {
    vi.stubGlobal('location', undefined);
  } else if (opts.origin !== undefined) {
    vi.stubGlobal('location', { origin: opts.origin });
  }

  if (opts.override !== undefined) {
    vi.stubGlobal('__SIRIEDU_API_BASE_URL__', opts.override);
  }

  const envModule = await import('../../environments/environment');
  envModule.environment.apiUrl = opts.apiUrl;

  return await import('./api-runtime');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('defaultApiBaseUrl (AC-12)', () => {
  it('falls back to the app origin with no path base appended', async () => {
    const { API_BASE_URL } = await loadApiRuntime({ apiUrl: '', origin: 'https://x.test' });

    expect(API_BASE_URL).toBe('https://x.test');
  });

  it('falls back to http://localhost when there is no `location` (SSR / unit tests)', async () => {
    const { API_BASE_URL } = await loadApiRuntime({ apiUrl: '', origin: null });

    expect(API_BASE_URL).toBe('http://localhost');
  });

  it('prefers `environment.apiUrl` over the app origin and trims a trailing slash', async () => {
    const { API_BASE_URL } = await loadApiRuntime({
      apiUrl: 'http://localhost:5282/',
      origin: 'https://x.test',
    });

    expect(API_BASE_URL).toBe('http://localhost:5282');
  });

  it('still lets `window.__SIRIEDU_API_BASE_URL__` override a built bundle', async () => {
    const { API_BASE_URL } = await loadApiRuntime({
      apiUrl: 'http://localhost:5282',
      origin: 'https://x.test',
      override: 'https://runtime-override.test/',
    });

    expect(API_BASE_URL).toBe('https://runtime-override.test');
  });
});

describe('resolveApiUrl / resolvePublicUrl (AC-13)', () => {
  it('joins a relative API path onto the base URL', async () => {
    const { API_BASE_URL, resolveApiUrl } = await loadApiRuntime({
      apiUrl: 'http://localhost:5282',
    });

    expect(resolveApiUrl('/api/library/123/reviews')).toBe(
      `${API_BASE_URL}/api/library/123/reviews`,
    );
    expect(API_BASE_URL).toBe('http://localhost:5282');
  });

  it('prefixes a relative download URL with the base URL', async () => {
    const { API_BASE_URL, resolvePublicUrl } = await loadApiRuntime({
      apiUrl: 'http://localhost:5282',
    });

    expect(resolvePublicUrl('/api/files/download/a.jpg')).toBe(
      `${API_BASE_URL}/api/files/download/a.jpg`,
    );
  });

  it('returns an absolute URL untouched', async () => {
    const { resolvePublicUrl } = await loadApiRuntime({ apiUrl: 'http://localhost:5282' });

    expect(resolvePublicUrl('https://cdn.example.com/x.png')).toBe(
      'https://cdn.example.com/x.png',
    );
  });

  it('returns an empty string for null / undefined / blank', async () => {
    const { resolvePublicUrl } = await loadApiRuntime({ apiUrl: 'http://localhost:5282' });

    expect(resolvePublicUrl(null)).toBe('');
    expect(resolvePublicUrl(undefined)).toBe('');
    expect(resolvePublicUrl('   ')).toBe('');
  });
});
