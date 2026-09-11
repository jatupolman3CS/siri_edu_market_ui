import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from './auth.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { GoogleOauthService } from './google-oauth.service';
import { GoogleOauthConfigService } from './google-oauth-config.service';
import { CartService } from './cart.service';
import { WishlistService } from './wishlist.service';

const ACCESS_TOKEN_KEY = 'siriedu.auth.token';
const REFRESH_TOKEN_KEY = 'siriedu.auth.refresh';
const STORAGE_KEY = 'siriedu.auth';

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

function loginBody(
  over: Partial<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; displayName: string; email: string; role: string; roles?: string[] };
  }> = {},
) {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 'u-1', displayName: 'x', email: 'teacher@example.com', role: 'Buyer' },
    ...over,
  };
}

function cartWishlistNoopProviders() {
  return [
    { provide: CartService, useValue: { loadCart: vi.fn() } },
    { provide: WishlistService, useValue: { refresh: vi.fn().mockResolvedValue(undefined) } },
  ];
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
      ...cartWishlistNoopProviders(),
    ],
  });

  return TestBed.inject(AuthService);
}

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
    const path = new URL(request.url).pathname;
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
        user: { id: 'u-1', name: 'x', email: 'x@y.z', role: 'buyer', avatar: '', joinedAt: '' },
        provider: 'email',
        signedInAt: new Date().toISOString(),
      }),
    );

    const auth = buildService();

    expect(auth.isAuthenticated()).toBe(true);
  });
});

describe('AuthService verifyEmail Q07', () => {
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
        ...cartWishlistNoopProviders(),
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
    expect(apiFail.report).not.toHaveBeenCalled();
  });
});

describe('AuthService reloads cart wishlist after sign-in AC17', () => {
  function buildServiceWithCartWishlistSpies(): {
    auth: AuthService;
    cart: { loadCart: ReturnType<typeof vi.fn> };
    wishlist: { refresh: ReturnType<typeof vi.fn> };
  } {
    const cart = { loadCart: vi.fn() };
    const wishlist = { refresh: vi.fn().mockResolvedValue(undefined) };
    const googleOauth = {
      requestAuthorizationCode: vi
        .fn()
        .mockResolvedValue({ code: 'auth-code', redirectUri: 'https://x.test/callback' }),
    };
    const googleOauthConfig = {
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      getClientId: vi.fn().mockReturnValue('client-id'),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
        { provide: NzMessageService, useValue: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn(), url: '/' } },
        { provide: GoogleOauthService, useValue: googleOauth },
        { provide: GoogleOauthConfigService, useValue: googleOauthConfig },
        { provide: CartService, useValue: cart },
        { provide: WishlistService, useValue: wishlist },
      ],
    });

    return { auth: TestBed.inject(AuthService), cart, wishlist };
  }

  it('signIn reloads cart and wishlist after a successful login', async () => {
    stubRoute('POST', '/api/auth/login', loginBody());
    const { auth, cart, wishlist } = buildServiceWithCartWishlistSpies();

    const res = await auth.signIn('teacher@example.com', 'secret123');

    expect(res.ok).toBe(true);
    expect(cart.loadCart).toHaveBeenCalledTimes(1);
    expect(wishlist.refresh).toHaveBeenCalledTimes(1);
  });

  it('signIn does not reload cart wishlist when login fails', async () => {
    stubRoute(
      'POST',
      '/api/auth/login',
      { title: 'Unauthorized', status: 401, statusCode: 401, message: 'bad', traceId: 't' },
      401,
    );
    const { auth, cart, wishlist } = buildServiceWithCartWishlistSpies();

    const res = await auth.signIn('teacher@example.com', 'wrongpassword');

    expect(res.ok).toBe(false);
    expect(cart.loadCart).not.toHaveBeenCalled();
    expect(wishlist.refresh).not.toHaveBeenCalled();
  });

  it('verifyEmail reloads cart and wishlist after a successful verification', async () => {
    stubRoute('POST', '/api/auth/verify-email', loginBody());
    const { auth, cart, wishlist } = buildServiceWithCartWishlistSpies();

    const res = await auth.verifyEmail('good-token');

    expect(res.ok).toBe(true);
    expect(cart.loadCart).toHaveBeenCalledTimes(1);
    expect(wishlist.refresh).toHaveBeenCalledTimes(1);
  });

  it('signInWithProvider google reloads cart and wishlist after a successful external sign-in', async () => {
    stubRoute('POST', '/api/auth/external/google', loginBody());
    const { auth, cart, wishlist } = buildServiceWithCartWishlistSpies();

    const res = await auth.signInWithProvider('google');

    expect(res.ok).toBe(true);
    expect(cart.loadCart).toHaveBeenCalledTimes(1);
    expect(wishlist.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService construction does not eagerly construct CartService/WishlistService (BUG-CART-401-RACE)', () => {
  /**
   * QA fix: `provideSdkAuthBridge`'s `APP_INITIALIZER` factory constructs `AuthService` (via
   * `inject(AuthService)`) *before* it calls `setAuthTokenGetter(...)`. `CartService` and
   * `WishlistService` each fire their first API call synchronously from their own constructor —
   * so if constructing `AuthService` had the side effect of constructing them too (as it used to,
   * via eager `inject()` fields), that first `GET /api/cart` / `GET /api/wishlist` would go out
   * with no Authorization header even for an already-signed-in user, get a 401, and — because it
   * looked like an anonymous request — never retry after a refresh (see the D-11 comment in
   * `api-runtime.ts`), surfacing a false "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" toast on nearly every load.
   * This asserts the fix: `CartService`/`WishlistService` are built lazily, only when a sign-in
   * flow actually needs to reload them.
   */
  it('injecting AuthService alone never constructs CartService or WishlistService', () => {
    let cartConstructed = false;
    let wishlistConstructed = false;

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
        { provide: NzMessageService, useValue: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn(), url: '/' } },
        { provide: GoogleOauthService, useValue: {} },
        { provide: GoogleOauthConfigService, useValue: { load: vi.fn() } },
        {
          provide: CartService,
          useFactory: () => {
            cartConstructed = true;
            return { loadCart: vi.fn() };
          },
        },
        {
          provide: WishlistService,
          useFactory: () => {
            wishlistConstructed = true;
            return { refresh: vi.fn().mockResolvedValue(undefined) };
          },
        },
      ],
    });

    TestBed.inject(AuthService);

    expect(cartConstructed).toBe(false);
    expect(wishlistConstructed).toBe(false);
  });
});

