import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CartService } from './cart.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import type { DocumentItem } from '../models';

/**
 * The Angular unit-test builder refuses `vi.mock` on relative imports, so these drive the
 * real generated SDK and the real `api-runtime` fetch wrapper against a stubbed
 * `globalThis.fetch`. That is the more useful boundary anyway: it exercises the same code
 * path a browser takes, including the Bearer header and the 401 replay.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function key(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(key(method, path), { body, status });
}

function doc(id: string, price: number, originalPrice?: number): DocumentItem {
  return { id, title: `doc ${id}`, price, originalPrice } as DocumentItem;
}

/** A cart body as the server sends it. Listed prices are VAT-inclusive. */
function cartBody(
  over: Partial<{ items: unknown[]; subtotal: number; vatIncluded: number; total: number }> = {},
) {
  return {
    items: [{ documentId: 'doc-1', title: 'สรุปเคมี', price: 214, coverUrl: '' }],
    subtotal: 200,
    vatIncluded: 14,
    total: 214,
    ...over,
  };
}

function buildService(): CartService {
  TestBed.configureTestingModule({
    providers: [
      CartService,
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      { provide: NzMessageService, useValue: { warning: vi.fn(), error: vi.fn() } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ],
  });

  return TestBed.inject(CartService);
}

/** Lets the SDK promise chain and the service's fire-and-forget blocks settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

beforeEach(() => {
  routes = new Map();
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname.replace('/SIRIEDUMARKET.Api', '');
    const route = routes.get(key(request.method, path));

    if (!route) return jsonResponse({ title: 'no stub for this route' }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

/**
 * BUG-01: the cart used to add 7% VAT on top of a total the server never charged, so the
 * buyer saw one number and the card was charged another. These pin the rule that totals come
 * from the server and that VAT is contained in the total, never added to it.
 */
describe('CartService totals', () => {
  let cart: CartService;

  beforeEach(async () => {
    stubRoute('GET', '/api/cart', cartBody());
    cart = buildService();
    await settle();
  });

  it('takes the charged total from the server, not from summing listed prices', () => {
    expect(cart.total()).toBe(214);
  });

  it('reports VAT as contained in the total, so subtotal plus VAT equals total', () => {
    expect(cart.subtotal()).toBe(200);
    expect(cart.vatIncluded()).toBe(14);
    expect(cart.subtotal() + cart.vatIncluded()).toBe(cart.total());
  });

  it('never adds VAT on top of the total', () => {
    // The specific regression: 214 * 1.07 = 228.98 was once what checkout displayed.
    expect(cart.total()).not.toBeCloseTo(214 * 1.07, 2);
  });

  it('reports zero on every money figure when the cart is empty', async () => {
    stubRoute('GET', '/api/cart', cartBody({ items: [], subtotal: 0, vatIncluded: 0, total: 0 }));
    cart.loadCart();
    await settle();

    expect(cart.count()).toBe(0);
    expect(cart.total()).toBe(0);
    expect(cart.subtotal()).toBe(0);
    expect(cart.vatIncluded()).toBe(0);
  });

  it('quotes the listed sum while a server total has not arrived yet', async () => {
    stubRoute('GET', '/api/cart', cartBody({ items: [], subtotal: 0, vatIncluded: 0, total: 0 }));
    cart.loadCart();
    await settle();

    // Optimistic add lands before the server answers; quoting 0 here would flash a free cart.
    cart.add(doc('doc-2', 149));

    expect(cart.count()).toBe(1);
    expect(cart.total()).toBe(149);
  });

  it('counts savings against the original price and never goes negative', async () => {
    stubRoute('GET', '/api/cart', cartBody({ items: [], subtotal: 0, vatIncluded: 0, total: 0 }));
    cart.loadCart();
    await settle();

    cart.add(doc('doc-3', 100, 250));
    expect(cart.savings()).toBe(150);

    // No original price means no extra discount, not a negative one.
    cart.add(doc('doc-4', 100));
    expect(cart.savings()).toBe(150);
  });
});

describe('CartService membership and mutation', () => {
  let cart: CartService;

  beforeEach(async () => {
    stubRoute('GET', '/api/cart', cartBody({ items: [], subtotal: 0, vatIncluded: 0, total: 0 }));
    stubRoute('POST', '/api/cart/items', {});
    stubRoute('DELETE', '/api/cart', {});
    cart = buildService();
    await settle();
  });

  it('refuses to add the same document twice', () => {
    expect(cart.add(doc('doc-1', 100))).toBe(true);
    expect(cart.add(doc('doc-1', 100))).toBe(false);
    expect(cart.count()).toBe(1);
  });

  it('opens the drawer when something is added', () => {
    expect(cart.drawerOpen()).toBe(false);
    cart.add(doc('doc-1', 100));
    expect(cart.drawerOpen()).toBe(true);
  });

  it('answers has() for what is in the cart', () => {
    cart.add(doc('doc-1', 100));

    expect(cart.has('doc-1')).toBe(true);
    expect(cart.has('doc-nope')).toBe(false);
  });

  it('removes optimistically', () => {
    cart.add(doc('doc-1', 100));
    cart.add(doc('doc-2', 100));

    cart.remove('doc-1');

    expect(cart.count()).toBe(1);
    expect(cart.has('doc-1')).toBe(false);
  });

  it('clears the totals along with the items, so no stale figure survives', async () => {
    stubRoute('GET', '/api/cart', cartBody());
    cart.loadCart();
    await settle();
    expect(cart.total()).toBe(214);

    cart.clear();

    expect(cart.count()).toBe(0);
    expect(cart.total()).toBe(0);
    expect(cart.vatIncluded()).toBe(0);
  });

  it('BUG-03: adds a bundle in one call so the server can charge the bundle price', async () => {
    stubRoute('POST', '/api/cart/bundles/bun-1', {});

    const res = await cart.addBundle('bun-1');
    await settle();

    expect(res.ok).toBe(true);
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const urls = calls.map((c) => (c[0] as Request).url);
    // Adding the members one at a time is what charged full price instead of the bundle price.
    expect(urls.some((u) => u.includes('/api/cart/bundles/bun-1'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/api/cart/items'))).toBe(false);
  });

  it('reports an already-owned bundle rather than failing silently', async () => {
    // addBundle passes throwOnError, so a 409 really does reach its catch. The client throws
    // the parsed body, so the status has to be read off the envelope — which is why
    // ApiErrorResponse carries `status` alongside `statusCode`.
    stubRoute(
      'POST',
      '/api/cart/bundles/bun-2',
      {
        title: 'Conflict',
        status: 409,
        statusCode: 409,
        message: 'คุณเป็นเจ้าของเอกสารบางรายการแล้ว',
        traceId: 'trace-1',
      },
      409,
    );

    const res = await cart.addBundle('bun-2');

    expect(res).toEqual({ ok: false, alreadyOwned: true });
  });

  it('does not treat a non-409 bundle failure as already owned', async () => {
    stubRoute(
      'POST',
      '/api/cart/bundles/bun-3',
      { title: 'Server Error', status: 500, statusCode: 500, message: 'boom', traceId: 't' },
      500,
    );

    const res = await cart.addBundle('bun-3');

    expect(res).toEqual({ ok: false });
  });

  it.skip('BUG: rolls the optimistic add back and redirects when the buyer already owns it', async () => {
    // FAILS TODAY - kept skipped per T-30's rule against changing production code to make a
    // test pass. See F-30-1.
    //
    // CartService.add() calls postApiCartItems() without `throwOnError`, and the generated
    // client only throws when that flag is set — otherwise a non-2xx comes back as
    // `{ data: undefined, error }`. So the catch block, and with it the whole 409
    // "already owned" recovery, is unreachable: the item stays in the cart, no warning is
    // shown, and the buyer is never sent to their library.
    //
    // addBundle() gets this right by passing `throwOnError: true`.
    stubRoute('POST', '/api/cart/items', { title: 'already owned' }, 409);

    cart.add(doc('doc-owned', 100));
    expect(cart.count()).toBe(1); // optimistic
    await settle();

    expect(cart.count()).toBe(0);
  });
});
