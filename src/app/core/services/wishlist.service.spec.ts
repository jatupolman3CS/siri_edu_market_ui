import { TestBed } from '@angular/core/testing';
import { WishlistService } from './wishlist.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
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

function buildService(): WishlistService {
  TestBed.configureTestingModule({
    providers: [WishlistService, { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });

  return TestBed.inject(WishlistService);
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
    const path = url.pathname.replace('/SIRIEDUMARKET.Api', '');
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

  it.skip('BUG: reports an error state when the list cannot be loaded', async () => {
    // FAILS TODAY - kept skipped per T-30's rule against changing production code to make a
    // test pass. See F-30-2.
    //
    // `createInfinitePager.loadMore()` catches the failure and writes it to the pager's own
    // `state` signal, so `loadFirst()` resolves normally. `WishlistService.refresh()` then
    // takes its success path and sets idle, and it surfaces `_state`, not `pager.state`.
    // The result is that a failed load is indistinguishable from an empty wishlist: no
    // message, no retry affordance, just nothing there.
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
