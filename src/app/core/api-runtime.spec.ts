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

  it('converts an R2 URL to an API download URL', async () => {
    const { API_BASE_URL, resolvePublicUrl } = await loadApiRuntime({
      apiUrl: 'http://localhost:5282',
    });

    const r2Url = 'https://acc123.r2.cloudflarestorage.com/siriedumarket/docs/orig.pdf?X-Amz-Signature=123';
    expect(resolvePublicUrl(r2Url)).toBe(
      `${API_BASE_URL}/api/files/download/docs/orig.pdf`,
    );
  });

  it('converts an R2 custom/dev domain URL to an API download URL', async () => {
    const { API_BASE_URL, resolvePublicUrl } = await loadApiRuntime({
      apiUrl: 'http://localhost:5282',
    });

    const r2Url = 'https://pub-abc.r2.dev/seller-1/doc.pdf';
    expect(resolvePublicUrl(r2Url)).toBe(
      `${API_BASE_URL}/api/files/download/doc.pdf`,
    );
  });

  it('resolves download URL with authentication token and filename', async () => {
    const { API_BASE_URL, resolveDownloadUrl } = await loadApiRuntime({
      apiUrl: 'http://localhost:5282',
    });

    const url = resolveDownloadUrl(
      '/api/files/download/docs/orig.pdf',
      'my.jwt.token',
      'myfile.pdf',
    );
    expect(url).toContain(`${API_BASE_URL}/api/files/download/docs/orig.pdf`);
    expect(url).toContain('token=my.jwt.token');
    expect(url).toContain('filename=myfile.pdf');
  });

  /**
   * Production incident: `Api:PublicBaseUrl` pointed at the *web* origin, so the API handed out
   * `https://siriedumarket.../api/files/download/<key>.jpg` — a host that serves only static
   * files and 404s every `/api/` path. Covers, gallery images and previews were blank for every
   * role while the very same objects answered 200 on the API host. The frontend knows where its
   * API is, so an `/api/...` URL from a foreign origin is re-pointed instead of shown broken.
   */
  describe('foreign-origin /api/ URLs', () => {
    it('re-points an absolute /api/ URL from another origin at the API base', async () => {
      const { API_BASE_URL, resolvePublicUrl } = await loadApiRuntime({
        apiUrl: 'https://api-siriedumarket.test',
      });

      expect(
        resolvePublicUrl('https://siriedumarket.test/api/files/download/covers/a.jpg'),
      ).toBe(`${API_BASE_URL}/api/files/download/covers/a.jpg`);
    });

    it('keeps the query string and hash of a re-pointed URL', async () => {
      const { API_BASE_URL, resolvePublicUrl } = await loadApiRuntime({
        apiUrl: 'https://api-siriedumarket.test',
      });

      expect(
        resolvePublicUrl('https://siriedumarket.test/api/files/download/a.jpg?v=2&inline=true#p1'),
      ).toBe(`${API_BASE_URL}/api/files/download/a.jpg?v=2&inline=true#p1`);
    });

    it('leaves an /api/ URL already on the API origin untouched (single-origin nginx deploy)', async () => {
      const { resolvePublicUrl } = await loadApiRuntime({ apiUrl: 'https://api-siriedumarket.test' });

      const sameOrigin = 'https://api-siriedumarket.test/api/files/download/covers/a.jpg';
      expect(resolvePublicUrl(sameOrigin)).toBe(sameOrigin);
    });

    it('leaves a non-/api/ absolute URL on a foreign origin untouched (CDN, external links)', async () => {
      const { resolvePublicUrl } = await loadApiRuntime({ apiUrl: 'https://api-siriedumarket.test' });

      expect(resolvePublicUrl('https://cdn.example.com/api-docs/x.png')).toBe(
        'https://cdn.example.com/api-docs/x.png',
      );
      expect(resolvePublicUrl('https://siriedumarket.test/assets/logo.svg')).toBe(
        'https://siriedumarket.test/assets/logo.svg',
      );
    });

    it('still resolves a relative /api/ path against the base URL', async () => {
      const { API_BASE_URL, resolvePublicUrl } = await loadApiRuntime({
        apiUrl: 'https://api-siriedumarket.test',
      });

      expect(resolvePublicUrl('/api/files/download/covers/a.jpg')).toBe(
        `${API_BASE_URL}/api/files/download/covers/a.jpg`,
      );
    });

    it('still sends a raw R2 URL down the resolveR2AssetUrl branch', async () => {
      const { API_BASE_URL, resolvePublicUrl } = await loadApiRuntime({
        apiUrl: 'https://api-siriedumarket.test',
      });

      expect(
        resolvePublicUrl('https://acc123.r2.cloudflarestorage.com/siriedumarket/docs/orig.pdf?X-Amz-Signature=1'),
      ).toBe(`${API_BASE_URL}/api/files/download/docs/orig.pdf`);
    });

    it('returns a malformed URL unchanged instead of throwing', async () => {
      const { resolvePublicUrl } = await loadApiRuntime({ apiUrl: 'https://api-siriedumarket.test' });

      expect(() => resolvePublicUrl('https://')).not.toThrow();
      expect(resolvePublicUrl('https://')).toBe('https://');
      expect(resolvePublicUrl('http://[oops/api/files/download/a.jpg')).toBe(
        'http://[oops/api/files/download/a.jpg',
      );
    });

    it('never re-points when the base URL is the blind fallback (no window, no apiUrl)', async () => {
      const { API_BASE_URL, resolvePublicUrl } = await loadApiRuntime({ apiUrl: '', origin: null });

      expect(API_BASE_URL).toBe('http://localhost');
      // Nothing said where the API is, so `http://localhost` is a guess — rewriting a perfectly
      // good production URL onto it would be strictly worse than leaving it alone.
      const absolute = 'https://siriedumarket.test/api/files/download/covers/a.jpg';
      expect(resolvePublicUrl(absolute)).toBe(absolute);
    });

    it('resolveDownloadUrl inherits the repair and still appends the token', async () => {
      const { API_BASE_URL, resolveDownloadUrl } = await loadApiRuntime({
        apiUrl: 'https://api-siriedumarket.test',
      });

      const url = resolveDownloadUrl(
        'https://siriedumarket.test/api/files/download/docs/orig.pdf',
        'my.jwt.token',
      );
      expect(url).toContain(`${API_BASE_URL}/api/files/download/docs/orig.pdf`);
      // The web origin is a prefix-free check: `api-siriedumarket.test` contains the web host
      // as a substring, so assert on where the URL actually points instead.
      expect(url.startsWith('https://siriedumarket.test/')).toBe(false);
      expect(url).toContain('token=my.jwt.token');
    });
  });

  it('resolves download URL from an R2 presigned URL with token attached', async () => {
    const { API_BASE_URL, resolveDownloadUrl } = await loadApiRuntime({
      apiUrl: 'http://localhost:5282',
    });

    const r2Url = 'https://acc123.r2.cloudflarestorage.com/siriedumarket/seller/2026/sheet.xlsx?X-Amz-Signature=xyz';
    const url = resolveDownloadUrl(r2Url, 'auth_token');
    expect(url).toContain(`${API_BASE_URL}/api/files/download/seller/2026/sheet.xlsx`);
    expect(url).toContain('token=auth_token');
  });
});

