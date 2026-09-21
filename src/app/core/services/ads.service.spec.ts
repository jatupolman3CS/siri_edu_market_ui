import { TestBed } from '@angular/core/testing';
import { AdsService } from './ads.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * seller-ads-promotion v1 (docs/contracts/seller-ads-promotion.md §1.4 "frontend spec",
 * §3, §4.3) — stubs `fetch` (mirrors `payout-account.service.spec.ts`) rather than the service
 * under test.
 *
 * Covers:
 *  - every method actually calling its endpoint (method + path + query/body) and mapping the
 *    response, including the admin variants
 *  - §0 item 12 / §3: the plain `{ message }` (+ `fullDates?`) error shape every ads endpoint
 *    uses (no `status`/`code` at all, unlike `ApiErrorResponse`) — `createCampaign()`'s 3-way
 *    branch (`full_dates` / `price_changed` / `generic`) per §4.2 rules 5–6
 *  - §4.3: `recordImpressions()` fires once per distinct result-set reference (not per call),
 *    dedups `campaignIds`, no-ops on an empty sponsored set, and never throws on a failed request;
 *    `recordClick()` never throws either
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

function buildService(apiFail: { report: ReturnType<typeof vi.fn> } = { report: vi.fn() }): AdsService {
  TestBed.configureTestingModule({
    providers: [AdsService, { provide: ApiFailureReporter, useValue: apiFail }],
  });
  return TestBed.inject(AdsService);
}

function campaignBody(over: Record<string, unknown> = {}) {
  return {
    id: 'camp-1',
    documentId: 'doc-1',
    documentTitle: 'สรุปเคมี ม.6',
    documentCoverUrl: '/api/files/download/seller/cover.png',
    sellerId: 'seller-1',
    placementKey: 'search_top',
    placementName: 'บนสุดของผลค้นหา',
    targetKey: '*',
    targetLabel: null,
    startDate: '2026-09-20',
    endDate: '2026-09-26',
    dayCount: 7,
    pricePerDay: 199,
    totalAmount: 999,
    refundedAmount: 0,
    status: 'scheduled',
    stopReason: null,
    stopNote: null,
    stoppedAt: null,
    impressions: 0,
    clicks: 0,
    createdAt: '2026-09-15T00:00:00.000Z',
    ...over,
  };
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
    if (!route) return jsonResponse({ title: 'no stub for this route' }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('AdsService — seller: placements / availability / quote', () => {
  it('loadPlacements() maps every field of GET /api/seller/ads/placements', async () => {
    stubRoute('GET', '/api/seller/ads/placements', [
      {
        placementKey: 'search_top',
        displayName: 'บนสุดของผลค้นหา',
        description: 'แสดงบนสุดของผลการค้นหา',
        pricePerDay: 199,
        weeklyPrice: 999,
        dailySlotCapacity: 2,
        requiresTarget: false,
      },
    ]);
    const service = buildService();

    const result = await service.loadPlacements();

    expect(result).toEqual([
      {
        placementKey: 'search_top',
        displayName: 'บนสุดของผลค้นหา',
        description: 'แสดงบนสุดของผลการค้นหา',
        pricePerDay: 199,
        weeklyPrice: 999,
        dailySlotCapacity: 2,
        requiresTarget: false,
      },
    ]);
  });

  it('loadPlacements() reports and returns [] on a generic failure', async () => {
    stubRoute('GET', '/api/seller/ads/placements', { title: 'boom' }, 500);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    const result = await service.loadPlacements();

    expect(result).toEqual([]);
    expect(apiFail.report).toHaveBeenCalled();
  });

  it('loadAvailability() sends placement/targetKey/from/to and maps days[]', async () => {
    stubRoute('GET', '/api/seller/ads/availability', {
      placementKey: 'category_top',
      targetKey: 'cat-math',
      pricePerDay: 99,
      weeklyPrice: 499,
      dailySlotCapacity: 2,
      days: [
        { date: '2026-09-20', remainingSlots: 2, isSelectable: true },
        { date: '2026-09-21', remainingSlots: 0, isSelectable: false },
      ],
    });
    const service = buildService();

    const result = await service.loadAvailability({
      placement: 'category_top',
      targetKey: 'cat-math',
      from: '2026-09-20',
      to: '2026-09-21',
    });

    expect(result?.days).toEqual([
      { date: '2026-09-20', remainingSlots: 2, isSelectable: true },
      { date: '2026-09-21', remainingSlots: 0, isSelectable: false },
    ]);
    const call = requests.find((r) => r.method === 'GET' && r.path === '/api/seller/ads/availability');
    expect(call?.search).toContain('placement=category_top');
    expect(call?.search).toContain('targetKey=cat-math');
    expect(call?.search).toContain('from=2026-09-20');
    expect(call?.search).toContain('to=2026-09-21');
  });

  it('loadAvailability() returns null on the documented 400 (>90-day range)', async () => {
    stubRoute(
      'GET',
      '/api/seller/ads/availability',
      { message: 'ดูได้ครั้งละไม่เกิน 90 วัน' },
      400,
    );
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    const result = await service.loadAvailability({
      placement: 'search_top',
      from: '2026-09-01',
      to: '2026-12-31',
    });

    expect(result).toBeNull();
    expect(apiFail.report).not.toHaveBeenCalled();
  });

  it('getQuote() §4.2 rule 1: maps every money field from the server, never computed here', async () => {
    stubRoute('POST', '/api/seller/ads/campaigns/quote', {
      dayCount: 7,
      pricePerDay: 142.71,
      pricingMode: 'weekly',
      totalAmount: 999,
      availableBalance: 1500,
      canAfford: true,
      fullDates: [],
    });
    const service = buildService();

    const result = await service.getQuote({
      documentId: 'doc-1',
      placementKey: 'search_top',
      startDate: '2026-09-20',
      endDate: '2026-09-26',
    });

    expect(result).toEqual({
      ok: true,
      quote: {
        dayCount: 7,
        pricePerDay: 142.71,
        pricingMode: 'weekly',
        totalAmount: 999,
        availableBalance: 1500,
        canAfford: true,
        fullDates: [],
      },
    });
    const call = requests.find((r) => r.method === 'POST' && r.path === '/api/seller/ads/campaigns/quote');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      documentId: 'doc-1',
      placementKey: 'search_top',
      targetKey: null,
      startDate: '2026-09-20',
      endDate: '2026-09-26',
    });
  });

  it('getQuote() returns the real { message } on the documented 400/404', async () => {
    stubRoute(
      'POST',
      '/api/seller/ads/campaigns/quote',
      { message: 'ไม่พบเอกสารหรือตำแหน่งโฆษณา' },
      404,
    );
    const service = buildService();

    const result = await service.getQuote({
      documentId: 'doc-x',
      placementKey: 'search_top',
      startDate: '2026-09-20',
      endDate: '2026-09-26',
    });

    expect(result).toEqual({ ok: false, message: 'ไม่พบเอกสารหรือตำแหน่งโฆษณา' });
  });
});

