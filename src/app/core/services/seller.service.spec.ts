import { TestBed } from '@angular/core/testing';
import { SellerService } from './seller.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { DEFAULT_SELLER_INSIGHTS } from '../models';

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

describe('SellerService — insights (seller-analytics-insights v1 §4 round 1 stub)', () => {
  it('defaults stats().insights to DEFAULT_SELLER_INSIGHTS before any dashboard load', () => {
    const service = buildService();

    expect(service.stats().insights).toEqual(DEFAULT_SELLER_INSIGHTS);
  });

  it('keeps stats().insights at DEFAULT_SELLER_INSIGHTS after a real dashboard load — mapSellerStats is not touched until round 2', async () => {
    stubRoute('GET', '/api/seller/dashboard', {
      totalRevenue: 1000,
      monthlyRevenue: 200,
      totalDownloads: 5,
      monthlyDownloads: 2,
      averageRating: 4.5,
      totalReviews: 3,
      pendingPayout: 100,
      activeListings: 2,
      pendingApproval: 0,
      followerCount: 10,
      newFollowersThisMonth: 1,
      revenueByMonth: [],
      topCategories: [],
    });
    const service = buildService();

    await service.refreshDashboard();

    expect(service.stats().insights).toEqual(DEFAULT_SELLER_INSIGHTS);
    expect(service.stats().totalRevenue).toBe(1000);
  });
});

