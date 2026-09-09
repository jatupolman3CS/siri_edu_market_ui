import { TestBed } from '@angular/core/testing';
import { SubscriptionService } from './subscription.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import type { Subscription } from '../models';

/**
 * subscription-membership v3 (docs/contracts/subscription-membership.md §1 test list / §4).
 *
 * Round 2 (wired): `GET`/`POST`/`POST .../cancel`/`GET .../access-history api/me/subscription` and
 * `GET /api/admin/subscriptions` all hit the real, regenerated SDK now (gate 1 confirmed backend
 * matches this contract, snapshot updated) — this spec stubs `fetch` directly (mirrors the pattern
 * in `exam-countdown.service.spec.ts`/`payout-account.service.spec.ts`) rather than the service
 * under test.
 *
 * Response shapes verified against the live backend (`dotnet run` on :5282):
 *  - `GET /api/me/subscription`'s `404` (never subscribed, §3.4 — v2→v3 fix, was wrongly `204` in
 *    v2) is ASP.NET Core's auto-`ProblemDetails` body. The SDK client defaults `throwOnError: true`
 *    (`api-runtime.ts`), so `getApiMeSubscription()` **throws** rather than resolving with a
 *    `{ response }` to branch on afterwards — `SubscriptionService.loadCurrent()` reads the thrown
 *    body's own `status` field via `extractErrorStatus`, exactly like
 *    `ExamCountdownService.loadSetting()`'s 404 handling. A 404 here must NOT go through
 *    `ApiFailureReporter` (it's an expected empty state, not a failure) — every other status code
 *    (500, etc.) still must.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; search: string; body: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

/** ASP.NET Core's auto-`ProblemDetails` shape. */
function problemDetails(status: number, title: string) {
  return {
    type: `https://tools.ietf.org/html/rfc9110#section-15.5.5`,
    title,
    status,
    traceId: 'test-trace-id',
  };
}

function subscriptionBody(over: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    status: 'active',
    categoryIds: ['cat-1', 'cat-2'],
    monthlyPrice: 299,
    currentPeriodStart: '2026-09-01T00:00:00Z',
    currentPeriodEnd: '2026-10-01T00:00:00Z',
    cancelAtPeriodEnd: false,
    canceledAt: null,
    paymentHints: null,
    ...over,
  };
}

function accessHistoryPage(items: unknown[] = []) {
  return { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 };
}

function accessHistoryRow(documentId: string) {
  return {
    documentId,
    title: `เอกสาร ${documentId}`,
    coverUrl: '/files/cover.jpg',
    sellerName: 'Siri Studio',
    firstAccessedAt: '2026-09-01T00:00:00Z',
    lastAccessedAt: '2026-09-05T00:00:00Z',
    accessCount: 3,
    stillAccessible: true,
  };
}

function adminSubscriptionsPage(items: unknown[] = []) {
  return { items, page: 1, pageSize: 10, totalCount: items.length, totalPages: 1 };
}

function adminSubscriptionRow(id: string) {
  return {
    id,
    buyerName: 'สมชาย ใจดี',
    buyerEmail: 'somchai@example.com',
    categoryIds: ['cat-1'],
    status: 'active',
    monthlyPrice: 299,
    currentPeriodStart: '2026-09-01T00:00:00Z',
    currentPeriodEnd: '2026-10-01T00:00:00Z',
    cancelAtPeriodEnd: false,
    createdAt: '2026-08-01T00:00:00Z',
  };
}