describe('AdsService — seller: campaigns', () => {
  it('listCampaigns() sends Page/PageSize/status and maps items[]', async () => {
    stubRoute('GET', '/api/seller/ads/campaigns', {
      items: [campaignBody()],
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
    });
    const service = buildService();

    const result = await service.listCampaigns({ status: 'scheduled', page: 1, pageSize: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items?.[0]?.id).toBe('camp-1');
    expect(result.items?.[0]?.status).toBe('scheduled');
    const call = requests.find((r) => r.method === 'GET' && r.path === '/api/seller/ads/campaigns');
    expect(call?.search).toContain('status=scheduled');
  });

  it("listCampaigns() omits status when it's 'all'", async () => {
    stubRoute('GET', '/api/seller/ads/campaigns', { items: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 1 });
    const service = buildService();

    await service.listCampaigns({ status: 'all' });

    const call = requests.find((r) => r.method === 'GET' && r.path === '/api/seller/ads/campaigns');
    expect(call?.search).not.toContain('status=');
  });

  it('getCampaign() maps AdsCampaignDetailResponse including dailyStats[]', async () => {
    stubRoute('GET', '/api/seller/ads/campaigns/camp-1', {
      ...campaignBody(),
      dailyStats: [{ date: '2026-09-20', impressions: 12, clicks: 3 }],
    });
    const service = buildService();

    const result = await service.getCampaign('camp-1');

    expect(result?.dailyStats).toEqual([{ date: '2026-09-20', impressions: 12, clicks: 3 }]);
  });

  it('getCampaign() returns null on 404 (not found / not this seller\'s)', async () => {
    stubRoute('GET', '/api/seller/ads/campaigns/camp-x', undefined, 404);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    const result = await service.getCampaign('camp-x');

    expect(result).toBeNull();
  });

  describe('createCampaign() — §3.4 / §4.2 rules 5–6', () => {
    const params = {
      documentId: 'doc-1',
      placementKey: 'search_top',
      startDate: '2026-09-20',
      endDate: '2026-09-26',
      expectedTotalAmount: 999,
    };

    it('201 → { ok: true, campaign }', async () => {
      stubRoute('POST', '/api/seller/ads/campaigns', campaignBody(), 201);
      const service = buildService();

      const result = await service.createCampaign(params);

      expect(result).toEqual({ ok: true, campaign: expect.objectContaining({ id: 'camp-1' }) });
      const call = requests.find((r) => r.method === 'POST' && r.path === '/api/seller/ads/campaigns');
      expect(JSON.parse(call?.body ?? '{}')).toEqual({
        documentId: 'doc-1',
        placementKey: 'search_top',
        targetKey: null,
        startDate: '2026-09-20',
        endDate: '2026-09-26',
        expectedTotalAmount: 999,
      });
    });

    it('409 with fullDates → { ok:false, kind:"full_dates", fullDates }', async () => {
      stubRoute(
        'POST',
        '/api/seller/ads/campaigns',
        { message: 'ช่วงวันที่เลือกมีวันที่เต็มแล้ว', fullDates: ['2026-09-21', '2026-09-22'] },
        409,
      );
      const service = buildService();

      const result = await service.createCampaign(params);

      expect(result).toEqual({
        ok: false,
        kind: 'full_dates',
        message: 'ช่วงวันที่เลือกมีวันที่เต็มแล้ว',
        fullDates: ['2026-09-21', '2026-09-22'],
      });
    });

    it('409 "ราคาเปลี่ยนแปลง..." (no fullDates) → { ok:false, kind:"price_changed" }', async () => {
      stubRoute(
        'POST',
        '/api/seller/ads/campaigns',
        { message: 'ราคาเปลี่ยนแปลง กรุณาตรวจสอบราคาใหม่อีกครั้ง' },
        409,
      );
      const service = buildService();

      const result = await service.createCampaign(params);

      expect(result).toEqual({
        ok: false,
        kind: 'price_changed',
        message: 'ราคาเปลี่ยนแปลง กรุณาตรวจสอบราคาใหม่อีกครั้ง',
      });
    });

    it('400 (insufficient balance) → { ok:false, kind:"generic", message }', async () => {
      stubRoute(
        'POST',
        '/api/seller/ads/campaigns',
        { message: 'ยอดคงเหลือ 100.00 บาท ไม่พอสำหรับค่าโฆษณา 999.00 บาท' },
        400,
      );
      const service = buildService();

      const result = await service.createCampaign(params);

      expect(result).toEqual({
        ok: false,
        kind: 'generic',
        message: 'ยอดคงเหลือ 100.00 บาท ไม่พอสำหรับค่าโฆษณา 999.00 บาท',
      });
    });

    it('empty-body 404 → generic fallback message, reports through ApiFailureReporter', async () => {
      stubRoute('POST', '/api/seller/ads/campaigns', undefined, 404);
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      const result = await service.createCampaign(params);

      expect(result).toEqual({ ok: false, kind: 'generic', message: 'สร้างแคมเปญโฆษณาไม่สำเร็จ' });
      expect(apiFail.report).toHaveBeenCalled();
    });
  });

  describe('cancelCampaign() — §3.7', () => {
    it('200 → { ok: true, campaign } with status cancelled', async () => {
      stubRoute('DELETE', '/api/seller/ads/campaigns/camp-1', campaignBody({ status: 'cancelled' }));
      const service = buildService();

      const result = await service.cancelCampaign('camp-1');

      expect(result).toEqual({ ok: true, campaign: expect.objectContaining({ status: 'cancelled' }) });
    });

    it('409 (already ended / already cancelled) → { ok:false, message }', async () => {
      stubRoute(
        'DELETE',
        '/api/seller/ads/campaigns/camp-1',
        { message: 'แคมเปญนี้จบไปแล้ว ยกเลิกไม่ได้' },
        409,
      );
      const service = buildService();

      const result = await service.cancelCampaign('camp-1');

      expect(result).toEqual({ ok: false, message: 'แคมเปญนี้จบไปแล้ว ยกเลิกไม่ได้' });
    });
  });
});

describe('AdsService — admin', () => {
  it('adminListCampaigns() sends filters and maps sellerName/sellerAvailableBalance', async () => {
    stubRoute('GET', '/api/admin/ads/campaigns', {
      items: [{ ...campaignBody(), sellerName: 'ครูพิม', sellerAvailableBalance: 2500 }],
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
    });
    const service = buildService();

    const result = await service.adminListCampaigns({ status: 'active', sellerId: 'seller-1', placement: 'search_top' });

    expect(result.items?.[0]).toMatchObject({ sellerName: 'ครูพิม', sellerAvailableBalance: 2500 });
    const call = requests.find((r) => r.method === 'GET' && r.path === '/api/admin/ads/campaigns');
    expect(call?.search).toContain('status=active');
    expect(call?.search).toContain('sellerId=seller-1');
    expect(call?.search).toContain('placement=search_top');
  });

  it('adminStopCampaign() sends reason + refundRemainingDays, maps the response', async () => {
    stubRoute(
      'POST',
      '/api/admin/ads/campaigns/camp-1/stop',
      { ...campaignBody({ status: 'stopped' }), sellerName: 'ครูพิม', sellerAvailableBalance: 1600 },
    );
    const service = buildService();

    const result = await service.adminStopCampaign('camp-1', 'ละเมิดกฎการโฆษณา', true);

    expect(result).toEqual({
      ok: true,
      campaign: expect.objectContaining({ status: 'stopped', sellerName: 'ครูพิม' }),
    });
    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/api/admin/ads/campaigns/camp-1/stop',
    );
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      reason: 'ละเมิดกฎการโฆษณา',
      refundRemainingDays: true,
    });
  });

  it('adminStopCampaign() 400 (reason too short) → { ok:false, message }', async () => {
    stubRoute(
      'POST',
      '/api/admin/ads/campaigns/camp-1/stop',
      { message: 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร' },
      400,
    );
    const service = buildService();

    const result = await service.adminStopCampaign('camp-1', 'สั้นไป', false);

    expect(result).toEqual({ ok: false, message: 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร' });
  });

  it('adminListPlacements() maps every row including disabled ones', async () => {
    stubRoute('GET', '/api/admin/ads/placements', [
      {
        placementKey: 'search_top',
        displayName: 'บนสุดของผลค้นหา',
        description: 'd',
        pricePerDay: 199,
        weeklyPrice: 999,
        dailySlotCapacity: 2,
        requiresTarget: false,
        maxPerResultPage: 2,
        isEnabled: false,
        activeCampaignCount: 3,
        updatedAt: '2026-09-14T00:00:00.000Z',
      },
    ]);
    const service = buildService();

    const result = await service.adminListPlacements();

    expect(result).toEqual([
      {
        placementKey: 'search_top',
        displayName: 'บนสุดของผลค้นหา',
        description: 'd',
        pricePerDay: 199,
        weeklyPrice: 999,
        dailySlotCapacity: 2,
        requiresTarget: false,
        maxPerResultPage: 2,
        isEnabled: false,
        activeCampaignCount: 3,
        updatedAt: '2026-09-14T00:00:00.000Z',
      },
    ]);
  });

  it('adminUpdatePlacement() sends the full body and maps the response', async () => {
    stubRoute('PUT', '/api/admin/ads/placements/search_top', {
      placementKey: 'search_top',
      displayName: 'บนสุดของผลค้นหา',
      description: 'd',
      pricePerDay: 250,
      weeklyPrice: null,
      dailySlotCapacity: 3,
      requiresTarget: false,
      maxPerResultPage: 2,
      isEnabled: true,
      activeCampaignCount: 1,
      updatedAt: '2026-09-15T00:00:00.000Z',
    });
    const service = buildService();

    const result = await service.adminUpdatePlacement('search_top', {
      pricePerDay: 250,
      weeklyPrice: null,
      dailySlotCapacity: 3,
      maxPerResultPage: 2,
      isEnabled: true,
    });

    expect(result.ok).toBe(true);
    const call = requests.find(
      (r) => r.method === 'PUT' && r.path === '/api/admin/ads/placements/search_top',
    );
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      pricePerDay: 250,
      weeklyPrice: null,
      dailySlotCapacity: 3,
      maxPerResultPage: 2,
      isEnabled: true,
    });
  });

  it('adminUpdatePlacement() 409 (capacity below current usage) → { ok:false, message }', async () => {
    stubRoute(
      'PUT',
      '/api/admin/ads/placements/search_top',
      { message: 'มีวันที่ขายเกินความจุใหม่ไปแล้ว' },
      409,
    );
    const service = buildService();

    const result = await service.adminUpdatePlacement('search_top', {
      pricePerDay: 199,
      weeklyPrice: 999,
      dailySlotCapacity: 1,
      maxPerResultPage: 2,
      isEnabled: true,
    });

    expect(result).toEqual({ ok: false, message: 'มีวันที่ขายเกินความจุใหม่ไปแล้ว' });
  });
});

