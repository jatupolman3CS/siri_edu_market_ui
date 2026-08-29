import { TestBed } from '@angular/core/testing';
import { LoyaltyService } from './loyalty.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { AuthService } from './auth.service';
import { mapLoyaltyEntry, mapLoyaltySummary } from '../api-mappers/mappers';

/**
 * loyalty-points v1 (docs/contracts/loyalty-points.md §4).
 *
 * `LoyaltyService` calls `GET /api/me/loyalty` and `GET /api/me/loyalty/entries` through the
 * generated SDK. These specs cover:
 *  - `mapLoyaltySummary` / `mapLoyaltyEntry` map a response shape → the domain model (the "map
 *    response → model" case from spec §1's test list)
 *  - the service actually reading the two endpoints through a stubbed `fetch` (mirrors the
 *    pattern in `library.service.spec.ts`)
 *  - the service's default values when there is no usable session — the closest stand-in for
 *    "ค่า default เมื่อ 401" (AC-6) since there is no live 401 to provoke in a unit spec
 */

type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; search: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

function summaryBody(over: Record<string, unknown> = {}) {
  return {
    balance: 1840,
    earnedThisMonth: 120,
    lifetimeEarned: 2000,
    lifetimeSpent: 160,
    asOf: '2026-08-29T00:00:00.000Z',
    ...over,
  };
}

function entriesPage(items: unknown[]) {
  return { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 };
}

