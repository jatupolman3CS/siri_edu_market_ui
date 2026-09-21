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
/** document-versioning v1 §1.3: lets a test assert the exact body a PUT call sent. */
let requestBodies: { method: string; path: string; body: unknown }[];

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
  requestBodies = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    const bodyText = await request.clone().text().catch(() => '');
    requestBodies.push({
      method: request.method,
      path,
      body: bodyText ? JSON.parse(bodyText) : undefined,
    });
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

describe('SellerService — setListedMainFile (document-versioning v1 §3.1/§4.1)', () => {
  it('sends isNewVersion + changeNote to PUT .../listed-main-file and maps the response', async () => {
    stubRoute('PUT', '/api/seller/documents/doc-1/listed-main-file', {
      id: 'doc-1',
      currentVersionNumber: 2,
      lastVersionNotifiedBuyerCount: 5,
    });
    const service = buildService();

    const result = await service.setListedMainFile('doc-1', 'file-2', {
      isNewVersion: true,
      changeNote: 'อัปเดตข้อสอบให้ตรงหลักสูตรปีล่าสุด',
    });

    const call = requestBodies.find(
      (r) => r.method === 'PUT' && r.path === '/api/seller/documents/doc-1/listed-main-file',
    );
    expect(call?.body).toEqual({
      fileId: 'file-2',
      isNewVersion: true,
      changeNote: 'อัปเดตข้อสอบให้ตรงหลักสูตรปีล่าสุด',
    });
    expect(result?.currentVersionNumber).toBe(2);
    expect(result?.lastVersionNotifiedBuyerCount).toBe(5);
  });

  it('omits isNewVersion/changeNote when the caller does not opt into a new version', async () => {
    stubRoute('PUT', '/api/seller/documents/doc-1/listed-main-file', { id: 'doc-1' });
    const service = buildService();

    await service.setListedMainFile('doc-1', 'file-2');

    const call = requestBodies.find(
      (r) => r.method === 'PUT' && r.path === '/api/seller/documents/doc-1/listed-main-file',
    );
    expect((call?.body as { fileId?: string }).fileId).toBe('file-2');
    expect((call?.body as { isNewVersion?: boolean }).isNewVersion).toBeUndefined();
  });
});

/**
 * document-watermark-scope-options v1 §3.6 — AC-23/AC-24 at the wire level. The backend reads an
 * ABSENT key as "keep inheriting the document's current watermark settings", so the difference
 * between omitting `previewWatermarkEnabled` and sending it as `null` is the difference between
 * inheriting and overwriting. `JSON.stringify` drops `undefined` values, which makes that mistake
 * invisible in a naive object-identity assertion — these tests look at the serialized body, and at
 * the keys that survived serialization, for exactly that reason.
 */
describe('SellerService — setListedMainFile watermark override (document-watermark-scope-options v1 §3.6)', () => {
  const PATH = '/api/seller/documents/doc-1/listed-main-file';

  function sentBody(): Record<string, unknown> {
    const call = requestBodies.find((r) => r.method === 'PUT' && r.path === PATH);
    expect(call).toBeDefined();
    return call?.body as Record<string, unknown>;
  }

  it('AC-23: no override at all → neither watermark key appears in the request body', async () => {
    stubRoute('PUT', PATH, { id: 'doc-1' });
    const service = buildService();

    await service.setListedMainFile('doc-1', 'file-2', { isNewVersion: true, changeNote: 'แก้ไฟล์' });

    const body = sentBody();
    expect(Object.keys(body)).not.toContain('previewWatermarkEnabled');
    expect(Object.keys(body)).not.toContain('watermarkEnabled');
    expect(body['fileId']).toBe('file-2');
  });

  it('AC-24: only the overridden key is sent — the untouched one stays absent', async () => {
    stubRoute('PUT', PATH, { id: 'doc-1' });
    const service = buildService();

    await service.setListedMainFile('doc-1', 'file-2', {
      isNewVersion: false,
      previewWatermarkEnabled: false,
    });

    const body = sentBody();
    expect(body['previewWatermarkEnabled']).toBe(false);
    expect(Object.keys(body)).not.toContain('watermarkEnabled');
  });

  it('AC-24: both overrides travel with the seller\'s exact values', async () => {
    stubRoute('PUT', PATH, { id: 'doc-1' });
    const service = buildService();

    await service.setListedMainFile('doc-1', 'file-2', {
      isNewVersion: true,
      changeNote: 'ปิดลายน้ำตัวอย่าง',
      previewWatermarkEnabled: false,
      watermarkEnabled: true,
    });

    expect(sentBody()).toEqual({
      fileId: 'file-2',
      isNewVersion: true,
      changeNote: 'ปิดลายน้ำตัวอย่าง',
      previewWatermarkEnabled: false,
      watermarkEnabled: true,
    });
  });

  it('AC-24: an override of `false` is sent, not mistaken for "nothing to send"', async () => {
    stubRoute('PUT', PATH, { id: 'doc-1' });
    const service = buildService();

    await service.setListedMainFile('doc-1', 'file-2', {
      isNewVersion: false,
      previewWatermarkEnabled: false,
      watermarkEnabled: false,
    });

    const body = sentBody();
    expect(body['previewWatermarkEnabled']).toBe(false);
    expect(body['watermarkEnabled']).toBe(false);
  });
});