function buildService(
  apiFail: { report: ReturnType<typeof vi.fn>; formatDetail?: ReturnType<typeof vi.fn> } = {
    report: vi.fn(),
  },
): SubscriptionService {
  TestBed.configureTestingModule({
    providers: [
      SubscriptionService,
      {
        provide: ApiFailureReporter,
        useValue: { formatDetail: vi.fn().mockReturnValue('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'), ...apiFail },
      },
    ],
  });
  return TestBed.inject(SubscriptionService);
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const body = await request.clone().text();
    requests.push({ method: request.method, path: url.pathname, search: url.search, body });

    const route = routes.get(`${request.method.toUpperCase()} ${url.pathname}`);
    if (!route) return jsonResponse({ title: 'no stub for this route', status: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('SubscriptionService — initial state', () => {
  it('starts with current=null and idle states', () => {
    const service = buildService();

    expect(service.current()).toBeNull();
    expect(service.state()).toEqual({ status: 'idle' });
    expect(service.createState()).toEqual({ status: 'idle' });
    expect(service.cancelState()).toEqual({ status: 'idle' });
  });
});

describe('SubscriptionService — loadCurrent() (§3.4)', () => {
  it('AC-24: 404 (never subscribed) resolves current=null, state=idle — NOT reported as a failure', async () => {
    stubRoute('GET', '/api/me/subscription', problemDetails(404, 'Not Found'), 404);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await service.loadCurrent();

    expect(service.current()).toBeNull();
    expect(service.state()).toEqual({ status: 'idle' });
    expect(apiFail.report).not.toHaveBeenCalled();
  });

  it('200 maps the full response onto current()', async () => {
    stubRoute('GET', '/api/me/subscription', subscriptionBody());
    const service = buildService();

    await service.loadCurrent();

    expect(service.current()).toEqual({
      id: 'sub-1',
      status: 'active',
      categoryIds: ['cat-1', 'cat-2'],
      monthlyPrice: 299,
      currentPeriodStart: '2026-09-01T00:00:00Z',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: false,
      canceledAt: null,
      paymentHints: null,
    });
    expect(service.state()).toEqual({ status: 'idle' });
  });

  it('a real failure (500) IS reported and leaves current=null, state=error — distinct from the 404 case', async () => {
    stubRoute('GET', '/api/me/subscription', problemDetails(500, 'Internal Server Error'), 500);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await service.loadCurrent();

    expect(service.current()).toBeNull();
    expect(service.state()).toEqual({ status: 'error', message: 'โหลดข้อมูลสมาชิกไม่สำเร็จ' });
    expect(apiFail.report).toHaveBeenCalledTimes(1);
  });
});

describe('SubscriptionService — create() (§3.3)', () => {
  it('POSTs categoryIds and maps the created subscription (createState=success)', async () => {
    stubRoute('POST', '/api/me/subscription', subscriptionBody({ status: 'incomplete' }), 201);
    const service = buildService();

    const result = await service.create(['cat-1', 'cat-2']);

    expect(result.status).toBe('incomplete');
    expect(service.current()?.status).toBe('incomplete');
    expect(service.createState()).toEqual({ status: 'success', message: 'สมัครสมาชิกสำเร็จ' });
    const call = requests.find((r) => r.method === 'POST' && r.path === '/api/me/subscription');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ categoryIds: ['cat-1', 'cat-2'] });
  });

  it('rejects and records createState=error on failure (never fakes a created subscription)', async () => {
    stubRoute('POST', '/api/me/subscription', problemDetails(409, 'Conflict'), 409);
    const service = buildService();

    await expect(service.create(['cat-1'])).rejects.toBeTruthy();

    expect(service.createState().status).toBe('error');
    expect(service.current()).toBeNull();
  });
});

describe('SubscriptionService — cancel() (§3.5)', () => {
  it('POSTs to .../cancel and updates current() with cancelAtPeriodEnd=true (cancelState=success)', async () => {
    stubRoute(
      'POST',
      '/api/me/subscription/cancel',
      subscriptionBody({ cancelAtPeriodEnd: true }),
    );
    const service = buildService();
    service.setCurrentForTest(subscriptionBody() as unknown as Subscription);

    await service.cancel();

    expect(service.current()?.cancelAtPeriodEnd).toBe(true);
    expect(service.cancelState()).toEqual({
      status: 'success',
      message: 'ยกเลิกการสมัครสมาชิกเรียบร้อย',
    });
    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/api/me/subscription/cancel',
    );
    expect(call).toBeDefined();
  });

  it('rejects and records cancelState=error on failure', async () => {
    stubRoute('POST', '/api/me/subscription/cancel', problemDetails(404, 'Not Found'), 404);
    const service = buildService();

    await expect(service.cancel()).rejects.toBeTruthy();

    expect(service.cancelState().status).toBe('error');
  });
});