describe('AuthService.syncUserFromProfile (QA fix: stale header identity)', () => {
  it('reconciles auth.user() with the live GET /api/me/profile result', async () => {
    stubRoute('POST', '/api/auth/login', loginBody());
    const auth = buildService();
    await auth.signIn('teacher@example.com', 'secret123');
    expect(auth.user()?.name).toBe('x');

    // Simulates a session that was actually left over from an earlier login (e.g. a different
    // seeded account, or another tab) — the live profile is what the JWT actually resolves to.
    auth.syncUserFromProfile({
      id: 'u-1',
      name: 'Admin จริง',
      email: 'admin@siriedumarket.local',
      role: 'Admin',
    });

    expect(auth.user()?.name).toBe('Admin จริง');
    expect(auth.user()?.email).toBe('admin@siriedumarket.local');
    expect(auth.role()).toBe('admin');
    expect(auth.isAdmin()).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).user.name).toBe('Admin จริง');
  });

  it('does nothing when there is no session to reconcile', () => {
    const auth = buildService();

    auth.syncUserFromProfile({ id: 'u-1', name: 'Someone', email: 'x@example.com', role: 'buyer' });

    expect(auth.user()).toBeNull();
  });

  it('is a no-op when the live profile already matches the session (no redundant write)', async () => {
    stubRoute('POST', '/api/auth/login', loginBody());
    const auth = buildService();
    await auth.signIn('teacher@example.com', 'secret123');
    const before = auth.user();

    auth.syncUserFromProfile({
      id: 'u-1',
      name: 'x',
      email: 'teacher@example.com',
      role: 'buyer',
    });

    // Same object reference — nothing was rewritten for an already-matching profile.
    expect(auth.user()).toBe(before);
  });
});

