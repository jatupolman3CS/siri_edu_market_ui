import { TestBed } from '@angular/core/testing';
import { SellerService } from './seller.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * real-data-stats v1 §3.5 — `SellerEarningsResponse.nextPayoutDate` isn't on the generated type
 * yet (backend hasn't shipped/regenerated). `nextPayoutDate()` must default to `null` (hide the
 * "โอนรอบถัดไป" line per §4.6/§4.5) rather than fabricate a date — both when the field is simply
 * absent (today) and when the backend genuinely couldn't parse `PLATFORM_SETTING.PayoutSchedule`.
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

function buildService(): SellerService {
  TestBed.configureTestingModule({
    providers: [SellerService, { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  return TestBed.inject(SellerService);
}

describe('SellerService — nextPayoutDate (real-data-stats v1 §3.5)', () => {
  it('defaults to null before any earnings load', () => {
    const service = buildService();

    expect(service.nextPayoutDate()).toBeNull();
  });

  it('stays null after a real earnings load — the field does not exist on the wire yet', async () => {
    stubRoute('GET', '/api/seller/earnings', {
      totalEarnings: 5000,
      pendingBalance: 1200,
      payouts: [],
    });
    const service = buildService();

    await service.loadEarnings();

    expect(service.nextPayoutDate()).toBeNull();
  });

  it('reads nextPayoutDate once the backend starts sending it (round 2 pre-check)', async () => {
    stubRoute('GET', '/api/seller/earnings', {
      totalEarnings: 5000,
      pendingBalance: 1200,
      payouts: [],
      nextPayoutDate: '2026-05-15',
    });
    const service = buildService();

    await service.loadEarnings();

    expect(service.nextPayoutDate()).toBe('2026-05-15');
  });

  it('AC-EPIC-3 / §3.5: surfaces an explicit null (unparseable schedule) as null, not a fabricated date', async () => {
    stubRoute('GET', '/api/seller/earnings', {
      totalEarnings: 5000,
      pendingBalance: 1200,
      payouts: [],
      nextPayoutDate: null,
    });
    const service = buildService();

    await service.loadEarnings();

    expect(service.nextPayoutDate()).toBeNull();
  });
});
