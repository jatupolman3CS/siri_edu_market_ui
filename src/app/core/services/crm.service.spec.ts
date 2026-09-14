import { TestBed } from '@angular/core/testing';
import { CrmService } from './crm.service';
import type { CrmDocumentAlertOverview, CrmOverview, CrmUserDetail, MyCrmProfile } from '../models';

/**
 * crm-core v1 (docs/contracts/crm-core.md) §1.3 — `crm.service.spec.ts` (round 2, after regen).
 *
 * Round 2 (wired): `GET`/`PUT`/`DELETE /api/me/crm[/tracking]` and
 * `GET /api/admin/crm/{overview,segments/{code}/users,users/{userId}}` all hit the real,
 * regenerated SDK now (gate 1 confirmed backend matches this contract, snapshot updated) —
 * this spec stubs `fetch` directly (mirrors the pattern in `subscription.service.spec.ts` /
 * `exam-countdown.service.spec.ts`) rather than the service under test.
 *
 * `CrmService` never calls `ApiFailureReporter` itself (see its class doc) — every page that
 * uses it reports failures on its own — so these specs only assert mapper correctness and that
 * failures propagate as rejected promises, never that a reporter was called.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; search: string; body: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  // `undefined` = a truly empty body (matches DELETE's real `204`).
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

/** ASP.NET Core's auto-`ProblemDetails` shape. */
function problemDetails(status: number, title: string) {
  return {
    type: `https://tools.ietf.org/html/rfc9110#section-15.5.5`,
    title,
    status,
    traceId: 'test-trace-id',
  };
}

function buildService(): CrmService {
  TestBed.configureTestingModule({ providers: [CrmService] });
  return TestBed.inject(CrmService);
}

function signalCountsBody(over: Record<string, unknown> = {}) {
  return {
    documentViews: 10,
    searches: 5,
    purchases: 2,
    subscriptionAccesses: 0,
    wishlistItems: 1,
    cartItems: 0,
    sellerFollows: 0,
    reviews: 0,
    declaredInterests: 1,
    ...over,
  };
}

function myProfileBody(over: Record<string, unknown> = {}) {
  return {
    trackingEnabled: true,
    computedAt: '2026-09-10T00:00:00Z',
    interestConfidence: 0.42,
    topInterests: [
      {
        facetType: 'category',
        value: 'cat-1',
        label: 'คณิตศาสตร์',
        score: 0.8,
        reason: 'เพราะคุณเคยซื้อเอกสารในหมวดนี้ 2 รายการ',
      },
    ],
    segments: [
      { code: 'repeat_buyer', label: 'ซื้อซ้ำ', kind: 'lifecycle', reason: 'ซื้อไปแล้ว 2 รายการ' },
    ],
    signalCounts: signalCountsBody(),
    dataRetentionDays: 90,
    ...over,
  };
}

function adminOverviewBody(over: Record<string, unknown> = {}) {
  return {
    profileCount: 100,
    computedProfileCount: 80,
    trackingOptOutCount: 5,
    lastComputedAt: '2026-09-10T00:00:00Z',
    averageConfidence: 0.35,
    signalRowCount: 12345,
    segments: [
      {
        code: 'repeat_buyer',
        label: 'ซื้อซ้ำ',
        kind: 'lifecycle',
        description: 'ซื้อไปแล้ว 5 รายการขึ้นไป',
        userCount: 20,
      },
      {
        code: 'dormant',
        label: 'ไม่ได้ใช้งานมาสักพัก',
        kind: 'lifecycle',
        description: 'ไม่มีความเคลื่อนไหวมา 90 วัน',
        userCount: 0,
      },
    ],
    topSearchTerms: [{ term: 'คณิต', searchCount: 50, zeroResultCount: 2, userCount: 30 }],
    topFacets: [
      { facetType: 'category', value: 'cat-1', label: 'คณิตศาสตร์', userCount: 40, averageScore: 0.6 },
    ],
    ...over,
  };
}

