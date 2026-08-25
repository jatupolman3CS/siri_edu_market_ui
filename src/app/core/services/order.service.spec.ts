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
    const path = new URL(request.url).pathname.replace('/SIRIEDUMARKET.Api', '');
    const route = routes.get(`${request.method.toUpperCase()} ${path}`);

    if (!route) return jsonResponse({ title: 'no stub for this route' }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
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
