import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { SellerApplicationService } from './seller-application.service';

/**
 * F-03 (TASK-PLAN-2026-09-12 §8.3): `sellerGuard` gates /seller on the real store status, so the
 * cache that keeps it from re-requesting `GET /api/me/seller-application` on every navigation —
 * and the failure path that must NOT read as "never applied" — live here.
 *
 * Stubs `fetch` directly (same pattern as `onboarding.service.spec.ts`) rather than the service
 * under test, so the request count is a real observation and not an assumption.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string }[];

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

function problemDetails(status: number, title: string) {
  return { title, status, traceId: 'test-trace-id' };
}

function application(status: string, extra: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    studioName: 'ห้องเรียนครูพิม',
    bio: '',
    specialties: [],
    status,
    rejectionReason: null,
    appliedAt: null,
    reviewedAt: null,
    ...extra,
  };
}

/** GET and POST share the path `/api/me/seller-application`, so the method must be part of it. */
function countRequests(path: string, method = 'GET'): number {
  return requests.filter((r) => r.path === path && r.method === method.toUpperCase()).length;
}

type Harness = {
  service: SellerApplicationService;
  apiFail: { report: ReturnType<typeof vi.fn> };
  user: WritableSignal<{ id: string } | null>;
};

function buildService(): Harness {
  const apiFail = { report: vi.fn() };
  const user = signal<{ id: string } | null>({ id: 'user-1' });

  TestBed.configureTestingModule({
    providers: [
      SellerApplicationService,
      { provide: ApiFailureReporter, useValue: apiFail },
      { provide: AuthService, useValue: { user } as unknown as AuthService },
    ],
  });

  return { service: TestBed.inject(SellerApplicationService), apiFail, user };
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    requests.push({ method: request.method, path: url.pathname });

    const route = routes.get(`${request.method.toUpperCase()} ${url.pathname}`);
    if (!route) return jsonResponse({ title: 'no stub for this route', status: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('SellerApplicationService.resolveAccessStatus (F-03)', () => {
  it('maps an approved application to "approved"', async () => {
    stubRoute('GET', '/api/me/seller-application', application('approved'));
    const { service } = buildService();

    expect(await service.resolveAccessStatus()).toBe('approved');
    expect(service.accessStatus()).toBe('approved');
  });

  it('maps a pending application to "pending"', async () => {
    stubRoute('GET', '/api/me/seller-application', application('pending'));
    const { service } = buildService();

    expect(await service.resolveAccessStatus()).toBe('pending');
  });

  it('maps a rejected application to "rejected" and keeps the reason readable', async () => {
    stubRoute(
      'GET',
      '/api/me/seller-application',
      application('rejected', { rejectionReason: 'เอกสารไม่ครบ' }),
    );
    const { service } = buildService();

    expect(await service.resolveAccessStatus()).toBe('rejected');
    expect(service.mine()?.rejectionReason).toBe('เอกสารไม่ครบ');
  });

  it('maps 404 (never applied) to "none", not to a failure', async () => {
    stubRoute('GET', '/api/me/seller-application', problemDetails(404, 'Not Found'), 404);
    const { service, apiFail } = buildService();

    expect(await service.resolveAccessStatus()).toBe('none');
    expect(service.mine()).toBeNull();
    expect(apiFail.report).not.toHaveBeenCalled();
  });

  it('maps a 5xx to "unavailable" and reports it through ApiFailureReporter', async () => {
    stubRoute(
      'GET',
      '/api/me/seller-application',
      problemDetails(500, 'Internal Server Error'),
      500,
    );
    const { service, apiFail } = buildService();

    expect(await service.resolveAccessStatus()).toBe('unavailable');
    expect(apiFail.report).toHaveBeenCalledWith('ตรวจสอบสถานะร้านของคุณ', expect.anything());
  });

  it('caches the answer — a second navigation inside /seller sends no second request', async () => {
    stubRoute('GET', '/api/me/seller-application', application('approved'));
    const { service } = buildService();

    await service.resolveAccessStatus();
    await service.resolveAccessStatus();
    await service.resolveAccessStatus();

    expect(countRequests('/api/me/seller-application')).toBe(1);
  });

  it('does not re-request while a failure is still fresh (no toast storm during an outage)', async () => {
    stubRoute('GET', '/api/me/seller-application', problemDetails(503, 'Unavailable'), 503);
    const { service, apiFail } = buildService();

    expect(await service.resolveAccessStatus()).toBe('unavailable');
    expect(await service.resolveAccessStatus()).toBe('unavailable');

    expect(countRequests('/api/me/seller-application')).toBe(1);
    expect(apiFail.report).toHaveBeenCalledTimes(1);
  });

  it('collapses parallel guard runs into one request', async () => {
    stubRoute('GET', '/api/me/seller-application', application('approved'));
    const { service } = buildService();

    const [a, b] = await Promise.all([
      service.resolveAccessStatus(),
      service.resolveAccessStatus(),
    ]);

    expect(a).toBe('approved');
    expect(b).toBe('approved');
    expect(countRequests('/api/me/seller-application')).toBe(1);
  });

  it('force: true refetches even with a cached answer', async () => {
    stubRoute('GET', '/api/me/seller-application', application('approved'));
    const { service } = buildService();

    await service.resolveAccessStatus();
    await service.resolveAccessStatus({ force: true });

    expect(countRequests('/api/me/seller-application')).toBe(2);
  });
});

describe('SellerApplicationService cache invalidation (F-03 requirement 2)', () => {
  it('clears the cached decision on sign-out', async () => {
    stubRoute('GET', '/api/me/seller-application', application('approved'));
    const { service, user } = buildService();

    await service.resolveAccessStatus();
    expect(service.accessStatus()).toBe('approved');

    user.set(null);
    TestBed.tick();

    expect(service.accessStatus()).toBeNull();
    expect(service.mine()).toBeNull();
  });

  it('never serves one account the decision cached for another', async () => {
    stubRoute('GET', '/api/me/seller-application', application('approved'));
    const { service, user } = buildService();

    await service.resolveAccessStatus();

    // Second account on the same browser: never applied.
    user.set({ id: 'user-2' });
    stubRoute('GET', '/api/me/seller-application', problemDetails(404, 'Not Found'), 404);

    expect(await service.resolveAccessStatus()).toBe('none');
    expect(countRequests('/api/me/seller-application')).toBe(2);
  });

  it('replaces the cached decision when a new application is submitted', async () => {
    stubRoute(
      'GET',
      '/api/me/seller-application',
      application('rejected', { rejectionReason: 'ข้อมูลไม่ครบ' }),
    );
    stubRoute('POST', '/api/me/seller-application', application('pending'));
    const { service } = buildService();

    expect(await service.resolveAccessStatus()).toBe('rejected');

    const result = await service.submit({ studioName: 'ห้องเรียนครูพิม', bio: '', specialties: [] });

    expect(result.ok).toBe(true);
    // The stale "rejected" must be gone without another GET — the POST response is the truth.
    expect(await service.resolveAccessStatus()).toBe('pending');
    expect(countRequests('/api/me/seller-application')).toBe(1);
  });

  it('clearAccessCache forces the next lookup to hit the API again', async () => {
    stubRoute('GET', '/api/me/seller-application', application('approved'));
    const { service } = buildService();

    await service.resolveAccessStatus();
    service.clearAccessCache();
    await service.resolveAccessStatus();

    expect(countRequests('/api/me/seller-application')).toBe(2);
  });
});

describe('SellerApplicationService.loadMine (GAP-01 behaviour kept)', () => {
  it('returns the application and primes the guard cache', async () => {
    stubRoute('GET', '/api/me/seller-application', application('pending'));
    const { service } = buildService();

    const mine = await service.loadMine();

    expect(mine?.status).toBe('pending');
    // The become-seller page already asked — the guard must not ask again.
    expect(await service.resolveAccessStatus()).toBe('pending');
    expect(countRequests('/api/me/seller-application')).toBe(1);
  });

  it('still reads a failed lookup as "no application" for the apply form, without caching it', async () => {
    stubRoute('GET', '/api/me/seller-application', problemDetails(500, 'Boom'), 500);
    const { service } = buildService();

    expect(await service.loadMine()).toBeNull();
    // Not cached as "none": the guard has to make its own call and decide on the failure itself.
    expect(service.accessStatus()).toBeNull();
  });
});