function segmentUsersPageBody(items: unknown[] = []) {
  return { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 };
}

function segmentUserRow(userId: string) {
  return {
    userId,
    displayName: 'สมชาย ใจดี',
    email: 'somchai@example.com',
    interestConfidence: 0.7,
    topCategoryLabel: 'คณิตศาสตร์',
    lastActivityAt: '2026-09-10T00:00:00Z',
    assignedAt: '2026-09-01T00:00:00Z',
  };
}

function userDetailBody(over: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    displayName: 'สมชาย ใจดี',
    email: 'somchai@example.com',
    trackingEnabled: true,
    computedAt: '2026-09-10T00:00:00Z',
    interestConfidence: 0.55,
    engagementScore: 12.3,
    signalCount: 8,
    lastActivityAt: '2026-09-10T00:00:00Z',
    lastPurchaseAt: '2026-09-05T00:00:00Z',
    purchaseCount: 2,
    declaredCategories: [{ value: 'cat-1', label: 'คณิตศาสตร์' }],
    facets: [
      {
        facetType: 'category',
        value: 'cat-1',
        label: 'คณิตศาสตร์',
        score: 12,
        normalizedScore: 1,
        signalCount: 3,
        topSignal: 'purchase',
        isDeclared: false,
        lastSignalAt: '2026-09-05T00:00:00Z',
      },
    ],
    segments: [
      {
        code: 'repeat_buyer',
        label: 'ซื้อซ้ำ',
        kind: 'lifecycle',
        reason: 'ซื้อไปแล้ว 2 รายการ',
        assignedAt: '2026-09-01T00:00:00Z',
      },
    ],
    signalBreakdown: signalCountsBody(),
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
    if (!route) return jsonResponse({ title: 'no stub for this route', status: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('CrmService — initial state', () => {
  it('starts with every signal at its empty default', () => {
    const service = buildService();

    expect(service.myProfile()).toBeNull();
    expect(service.adminOverview()).toBeNull();
    expect(service.segmentUsers()).toEqual([]);
    expect(service.userDetail()).toBeNull();
  });
});

describe('CrmService — loadMine() (§3.1)', () => {
  it('maps a full response onto myProfile()', async () => {
    stubRoute('GET', '/api/me/crm', myProfileBody());
    const service = buildService();

    await service.loadMine();

    expect(service.myProfile()).toEqual({
      trackingEnabled: true,
      computedAt: '2026-09-10T00:00:00Z',
      interestConfidence: 0.42,
      topInterests: [
        {
          facetType: 'category',
          value: 'cat-1',
          label: 'คณิตศาสตร์',
          score: 0.8,
          reason: 'เพราะคุณเคยซื้อเอกสารในหมวดนี้ 2 รายการ',
        },
      ],
      segments: [
        { code: 'repeat_buyer', label: 'ซื้อซ้ำ', kind: 'lifecycle', reason: 'ซื้อไปแล้ว 2 รายการ' },
      ],
      signalCounts: signalCountsBody(),
      dataRetentionDays: 90,
    });
    expect(service.loadingMine()).toBe(false);
  });

  it('AC-11: a profile with no CUSTOMER_PROFILE row yet still maps computedAt=null and empty lists', async () => {
    stubRoute(
      'GET',
      '/api/me/crm',
      myProfileBody({ computedAt: null, topInterests: [], segments: [], interestConfidence: 0 }),
    );
    const service = buildService();

    await service.loadMine();

    expect(service.myProfile()).toMatchObject({
      computedAt: null,
      interestConfidence: 0,
      topInterests: [],
      segments: [],
    });
  });

  it('a failure rejects and leaves myProfile() unset — CrmService never reports it itself', async () => {
    stubRoute('GET', '/api/me/crm', problemDetails(500, 'Internal Server Error'), 500);
    const service = buildService();

    await expect(service.loadMine()).rejects.toBeTruthy();

    expect(service.myProfile()).toBeNull();
    expect(service.loadingMine()).toBe(false);
  });
});

describe('CrmService — setTracking() (§3.2)', () => {
  it('PUTs { enabled } and maps the response back onto myProfile()', async () => {
    stubRoute(
      'PUT',
      '/api/me/crm/tracking',
      myProfileBody({ trackingEnabled: false, topInterests: [], segments: [] }),
    );
    const service = buildService();

    await service.setTracking(false);

    expect(service.myProfile()?.trackingEnabled).toBe(false);
    expect(service.myProfile()?.topInterests).toEqual([]);
    expect(service.myProfile()?.segments).toEqual([]);
    const call = requests.find((r) => r.method === 'PUT' && r.path === '/api/me/crm/tracking');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ enabled: false });
  });

  it('rejects on failure', async () => {
    stubRoute('PUT', '/api/me/crm/tracking', problemDetails(400, 'Bad Request'), 400);
    const service = buildService();

    await expect(service.setTracking(true)).rejects.toBeTruthy();
  });
});

describe('CrmService — deleteMyData() (§3.3)', () => {
  it('DELETEs then reloads §3.1 to reflect the server-reset profile (204 carries no body)', async () => {
    stubRoute('DELETE', '/api/me/crm', undefined, 204);
    stubRoute(
      'GET',
      '/api/me/crm',
      myProfileBody({ computedAt: null, interestConfidence: 0, topInterests: [], segments: [] }),
    );
    const service = buildService();

    await service.deleteMyData();

    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'DELETE /api/me/crm',
      'GET /api/me/crm',
    ]);
    expect(service.myProfile()).toMatchObject({ computedAt: null, interestConfidence: 0 });
  });

  it('rejects on failure and does not reload', async () => {
    stubRoute('DELETE', '/api/me/crm', problemDetails(401, 'Unauthorized'), 401);
    const service = buildService();

    await expect(service.deleteMyData()).rejects.toBeTruthy();

    expect(requests).toHaveLength(1);
  });
});