describe('SubscriptionService — access-history (§3.6)', () => {
  it('loadAccessHistory() maps each row and carries paging fields', async () => {
    stubRoute(
      'GET',
      '/api/me/subscription/access-history',
      accessHistoryPage([accessHistoryRow('doc-1'), accessHistoryRow('doc-2')]),
    );
    const service = buildService();

    await service.loadAccessHistory();

    expect(service.accessHistory().map((i) => i.documentId)).toEqual(['doc-1', 'doc-2']);
    expect(service.accessHistoryTotalCount()).toBe(2);
    const call = requests.find(
      (r) => r.method === 'GET' && r.path === '/api/me/subscription/access-history',
    );
    expect(call?.search).toContain('Page=1');
  });

  it('reports through ApiFailureReporter on failure and leaves the list empty', async () => {
    stubRoute(
      'GET',
      '/api/me/subscription/access-history',
      problemDetails(500, 'Internal Server Error'),
      500,
    );
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await service.loadAccessHistory();

    expect(service.accessHistory()).toEqual([]);
    expect(apiFail.report).toHaveBeenCalled();
  });
});

describe('SubscriptionService — listAdmin() (§3.2)', () => {
  it('maps each row and omits the status query param for the "all" filter', async () => {
    stubRoute(
      'GET',
      '/api/admin/subscriptions',
      adminSubscriptionsPage([adminSubscriptionRow('sub-1')]),
    );
    const service = buildService();

    const res = await service.listAdmin('all', 1, 10);

    expect(res.items).toEqual([
      {
        id: 'sub-1',
        buyerName: 'สมชาย ใจดี',
        buyerEmail: 'somchai@example.com',
        categoryIds: ['cat-1'],
        status: 'active',
        monthlyPrice: 299,
        currentPeriodStart: '2026-09-01T00:00:00Z',
        currentPeriodEnd: '2026-10-01T00:00:00Z',
        cancelAtPeriodEnd: false,
        createdAt: '2026-08-01T00:00:00Z',
      },
    ]);
    const call = requests.find((r) => r.method === 'GET' && r.path === '/api/admin/subscriptions');
    expect(call?.search).not.toContain('status');
  });

  it('passes the status query param through for a specific filter', async () => {
    stubRoute('GET', '/api/admin/subscriptions', adminSubscriptionsPage([]));
    const service = buildService();

    await service.listAdmin('past_due', 1, 10);

    const call = requests.find((r) => r.method === 'GET' && r.path === '/api/admin/subscriptions');
    expect(call?.search).toContain('status=past_due');
  });

  it('reports through ApiFailureReporter and returns an empty page on failure', async () => {
    stubRoute(
      'GET',
      '/api/admin/subscriptions',
      problemDetails(403, 'Forbidden'),
      403,
    );
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    const res = await service.listAdmin('all', 1, 10);

    expect(res.items).toEqual([]);
    expect(apiFail.report).toHaveBeenCalled();
  });
});

describe('SubscriptionService — test helpers', () => {
  it('setCurrentForTest updates the current signal directly', () => {
    const service = buildService();
    const sub: Subscription = {
      id: 'sub-1',
      status: 'active',
      categoryIds: ['cat-1', 'cat-2'],
      monthlyPrice: 299,
      currentPeriodStart: '2026-09-01T00:00:00Z',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: false,
      canceledAt: null,
      paymentHints: null,
    };

    service.setCurrentForTest(sub);

    expect(service.current()).toEqual(sub);
  });

  it('resetCreateStateForTest resets createState() back to idle', async () => {
    stubRoute('POST', '/api/me/subscription', problemDetails(409, 'Conflict'), 409);
    const service = buildService();
    await expect(service.create(['cat-1'])).rejects.toBeTruthy();
    expect(service.createState().status).toBe('error');

    service.resetCreateStateForTest();

    expect(service.createState()).toEqual({ status: 'idle' });
  });
});
