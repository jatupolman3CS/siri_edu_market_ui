import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from './auth.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { GoogleOauthService } from './google-oauth.service';
import { GoogleOauthConfigService } from './google-oauth-config.service';

/**
 * Auth is a real JWT flow: a short-lived access token, a refresh token that rotates, and a
 * sign-out that has to revoke server-side. AUD-006 and AUD-007 are both in here — the refresh
 * token used to share storage with the access token, so sign-out sent the wrong one, and a
 * 401 used to end the session outright.
 *
 * These drive the real generated SDK against a stubbed `globalThis.fetch`; the builder does
 * not allow `vi.mock` on relative imports.
 */
const ACCESS_TOKEN_KEY = 'siriedu.auth.token';
const REFRESH_TOKEN_KEY = 'siriedu.auth.refresh';
const STORAGE_KEY = 'siriedu.auth';

/**
 * The test environment has no `localStorage`, which is why AuthService guards every use with
 * `typeof localStorage !== 'undefined'`. Where the tokens land is the point of AUD-007, so
 * stand up a real one rather than asserting around the guard.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; body: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

function loginBody(over: Partial<{ accessToken: string; refreshToken: string }> = {}) {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 'u-1', displayName: 'ครูสมชาย', email: 'teacher@example.com', role: 'Buyer' },
    ...over,
  };
}

function buildService(): AuthService {
  TestBed.configureTestingModule({
    providers: [
      AuthService,
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      { provide: NzMessageService, useValue: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } },
      { provide: Router, useValue: { navigate: vi.fn(), url: '/' } },
      { provide: GoogleOauthService, useValue: {} },
      { provide: GoogleOauthConfigService, useValue: { load: vi.fn() } },
    ],
  });

  return TestBed.inject(AuthService);
}

/** Lets fire-and-forget work (signOut's revoke call) reach the fetch stub. */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  localStorage.clear();
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname.replace('/SIRIEDUMARKET.Api', '');
    requests.push({
      method: request.method,
      path,
      body: await request.clone().text(),
    });

    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  localStorage.clear();
  TestBed.resetTestingModule();
});

describe('AuthService sign-in', () => {
  it('stores both tokens under separate keys after a successful login', async () => {
    stubRoute('POST', '/api/auth/login', loginBody());
    const auth = buildService();

    const res = await auth.signIn('teacher@example.com', 'secret123');

    expect(res.ok).toBe(true);
    expect(auth.isAuthenticated()).toBe(true);
    // AUD-007: separate keys. Sharing one is what made signOut send the wrong token.
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-1');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-1');
    expect(auth.accessToken()).toBe('access-1');
    expect(auth.refreshToken()).toBe('refresh-1');
  });

  it('exposes the signed-in user and role', async () => {
    stubRoute('POST', '/api/auth/login', loginBody());
    const auth = buildService();

    await auth.signIn('teacher@example.com', 'secret123');

    expect(auth.user()?.email).toBe('teacher@example.com');
    expect(auth.user()?.name).toBe('ครูสมชาย');
    expect(auth.role()).toBe('buyer');
    expect(auth.isAdmin()).toBe(false);
    expect(auth.isSeller()).toBe(false);
  });

  it('rejects empty credentials without calling the API', async () => {
    const auth = buildService();

    const res = await auth.signIn('', '');

    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(requests.filter((r) => r.path === '/api/auth/login')).toHaveLength(0);
  });

  it('rejects a too-short password without calling the API', async () => {
    const auth = buildService();

    const res = await auth.signIn('teacher@example.com', '123');

    expect(res.ok).toBe(false);
    expect(requests.filter((r) => r.path === '/api/auth/login')).toHaveLength(0);
  });

  it('leaves no session or token behind when the server rejects the login', async () => {
    stubRoute(
      'POST',
      '/api/auth/login',
      { title: 'Unauthorized', status: 401, statusCode: 401, message: 'bad', traceId: 't' },
      401,
    );
    const auth = buildService();

    const res = await auth.signIn('teacher@example.com', 'wrongpassword');

    expect(res.ok).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });
});