describe('SellerService — seller_profile_required (QA fix: friendly 403, not a generic toast)', () => {
  function buildServiceWithReporterSpy(): { service: SellerService; report: ReturnType<typeof vi.fn> } {
    const report = vi.fn();
    TestBed.configureTestingModule({
      providers: [SellerService, { provide: ApiFailureReporter, useValue: { report } }],
    });
    return { service: TestBed.inject(SellerService), report };
  }

  it('refreshDashboard() sets sellerProfileRequired without a generic toast on 403 seller_profile_required', async () => {
    stubRoute(
      'GET',
      '/api/seller/dashboard',
      { title: 'Forbidden', status: 403, statusCode: 403, code: 'seller_profile_required' },
      403,
    );
    const { service, report } = buildServiceWithReporterSpy();

    await service.refreshDashboard();

    expect(service.sellerProfileRequired()).toBe(true);
    expect(report).not.toHaveBeenCalled();
  });

  it('refreshDashboard() still reports a generic failure for any other error', async () => {
    stubRoute('GET', '/api/seller/dashboard', { title: 'boom', status: 500, statusCode: 500 }, 500);
    const { service, report } = buildServiceWithReporterSpy();

    await service.refreshDashboard();

    expect(service.sellerProfileRequired()).toBe(false);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('refreshDocuments() sets sellerProfileRequired without a generic toast on 403 seller_profile_required', async () => {
    stubRoute(
      'GET',
      '/api/seller/documents',
      { title: 'Forbidden', status: 403, statusCode: 403, code: 'seller_profile_required' },
      403,
    );
    const { service, report } = buildServiceWithReporterSpy();

    await service.refreshDocuments();

    expect(service.sellerProfileRequired()).toBe(true);
    expect(report).not.toHaveBeenCalled();
  });

  it('clears sellerProfileRequired once a later call succeeds', async () => {
    stubRoute(
      'GET',
      '/api/seller/dashboard',
      { title: 'Forbidden', status: 403, statusCode: 403, code: 'seller_profile_required' },
      403,
    );
    const { service } = buildServiceWithReporterSpy();
    await service.refreshDashboard();
    expect(service.sellerProfileRequired()).toBe(true);

    stubRoute('GET', '/api/seller/dashboard', {
      totalRevenue: 0,
      monthlyRevenue: 0,
      totalDownloads: 0,
      monthlyDownloads: 0,
      averageRating: 0,
      totalReviews: 0,
      pendingPayout: 0,
      activeListings: 0,
      pendingApproval: 0,
      followerCount: 0,
      newFollowersThisMonth: 0,
      revenueByMonth: [],
      topCategories: [],
    });
    await service.refreshDashboard();

    expect(service.sellerProfileRequired()).toBe(false);
  });

  it('loadEarnings() sets sellerProfileRequired without a generic toast on 403 seller_profile_required', async () => {
    stubRoute(
      'GET',
      '/api/seller/earnings',
      { title: 'Forbidden', status: 403, statusCode: 403, code: 'seller_profile_required' },
      403,
    );
    const { service, report } = buildServiceWithReporterSpy();

    await service.loadEarnings();

    expect(service.sellerProfileRequired()).toBe(true);
    expect(report).not.toHaveBeenCalled();
  });

  it('loadEarnings() still reports a generic failure for any other error', async () => {
    stubRoute('GET', '/api/seller/earnings', { title: 'boom', status: 500, statusCode: 500 }, 500);
    const { service, report } = buildServiceWithReporterSpy();

    await service.loadEarnings();

    expect(service.sellerProfileRequired()).toBe(false);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('loadEarnings() clears sellerProfileRequired once a later call succeeds', async () => {
    stubRoute(
      'GET',
      '/api/seller/earnings',
      { title: 'Forbidden', status: 403, statusCode: 403, code: 'seller_profile_required' },
      403,
    );
    const { service } = buildServiceWithReporterSpy();
    await service.loadEarnings();
    expect(service.sellerProfileRequired()).toBe(true);

    stubRoute('GET', '/api/seller/earnings', { totalEarnings: 0, pendingBalance: 0, payouts: [] });
    await service.loadEarnings();

    expect(service.sellerProfileRequired()).toBe(false);
  });

  it('loadReviews() sets sellerProfileRequired without a generic toast on 403 seller_profile_required', async () => {
    stubRoute(
      'GET',
      '/api/seller/reviews',
      { title: 'Forbidden', status: 403, statusCode: 403, code: 'seller_profile_required' },
      403,
    );
    const { service, report } = buildServiceWithReporterSpy();

    const rows = await service.loadReviews();

    expect(rows).toEqual([]);
    expect(service.sellerProfileRequired()).toBe(true);
    expect(report).not.toHaveBeenCalled();
  });

  it('loadReviews() still reports a generic failure for any other error', async () => {
    stubRoute('GET', '/api/seller/reviews', { title: 'boom', status: 500, statusCode: 500 }, 500);
    const { service, report } = buildServiceWithReporterSpy();

    const rows = await service.loadReviews();

    expect(rows).toEqual([]);
    expect(service.sellerProfileRequired()).toBe(false);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('loadReviews() clears sellerProfileRequired once a later call succeeds', async () => {
    stubRoute(
      'GET',
      '/api/seller/reviews',
      { title: 'Forbidden', status: 403, statusCode: 403, code: 'seller_profile_required' },
      403,
    );
    const { service } = buildServiceWithReporterSpy();
    await service.loadReviews();
    expect(service.sellerProfileRequired()).toBe(true);

    stubRoute('GET', '/api/seller/reviews', { items: [], totalCount: 0 });
    await service.loadReviews();

    expect(service.sellerProfileRequired()).toBe(false);
  });
});

/**
 * ai-qna-draft v1 §0.2 Fix-1 / §1: `draftQnaAnswer` used to call `(client.post as any)` directly
 * — these specs pin it down to the generated SDK function after the regen against a live backend.
 */
describe('SellerService — draftQnaAnswer (ai-qna-draft v1 §0.2/§1)', () => {
  it('AC-4: calls the draft-answer endpoint through the generated SDK and returns the draft', async () => {
    stubRoute('POST', '/api/seller/qna/q-1/draft-answer', {
      isSuccess: true,
      failureReason: null,
      draftAnswer: 'สวัสดีครับ เอกสารนี้ครอบคลุมเนื้อหาบทที่ 1-3 ครับ',
    });
    const service = buildService();

    const draft = await service.draftQnaAnswer('q-1');

    expect(draft).toBe('สวัสดีครับ เอกสารนี้ครอบคลุมเนื้อหาบทที่ 1-3 ครับ');
  });

  it('returns an empty string when the response has no draftAnswer', async () => {
    stubRoute('POST', '/api/seller/qna/q-2/draft-answer', {
      isSuccess: false,
      failureReason: 'AI completion client not configured',
      draftAnswer: null,
    });
    const service = buildService();

    const draft = await service.draftQnaAnswer('q-2');

    expect(draft).toBe('');
  });
});

/**
 * ai-listing-autofill v1 §0.2 Fix-1 / §1: `getAutofillSuggestion` used to call
 * `(client.post as any)` for both branches — these specs pin both down to the generated SDK
 * functions after the regen against a live backend.
 */
describe('SellerService — getAutofillSuggestion (ai-listing-autofill v1 §0.2/§1)', () => {
  it('AC-7 (documentId branch): calls the by-id autofill-suggestion endpoint', async () => {
    stubRoute('POST', '/api/seller/documents/doc-1/autofill-suggestion', {
      isSuccess: true,
      failureReason: null,
      title: 'แบบฝึกหัดคณิตศาสตร์ ป.4',
      shortDescription: 'โจทย์เศษส่วนพร้อมเฉลย',
      description: 'เนื้อหาเต็ม...',
      categoryIds: ['cat-math'],
      subcategoryId: null,
      resourceType: 'worksheet',
      gradeLevels: ['primary-late'],
      tags: ['คณิตศาสตร์', 'เศษส่วน'],
    });
    const service = buildService();

    const res = await service.getAutofillSuggestion({ documentId: 'doc-1' });

    expect(res.isSuccess).toBe(true);
    expect(res.title).toBe('แบบฝึกหัดคณิตศาสตร์ ป.4');
    expect(res.categoryIds).toEqual(['cat-math']);
  });

  it('AC-7 (storageKey branch): calls the standalone autofill-suggestion endpoint', async () => {
    stubRoute('POST', '/api/seller/documents/autofill-suggestion', {
      isSuccess: true,
      failureReason: null,
      title: 'ข้อสอบวิทยาศาสตร์ ม.1',
      shortDescription: 'ข้อสอบเก็บคะแนนกลางภาค',
      description: null,
      categoryIds: ['cat-science'],
      subcategoryId: null,
      resourceType: 'exam',
      gradeLevels: ['secondary-early'],
      tags: ['วิทยาศาสตร์'],
    });
    const service = buildService();

    const res = await service.getAutofillSuggestion({
      storageKey: 'uploads/tmp-1.pdf',
      fileName: 'tmp-1.pdf',
    });

    expect(res.isSuccess).toBe(true);
    expect(res.title).toBe('ข้อสอบวิทยาศาสตร์ ม.1');
  });

  it('AC-4: returns a failure shape (without throwing) when the request errors out', async () => {
    stubRoute('POST', '/api/seller/documents/autofill-suggestion', { title: 'boom', status: 500 }, 500);
    const service = buildService();

    const res = await service.getAutofillSuggestion({ sampleText: 'เนื้อหาไฟล์...' });

    expect(res.isSuccess).toBe(false);
  });
});