describe('CrmService — loadOverview() (§3.4)', () => {
  it('maps every field including segments with userCount=0 (AC-23)', async () => {
    stubRoute('GET', '/api/admin/crm/overview', adminOverviewBody());
    const service = buildService();

    await service.loadOverview();

    const overview = service.adminOverview();
    expect(overview?.profileCount).toBe(100);
    expect(overview?.segments).toHaveLength(2);
    expect(overview?.segments.find((s) => s.code === 'dormant')?.userCount).toBe(0);
    expect(overview?.topSearchTerms).toEqual([
      { term: 'คณิต', searchCount: 50, zeroResultCount: 2, userCount: 30 },
    ]);
    expect(overview?.topFacets).toEqual([
      { facetType: 'category', value: 'cat-1', label: 'คณิตศาสตร์', userCount: 40, averageScore: 0.6 },
    ]);
  });

  it('rejects on 403 (not Admin)', async () => {
    stubRoute('GET', '/api/admin/crm/overview', problemDetails(403, 'Forbidden'), 403);
    const service = buildService();

    await expect(service.loadOverview()).rejects.toBeTruthy();
    expect(service.adminOverview()).toBeNull();
  });
});

describe('CrmService — segment users pager (§3.5)', () => {
  it('loadSegmentUsers() sends the code in the path and Page/PageSize in the query', async () => {
    stubRoute(
      'GET',
      '/api/admin/crm/segments/repeat_buyer/users',
      segmentUsersPageBody([segmentUserRow('user-1'), segmentUserRow('user-2')]),
    );
    const service = buildService();

    await service.loadSegmentUsers('repeat_buyer');

    expect(service.segmentUsers().map((u) => u.userId)).toEqual(['user-1', 'user-2']);
    expect(service.segmentUsersTotalCount()).toBe(2);
    const call = requests.find(
      (r) => r.method === 'GET' && r.path === '/api/admin/crm/segments/repeat_buyer/users',
    );
    expect(call?.search).toContain('Page=1');
    expect(call?.search).toContain('PageSize=20');
  });

  it('onSegmentUsersPageChange() re-fetches with the same code and the new page', async () => {
    stubRoute(
      'GET',
      '/api/admin/crm/segments/repeat_buyer/users',
      segmentUsersPageBody([segmentUserRow('user-1')]),
    );
    const service = buildService();
    await service.loadSegmentUsers('repeat_buyer');

    await service.onSegmentUsersPageChange(2);

    const call = requests[requests.length - 1];
    expect(call.path).toBe('/api/admin/crm/segments/repeat_buyer/users');
    expect(call.search).toContain('Page=2');
  });

  it('400 (unknown segment code) rejects and leaves the list empty', async () => {
    stubRoute(
      'GET',
      '/api/admin/crm/segments/not_a_real_code/users',
      { message: 'ไม่รู้จัก segment code นี้' },
      400,
    );
    const service = buildService();

    await expect(service.loadSegmentUsers('not_a_real_code')).rejects.toBeTruthy();

    expect(service.segmentUsers()).toEqual([]);
  });
});

