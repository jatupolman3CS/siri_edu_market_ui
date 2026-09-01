import { TestBed } from '@angular/core/testing';
import { PlatformStatsService } from './platform-stats.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * real-data-stats v1 §4.1 (round 2 — SDK wired): `loadStats()` calls the real
 * `GET /api/marketplace/stats` and caches the mapped result — every consumer page's
 * "not loaded yet" UI (skeleton / hidden element, per §4's shared principle) reads `stats()`
 * from this one service, so a guest opening login/home never triggers more than one request.
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

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

beforeEach(() => {
  routes = new Map();
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname.replace('/SIRIEDUMARKET.Api', '');
    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

function buildService(): PlatformStatsService {
  TestBed.configureTestingModule({
    providers: [PlatformStatsService, { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  return TestBed.inject(PlatformStatsService);
}

describe('PlatformStatsService (round 2 — SDK wired)', () => {
  it('starts with stats() undefined and statsState idle', () => {
    const service = buildService();

    expect(service.stats()).toBeUndefined();
    expect(service.statsState()).toEqual({ status: 'idle' });
  });

  it('loadStats() calls GET /api/marketplace/stats and maps the response through mapPlatformStats', async () => {
    stubRoute('GET', '/api/marketplace/stats', {
      totalApprovedDocuments: 12500,
      totalSellers: 3200,
      totalDownloads: 98000,
      reviewCount: 8400,
      averageRating: 4.9,
      positiveReviewPercent: 98,
      feeRatePercent: 10,
    });
    const service = buildService();

    service.loadStats();
    await vi.waitFor(() => expect(service.statsState()).toEqual({ status: 'idle' }));

    expect(service.stats()).toEqual({
      totalApprovedDocuments: 12500,
      totalSellers: 3200,
      totalDownloads: 98000,
      reviewCount: 8400,
      averageRating: 4.9,
      positiveReviewPercent: 98,
      feeRatePercent: 10,
    });
  });

  it('AC-EPIC-3: surfaces null averageRating/positiveReviewPercent (no reviews yet) as undefined, never 0', async () => {
    stubRoute('GET', '/api/marketplace/stats', {
      totalApprovedDocuments: 0,
      totalSellers: 0,
      totalDownloads: 0,
      reviewCount: 0,
      averageRating: null,
      positiveReviewPercent: null,
      feeRatePercent: 10,
    });
    const service = buildService();

    service.loadStats();
    await vi.waitFor(() => expect(service.statsState()).toEqual({ status: 'idle' }));

    expect(service.stats()?.averageRating).toBeUndefined();
    expect(service.stats()?.positiveReviewPercent).toBeUndefined();
  });

  it('is idempotent — a second loadStats() call does not trigger a second request once cached', async () => {
    stubRoute('GET', '/api/marketplace/stats', {
      totalApprovedDocuments: 1,
      totalSellers: 1,
      totalDownloads: 1,
      reviewCount: 1,
      feeRatePercent: 10,
    });
    const service = buildService();

    service.loadStats();
    await vi.waitFor(() => expect(service.statsState()).toEqual({ status: 'idle' }));
    const callsAfterFirst = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    service.loadStats();
    service.loadStats();

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
  });

  it('reports the failure and leaves stats() undefined when the request fails', async () => {
    stubRoute(
      'GET',
      '/api/marketplace/stats',
      { title: 'Server error', status: 500, statusCode: 500 },
      500,
    );
    const apiFail = { report: vi.fn() };
    TestBed.configureTestingModule({
      providers: [PlatformStatsService, { provide: ApiFailureReporter, useValue: apiFail }],
    });
    const service = TestBed.inject(PlatformStatsService);

    service.loadStats();
    await vi.waitFor(() => expect(apiFail.report).toHaveBeenCalled());

    expect(service.stats()).toBeUndefined();
    expect(service.statsState()).toEqual({ status: 'error', message: 'โหลดสถิติแพลตฟอร์มไม่สำเร็จ' });
  });
});
