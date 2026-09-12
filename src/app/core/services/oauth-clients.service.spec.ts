import { TestBed } from '@angular/core/testing';
import { OauthClientsService } from './oauth-clients.service';
import { GoogleOauthConfigService } from './google-oauth-config.service';
import { environment } from '../../../environments/environment';

/**
 * external-login-and-mail-config v1 §1.3 — `GET /api/auth/oauth-clients` is the only thing that
 * decides which external sign-in buttons exist (AC-7), so the rules that matter here are: one
 * request no matter how many callers ask, the server's answer wins even when it is empty, and the
 * environment fallback stays Google-only.
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
      lineLoginChannelId: '2001234567',
    });
    const service = TestBed.inject(OauthClientsService);

    await Promise.all([service.ensureLoaded(), service.ensureLoaded()]);
    await service.ensureLoaded();

    expect(calls.filter((p) => p === '/api/auth/oauth-clients')).toHaveLength(1);
  });

  it('exposes both client ids exactly as the API reported them', async () => {
    stubRoute('/api/auth/oauth-clients', {
      googleClientId: '  google-1.apps.googleusercontent.com  ',
      lineLoginChannelId: '  2001234567  ',
    });
    const service = TestBed.inject(OauthClientsService);

    await service.ensureLoaded();

    expect(service.googleClientId()).toBe('google-1.apps.googleusercontent.com');
    expect(service.lineLoginChannelId()).toBe('2001234567');
    expect(service.apiAnswered()).toBe(true);
  });

  it('treats an empty value from a server that answered as "not configured here"', async () => {
    stubRoute('/api/auth/oauth-clients', { googleClientId: '', lineLoginChannelId: '' });
    const service = TestBed.inject(OauthClientsService);
    const google = TestBed.inject(GoogleOauthConfigService);

    await service.ensureLoaded();

    expect(service.lineLoginChannelId()).toBe('');
    // D-08b: the environment carries a real-looking Google client id, and it must not override
    // a server that explicitly said it has no Google configuration.
    expect(google.getClientId()).toBe('');
  });

  it('treats a response without lineLoginChannelId as "LINE not configured here"', async () => {
    // external-login-and-mail-config v1 §3.1/§4.4 — the generated `PublicOAuthClientsResponse`
    // marks every field optional, so an older/partial payload must degrade to '' rather than
    // reach the UI as `undefined` and light up a LINE button that cannot finish its callback.
    stubRoute('/api/auth/oauth-clients', { googleClientId: 'google-1.apps.googleusercontent.com' });
    const service = TestBed.inject(OauthClientsService);

    await service.ensureLoaded();

    expect(service.lineLoginChannelId()).toBe('');
    expect(service.googleClientId()).toBe('google-1.apps.googleusercontent.com');
  });

  it('falls back to the environment for Google only when the API could not be reached', async () => {
    // no stub registered → the request fails with a 404 body the unwrapper throws on
    const service = TestBed.inject(OauthClientsService);
    const google = TestBed.inject(GoogleOauthConfigService);

    await service.ensureLoaded();

    expect(service.apiAnswered()).toBe(false);
    expect(google.getClientId()).toBe((environment.googleOAuthClientId ?? '').trim());
    // LINE has no fallback by design: a channel id without the server-side channel secret only
    // produces a button whose callback fails.
    expect(service.lineLoginChannelId()).toBe('');
  });
});