describe('CrmService — loadUserDetail() (§3.6)', () => {
  it('maps facets/segments/declaredCategories/signalBreakdown in full', async () => {
    stubRoute('GET', '/api/admin/crm/users/user-1', userDetailBody());
    const service = buildService();

    await service.loadUserDetail('user-1');

    const detail = service.userDetail();
    expect(detail?.userId).toBe('user-1');
    expect(detail?.declaredCategories).toEqual([{ value: 'cat-1', label: 'คณิตศาสตร์' }]);
    expect(detail?.facets).toEqual([
      {
        facetType: 'category',
        value: 'cat-1',
        label: 'คณิตศาสตร์',
        score: 12,
        normalizedScore: 1,
        signalCount: 3,
        topSignal: 'purchase',
        isDeclared: false,
        lastSignalAt: '2026-09-05T00:00:00Z',
      },
    ]);
    // §3.6 note: AdminCrmSegmentResponse carries `assignedAt` too, which CrmSegment drops.
    expect(detail?.segments).toEqual([
      { code: 'repeat_buyer', label: 'ซื้อซ้ำ', kind: 'lifecycle', reason: 'ซื้อไปแล้ว 2 รายการ' },
    ]);
    expect(detail?.signalBreakdown).toEqual(signalCountsBody());
  });

  it('AC-15: a user with no CUSTOMER_PROFILE yet still maps to zeros, not an error', async () => {
    stubRoute(
      'GET',
      '/api/admin/crm/users/user-2',
      userDetailBody({
        computedAt: null,
        interestConfidence: 0,
        engagementScore: 0,
        signalCount: 0,
        declaredCategories: [],
        facets: [],
        segments: [],
      }),
    );
    const service = buildService();

    await service.loadUserDetail('user-2');

    expect(service.userDetail()).toMatchObject({
      computedAt: null,
      interestConfidence: 0,
      facets: [],
      segments: [],
    });
  });

  it('AC-15: 404 (no such userId) rejects and leaves userDetail() unset', async () => {
    stubRoute('GET', '/api/admin/crm/users/does-not-exist', problemDetails(404, 'Not Found'), 404);
    const service = buildService();

    await expect(service.loadUserDetail('does-not-exist')).rejects.toBeTruthy();

    expect(service.userDetail()).toBeNull();
  });
});

describe('CrmService — test helpers', () => {
  it('setMyProfileForTest / setAdminOverviewForTest / setUserDetailForTest set their signals directly', () => {
    const service = buildService();

    service.setMyProfileForTest(myProfileBody() as unknown as MyCrmProfile);
    service.setAdminOverviewForTest(adminOverviewBody() as unknown as CrmOverview);
    service.setUserDetailForTest(userDetailBody() as unknown as CrmUserDetail);

    expect(service.myProfile()).not.toBeNull();
    expect(service.adminOverview()).not.toBeNull();
    expect(service.userDetail()).not.toBeNull();
  });
});

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.4/§3.5 (F-10, ข้อ 13/16).
 *
 * Round 2 (crm-driven-discovery-fe-wire): both endpoints are wired to the generated SDK now
 * (gate 1 confirmed backend matches this contract, snapshot updated) — same "unwrap+rethrow,
 * caller reports" convention as `loadUserDetail` above (no `ApiFailureReporter` call inside
 * `CrmService` itself).
 */
