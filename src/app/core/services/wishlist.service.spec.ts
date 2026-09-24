import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { WishlistService } from './wishlist.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { AuthService } from './auth.service';
import type { DocumentItem } from '../models';

/**
 * GAP-10: every method on the backing service used to be a no-op — the page rendered, the
 * heart filled in, and nothing was ever stored. These cover the client half: that the list
 * comes from the API, and that toggling actually issues the write.
 */
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

function wishlistPage(items: unknown[]) {
  return { items, page: 1, pageSize: 24, totalCount: items.length, totalPages: 1 };
}

function row(documentId: string, over: Record<string, unknown> = {}) {
  return {
    documentId,
    title: `เอกสาร ${documentId}`,
    price: 149,
    sellerName: 'Siri Studio',
    format: 'pdf',
    averageRating: 4.5,
    addedAt: '2026-08-01T00:00:00Z',
    ...over,
  };
}

type AuthHarness = {
  wishlist: WishlistService;
  user: WritableSignal<{ id: string } | null>;
};

/** Defaults to a signed-in user; pass `null` to exercise the anonymous-visitor path (AC-5/AC-16). */
function buildServiceWithAuth(userId: string | null = 'user-1'): AuthHarness {
  const user = signal<{ id: string } | null>(userId ? { id: userId } : null);
  TestBed.configureTestingModule({
    providers: [
      WishlistService,
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      { provide: AuthService, useValue: { user } as unknown as AuthService },
    ],
  });

  return { wishlist: TestBed.inject(WishlistService), user };
}

/** Defaults to a signed-in session. */
function buildService(userId: string | null = 'user-1'): WishlistService {
  return buildServiceWithAuth(userId).wishlist;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    requests.push({ method: request.method, path, body: await request.clone().text() });

    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('WishlistService', () => {
  it('loads the list from the API rather than from local state', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1'), row('doc-2')]));
    const wishlist = buildService();
    await settle();

    expect(wishlist.count()).toBe(2);
    expect(requests.some((r) => r.method === 'GET' && r.path === '/api/wishlist')).toBe(true);
  });

  it('GAP-10: keeps the seller name the API now returns', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1', { sellerName: 'ครูเคมี' })]));
    const wishlist = buildService();
    await settle();

    expect(wishlist.items()[0].seller.studioName).toBe('ครูเคมี');
  });

  it('marks a zero-price row as free', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-free', { price: 0 })]));
    const wishlist = buildService();
    await settle();

    expect(wishlist.items()[0].isFree).toBe(true);
    expect(wishlist.items()[0].price).toBe(0);
  });

  it('wishlist-price-drop-alerts v1 §3.3: maps hasPriceDropped from the API', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1', { hasPriceDropped: true })]));
    const wishlist = buildService();
    await settle();

    expect(wishlist.items()[0].hasPriceDropped).toBe(true);
  });

  it('wishlist-price-drop-alerts v1 §3.3: defaults hasPriceDropped to false when the API omits it', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1')]));
    const wishlist = buildService();
    await settle();

    expect(wishlist.items()[0].hasPriceDropped).toBe(false);
  });

  it('answers has() from what the API returned', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1')]));
    const wishlist = buildService();
    await settle();

    expect(wishlist.has('doc-1')).toBe(true);
    expect(wishlist.has('doc-absent')).toBe(false);
  });

  it('POSTs when toggling something that is not on the list yet', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([]));
    stubRoute('POST', '/api/wishlist', {});
    const wishlist = buildService();
    await settle();

    const added = wishlist.toggle({ id: 'doc-9' } as DocumentItem);
    await settle();

    expect(added).toBe(true);
    const post = requests.find((r) => r.method === 'POST' && r.path === '/api/wishlist');
    expect(post).toBeDefined();
    expect(post?.body).toContain('doc-9');
  });

  it('DELETEs the specific document when toggling one already on the list', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1')]));
    stubRoute('DELETE', '/api/wishlist/doc-1', {});
    const wishlist = buildService();
    await settle();

    const added = wishlist.toggle({ id: 'doc-1' } as DocumentItem);
    await settle();

    expect(added).toBe(false);
    // Per-document delete, not a clear: removing one favourite must not empty the list.
    expect(requests.some((r) => r.method === 'DELETE' && r.path === '/api/wishlist/doc-1')).toBe(
      true,
    );
    expect(requests.some((r) => r.method === 'DELETE' && r.path === '/api/wishlist')).toBe(false);
  });

  it('ends up with an empty list when loading fails', async () => {
    stubRoute(
      'GET',
      '/api/wishlist',
      { title: 'Server Error', status: 500, statusCode: 500, message: 'boom', traceId: 't' },
      500,
    );
    const wishlist = buildService();
    await settle();

    expect(wishlist.count()).toBe(0);
  });

  it('reports an error state when the list cannot be loaded', async () => {
    // F-30-2: the pager used to swallow the failure into its own state signal, so
    // loadFirst() resolved normally, refresh() took its success path, and a failed load was
    // indistinguishable from an empty wishlist. loadFirst() now rethrows.
    stubRoute(
      'GET',
      '/api/wishlist',
      { title: 'Server Error', status: 500, statusCode: 500, message: 'boom', traceId: 't' },
      500,
    );
    const wishlist = buildService();
    await settle();

    expect(wishlist.state().status).toBe('error');
  });
});

