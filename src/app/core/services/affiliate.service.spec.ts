import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AffiliateService } from './affiliate.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import type { AffiliateSummary } from '../models';

/**
 * referral-program v2 §3.7/§4.1: `AffiliateService.refreshSummary` wraps
 * `GET /api/me/affiliate` — these specs stub `fetch` the same way `library.service.spec.ts`
 * does, since the generated SDK client goes straight to the global `fetch`.
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

function buildService(): AffiliateService {
  TestBed.configureTestingModule({
    providers: [
      AffiliateService,
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
    ],
  });
  return TestBed.inject(AffiliateService);
}

beforeEach(() => {
  routes = new Map();
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;

    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('AffiliateService', () => {
  it('initializes with null summary and idle state', () => {
    const service = buildService();
    expect(service.summary()).toBeNull();
    expect(service.state().status).toBe('idle');
  });

  it('refreshSummary maps a successful GET /api/me/affiliate response', async () => {
    stubRoute('GET', '/api/me/affiliate', {
      code: 'MYAFF99',
      shareUrl: 'http://localhost:4200/marketplace?aff=MYAFF99',
      commissionRatePercent: 10,
      isActive: true,
      totalClicks: 25,
      totalConversions: 5,
      commissionEarnedTotal: 500,
    });
    const service = buildService();

    await service.refreshSummary();

    expect(service.summary()).toEqual({
      code: 'MYAFF99',
      shareUrl: 'http://localhost:4200/marketplace?aff=MYAFF99',
      commissionRatePercent: 10,
      isActive: true,
      totalClicks: 25,
      totalConversions: 5,
      commissionEarnedTotal: 500,
    });
    expect(service.state().status).toBe('idle');
  });

  it('refreshSummary clears summary and reports an error state when the call fails', async () => {
    stubRoute('GET', '/api/me/affiliate', { message: 'boom' }, 500);
    const service = buildService();

    await service.refreshSummary();

    expect(service.summary()).toBeNull();
    expect(service.state().status).toBe('error');
  });

  it('setSummaryForTest updates summary signal', () => {
    const service = buildService();
    const mockSummary: AffiliateSummary = {
      code: 'MYAFF99',
      shareUrl: 'http://localhost:4200/marketplace?aff=MYAFF99',
      commissionRatePercent: 10,
      isActive: true,
      totalClicks: 25,
      totalConversions: 5,
      commissionEarnedTotal: 500,
    };

    service.setSummaryForTest(mockSummary);
    expect(service.summary()).toEqual(mockSummary);
  });
});