function demandGapRow(term: string, over: Record<string, unknown> = {}) {
  return {
    term,
    searchCount: 120,
    zeroResultCount: 90,
    zeroResultRate: 0.75,
    userCount: 8,
    lastSeenDate: '2026-09-14',
    matchedFacetLabel: 'คณิตศาสตร์',
    ...over,
  };
}

function demandGapsPageBody(items: ReturnType<typeof demandGapRow>[], over: Record<string, unknown> = {}) {
  return { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1, ...over };
}

describe('CrmService — admin demand gaps pager (crm-driven-discovery v1 §3.4)', () => {
  it('starts with an empty list and not loading', () => {
    const service = buildService();

    expect(service.demandGaps()).toEqual([]);
    expect(service.demandGapsLoading()).toBe(false);
  });

  it('loadDemandGaps() maps items and sends Page/PageSize in the query', async () => {
    stubRoute('GET', '/api/admin/crm/demand-gaps', demandGapsPageBody([demandGapRow('pitch deck')]));
    const service = buildService();

    await service.loadDemandGaps();

    expect(service.demandGaps()).toEqual([demandGapRow('pitch deck')]);
    expect(service.demandGapsTotalCount()).toBe(1);
    expect(service.demandGapsLoading()).toBe(false);
    const call = requests.find((r) => r.method === 'GET' && r.path === '/api/admin/crm/demand-gaps');
    expect(call?.search).toContain('Page=1');
    expect(call?.search).toContain('PageSize=20');
  });

  it('a row with matchedFacetLabel: null maps through as-is (§3.4 "หมวดที่เกี่ยวข้อง" = "—")', async () => {
    stubRoute(
      'GET',
      '/api/admin/crm/demand-gaps',
      demandGapsPageBody([demandGapRow('resume', { matchedFacetLabel: null })]),
    );
    const service = buildService();

    await service.loadDemandGaps();

    expect(service.demandGaps()[0].matchedFacetLabel).toBeNull();
  });

  it('onDemandGapsPageChange()/onDemandGapsPageSizeChange() re-fetch with the new page/size', async () => {
    stubRoute('GET', '/api/admin/crm/demand-gaps', demandGapsPageBody([demandGapRow('toeic')]));
    const service = buildService();
    await service.loadDemandGaps();

    await service.onDemandGapsPageChange(2);
    expect(requests[requests.length - 1].search).toContain('Page=2');

    await service.onDemandGapsPageSizeChange(50);
    expect(requests[requests.length - 1].search).toContain('PageSize=50');
  });

  it('rejects on 403 (not Admin) and leaves the list empty', async () => {
    stubRoute('GET', '/api/admin/crm/demand-gaps', problemDetails(403, 'Forbidden'), 403);
    const service = buildService();

    await expect(service.loadDemandGaps()).rejects.toBeTruthy();

    expect(service.demandGaps()).toEqual([]);
    expect(service.demandGapsLoading()).toBe(false);
  });
});