describe('AuthService refresh rotation', () => {
  async function signedIn(): Promise<AuthService> {
    stubRoute('POST', '/api/auth/login', loginBody());
    const auth = buildService();
    await auth.signIn('teacher@example.com', 'secret123');
    return auth;
  }

  it('AUD-006: rotates both tokens and returns the new access token', async () => {
    const auth = await signedIn();
    stubRoute('POST', '/api/auth/refresh', {
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });

    const token = await auth.refreshSession();

    expect(token).toBe('access-2');
    expect(auth.accessToken()).toBe('access-2');
    // Rotation means the old refresh token is replaced, not kept.
    expect(auth.refreshToken()).toBe('refresh-2');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-2');
  });

  it('sends the refresh token, not the access token', async () => {
    const auth = await signedIn();
    stubRoute('POST', '/api/auth/refresh', { accessToken: 'access-2', refreshToken: 'refresh-2' });

    await auth.refreshSession();

    const refreshCall = requests.find((r) => r.path === '/api/auth/refresh');
    expect(refreshCall?.body).toContain('refresh-1');
    expect(refreshCall?.body).not.toContain('access-1');
  });

  it('returns null without calling the API when there is no refresh token', async () => {
    const auth = buildService();

    expect(await auth.refreshSession()).toBeNull();
    expect(requests.filter((r) => r.path === '/api/auth/refresh')).toHaveLength(0);
  });

  it('drops the session when the refresh is refused', async () => {
    const auth = await signedIn();
    stubRoute(
      'POST',
      '/api/auth/refresh',
      { title: 'Unauthorized', status: 401, statusCode: 401, message: 'expired', traceId: 't' },
      401,
    );

    const token = await auth.refreshSession();

    expect(token).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.accessToken()).toBeNull();
    expect(auth.refreshToken()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('shares one in-flight request when several callers refresh at once', async () => {
    const auth = await signedIn();
    stubRoute('POST', '/api/auth/refresh', { accessToken: 'access-2', refreshToken: 'refresh-2' });

    const [a, b, c] = await Promise.all([
      auth.refreshSession(),
      auth.refreshSession(),
      auth.refreshSession(),
    ]);

    expect([a, b, c]).toEqual(['access-2', 'access-2', 'access-2']);
    // Three concurrent 401s must not burn three refresh tokens; rotation would invalidate
    // the ones that lost the race and end the session.
    expect(requests.filter((r) => r.path === '/api/auth/refresh')).toHaveLength(1);
  });

  it('allows a later refresh after an earlier one finished', async () => {
    const auth = await signedIn();
    stubRoute('POST', '/api/auth/refresh', { accessToken: 'access-2', refreshToken: 'refresh-2' });
    await auth.refreshSession();

    stubRoute('POST', '/api/auth/refresh', { accessToken: 'access-3', refreshToken: 'refresh-3' });
    expect(await auth.refreshSession()).toBe('access-3');
    expect(requests.filter((r) => r.path === '/api/auth/refresh')).toHaveLength(2);
  });
});

describe('AuthService sign-out', () => {
  it('AUD-007: revokes server-side with the refresh token and clears every key', async () => {
    stubRoute('POST', '/api/auth/login', loginBody());
    stubRoute('POST', '/api/auth/logout', {});
    const auth = buildService();
    await auth.signIn('teacher@example.com', 'secret123');

    auth.signOut();
    await settle();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.accessToken()).toBeNull();
    expect(auth.refreshToken()).toBeNull();
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    const logout = requests.find((r) => r.path === '/api/auth/logout');
    expect(logout?.body).toContain('refresh-1');
  });

  it('still clears local state when the server logout call fails', async () => {
    stubRoute('POST', '/api/auth/login', loginBody());
    stubRoute(
      'POST',
      '/api/auth/logout',
      { title: 'Server Error', status: 500, statusCode: 500, message: 'boom', traceId: 't' },
      500,
    );
    const auth = buildService();
    await auth.signIn('teacher@example.com', 'secret123');

    auth.signOut();
    await settle();

    // A server that cannot be reached must not leave the user apparently signed in.
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });

  it('does not call logout when there is no refresh token to revoke', () => {
    const auth = buildService();

    auth.signOut();

    expect(requests.filter((r) => r.path === '/api/auth/logout')).toHaveLength(0);
    expect(auth.isAuthenticated()).toBe(false);
  });
});

describe('AuthService session restore', () => {
  it('drops a stored session that has no access token beside it', () => {
    // A half-written localStorage would otherwise render a signed-in header over an
    // unauthenticated API, and every call would 401.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        user: { id: 'u-1', name: 'x', email: 'x@y.z', role: 'buyer', avatar: '', joinedAt: '' },
        provider: 'email',
        signedInAt: new Date().toISOString(),
      }),
    );

    const auth = buildService();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('restores a session when both the session and the access token are present', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        user: { id: 'u-1', name: 'ครูสมชาย', email: 'x@y.z', role: 'buyer', avatar: '', joinedAt: '' },
        provider: 'email',
        signedInAt: new Date().toISOString(),
      }),
    );

    const auth = buildService();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.name).toBe('ครูสมชาย');
  });
});

/**
 * Q-07 item 4: verify-email.page.ts already renders a friendly Thai `error` inline
 * ("ยืนยันอีเมลไม่สำเร็จ — ใช้ลิงก์ในอีเมลหรือรหัสที่ถูกต้อง"), so `verifyEmail()` must not *also*
 * push the raw backend ProblemDetails (English "Verification token is invalid or expired.")
 * through `ApiFailureReporter` as a duplicate toast.
 */
describe('AuthService verifyEmail — no raw-English toast (Q-07 item 4)', () => {
  function buildServiceWithApiFail(): { auth: AuthService; apiFail: { report: ReturnType<typeof vi.fn> } } {
    const apiFail = { report: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: ApiFailureReporter, useValue: apiFail },
        { provide: NzMessageService, useValue: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn(), url: '/' } },
        { provide: GoogleOauthService, useValue: {} },
        { provide: GoogleOauthConfigService, useValue: { load: vi.fn() } },
      ],
    });
    return { auth: TestBed.inject(AuthService), apiFail };
  }

  it('returns the friendly Thai error without reporting the raw backend detail', async () => {
    stubRoute(
      'POST',
      '/api/auth/verify-email',
      { title: 'Bad Request', detail: 'Verification token is invalid or expired.', status: 400 },
      400,
    );
    const { auth, apiFail } = buildServiceWithApiFail();

    const result = await auth.verifyEmail('bad-token');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('ยืนยันอีเมลไม่สำเร็จ — ใช้ลิงก์ในอีเมลหรือรหัสที่ถูกต้อง');
    expect(apiFail.report).not.toHaveBeenCalled();
  });
});