function buildService(auth: { accessToken(): string | null; isAuthenticated(): boolean }): LoyaltyService {
  TestBed.configureTestingModule({
    providers: [
      LoyaltyService,
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      { provide: AuthService, useValue: auth },
    ],
  });

  return TestBed.inject(LoyaltyService);
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname.replace('/SIRIEDUMARKET.Api', '');
    requests.push({ method: request.method, path, search: url.search });

    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('mapLoyaltySummary', () => {
  it('maps every field from the response', () => {
    const summary = mapLoyaltySummary({
      balance: 1840,
      earnedThisMonth: 120,
      lifetimeEarned: 2000,
      lifetimeSpent: 160,
      asOf: '2026-08-29T00:00:00.000Z',
    });

    expect(summary).toEqual({
      balance: 1840,
      earnedThisMonth: 120,
      lifetimeEarned: 2000,
      lifetimeSpent: 160,
      asOf: '2026-08-29T00:00:00.000Z',
    });
  });

  it('defaults every missing/null number field to 0, never leaves it undefined', () => {
    const summary = mapLoyaltySummary({});

    expect(summary.balance).toBe(0);
    expect(summary.earnedThisMonth).toBe(0);
    expect(summary.lifetimeEarned).toBe(0);
    expect(summary.lifetimeSpent).toBe(0);
  });
});

describe('mapLoyaltyEntry', () => {
  it('maps a "order_paid" earn entry with an order number', () => {
    const entry = mapLoyaltyEntry({
      id: 'entry-1',
      points: 12,
      kind: 'earn',
      reason: 'order_paid',
      orderNumber: 'ORD-0001',
      occurredAt: '2026-08-01T00:00:00.000Z',
    });

    expect(entry).toEqual({
      id: 'entry-1',
      points: 12,
      kind: 'earn',
      reason: 'order_paid',
      orderNumber: 'ORD-0001',
      occurredAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('falls back kind to "earn" when the response sends an unknown/missing value', () => {
    expect(mapLoyaltyEntry({ kind: undefined }).kind).toBe('earn');
    expect(mapLoyaltyEntry({ kind: 'something-else' }).kind).toBe('earn');
  });

  it('keeps orderNumber undefined (not null) when the entry is not tied to an order', () => {
    const entry = mapLoyaltyEntry({ id: 'entry-2', orderNumber: null });

    expect(entry.orderNumber).toBeUndefined();
  });
});

describe('LoyaltyService', () => {
  it('starts with summary=null and state=idle', () => {
    const loyalty = buildService({ accessToken: () => 'test-token', isAuthenticated: () => true });

    expect(loyalty.summary()).toBeNull();
    expect(loyalty.state()).toEqual({ status: 'idle' });
  });

  it('refreshSummary() with a session fetches GET /api/me/loyalty and maps the response', async () => {
    stubRoute('GET', '/api/me/loyalty', summaryBody());
    const loyalty = buildService({ accessToken: () => 'test-token', isAuthenticated: () => true });

    await loyalty.refreshSummary();

    expect(loyalty.summary()).toEqual({
      balance: 1840,
      earnedThisMonth: 120,
      lifetimeEarned: 2000,
      lifetimeSpent: 160,
      asOf: '2026-08-29T00:00:00.000Z',
    });
    expect(loyalty.state()).toEqual({ status: 'idle' });
    expect(requests.some((r) => r.method === 'GET' && r.path === '/api/me/loyalty')).toBe(true);
  });

  it('refreshSummary() reports an error and keeps summary=null when the request fails', async () => {
    stubRoute('GET', '/api/me/loyalty', { title: 'boom', status: 500 }, 500);
    const apiFail = { report: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        LoyaltyService,
        { provide: ApiFailureReporter, useValue: apiFail },
        {
          provide: AuthService,
          useValue: { accessToken: () => 'test-token', isAuthenticated: () => true },
        },
      ],
    });
    const loyalty = TestBed.inject(LoyaltyService);

    await loyalty.refreshSummary();

    expect(loyalty.summary()).toBeNull();
    expect(loyalty.state()).toEqual({ status: 'error', message: 'โหลดคะแนนสะสมไม่สำเร็จ' });
    expect(apiFail.report).toHaveBeenCalled();
  });

  it('AC-6 stand-in: no usable session (authenticated but no access token) → error state, never a fake balance', async () => {
    const loyalty = buildService({ accessToken: () => null, isAuthenticated: () => true });

    await loyalty.refreshSummary();

    expect(loyalty.summary()).toBeNull();
    expect(loyalty.state()).toEqual({ status: 'error', message: 'โหลดคะแนนสะสมไม่สำเร็จ' });
    expect(requests.length).toBe(0);
  });

  it('does nothing when there is no session at all', async () => {
    const loyalty = buildService({ accessToken: () => null, isAuthenticated: () => false });

    await loyalty.refreshSummary();

    expect(loyalty.summary()).toBeNull();
    expect(loyalty.state()).toEqual({ status: 'idle' });
    expect(requests.length).toBe(0);
  });

  it('loadLedgerFirst() fetches GET /api/me/loyalty/entries and maps each entry', async () => {
    stubRoute(
      'GET',
      '/api/me/loyalty/entries',
      entriesPage([
        {
          id: 'entry-1',
          points: 12,
          kind: 'earn',
          reason: 'order_paid',
          orderNumber: 'ORD-0001',
          occurredAt: '2026-08-01T00:00:00.000Z',
        },
      ]),
    );
    const loyalty = buildService({ accessToken: () => 'test-token', isAuthenticated: () => true });

    await loyalty.loadLedgerFirst();

    expect(loyalty.ledger()).toEqual([
      {
        id: 'entry-1',
        points: 12,
        kind: 'earn',
        reason: 'order_paid',
        orderNumber: 'ORD-0001',
        occurredAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    expect(loyalty.ledgerHasMore()).toBe(false);
    const call = requests.find((r) => r.method === 'GET' && r.path === '/api/me/loyalty/entries');
    expect(call?.search).toContain('PageSize=20');
  });

  it('loadMoreLedger() without a session resolves without touching the pager', async () => {
    const loyalty = buildService({ accessToken: () => null, isAuthenticated: () => false });

    await expect(loyalty.loadMoreLedger()).resolves.toBeUndefined();
    expect(loyalty.ledger()).toEqual([]);
    expect(requests.length).toBe(0);
  });
});