function traceBody(over: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    displayName: 'สมชาย ใจดี',
    trackingEnabled: true,
    computedAt: '2026-09-14T00:00:00Z',
    interestConfidence: 0.62,
    minConfidence: 0.3,
    topFacetScore: 0.8,
    minTopFacetScore: 0.5,
    profileAgeDays: 3,
    gatePassed: true,
    gateFailReason: null,
    strategy: 'crm-personalized',
    strategyReason: 'เพราะคุณสนใจคณิตศาสตร์',
    candidateCount: 10,
    qualifiedCount: 4,
    minQualifiedItems: 3,
    userFacets: [
      {
        facetType: 'category',
        facetValue: 'cat-1',
        facetLabel: 'คณิตศาสตร์',
        normalizedScore: 0.9,
        topSignal: 'purchase',
        signalCount: 5,
        isDeclared: false,
      },
    ],
    candidates: [
      {
        documentId: 'doc-1',
        title: 'แบบฝึกหัดคณิตศาสตร์ ม.1',
        relevanceScore: 0.72,
        rawScore: 1.44,
        passed: true,
        excludedReason: null,
        matchedFacets: [
          {
            facetType: 'category',
            facetValue: 'cat-1',
            facetLabel: 'คณิตศาสตร์',
            userScore: 0.9,
            weight: 0.8,
            contribution: 0.72,
          },
        ],
      },
    ],
    ...over,
  };
}

describe('CrmService — admin recommendation trace (crm-driven-discovery v1 §3.5)', () => {
  it('starts with recommendationTrace() null and not loading', () => {
    const service = buildService();

    expect(service.recommendationTrace()).toBeNull();
    expect(service.loadingRecommendationTrace()).toBe(false);
  });

  it('loadRecommendationTrace() maps gate/facets/candidates in full and sends take in the query', async () => {
    stubRoute('GET', '/api/admin/crm/users/user-1/recommendation-trace', traceBody());
    const service = buildService();

    await service.loadRecommendationTrace('user-1');

    expect(service.recommendationTrace()).toEqual(traceBody());
    expect(service.loadingRecommendationTrace()).toBe(false);
    const call = requests.find(
      (r) => r.method === 'GET' && r.path === '/api/admin/crm/users/user-1/recommendation-trace',
    );
    expect(call?.search).toContain('take=8');
  });

  it('AC-21: an unknown value from the backend widens strategy to \'popular-fallback\' defensively', async () => {
    stubRoute(
      'GET',
      '/api/admin/crm/users/user-1/recommendation-trace',
      traceBody({ strategy: 'some-future-strategy' }),
    );
    const service = buildService();

    await service.loadRecommendationTrace('user-1');

    expect(service.recommendationTrace()?.strategy).toBe('popular-fallback');
  });

  it('AC-21: a user who has not passed the gate maps gatePassed=false with a non-null gateFailReason', async () => {
    stubRoute(
      'GET',
      '/api/admin/crm/users/user-2/recommendation-trace',
      traceBody({
        userId: 'user-2',
        gatePassed: false,
        gateFailReason: 'ความมั่นใจ 0.10 ต่ำกว่าเกณฑ์ 0.30',
        strategy: 'popular-fallback',
      }),
    );
    const service = buildService();

    await service.loadRecommendationTrace('user-2');

    expect(service.recommendationTrace()).toMatchObject({
      gatePassed: false,
      gateFailReason: 'ความมั่นใจ 0.10 ต่ำกว่าเกณฑ์ 0.30',
    });
  });

  it('AC-21: 404 (no such userId) rejects and leaves recommendationTrace() unset', async () => {
    stubRoute(
      'GET',
      '/api/admin/crm/users/does-not-exist/recommendation-trace',
      problemDetails(404, 'Not Found'),
      404,
    );
    const service = buildService();

    await expect(service.loadRecommendationTrace('does-not-exist')).rejects.toBeTruthy();

    expect(service.loadingRecommendationTrace()).toBe(false);
    expect(service.recommendationTrace()).toBeNull();
  });

  it('setRecommendationTraceForTest() sets the signal directly', () => {
    const service = buildService();

    service.setRecommendationTraceForTest({
      userId: 'user-1',
      displayName: 'สมชาย ใจดี',
      trackingEnabled: true,
      computedAt: '2026-09-14T00:00:00Z',
      interestConfidence: 0.62,
      minConfidence: 0.3,
      topFacetScore: 0.8,
      minTopFacetScore: 0.4,
      profileAgeDays: 3,
      gatePassed: true,
      gateFailReason: null,
      strategy: 'crm-personalized',
      strategyReason: 'เพราะคุณสนใจคณิตศาสตร์',
      candidateCount: 10,
      qualifiedCount: 4,
      minQualifiedItems: 3,
      userFacets: [],
      candidates: [],
    });

    expect(service.recommendationTrace()).not.toBeNull();
  });
});

