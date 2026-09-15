import { TestBed } from '@angular/core/testing';
import { OrderService } from './order.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * T-13: checkout can fail *after* the card has been charged. Every one of these cases used to
 * land in the same 409 branch as "already owned", which told a buyer who had just paid that
 * they owned the document already and sent them to an empty library. What is pinned here is
 * that each 409 code takes its own branch, keyed on the server's `code` and not on the status.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

function stubOrderPost(body: unknown, status: number): void {
  routes.set('POST /api/orders', { body, status });
}

/** The error body `GlobalExceptionMiddleware` writes, camelCased as the API sends it. */
function problem(code: string, detail: string, status: number) {
  return {
    type: `https://siriedumarket/errors/${status}`,
    title: 'Conflict',
    status,
    detail,
    code,
    message: detail,
    statusCode: status,
    traceId: 'trace-1',
  };
}

function buildService(): OrderService {
  TestBed.configureTestingModule({
    providers: [OrderService, { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  return TestBed.inject(OrderService);
}

beforeEach(() => {
  routes = new Map();
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    const route = routes.get(`${request.method.toUpperCase()} ${path}`);

    if (!route) return jsonResponse({ title: 'no stub for this route' }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('OrderService.create — saved-credit-cards v1 §4: request body', () => {
  it('sends savedPaymentMethodId when paying with a saved card', async () => {
    let sentBody = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      sentBody = await request.clone().text();
      return jsonResponse({ id: 'order-1', orderNumber: 'SE-1', status: 'awaiting_payment' }, 200);
    }) as typeof globalThis.fetch;

    await buildService().create({ savedPaymentMethodId: 'spm-1' });

    expect(JSON.parse(sentBody)).toEqual({ savedPaymentMethodId: 'spm-1' });
  });

  it('sends saveNewCard when paying with a new card and opting to save it', async () => {
    let sentBody = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      sentBody = await request.clone().text();
      return jsonResponse({ id: 'order-1', orderNumber: 'SE-1', status: 'awaiting_payment' }, 200);
    }) as typeof globalThis.fetch;

    await buildService().create({ saveNewCard: true });

    expect(JSON.parse(sentBody)).toEqual({ saveNewCard: true });
  });

  it('buyer-wallet v1 §3.1: sends payWithWallet when paying with buyer wallet', async () => {
    let sentBody = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      sentBody = await request.clone().text();
      return jsonResponse({ id: 'order-1', orderNumber: 'SE-1', status: 'paid', paymentMethod: 'wallet' }, 200);
    }) as typeof globalThis.fetch;

    const outcome = await buildService().create({ payWithWallet: true });

    expect(JSON.parse(sentBody)).toEqual({ payWithWallet: true });
    expect(outcome.ok).toBe(true);
  });

  it('buyer-wallet v1 §3.1: returns ok: false and error message when wallet balance is insufficient (400)', async () => {
    stubOrderPost(problem('validation_failed', 'ยอดเงินในกระเป๋าไม่พอสำหรับคำสั่งซื้อนี้', 400), 400);

    const outcome = await buildService().create({ payWithWallet: true });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(400);
      expect(outcome.message).toContain('ยอดเงินในกระเป๋าไม่พอสำหรับคำสั่งซื้อนี้');
    }
  });
});