describe('SellerService — getDocumentVersions (document-versioning v1 §3.2/§4.1)', () => {
  it('GETs .../versions and maps the version history, newest first', async () => {
    stubRoute('GET', '/api/seller/documents/doc-1/versions', [
      { versionNumber: 2, changeNote: 'แก้ไขล่าสุด', createdAt: '2026-09-10T00:00:00Z', notifiedBuyerCount: 5 },
      { versionNumber: 1, changeNote: null, createdAt: '2026-08-01T00:00:00Z', notifiedBuyerCount: 0 },
    ]);
    const service = buildService();

    const versions = await service.getDocumentVersions('doc-1');

    expect(versions).toHaveLength(2);
    expect(versions[0]).toEqual({
      versionNumber: 2,
      changeNote: 'แก้ไขล่าสุด',
      createdAt: '2026-09-10T00:00:00Z',
      notifiedBuyerCount: 5,
    });
  });

  it('returns an empty array (without throwing) when the request fails', async () => {
    stubRoute('GET', '/api/seller/documents/doc-1/versions', { message: 'boom' }, 500);
    const service = buildService();

    const versions = await service.getDocumentVersions('doc-1');

    expect(versions).toEqual([]);
  });
});

/**
 * document-preview-access-fixes v1 §3.5/§4.2 (D3) — `GET /api/seller/documents/{id}/download-url`
 * answers `400 { message: "FileStorageKey is missing." }` for a listing that has no file yet, and
 * that case has to reach the page as its own outcome (it gets a different Thai message and must
 * not raise a generic failure toast on top of it).
 */
describe('SellerService — getDocumentDownloadUrl (document-preview-access-fixes v1 §3.5)', () => {
  function buildWithReporter(): { service: SellerService; report: ReturnType<typeof vi.fn> } {
    const report = vi.fn();
    TestBed.configureTestingModule({
      providers: [SellerService, { provide: ApiFailureReporter, useValue: { report } }],
    });
    return { service: TestBed.inject(SellerService), report };
  }

  it('returns the presigned url on success', async () => {
    stubRoute('GET', '/api/seller/documents/doc-1/download-url', {
      url: '/api/files/download/docs/doc-1.pdf',
      expiresSeconds: 600,
    });
    const { service, report } = buildWithReporter();

    const result = await service.getDocumentDownloadUrl('doc-1');

    expect(result).toEqual({ url: '/api/files/download/docs/doc-1.pdf' });
    expect(report).not.toHaveBeenCalled();
  });

  it('maps 400 (FileStorageKey is missing) to no_file without reporting a generic failure', async () => {
    // Exactly what the controller sends: `BadRequest(new { message })` — no ProblemDetails
    // `status` field, which is why the service reads `response.status` instead of the body.
    stubRoute('GET', '/api/seller/documents/doc-1/download-url', { message: 'FileStorageKey is missing.' }, 400);
    const { service, report } = buildWithReporter();

    const result = await service.getDocumentDownloadUrl('doc-1');

    expect(result).toEqual({ error: 'no_file' });
    expect(report).not.toHaveBeenCalled();
  });

  it('maps any other failure to failed and reports it', async () => {
    stubRoute('GET', '/api/seller/documents/doc-1/download-url', { message: 'boom' }, 500);
    const { service, report } = buildWithReporter();

    const result = await service.getDocumentDownloadUrl('doc-1');

    expect(result).toEqual({ error: 'failed' });
    expect(report).toHaveBeenCalledWith('errors.context.downloadFile', expect.anything());
  });

  it('treats a blank url in a 200 response as no_file rather than navigating nowhere', async () => {
    stubRoute('GET', '/api/seller/documents/doc-1/download-url', { url: '   ', expiresSeconds: 600 });
    const { service } = buildWithReporter();

    expect(await service.getDocumentDownloadUrl('doc-1')).toEqual({ error: 'no_file' });
  });
});