/**
 * crm-targeted-document-alerts v2 §3.3, §1.3 (`docs/contracts/crm-targeted-document-alerts.md`,
 * F-12, ข้อ 11) — wired directly to the real SDK (backend gate 1 already passed and the snapshot
 * was updated before this page/service change was built), same "unwrap+rethrow, caller reports"
 * convention as every other method above.
 */
function documentAlertDocRow(documentId: string, over: Record<string, unknown> = {}) {
  return {
    documentId,
    documentTitle: 'แบบฝึกหัดคณิตศาสตร์ ป.4 ชุดที่ 2',
    studioName: 'ร้านครูใจดี',
    queuedAt: '2026-09-15T02:00:00Z',
    matchedCount: 8,
    sentCount: 6,
    averageMatchScore: 0.72,
    ...over,
  };
}

function documentAlertsOverviewBody(over: Record<string, unknown> = {}) {
  return {
    days: 7,
    pendingCount: 12,
    sentCount: 34,
    suppressedCount: 3,
    digestCount: 9,
    recipientCount: 21,
    documentCount: 5,
    averageMatchScore: 0.68,
    lastQueuedAt: '2026-09-15T03:00:00Z',
    lastSentAt: '2026-09-15T04:00:00Z',
    documents: [documentAlertDocRow('doc-1')],
    ...over,
  };
}

describe('CrmService — loadDocumentAlerts() (crm-targeted-document-alerts v2 §3.3)', () => {
  it('starts with documentAlerts() null and not loading', () => {
    const service = buildService();

    expect(service.documentAlerts()).toBeNull();
    expect(service.loadingDocumentAlerts()).toBe(false);
  });

  it('maps every field including a null lastQueuedAt/lastSentAt and sends days in the query', async () => {
    stubRoute(
      'GET',
      '/api/admin/crm/document-alerts',
      documentAlertsOverviewBody({ lastQueuedAt: null, lastSentAt: null }),
    );
    const service = buildService();

    await service.loadDocumentAlerts(14);

    expect(service.documentAlerts()).toEqual(
      documentAlertsOverviewBody({ lastQueuedAt: null, lastSentAt: null }),
    );
    expect(service.loadingDocumentAlerts()).toBe(false);
    const call = requests.find((r) => r.method === 'GET' && r.path === '/api/admin/crm/document-alerts');
    expect(call?.search).toContain('days=14');
  });

  it('maps an empty documents array to the empty-state shape', async () => {
    stubRoute('GET', '/api/admin/crm/document-alerts', documentAlertsOverviewBody({ documents: [] }));
    const service = buildService();

    await service.loadDocumentAlerts(7);

    expect(service.documentAlerts()?.documents).toEqual([]);
  });

  it('rejects on 403 (not Admin) and leaves documentAlerts() unset — CrmService never reports it itself', async () => {
    stubRoute('GET', '/api/admin/crm/document-alerts', problemDetails(403, 'Forbidden'), 403);
    const service = buildService();

    await expect(service.loadDocumentAlerts(7)).rejects.toBeTruthy();

    expect(service.documentAlerts()).toBeNull();
    expect(service.loadingDocumentAlerts()).toBe(false);
  });

  it('setDocumentAlertsForTest() sets the signal directly', () => {
    const service = buildService();

    service.setDocumentAlertsForTest(documentAlertsOverviewBody() as unknown as CrmDocumentAlertOverview);

    expect(service.documentAlerts()).not.toBeNull();
  });
});