describe('AdsService — recordImpressions() / recordClick() (§3.8, §4.3)', () => {
  it('fires POST /api/marketplace/ads/impressions with distinct campaignIds', async () => {
    stubRoute('POST', '/api/marketplace/ads/impressions', undefined, 204);
    const service = buildService();

    service.recordImpressions({}, ['camp-1', 'camp-2', 'camp-1']);
    await new Promise((r) => setTimeout(r, 0));

    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/api/marketplace/ads/impressions',
    );
    expect(call).toBeDefined();
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ campaignIds: ['camp-1', 'camp-2'] });
  });

  it('does not fire twice for the same result-set reference (re-render guard)', async () => {
    stubRoute('POST', '/api/marketplace/ads/impressions', undefined, 204);
    const service = buildService();
    const resultSet = { id: 'page-1' };

    service.recordImpressions(resultSet, ['camp-1']);
    service.recordImpressions(resultSet, ['camp-1']);
    await new Promise((r) => setTimeout(r, 0));

    const calls = requests.filter(
      (r) => r.method === 'POST' && r.path === '/api/marketplace/ads/impressions',
    );
    expect(calls).toHaveLength(1);
  });

  it('fires again for a genuinely different result-set reference', async () => {
    stubRoute('POST', '/api/marketplace/ads/impressions', undefined, 204);
    const service = buildService();

    service.recordImpressions({ id: 'page-1' }, ['camp-1']);
    service.recordImpressions({ id: 'page-2' }, ['camp-1']);
    await new Promise((r) => setTimeout(r, 0));

    const calls = requests.filter(
      (r) => r.method === 'POST' && r.path === '/api/marketplace/ads/impressions',
    );
    expect(calls).toHaveLength(2);
  });

  it('no-ops (no request) when nothing on the page is sponsored', async () => {
    const service = buildService();

    service.recordImpressions({}, [undefined, undefined]);
    await Promise.resolve();

    expect(requests).toHaveLength(0);
  });

  it('never throws when the impressions request fails', async () => {
    stubRoute('POST', '/api/marketplace/ads/impressions', { message: 'boom' }, 400);
    const service = buildService();

    expect(() => service.recordImpressions({}, ['camp-1'])).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('recordClick() fires POST /api/marketplace/ads/{campaignId}/click', async () => {
    stubRoute('POST', '/api/marketplace/ads/camp-1/click', undefined, 204);
    const service = buildService();

    service.recordClick('camp-1');
    await new Promise((r) => setTimeout(r, 0));

    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/api/marketplace/ads/camp-1/click',
    );
    expect(call).toBeDefined();
  });

  it('recordClick() never throws when the request fails, and is a no-op for an undefined id', async () => {
    stubRoute('POST', '/api/marketplace/ads/camp-1/click', undefined, 500);
    const service = buildService();

    expect(() => service.recordClick('camp-1')).not.toThrow();
    expect(() => service.recordClick(undefined)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));

    expect(requests.filter((r) => r.path.includes('/click'))).toHaveLength(1);
  });

  it('getSponsoredAds() queries GET /api/marketplace/ads/sponsored and maps documents', async () => {
    stubRoute('GET', '/api/marketplace/ads/sponsored', [
      {
        id: 'doc-sp-1',
        title: 'สรุปคณิต ม.6 โฆษณา',
        price: 99,
        originalPrice: 150,
        pageCount: 30,
        fileFormat: 'pdf',
        seller: { id: 's-1', name: 'Kru Math' },
        sponsoredCampaignId: 'camp-sp-1',
        sponsoredPlacement: 'home_top',
      },
    ]);
    const service = buildService();

    const result = await service.getSponsoredAds('home_top', '*', 2);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('doc-sp-1');
    expect(result[0].title).toBe('สรุปคณิต ม.6 โฆษณา');
    expect(result[0].sponsoredCampaignId).toBe('camp-sp-1');

    const call = requests.find(
      (r) => r.method === 'GET' && r.path === '/api/marketplace/ads/sponsored',
    );
    expect(call).toBeDefined();
    expect(call?.search).toContain('placement=home_top');
    expect(call?.search).toContain('target=*');
    expect(call?.search).toContain('limit=2');
  });

  it('getSponsoredAds() returns empty array on error', async () => {
    stubRoute('GET', '/api/marketplace/ads/sponsored', { message: 'Server error' }, 500);
    const service = buildService();

    const result = await service.getSponsoredAds('home_top');

    expect(result).toEqual([]);
  });
});

