import { TestBed } from '@angular/core/testing';
import { DiscoveryService } from './discovery.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.1/§3.2/§4.2.
 *
 * Round 1: `GET /api/marketplace/popular-searches` and `GET /api/marketplace/discovery` don't
 * exist in the generated SDK yet — `loadPopularTerms()`/`loadDiscovery()` throw `TODO(contract)`
 * internally and catch it themselves (§4.2), so this only exercises that fallback + the 5-minute
 * client cache. The real request/response mapping is `discovery.service.spec.ts` round 2's job
 * (§1.4 test list), once `npm run generate:api` ships the 2 new endpoints.
 */
function buildService(apiFail: { report: ReturnType<typeof vi.fn> } = { report: vi.fn() }): DiscoveryService {
  TestBed.configureTestingModule({
    providers: [DiscoveryService, { provide: ApiFailureReporter, useValue: apiFail }],
  });
  return TestBed.inject(DiscoveryService);
}

afterEach(() => TestBed.resetTestingModule());

describe('DiscoveryService (round 1 — TODO(contract) stub)', () => {
  it('starts idle with empty popular terms and no discovery block', () => {
    const service = buildService();

    expect(service.popularTerms()).toEqual([]);
    expect(service.popularPersonalized()).toBe(false);
    expect(service.popularTermsState()).toEqual({ status: 'idle' });
    expect(service.discovery()).toBeNull();
    expect(service.discoveryState()).toEqual({ status: 'idle' });
  });

  it('loadPopularTerms() falls back to an empty list, reports the failure, and settles idle (never a stuck error state)', async () => {
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await service.loadPopularTerms();

    expect(service.popularTerms()).toEqual([]);
    expect(service.popularPersonalized()).toBe(false);
    expect(service.popularTermsState()).toEqual({ status: 'idle' });
    expect(apiFail.report).toHaveBeenCalledWith('โหลดคำค้นยอดนิยม', expect.anything());
  });

  it('loadDiscovery() falls back to discovery() === null, reports the failure, and settles idle', async () => {
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await service.loadDiscovery();

    expect(service.discovery()).toBeNull();
    expect(service.discoveryState()).toEqual({ status: 'idle' });
    expect(apiFail.report).toHaveBeenCalledWith('โหลดคำแนะนำสำหรับหน้าที่ยังไม่ได้ค้นหา', expect.anything());
  });

  it('§4.2 client cache: a second loadPopularTerms() within 5 minutes does not re-report (no re-fetch)', async () => {
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await service.loadPopularTerms();
    expect(apiFail.report).toHaveBeenCalledTimes(1);

    await service.loadPopularTerms();
    expect(apiFail.report).toHaveBeenCalledTimes(1);
  });

  it('§4.2 client cache: a second loadDiscovery() within 5 minutes does not re-report (no re-fetch)', async () => {
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await service.loadDiscovery();
    expect(apiFail.report).toHaveBeenCalledTimes(1);

    await service.loadDiscovery();
    expect(apiFail.report).toHaveBeenCalledTimes(1);
  });
});
