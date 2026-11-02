import { TestBed } from '@angular/core/testing';
import { OauthClientsService } from './oauth-clients.service';
import { GoogleOauthConfigService } from './google-oauth-config.service';

/**
 * external-login-and-mail-config v1 §1.3 — `GET /api/auth/oauth-clients` is the only thing that
 * decides which external sign-in buttons exist (AC-7), so the rules that matter here are: one
 * request no matter how many callers ask, and the server's answer wins even when it is empty.
 *
 * oauth-scopes-from-env v1 AC-14/AC-18 — the scopes come from the same response, a provider is
 * only usable when the server sent both its id and its scopes, and there is no environment
 * fallback for Google any more.
 */

type Route = { status: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let calls: string[];

function stubRoute(path: string, body: unknown, status = 200): void {
  routes.set(path, { body, status });
}

beforeEach(() => {
  routes = new Map();
  calls = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url, 'http://localhost').pathname;
    calls.push(path);
    const route = routes.get(path);
    if (!route) {
      return new Response(JSON.stringify({ title: 'no stub', status: 404, statusCode: 404 }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(route.body), {
      status: route.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;

  TestBed.configureTestingModule({ providers: [] });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('OauthClientsService', () => {
  it('requests the endpoint only once no matter how often ensureLoaded() is called', async () => {
    stubRoute('/api/auth/oauth-clients', {
      googleClientId: 'google-1.apps.googleusercontent.com',
      googleScopes: 'openid email profile',
      lineLoginChannelId: '2001234567',
      lineLoginScopes: 'openid profile email',
    });
    const service = TestBed.inject(OauthClientsService);

    await Promise.all([service.ensureLoaded(), service.ensureLoaded()]);
    await service.ensureLoaded();

    expect(calls.filter((p) => p === '/api/auth/oauth-clients')).toHaveLength(1);
  });

  it('exposes both client ids and their scopes as the API reported them, trimmed', async () => {
    stubRoute('/api/auth/oauth-clients', {
      googleClientId: '  google-1.apps.googleusercontent.com  ',
      googleScopes: '  openid email  ',
      lineLoginChannelId: '  2001234567  ',
      lineLoginScopes: ' openid profile ',
    });
    const service = TestBed.inject(OauthClientsService);
    const google = TestBed.inject(GoogleOauthConfigService);

    await service.ensureLoaded();

    expect(service.googleClientId()).toBe('google-1.apps.googleusercontent.com');
    expect(service.googleScopes()).toBe('openid email');
    expect(service.lineLoginChannelId()).toBe('2001234567');
    expect(service.lineLoginScopes()).toBe('openid profile');
    expect(service.apiAnswered()).toBe(true);
    expect(google.getClientId()).toBe('google-1.apps.googleusercontent.com');
    expect(google.getScopes()).toBe('openid email');
  });

  it('treats an empty value from a server that answered as "not configured here"', async () => {
    stubRoute('/api/auth/oauth-clients', {
      googleClientId: '',
      googleScopes: '',
      lineLoginChannelId: '',
      lineLoginScopes: '',
    });
    const service = TestBed.inject(OauthClientsService);
    const google = TestBed.inject(GoogleOauthConfigService);

    await service.ensureLoaded();

    expect(service.lineLoginChannelId()).toBe('');
    expect(service.lineLoginScopes()).toBe('');
    expect(google.getClientId()).toBe('');
    expect(google.getScopes()).toBe('');
  });

  it('forces both ids to "" when an older backend sends no scope fields at all (AC-14)', async () => {
    stubRoute('/api/auth/oauth-clients', {
      googleClientId: 'google-1.apps.googleusercontent.com',
      lineLoginChannelId: '2001234567',
    });
    const service = TestBed.inject(OauthClientsService);

    await service.ensureLoaded();

    expect(service.apiAnswered()).toBe(true);
    expect(service.googleClientId()).toBe('');
    expect(service.googleScopes()).toBe('');
    expect(service.lineLoginChannelId()).toBe('');
    expect(service.lineLoginScopes()).toBe('');
  });

  it('applies the pair invariant per provider: blank scopes hide only that provider', async () => {
    stubRoute('/api/auth/oauth-clients', {
      googleClientId: 'google-1.apps.googleusercontent.com',
      googleScopes: '   ',
      lineLoginChannelId: '2001234567',
      lineLoginScopes: 'openid profile email',
    });
    const service = TestBed.inject(OauthClientsService);

    await service.ensureLoaded();

    expect(service.googleClientId()).toBe('');
    expect(service.googleScopes()).toBe('');
    expect(service.lineLoginChannelId()).toBe('2001234567');
    expect(service.lineLoginScopes()).toBe('openid profile email');
  });

  it('drops scopes that arrive without an id (AC-14)', async () => {
    stubRoute('/api/auth/oauth-clients', {
      googleClientId: '',
      googleScopes: 'openid email profile',
      lineLoginChannelId: '',
      lineLoginScopes: 'openid profile email',
    });
    const service = TestBed.inject(OauthClientsService);

    await service.ensureLoaded();

    expect(service.googleScopes()).toBe('');
    expect(service.lineLoginScopes()).toBe('');
  });

  it('treats a response without lineLoginChannelId as "LINE not configured here"', async () => {
    // external-login-and-mail-config v1 §3.1/§4.4 — the generated `PublicOAuthClientsResponse`
    // marks every field optional, so an older/partial payload must degrade to '' rather than
    // reach the UI as `undefined` and light up a LINE button that cannot finish its callback.
    stubRoute('/api/auth/oauth-clients', {
      googleClientId: 'google-1.apps.googleusercontent.com',
      googleScopes: 'openid email profile',
    });
    const service = TestBed.inject(OauthClientsService);

    await service.ensureLoaded();

    expect(service.lineLoginChannelId()).toBe('');
    expect(service.lineLoginScopes()).toBe('');
    expect(service.googleClientId()).toBe('google-1.apps.googleusercontent.com');
  });

  it('leaves Google unconfigured when the API could not be reached — no fallback (AC-18)', async () => {
    // no stub registered → the request fails with a 404 body the unwrapper throws on
    const service = TestBed.inject(OauthClientsService);
    const google = TestBed.inject(GoogleOauthConfigService);

    await service.ensureLoaded();

    expect(service.apiAnswered()).toBe(false);
    expect(google.getClientId()).toBe('');
    expect(google.getScopes()).toBe('');
    expect(service.lineLoginChannelId()).toBe('');
    expect(service.lineLoginScopes()).toBe('');
  });
});