/**
 * anonymous-cart-wishlist-scoping AC-5/AC-16: `WishlistController` no longer requires
 * `[Authorize]` — the server keeps a cookie-scoped wishlist for guests too, so
 * `AppHeaderComponent`/the `/wishlist` page injecting `WishlistService` for a guest must load
 * unconditionally instead of guarding on `isAuthenticated()` (that guard used to leave a
 * reloaded guest's header badge and `/wishlist` page empty while the server still had their
 * items).
 */
describe('WishlistService construct-time load (anonymous-cart-wishlist-scoping)', () => {
  it('loads the wishlist on construct for an anonymous visitor too', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1')]));
    const wishlist = buildService(null);
    await settle();

    expect(wishlist.count()).toBe(1);
    expect(requests.length).toBe(1);
  });

  it('loads the wishlist on construct for a signed-in user', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1'), row('doc-2')]));
    const wishlist = buildService('user-1');
    await settle();

    expect(wishlist.count()).toBe(2);
  });
});

/**
 * anonymous-cart-wishlist-scoping AC-17 + the gap the closing gate found: a login that never
 * calls `AuthService.signIn()` directly (cross-tab login via the `storage` event, or
 * `applyDevBypassSession` in dev) still has to pick up the server-side merge. `WishlistService`
 * cannot observe `signIn()` calls, only the identity signal `AuthService.user()` exposes — so
 * these drive that signal directly, the same seam `AuthService` itself would flip.
 */
describe('WishlistService identity-change reload', () => {
  it('reloads once when the signed-in identity appears (cross-tab login / dev bypass)', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([]));
    const { wishlist, user } = buildServiceWithAuth(null);
    await settle();
    expect(wishlist.count()).toBe(0);

    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1')]));
    user.set({ id: 'user-1' });
    TestBed.tick();
    await settle();

    expect(wishlist.count()).toBe(1);
    expect(requests.filter((r) => r.method === 'GET' && r.path === '/api/wishlist').length).toBe(2);
  });

  it('reloads again when the signed-in account switches', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1')]));
    const { wishlist, user } = buildServiceWithAuth('user-1');
    await settle();
    expect(wishlist.count()).toBe(1);

    stubRoute('GET', '/api/wishlist', wishlistPage([]));
    user.set({ id: 'user-2' });
    TestBed.tick();
    await settle();

    expect(wishlist.count()).toBe(0);
    expect(requests.filter((r) => r.method === 'GET' && r.path === '/api/wishlist').length).toBe(2);
  });

  it('reloads (state cleared server-side) on sign-out', async () => {
    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1')]));
    const { wishlist, user } = buildServiceWithAuth('user-1');
    await settle();
    expect(wishlist.count()).toBe(1);

    stubRoute('GET', '/api/wishlist', wishlistPage([]));
    user.set(null);
    TestBed.tick();
    await settle();

    expect(wishlist.count()).toBe(0);
    expect(requests.filter((r) => r.method === 'GET' && r.path === '/api/wishlist').length).toBe(2);
  });

  it('does not double-load right after refresh() already ran for the same identity', async () => {
    // Mirrors what `AuthService.signIn()` does: it calls `completeSignIn()` (flips `user()`) and
    // then calls `WishlistService.refresh()` explicitly (AC-17) in the same synchronous turn —
    // before the identity-change effect gets a chance to flush.
    stubRoute('GET', '/api/wishlist', wishlistPage([]));
    const { wishlist, user } = buildServiceWithAuth(null);
    await settle();

    stubRoute('GET', '/api/wishlist', wishlistPage([row('doc-1')]));
    user.set({ id: 'user-1' });
    void wishlist.refresh(); // what AuthService.signIn() does, synchronously, right after flipping user()
    TestBed.tick(); // flush the identity-change effect afterwards
    await settle();

    expect(wishlist.count()).toBe(1);
    expect(requests.filter((r) => r.method === 'GET' && r.path === '/api/wishlist').length).toBe(2);
  });
});