describe('AuthService multi-role permissions (multi-role-permissions v1 AC-14/AC-15)', () => {
  it('signIn parses roles: ["buyer","seller"] — isSeller() true, isAdmin() false', async () => {
    stubRoute(
      'POST',
      '/api/auth/login',
      loginBody({
        user: {
          id: 'u-1',
          displayName: 'x',
          email: 'seller@example.com',
          role: 'seller',
          roles: ['buyer', 'seller'],
        },
      }),
    );
    const auth = buildService();

    await auth.signIn('seller@example.com', 'secret123');

    expect(auth.roles()).toEqual(['buyer', 'seller']);
    expect(auth.isSeller()).toBe(true);
    expect(auth.isAdmin()).toBe(false);
  });

  it('signIn parses roles: ["buyer","admin"] — isAdmin() true, isSeller() false', async () => {
    stubRoute(
      'POST',
      '/api/auth/login',
      loginBody({
        user: {
          id: 'u-1',
          displayName: 'x',
          email: 'admin@example.com',
          role: 'admin',
          roles: ['buyer', 'admin'],
        },
      }),
    );
    const auth = buildService();

    await auth.signIn('admin@example.com', 'secret123');

    expect(auth.roles()).toEqual(['buyer', 'admin']);
    expect(auth.isAdmin()).toBe(true);
    expect(auth.isSeller()).toBe(false);
  });

  it('falls back to a single-element roles array from `role` when the response omits `roles`', async () => {
    stubRoute('POST', '/api/auth/login', loginBody());
    const auth = buildService();

    await auth.signIn('teacher@example.com', 'secret123');

    expect(auth.roles()).toEqual(['buyer']);
  });

  it('syncUserFromProfile updates roles() and isAdmin()/isSeller() from the live profile', async () => {
    stubRoute('POST', '/api/auth/login', loginBody());
    const auth = buildService();
    await auth.signIn('teacher@example.com', 'secret123');
    expect(auth.isSeller()).toBe(false);

    auth.syncUserFromProfile({
      id: 'u-1',
      name: 'x',
      email: 'teacher@example.com',
      role: 'seller',
      roles: ['buyer', 'seller'],
    });

    expect(auth.roles()).toEqual(['buyer', 'seller']);
    expect(auth.isSeller()).toBe(true);
    expect(auth.isAdmin()).toBe(false);
  });

  describe('registration-onboarding v1 (AC-14, AC-18)', () => {
    it('resolvePostAuthRedirect returns /auth/login when no session exists', () => {
      const auth = buildService();
      expect(auth.resolvePostAuthRedirect('/marketplace')).toBe('/auth/login');
    });

    it('resolvePostAuthRedirect returns /onboarding/role when user has not completed onboarding, ignoring returnUrl and roles', async () => {
      stubRoute(
        'POST',
        '/api/auth/login',
        loginBody({
          user: {
            id: 'u-1',
            displayName: 'Admin User',
            email: 'admin@example.com',
            role: 'admin',
            roles: ['buyer', 'admin'],
            ...({ onboardingCompletedAt: null } as any),
          },
        }),
      );
      const auth = buildService();
      await auth.signIn('admin@example.com', 'secret123');

      expect(auth.resolvePostAuthRedirect('/cart')).toBe('/onboarding/role');
      expect(auth.resolvePostAuthRedirect('/')).toBe('/onboarding/role');
    });

    it('resolvePostAuthRedirect respects returnUrl when onboarding is completed', async () => {
      stubRoute(
        'POST',
        '/api/auth/login',
        loginBody({
          user: {
            id: 'u-1',
            displayName: 'Buyer',
            email: 'b@example.com',
            role: 'buyer',
            roles: ['buyer'],
            ...({ onboardingCompletedAt: '2026-09-11T10:00:00Z' } as any),
          },
        }),
      );
      const auth = buildService();
      await auth.signIn('b@example.com', 'secret123');

      expect(auth.resolvePostAuthRedirect('/cart')).toBe('/cart');
    });

    it('resolvePostAuthRedirect routes completed admin to /admin/dashboard when returnUrl is /', async () => {
      stubRoute(
        'POST',
        '/api/auth/login',
        loginBody({
          user: {
            id: 'u-1',
            displayName: 'Admin',
            email: 'a@example.com',
            role: 'admin',
            roles: ['buyer', 'admin'],
            ...({ onboardingCompletedAt: '2026-09-11T10:00:00Z' } as any),
          },
        }),
      );
      const auth = buildService();
      await auth.signIn('a@example.com', 'secret123');

      expect(auth.resolvePostAuthRedirect('/')).toBe('/admin/dashboard');
    });

    it('resolvePostAuthRedirect routes completed seller to /seller/dashboard when returnUrl is /', async () => {
      stubRoute(
        'POST',
        '/api/auth/login',
        loginBody({
          user: {
            id: 'u-1',
            displayName: 'Seller',
            email: 's@example.com',
            role: 'seller',
            roles: ['buyer', 'seller'],
            ...({ onboardingCompletedAt: '2026-09-11T10:00:00Z' } as any),
          },
        }),
      );
      const auth = buildService();
      await auth.signIn('s@example.com', 'secret123');

      expect(auth.resolvePostAuthRedirect('/')).toBe('/seller/dashboard');
    });

    it('resolvePostAuthRedirect routes completed buyer to / when returnUrl is /', async () => {
      stubRoute(
        'POST',
        '/api/auth/login',
        loginBody({
          user: {
            id: 'u-1',
            displayName: 'Buyer',
            email: 'b@example.com',
            role: 'buyer',
            roles: ['buyer'],
            ...({ onboardingCompletedAt: '2026-09-11T10:00:00Z' } as any),
          },
        }),
      );
      const auth = buildService();
      await auth.signIn('b@example.com', 'secret123');

      expect(auth.resolvePostAuthRedirect('/')).toBe('/');
    });

    it('register enforces 8+ chars and uppercase/lowercase/digit password policy', async () => {
      const auth = buildService();

      // < 8 chars
      let r = await auth.register({
        name: 'Test',
        email: 'test@example.com',
        password: 'Pass1',
        confirmPassword: 'Pass1',
        acceptTerms: true,
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');

      // missing uppercase
      r = await auth.register({
        name: 'Test',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        acceptTerms: true,
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('ประกอบด้วยตัวพิมพ์ใหญ่');

      // missing digit
      r = await auth.register({
        name: 'Test',
        email: 'test@example.com',
        password: 'PasswordXYZ',
        confirmPassword: 'PasswordXYZ',
        acceptTerms: true,
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('และตัวเลขอย่างน้อยอย่างละ 1 ตัว');
    });
  });
});