/**
 * BUG-04 regression: `sdk-auth-bridge.ts` must wire `setTokenRefresher` alongside
 * `setAuthTokenGetter`/`setUnauthorizedHandler`, or every 401 (e.g. from an expired
 * 15-minute access token) signs the user out instead of silently refreshing and
 * replaying the request. There is no Angular DI involved here — `setAuthTokenGetter`,
 * `setUnauthorizedHandler`, `setTokenRefresher` and `createClientConfig` are plain
 * module-level functions, so they are exercised directly against the custom fetch,
 * the same way the real SDK-generated `postApiXxx`/`getApiXxx` calls do.
 */
describe('createClientConfig 401 retry (BUG-04)', () => {
  it('refreshes an expiring JWT before the first request', async () => {
    const runtime = await loadApiRuntime({ apiUrl: 'http://localhost:5282' });
    const expiring = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 }))}.sig`;
    runtime.setAuthTokenGetter(() => expiring);
    const refresher = vi.fn().mockResolvedValue('fresh-token');
    runtime.setTokenRefresher(refresher);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await runtime.createClientConfig().fetch!('http://localhost:5282/api/library');

    expect(response.status).toBe(200);
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][0] as Request).headers.get('Authorization')).toBe('Bearer fresh-token');
  });

  it('does not refresh a JWT with more than two minutes remaining', async () => {
    const runtime = await loadApiRuntime({ apiUrl: 'http://localhost:5282' });
    const valid = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.sig`;
    runtime.setAuthTokenGetter(() => valid);
    const refresher = vi.fn();
    runtime.setTokenRefresher(refresher);
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await runtime.createClientConfig().fetch!('http://localhost:5282/api/library');

    expect(refresher).not.toHaveBeenCalled();
  });

  it('refreshes the token once and replays the request instead of signing the user out', async () => {
    const runtime = await loadApiRuntime({ apiUrl: 'http://localhost:5282' });
    runtime.setAuthTokenGetter(() => 'stale-token');
    const unauthorizedHandler = vi.fn();
    runtime.setUnauthorizedHandler(unauthorizedHandler);
    const refresher = vi.fn().mockResolvedValue('fresh-token');
    runtime.setTokenRefresher(refresher);

    const responses = [new Response(null, { status: 401 }), new Response(null, { status: 200 })];
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(responses.shift() as Response),
    );
    vi.stubGlobal('fetch', fetchMock);

    const config = runtime.createClientConfig();
    const response = await config.fetch!('http://localhost:5282/api/library', { method: 'GET' });

    expect(response.status).toBe(200);
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(unauthorizedHandler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retriedRequest = fetchMock.mock.calls[1][0] as Request;
    expect(retriedRequest.headers.get('Authorization')).toBe('Bearer fresh-token');
  });

  it('signs the user out when the refresher cannot recover the session', async () => {
    const runtime = await loadApiRuntime({ apiUrl: 'http://localhost:5282' });
    runtime.setAuthTokenGetter(() => 'stale-token');
    const unauthorizedHandler = vi.fn();
    runtime.setUnauthorizedHandler(unauthorizedHandler);
    const refresher = vi.fn().mockResolvedValue(null);
    runtime.setTokenRefresher(refresher);

    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 401 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const config = runtime.createClientConfig();
    const response = await config.fetch!('http://localhost:5282/api/library', { method: 'GET' });

    expect(response.status).toBe(401);
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('always sends credentials: "include" so the anonymous cart/wishlist session cookie is sent/stored (anonymous-cart-wishlist-scoping)', async () => {
    const runtime = await loadApiRuntime({ apiUrl: 'http://localhost:5282' });
    runtime.setAuthTokenGetter(() => null);

    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const config = runtime.createClientConfig();
    await config.fetch!('http://localhost:5282/api/cart', { method: 'GET' });

    const sentRequest = fetchMock.mock.calls[0][0] as Request;
    expect(sentRequest.credentials).toBe('include');
  });

  it('does not attempt a refresh when no token was sent (anonymous 401, e.g. D-11)', async () => {
    const runtime = await loadApiRuntime({ apiUrl: 'http://localhost:5282' });
    runtime.setAuthTokenGetter(() => null);
    const unauthorizedHandler = vi.fn();
    runtime.setUnauthorizedHandler(unauthorizedHandler);
    const refresher = vi.fn().mockResolvedValue('fresh-token');
    runtime.setTokenRefresher(refresher);

    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 401 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const config = runtime.createClientConfig();
    const response = await config.fetch!('http://localhost:5282/api/cart', { method: 'GET' });

    expect(response.status).toBe(401);
    expect(refresher).not.toHaveBeenCalled();
    expect(unauthorizedHandler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});


/**
 * admin-user-management §4.6 (ข) / AC-8b: this is where the ban actually reaches the user.
 * Practically every API call in the app goes through this fetch, so a 403 saying the account was
 * suspended/banned has to end the session here — without refreshing, without eating the response
 * body the caller still needs, and without touching any other kind of 403.
 */
describe('createClientConfig 403 account restricted (AC-8b)', () => {
  function restrictedResponse(code = 'account_banned'): Response {
    return new Response(
      JSON.stringify({
        status: 403,
        statusCode: 403,
        code,
        detail: 'บัญชีนี้ถูกระงับการใช้งานถาวร กรุณาติดต่อผู้ดูแลระบบ',
      }),
      { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
    );
  }

  async function armedRuntime(): Promise<{
    runtime: ApiRuntime;
    restricted: ReturnType<typeof vi.fn>;
    unauthorized: ReturnType<typeof vi.fn>;
    refresher: ReturnType<typeof vi.fn>;
  }> {
    const runtime = await loadApiRuntime({ apiUrl: 'http://localhost:5282' });
    runtime.setAuthTokenGetter(() => 'live-token');
    const restricted = vi.fn();
    const unauthorized = vi.fn();
    const refresher = vi.fn().mockResolvedValue('fresh-token');
    runtime.setAccountRestrictedHandler(restricted);
    runtime.setUnauthorizedHandler(unauthorized);
    runtime.setTokenRefresher(refresher);
    return { runtime, restricted, unauthorized, refresher };
  }

  it('(i)(ii) notifies the account-restricted handler once with the server payload and never refreshes', async () => {
    const { runtime, restricted, unauthorized, refresher } = await armedRuntime();
    const fetchMock = vi.fn(() => Promise.resolve(restrictedResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const config = runtime.createClientConfig();
    const response = await config.fetch!('http://localhost:5282/api/cart', { method: 'GET' });

    expect(response.status).toBe(403);
    expect(restricted).toHaveBeenCalledTimes(1);
    expect(restricted.mock.calls[0][0]).toMatchObject({
      code: 'account_banned',
      detail: 'บัญชีนี้ถูกระงับการใช้งานถาวร กรุณาติดต่อผู้ดูแลระบบ',
    });
    // A banned user's refresh is refused too, so trying would only add a round trip and a
    // second failure; and the 401 path must not claim the session merely expired.
    expect(refresher).not.toHaveBeenCalled();
    expect(unauthorized).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('(iii) returns the response with its body still readable (proves response.clone())', async () => {
    const { runtime, restricted } = await armedRuntime();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(restrictedResponse('account_suspended'))),
    );

    const config = runtime.createClientConfig();
    const response = await config.fetch!('http://localhost:5282/api/cart', { method: 'GET' });

    // Reading the body here would throw "body stream already read" if the runtime had consumed
    // the original response instead of a clone — every service downstream depends on this.
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('account_suspended');
    expect(restricted).toHaveBeenCalledTimes(1);
  });

  it('(iv) leaves an ordinary 403 alone — other code, no code, or a non-JSON body', async () => {
    const { runtime, restricted } = await armedRuntime();
    const bodies = [
      // A buyer poking an admin-only route: forbidden, but the session is perfectly valid.
      new Response(JSON.stringify({ status: 403, code: 'seller_profile_required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/problem+json' },
      }),
      new Response(JSON.stringify({ status: 403, detail: 'ไม่มีสิทธิ์' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
      // A proxy answering 403 with an HTML error page.
      new Response('<html>403 Forbidden</html>', {
        status: 403,
        headers: { 'Content-Type': 'text/html' },
      }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(bodies.shift() as Response)),
    );

    const config = runtime.createClientConfig();
    for (let i = 0; i < 3; i++) {
      const response = await config.fetch!('http://localhost:5282/api/admin/users', { method: 'GET' });
      expect(response.status).toBe(403);
    }

    expect(restricted).not.toHaveBeenCalled();
  });

  it('leaves a 403 from an auth endpoint to the page that made the call', async () => {
    const { runtime, restricted } = await armedRuntime();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(restrictedResponse())),
    );

    const config = runtime.createClientConfig();
    // The login page shows the reason itself; redirecting to /auth/login from /auth/login and
    // toasting on top of the form is strictly worse.
    await config.fetch!('http://localhost:5282/api/auth/login', { method: 'POST' });

    expect(restricted).not.toHaveBeenCalled();
  });

  it('also catches a ban that lands between the first call and the replayed one', async () => {
    const { runtime, restricted, refresher } = await armedRuntime();
    const responses = [new Response(null, { status: 401 }), restrictedResponse()];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(responses.shift() as Response)),
    );

    const config = runtime.createClientConfig();
    const response = await config.fetch!('http://localhost:5282/api/cart', { method: 'GET' });

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(403);
    expect(restricted).toHaveBeenCalledTimes(1);
  });

  it('is a silent no-op when nothing registered a handler (unit tests / SSR)', async () => {
    const runtime = await loadApiRuntime({ apiUrl: 'http://localhost:5282' });
    runtime.setAuthTokenGetter(() => 'live-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(restrictedResponse())),
    );

    const config = runtime.createClientConfig();
    const response = await config.fetch!('http://localhost:5282/api/cart', { method: 'GET' });

    expect(response.status).toBe(403);
  });
});
