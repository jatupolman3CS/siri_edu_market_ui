import { TestBed } from '@angular/core/testing';
import { WalletService } from './wallet.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { AuthService } from './auth.service';

type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; search: string; body?: unknown }[];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

function buildService(auth: { accessToken(): string | null; isAuthenticated(): boolean }): WalletService {
  TestBed.configureTestingModule({
    providers: [
      WalletService,
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      { provide: AuthService, useValue: auth },
    ],
  });

  return TestBed.inject(WalletService);
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    let body: unknown = undefined;
    // `@hey-api/client-fetch` calls `fetch(request)` with the body already baked into the
    // `Request` object rather than passing a separate `init.body` — read it off the request
    // itself (same pattern as `order.service.spec.ts`).
    if (request.method !== 'GET') {
      const text = await request.clone().text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
    }
    requests.push({ method: request.method, path, search: url.search, body });

    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('WalletService', () => {
  it('starts with summary=null and state=idle', () => {
    const wallet = buildService({ accessToken: () => 'test-token', isAuthenticated: () => true });

    expect(wallet.summary()).toBeNull();
    expect(wallet.state()).toEqual({ status: 'idle' });
  });

  it('refreshSummary() fetches GET /api/me/wallet and maps the response', async () => {
    stubRoute('GET', '/api/me/wallet', {
      balance: 500,
      asOf: '2026-09-15T10:00:00.000Z',
    });
    const wallet = buildService({ accessToken: () => 'test-token', isAuthenticated: () => true });

    await wallet.refreshSummary();

    expect(wallet.summary()).toEqual({
      balance: 500,
      asOf: '2026-09-15T10:00:00.000Z',
    });
    expect(wallet.state()).toEqual({ status: 'idle' });
    expect(requests.some((r) => r.method === 'GET' && r.path === '/api/me/wallet')).toBe(true);
  });

  it('refreshSummary() reports error and keeps summary=null when fetch fails', async () => {
    stubRoute('GET', '/api/me/wallet', { message: 'server error' }, 500);
    const apiFail = { report: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        WalletService,
        { provide: ApiFailureReporter, useValue: apiFail },
        {
          provide: AuthService,
          useValue: { accessToken: () => 'test-token', isAuthenticated: () => true },
        },
      ],
    });
    const wallet = TestBed.inject(WalletService);

    await wallet.refreshSummary();

    expect(wallet.summary()).toBeNull();
    expect(wallet.state()).toEqual({ status: 'error', message: 'โหลดข้อมูลกระเป๋าเงินไม่สำเร็จ' });
    expect(apiFail.report).toHaveBeenCalled();
  });

  it('does nothing when not authenticated and no access token', async () => {
    const wallet = buildService({ accessToken: () => null, isAuthenticated: () => false });

    await wallet.refreshSummary();

    expect(wallet.summary()).toBeNull();
    expect(wallet.state()).toEqual({ status: 'idle' });
    expect(requests.length).toBe(0);
  });

  it('sets error state when authenticated but has no access token', async () => {
    const wallet = buildService({ accessToken: () => null, isAuthenticated: () => true });

    await wallet.refreshSummary();

    expect(wallet.summary()).toBeNull();
    expect(wallet.state()).toEqual({ status: 'error', message: 'โหลดข้อมูลกระเป๋าเงินไม่สำเร็จ' });
    expect(requests.length).toBe(0);
  });

  it('loadLedgerFirst() fetches GET /api/me/wallet/entries and maps items', async () => {
    stubRoute('GET', '/api/me/wallet/entries', {
      items: [
        {
          id: 'ent-1',
          kind: 'topup',
          amount: 100,
          reason: 'wallet_topup',
          occurredAt: '2026-09-15T10:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1,
    });
    const wallet = buildService({ accessToken: () => 'test-token', isAuthenticated: () => true });

    await wallet.loadLedgerFirst();

    expect(wallet.ledger()).toEqual([
      {
        id: 'ent-1',
        kind: 'topup',
        amount: 100,
        reason: 'wallet_topup',
        orderNumber: undefined,
        occurredAt: '2026-09-15T10:00:00.000Z',
      },
    ]);
    expect(wallet.ledgerHasMore()).toBe(false);
  });

  it('loadMoreLedger() without session resolves without touching the pager', async () => {
    const wallet = buildService({ accessToken: () => null, isAuthenticated: () => false });

    await expect(wallet.loadMoreLedger()).resolves.toBeUndefined();
    expect(wallet.ledger()).toEqual([]);
  });

  it('createTopUp(amount) calls POST /api/me/wallet/topups and maps response', async () => {
    stubRoute('POST', '/api/me/wallet/topups', {
      id: 'top-1',
      amount: 100,
      status: 'pending',
      stripePaymentIntentId: 'pi_123',
      clientSecret: 'secret_123',
      createdAt: '2026-09-15T10:00:00.000Z',
    });
    const wallet = buildService({ accessToken: () => 'test-token', isAuthenticated: () => true });

    const result = await wallet.createTopUp(100);

    expect(result).toEqual({
      id: 'top-1',
      amount: 100,
      status: 'pending',
      stripePaymentIntentId: 'pi_123',
      clientSecret: 'secret_123',
      createdAt: '2026-09-15T10:00:00.000Z',
      succeededAt: null,
    });
    const postReq = requests.find((r) => r.method === 'POST' && r.path === '/api/me/wallet/topups');
    expect(postReq).toBeDefined();
    expect(postReq?.body).toEqual({ amount: 100 });
  });

  it('createTopUp(amount) returns null on failure', async () => {
    stubRoute('POST', '/api/me/wallet/topups', { detail: 'จำนวนเงินไม่ถูกต้อง' }, 400);
    const wallet = buildService({ accessToken: () => 'test-token', isAuthenticated: () => true });

    const result = await wallet.createTopUp(-10);

    expect(result).toBeNull();
  });

  it('pollTopUp(id) calls GET /api/me/wallet/topups/{id} and maps response', async () => {
    stubRoute('GET', '/api/me/wallet/topups/top-1', {
      id: 'top-1',
      amount: 100,
      status: 'succeeded',
      stripePaymentIntentId: 'pi_123',
      clientSecret: null,
      createdAt: '2026-09-15T10:00:00.000Z',
      succeededAt: '2026-09-15T10:02:00.000Z',
    });
    const wallet = buildService({ accessToken: () => 'test-token', isAuthenticated: () => true });

    const result = await wallet.pollTopUp('top-1');

    expect(result).toEqual({
      id: 'top-1',
      amount: 100,
      status: 'succeeded',
      stripePaymentIntentId: 'pi_123',
      clientSecret: null,
      createdAt: '2026-09-15T10:00:00.000Z',
      succeededAt: '2026-09-15T10:02:00.000Z',
    });
  });

  it('pollTopUp(id) returns null on failure', async () => {
    stubRoute('GET', '/api/me/wallet/topups/top-999', { message: 'Not found' }, 404);
    const wallet = buildService({ accessToken: () => 'test-token', isAuthenticated: () => true });

    const result = await wallet.pollTopUp('top-999');

    expect(result).toBeNull();
  });
});