describe('OrderService.create — 409 branches', () => {
  it('flags a charged-but-unreconciled payment instead of claiming the buyer owns it', async () => {
    const detail =
      'ชำระเงินสำเร็จแล้ว แต่ระบบยังจับคู่การชำระเงินกับคำสั่งซื้อ SE-260825-000001 ไม่สำเร็จ กรุณาอย่าชำระเงินซ้ำ';
    stubOrderPost(problem('payment_needs_review', detail, 409), 409);

    const outcome = await buildService().create({});

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.paymentNeedsReview).toBe(true);
    expect(outcome.alreadyOwned).toBeFalsy();
    // The buyer has to be told their money moved; a generic message would hide that.
    expect(outcome.message).toBe(detail);
  });

  it('keeps the pending-order branch keyed on its own code', async () => {
    stubOrderPost(problem('pending_order_exists', 'มีคำสั่งซื้อค้างชำระอยู่', 409), 409);

    const outcome = await buildService().create({});

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.pendingOrder).toBe(true);
    expect(outcome.paymentNeedsReview).toBeFalsy();
  });

  it('still falls back to already-owned for a 409 an older API build sent without a code', async () => {
    stubOrderPost({ title: 'Conflict', status: 409 }, 409);

    const outcome = await buildService().create({});

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.alreadyOwned).toBe(true);
    expect(outcome.paymentNeedsReview).toBeFalsy();
  });
});

/**
 * order-similar-documents v1 §3.1/§4 round 2 (post-regen wiring): `GET
 * /api/orders/{id}/similar-documents` → `OrderSimilarDocument[]`.
 */
describe('OrderService.loadSimilar — order-similar-documents v1', () => {
  function stubSimilar(orderId: string, body: unknown, status = 200): void {
    routes.set(`GET /api/orders/${orderId}/similar-documents`, { body, status });
  }

  it('maps items into OrderSimilarDocument[] via mapDocument for `document`', async () => {
    stubSimilar('order-1', {
      items: [
        {
          document: {
            id: 'doc-2',
            slug: 'doc-2',
            title: 'สรุปฟิสิกส์ ม.6',
            shortDescription: 'สรุปเข้ม',
            price: 39,
            format: 'pdf',
            pages: 20,
            averageRating: 4.2,
            reviewCount: 5,
            downloads: 100,
            sellerId: 'seller-9',
            sellerName: 'ครูบี',
            categoryIds: ['cat-1'],
          },
          reason: 'คล้ายกับ «สรุปคณิต ม.6» — อยู่ในหมวดเดียวกัน',
          matchedDocumentId: 'doc-1',
          matchedDocumentTitle: 'สรุปคณิต ม.6',
        },
      ],
    });

    const service = buildService();
    await service.loadSimilar('order-1');

    expect(service.similar()).toEqual([
      expect.objectContaining({
        reason: 'คล้ายกับ «สรุปคณิต ม.6» — อยู่ในหมวดเดียวกัน',
        matchedDocumentId: 'doc-1',
        matchedDocumentTitle: 'สรุปคณิต ม.6',
        document: expect.objectContaining({
          id: 'doc-2',
          title: 'สรุปฟิสิกส์ ม.6',
          price: 39,
        }),
      }),
    ]);
    expect(service.similarState()).toEqual({ status: 'success', message: undefined });
  });

  it('defaults `take` to 4 when the caller does not pass one', async () => {
    let sentUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      sentUrl = request.url;
      return jsonResponse({ items: [] }, 200);
    }) as typeof globalThis.fetch;

    await buildService().loadSimilar('order-1');

    expect(new URL(sentUrl).searchParams.get('take')).toBe('4');
  });

  it('an empty result leaves `similar` as []', async () => {
    stubSimilar('order-1', { items: [] });

    const service = buildService();
    await service.loadSimilar('order-1');

    expect(service.similar()).toEqual([]);
  });

  it('a failed call clears `similar` to [] and reports through ApiFailureReporter', async () => {
    stubSimilar('order-1', { title: 'Server error', status: 500 }, 500);
    const apiFail = { report: vi.fn() };
    TestBed.configureTestingModule({
      providers: [OrderService, { provide: ApiFailureReporter, useValue: apiFail }],
    });
    const service = TestBed.inject(OrderService);

    await service.loadSimilar('order-1');

    expect(service.similar()).toEqual([]);
    expect(service.similarState().status).toBe('error');
    expect(apiFail.report).toHaveBeenCalledWith('โหลดเอกสารที่คล้ายกัน', expect.anything());
  });
});
