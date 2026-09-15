import { TestBed } from '@angular/core/testing';
import { AdminService } from './admin.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * subcategory-admin-crud v1 (docs/contracts/subcategory-admin-crud.md §3-4). These specs drive
 * `AdminService`'s 5 subcategory methods against a stubbed `fetch`, exercising the real generated
 * SDK calls end to end (unlike `categories-admin.page.spec.ts`, which stubs `AdminService` itself).
 *
 * The 409 case is the one worth pinning down: the backend's swagger annotation says the body is
 * `ProblemDetails`, but at runtime it is a plain-text string (confirmed by integrator-qa) — these
 * tests make sure that string reaches the caller untouched rather than getting coerced into
 * `{ detail: ... }` or losing the Thai message somewhere in the unwrap chain.
 */
type Route = { status?: number; body: unknown; contentType?: string };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;

function textResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });
}

function jsonResponse(body: unknown, status = 200): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, route: Route): void {
  routes.set(`${method.toUpperCase()} ${path}`, route);
}

function buildService(): AdminService {
  TestBed.configureTestingModule({
    providers: [AdminService, { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  return TestBed.inject(AdminService);
}

beforeEach(() => {
  routes = new Map();
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404 }, 404);
    if (route.contentType === 'text/plain') {
      return textResponse(route.body as string, route.status ?? 200);
    }
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('AdminService — subcategory admin (subcategory-admin-crud v1)', () => {
  it('AC-1: lists subcategories for a category, mapped to the domain model', async () => {
    stubRoute('GET', '/api/admin/categories/cat-1/subcategories', {
      body: [
        {
          id: 'sub-1',
          categoryId: 'cat-1',
          name: 'กลางภาค',
          slug: 'sub-1',
          icon: '📄',
          isActive: true,
          sortOrder: 0,
          documentCount: 3,
        },
      ],
    });
    const admin = buildService();

    const list = await admin.listSubcategories('cat-1');

    expect(list).toEqual([
      {
        id: 'sub-1',
        categoryId: 'cat-1',
        name: 'กลางภาค',
        slug: 'sub-1',
        icon: '📄',
        isActive: true,
        sortOrder: 0,
        documentCount: 3,
      },
    ]);
  });

  it('AC-3: creates a subcategory and returns the mapped response', async () => {
    stubRoute('POST', '/api/admin/categories/cat-1/subcategories', {
      status: 201,
      body: {
        id: 'math-midterm',
        categoryId: 'cat-1',
        name: 'กลางภาค',
        slug: 'math-midterm',
        icon: '',
        isActive: true,
        sortOrder: 1,
        documentCount: 0,
      },
    });
    const admin = buildService();

    const created = await admin.createSubcategory('cat-1', {
      id: 'math-midterm',
      name: 'กลางภาค',
      sortOrder: 1,
    });

    expect(created?.id).toBe('math-midterm');
    expect(created?.categoryId).toBe('cat-1');
  });

  it('§3.6/AC-10: a 409 on delete surfaces the server\'s plain-text Thai message untouched', async () => {
    const conflictMessage = 'ลบไม่ได้ — ยังมีเอกสาร 3 รายการอยู่ในหมวดย่อยนี้';
    stubRoute('DELETE', '/api/admin/categories/cat-1/subcategories/sub-1', {
      status: 409,
      body: conflictMessage,
      contentType: 'text/plain',
    });
    const admin = buildService();

    await expect(admin.deleteSubcategory('cat-1', 'sub-1')).rejects.toBe(conflictMessage);
  });

  it('AC-9: a successful delete resolves without throwing', async () => {
    stubRoute('DELETE', '/api/admin/categories/cat-1/subcategories/sub-1', {
      status: 204,
      body: null,
    });
    const admin = buildService();

    await expect(admin.deleteSubcategory('cat-1', 'sub-1')).resolves.toBeUndefined();
  });

  it('AC-7: updates a subcategory and returns the mapped response', async () => {
    stubRoute('PUT', '/api/admin/categories/cat-1/subcategories/sub-1', {
      body: {
        id: 'sub-1',
        categoryId: 'cat-1',
        name: 'ใหม่',
        slug: 'sub-1',
        icon: '',
        isActive: false,
        sortOrder: 2,
        documentCount: 3,
      },
    });
    const admin = buildService();

    const updated = await admin.updateSubcategory('cat-1', 'sub-1', {
      name: 'ใหม่',
      isActive: false,
      sortOrder: 2,
    });

    expect(updated?.name).toBe('ใหม่');
    expect(updated?.isActive).toBe(false);
  });
});

/**
 * announcement-popup v1 (docs/contracts/announcement-popup.md §3-4). Round 2: these specs drive
 * `AdminService`'s 5 announcement methods against a stubbed `fetch`, exercising the real generated
 * SDK calls end to end — mirrors the subcategory admin block above (`AnnouncementPopupService`'s
 * own spec already covers the queue/dismiss/sessionStorage logic against a hand-stubbed
 * `fetchActive`, so this file's job is just the HTTP wiring + response mapping).
 */
describe('AdminService — announcement admin (announcement-popup v1)', () => {
  const image = (id: string) => ({
    id,
    imageUrl: `https://cdn.example.com/${id}.jpg`,
    linkUrl: null,
    altText: null,
    sortOrder: 0,
  });

  it('lists every announcement (every status, unfiltered), mapped to the domain model', async () => {
    stubRoute('GET', '/api/admin/announcements', {
      body: [
        {
          id: 'ann-1',
          title: 'ประกาศทดสอบ',
          isEnabled: true,
          startAt: null,
          endAt: null,
          sortOrder: 0,
          images: [image('img-1'), image('img-2')],
        },
      ],
    });
    const admin = buildService();

    const list = await admin.listAnnouncements();

    expect(list).toEqual([
      {
        id: 'ann-1',
        title: 'ประกาศทดสอบ',
        isEnabled: true,
        startAt: null,
        endAt: null,
        sortOrder: 0,
        images: [image('img-1'), image('img-2')],
      },
    ]);
  });

  it('getAnnouncement returns the mapped announcement by id', async () => {
    stubRoute('GET', '/api/admin/announcements/ann-1', {
      body: {
        id: 'ann-1',
        title: 'ประกาศทดสอบ',
        isEnabled: true,
        startAt: null,
        endAt: null,
        sortOrder: 0,
        images: [image('img-1')],
      },
    });
    const admin = buildService();

    const found = await admin.getAnnouncement('ann-1');

    expect(found?.id).toBe('ann-1');
  });

  it('AC-2: getAnnouncement rejects when the id does not exist (404)', async () => {
    stubRoute('GET', '/api/admin/announcements/missing', {
      status: 404,
      body: { title: 'Not Found', status: 404 },
    });
    const admin = buildService();

    await expect(admin.getAnnouncement('missing')).rejects.toBeTruthy();
  });

  it('AC-3: creates an announcement (1-10 images) and returns the mapped response', async () => {
    const images = [1, 2, 3, 4, 5].map((n) => image(`img-${n}`));
    stubRoute('POST', '/api/admin/announcements', {
      status: 201,
      body: {
        id: 'ann-new',
        title: 'ประกาศใหม่',
        isEnabled: true,
        startAt: null,
        endAt: null,
        sortOrder: 0,
        images,
      },
    });
    const admin = buildService();

    const created = await admin.createAnnouncement({
      title: 'ประกาศใหม่',
      isEnabled: true,
      startAt: null,
      endAt: null,
      sortOrder: 0,
      images: images.map((img, index) => ({
        id: null,
        imageUrl: img.imageUrl,
        linkUrl: null,
        altText: null,
        sortOrder: index,
      })),
    });

    expect(created?.id).toBe('ann-new');
    expect(created?.images).toHaveLength(5);
  });

  it('AC-5: a 400 on create (endAt before startAt) surfaces the ProblemDetails error', async () => {
    stubRoute('POST', '/api/admin/announcements', {
      status: 400,
      body: { title: 'Bad Request', status: 400, message: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มแสดง' },
    });
    const admin = buildService();

    await expect(
      admin.createAnnouncement({
        title: 'x',
        isEnabled: true,
        startAt: '2026-02-01T00:00:00Z',
        endAt: '2026-01-01T00:00:00Z',
        sortOrder: 0,
        images: [],
      }),
    ).rejects.toBeTruthy();
  });

  it('AC-7: updates an announcement and returns the mapped response', async () => {
    stubRoute('PUT', '/api/admin/announcements/ann-1', {
      body: {
        id: 'ann-1',
        title: 'แก้ไขแล้ว',
        isEnabled: false,
        startAt: null,
        endAt: null,
        sortOrder: 2,
        images: [image('img-1'), image('img-2')],
      },
    });
    const admin = buildService();

    const updated = await admin.updateAnnouncement('ann-1', {
      title: 'แก้ไขแล้ว',
      isEnabled: false,
      startAt: null,
      endAt: null,
      sortOrder: 2,
      images: [
        { id: 'img-1', imageUrl: image('img-1').imageUrl, linkUrl: null, altText: null, sortOrder: 0 },
        { id: 'img-2', imageUrl: image('img-2').imageUrl, linkUrl: null, altText: null, sortOrder: 1 },
      ],
    });

    expect(updated?.title).toBe('แก้ไขแล้ว');
    expect(updated?.isEnabled).toBe(false);
  });

  it('AC-7: updateAnnouncement rejects when the id does not exist (404)', async () => {
    stubRoute('PUT', '/api/admin/announcements/missing', {
      status: 404,
      body: { title: 'Not Found', status: 404 },
    });
    const admin = buildService();

    await expect(
      admin.updateAnnouncement('missing', {
        title: 'x',
        isEnabled: true,
        startAt: null,
        endAt: null,
        sortOrder: 0,
        images: [],
      }),
    ).rejects.toBeTruthy();
  });

  it('AC-11: a successful delete resolves without throwing', async () => {
    stubRoute('DELETE', '/api/admin/announcements/ann-1', { status: 204, body: null });
    const admin = buildService();

    await expect(admin.deleteAnnouncement('ann-1')).resolves.toBeUndefined();
  });

  it('AC-11: delete rejects when the announcement does not exist (404)', async () => {
    stubRoute('DELETE', '/api/admin/announcements/missing', {
      status: 404,
      body: { title: 'Not Found', status: 404 },
    });
    const admin = buildService();

    await expect(admin.deleteAnnouncement('missing')).rejects.toBeTruthy();
  });
});

/**
 * real-data-stats v1 §3.6 — `AdminDashboardResponse.revenueTrendPercent` / `.feesTrendPercent`
 * / `.refundTrendPercent` aren't on the generated type yet (backend hasn't
 * shipped/regenerated). `dashboardTrends()` must default every field to `null` (hide the trend
 * badge) rather than `0` ("+0%" would misleadingly read as "no change") — both when the fields
 * are simply absent (today) and when the backend genuinely reports no baseline.
 */
describe('AdminService — dashboardTrends (real-data-stats v1 §3.6)', () => {
  it('defaults every trend to null before any dashboard load', () => {
    const admin = buildService();

    expect(admin.dashboardTrends()).toEqual({
      revenueTrendPercent: null,
      feesTrendPercent: null,
      refundTrendPercent: null,
    });
  });

  it('stays null after a real dashboard load — the fields do not exist on the wire yet', async () => {
    stubRoute('GET', '/api/admin/dashboard', {
      body: { totalRevenue: 100000, totalFees: 10000, successCount: 5, refundCount: 1 },
    });
    const admin = buildService();

    await admin.refreshDashboard();

    expect(admin.dashboardTrends()).toEqual({
      revenueTrendPercent: null,
      feesTrendPercent: null,
      refundTrendPercent: null,
    });
  });

  it('reads the trend fields once the backend starts sending them (round 2 pre-check)', async () => {
    stubRoute('GET', '/api/admin/dashboard', {
      body: {
        totalRevenue: 100000,
        totalFees: 10000,
        successCount: 5,
        refundCount: 1,
        revenueTrendPercent: 24.0,
        feesTrendPercent: 24.0,
        refundTrendPercent: -12.0,
      },
    });
    const admin = buildService();

    await admin.refreshDashboard();

    expect(admin.dashboardTrends()).toEqual({
      revenueTrendPercent: 24.0,
      feesTrendPercent: 24.0,
      refundTrendPercent: -12.0,
    });
  });

  it('AC-EPIC-3: surfaces an explicit null trend (no baseline) as null, never 0', async () => {
    stubRoute('GET', '/api/admin/dashboard', {
      body: {
        totalRevenue: 0,
        totalFees: 0,
        successCount: 0,
        refundCount: 0,
        revenueTrendPercent: null,
        feesTrendPercent: null,
        refundTrendPercent: null,
      },
    });
    const admin = buildService();

    await admin.refreshDashboard();

    expect(admin.dashboardTrends()).toEqual({
      revenueTrendPercent: null,
      feesTrendPercent: null,
      refundTrendPercent: null,
    });
  });
});

/**
 * Production 404 fix — protected document files ("ไฟล์ขาย"/"ไฟล์หลัก") 404'd on a direct
 * `<a href>` link because that navigation carries no JWT and `CanReadAsync` denies anonymous
 * requests. `getFileDownloadUrl` calls the authenticated presigned-URL endpoint
 * (`GET /api/files/presigned/{key}`) instead, mirroring `LibraryService.download`.
 */
describe('AdminService — getFileDownloadUrl (presigned document downloads)', () => {
  it('returns the presigned url on success', async () => {
    stubRoute('GET', '/api/files/presigned/orig%2Fmain.pdf', {
      body: { url: 'https://r2.example.com/orig/main.pdf?sig=abc', expiresSeconds: 600 },
    });
    const admin = buildService();

    const url = await admin.getFileDownloadUrl('orig/main.pdf');

    expect(url).toBe('https://r2.example.com/orig/main.pdf?sig=abc');
  });

  it('reports the failure and returns null when the backend denies access (404)', async () => {
    stubRoute('GET', '/api/files/presigned/missing.pdf', {
      status: 404,
      body: { title: 'Not Found', status: 404 },
    });
    const admin = buildService();

    const url = await admin.getFileDownloadUrl('missing.pdf');

    expect(url).toBeNull();
  });
});

/**
 * ai-approval-prescreen v1 §0.2 Fix-3 / §1: `prescreenDocument` used to call
 * `(client.post as any)` directly — this spec pins it down to the generated SDK function
 * (`postApiAdminDocumentsByIdAiPrescreen`) after the regen against a live backend, and confirms
 * the pending queue refreshes afterwards (so the new risk badge/flags show up without a manual
 * reload).
 */
describe('AdminService — prescreenDocument (ai-approval-prescreen v1 §0.2/§1)', () => {
  it('AC-6: calls the ai-prescreen endpoint through the generated SDK and refreshes the queue', async () => {
    stubRoute('POST', '/api/admin/documents/doc-1/ai-prescreen', {
      body: { isSuccess: true, riskLevel: 'Warning', flags: ['empty_or_short'], reason: 'สั้นเกินไป' },
    });
    stubRoute('POST', '/api/admin/documents/pending/search', {
      body: { items: [], page: 1, pageSize: 50, totalCount: 0, totalPages: 1 },
    });
    const admin = buildService();

    await expect(admin.prescreenDocument('doc-1')).resolves.toBeUndefined();
  });

  it('reports and rethrows when the AI prescreen call fails', async () => {
    stubRoute('POST', '/api/admin/documents/doc-2/ai-prescreen', {
      status: 400,
      body: { isSuccess: false, riskLevel: null, flags: [], reason: 'Document not found' },
    });
    const report = vi.fn();
    TestBed.configureTestingModule({
      providers: [AdminService, { provide: ApiFailureReporter, useValue: { report } }],
    });
    const admin = TestBed.inject(AdminService);

    await expect(admin.prescreenDocument('doc-2')).rejects.toBeTruthy();
    expect(report).toHaveBeenCalledTimes(1);
  });
});

/**
 * admin-user-management v2 §3.1-§3.5 / §1 — the five moderation endpoints wired to the generated
 * SDK after gate 1. These drive `AdminService` against the stubbed `fetch` above, so they pin the
 * three things the round-1 stub got wrong and that only show up at the wire:
 *
 *  1. the registration timestamp is `joinedAt` (the stub model called it `createdDate`),
 *  2. `Sort` travels as the numeric `AdminUsersSort` enum, not the readable string the page binds,
 *  3. nullable fields stay `null` after mapping instead of collapsing to `undefined`.
 */
describe('AdminService — admin user management (admin-user-management v2 §3.1-§3.5)', () => {
  let requestedUrls: string[];

  beforeEach(() => {
    requestedUrls = [];
    const stubbed = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requestedUrls.push(request.url);
      return stubbed(input as RequestInfo, init);
    }) as typeof globalThis.fetch;
  });

  function listItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'user-1',
      displayName: 'สมชาย ใจดี',
      email: 'somchai@example.com',
      avatarUrl: null,
      roles: ['buyer', 'seller'],
      studioName: null,
      isEmailVerified: true,
      accountStatus: 'active',
      suspendedUntil: null,
      totalPurchaseAmount: 1500.5,
      totalOrderCount: 4,
      totalSalesAmount: 8500,
      totalSalesCount: 12,
      joinedAt: '2026-01-15T00:00:00.0000000Z',
      ...overrides,
    };
  }

  function detail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'user-1',
      displayName: 'สมชาย ใจดี',
      email: 'somchai@example.com',
      avatarUrl: null,
      roles: ['buyer'],
      studioName: null,
      isEmailVerified: true,
      accountStatus: 'active',
      suspendedUntil: null,
      totalPurchaseAmount: 1500,
      totalOrderCount: 4,
      accountStatusReason: null,
      accountStatusMessage: null,
      accountStatusChangedAt: null,
      accountStatusChangedBy: null,
      accountStatusChangedByName: null,
      isSeller: false,
      sellerApplicationStatus: null,
      purchaseStats: {
        totalPurchaseAmount: 1500,
        totalOrderCount: 4,
        refundedAmount: 200,
        refundedOrderCount: 1,
        lastOrderAt: null,
      },
      sellerStats: null,
      moderationHistory: [],
      joinedAt: '2026-01-15T00:00:00.0000000Z',
      ...overrides,
    };
  }

  it('§3.1: maps every list field and keeps nullable ones as null', async () => {
    stubRoute('GET', '/api/admin/users', {
      body: { items: [listItem()], page: 2, pageSize: 20, totalCount: 31, totalPages: 2 },
    });
    const admin = buildService();

    const result = await admin.searchUsers({ page: 2, pageSize: 20 });

    expect(result).toEqual({
      items: [
        {
          id: 'user-1',
          displayName: 'สมชาย ใจดี',
          email: 'somchai@example.com',
          avatarUrl: null,
          roles: ['buyer', 'seller'],
          studioName: null,
          isEmailVerified: true,
          accountStatus: 'active',
          suspendedUntil: null,
          totalPurchaseAmount: 1500.5,
          totalOrderCount: 4,
          totalSalesAmount: 8500,
          totalSalesCount: 12,
          joinedAt: '2026-01-15T00:00:00.0000000Z',
        },
      ],
      page: 2,
      pageSize: 20,
      totalCount: 31,
      totalPages: 2,
    });
    // `null` must survive the mapper rather than collapsing to `undefined`.
    const row = result.items![0];
    expect(Object.keys(row)).toContain('suspendedUntil');
    expect(row.suspendedUntil).toBeNull();
    expect(row.studioName).toBeNull();
  });

  it('§3.1: sends the filters as PascalCase query params and Sort as the numeric enum', async () => {
    stubRoute('GET', '/api/admin/users', {
      body: { items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 0 },
    });
    const admin = buildService();

    await admin.searchUsers({
      page: 1,
      pageSize: 20,
      q: 'สมชาย',
      role: 'seller',
      status: 'suspended',
      joinedFrom: '2026-01-01',
      joinedTo: '2026-02-01',
      sort: 'most_earned',
    });

    const query = new URL(requestedUrls.at(-1)!).searchParams;
    expect(query.get('Q')).toBe('สมชาย');
    expect(query.get('Role')).toBe('seller');
    expect(query.get('Status')).toBe('suspended');
    expect(query.get('JoinedFrom')).toBe('2026-01-01');
    expect(query.get('JoinedTo')).toBe('2026-02-01');
    expect(query.get('Page')).toBe('1');
    expect(query.get('PageSize')).toBe('20');
    // MostEarned = 3 (Newest=0, Oldest=1, MostSpent=2, MostEarned=3, NameAsc=4)
    expect(query.get('Sort')).toBe('3');
  });

  it('§3.1: reports and returns an empty page when the list call fails', async () => {
    stubRoute('GET', '/api/admin/users', { status: 403, body: { title: 'Forbidden', status: 403 } });
    const report = vi.fn();
    TestBed.configureTestingModule({
      providers: [AdminService, { provide: ApiFailureReporter, useValue: { report } }],
    });
    const admin = TestBed.inject(AdminService);

    const result = await admin.searchUsers({ page: 1, pageSize: 20 });

    expect(result).toEqual({ items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('§3.2: maps a buyer detail with sellerStats null and an empty history', async () => {
    stubRoute('GET', '/api/admin/users/user-1', { body: detail() });
    const admin = buildService();

    const result = await admin.getUser('user-1');

    expect(result.sellerStats).toBeNull();
    expect(result.isSeller).toBe(false);
    expect(result.moderationHistory).toEqual([]);
    expect(result.purchaseStats).toEqual({
      totalPurchaseAmount: 1500,
      totalOrderCount: 4,
      refundedAmount: 200,
      refundedOrderCount: 1,
      lastOrderAt: null,
    });
    expect(result.joinedAt).toBe('2026-01-15T00:00:00.0000000Z');
  });

  it('§3.2: maps sellerStats and the moderation history for a restricted seller', async () => {
    stubRoute('GET', '/api/admin/users/user-2', {
      body: detail({
        id: 'user-2',
        roles: ['buyer', 'seller'],
        studioName: 'ร้านครูสมชาย',
        accountStatus: 'suspended',
        suspendedUntil: '2026-10-01T00:00:00.0000000Z',
        accountStatusReason: 'ละเมิดกฎการขาย',
        accountStatusMessage: 'กรุณาติดต่อผู้ดูแลระบบ',
        accountStatusChangedAt: '2026-09-10T03:00:00.0000000Z',
        accountStatusChangedBy: 'admin-1',
        accountStatusChangedByName: 'แอดมินเอ',
        isSeller: true,
        sellerApplicationStatus: 'approved',
        sellerStats: {
          studioName: 'ร้านครูสมชาย',
          isVerified: true,
          rating: 4.5,
          totalDocuments: 20,
          totalSalesCount: 12,
          grossRevenue: 8500,
          lifetimeNetEarnings: 6800,
          pendingBalance: 1200,
        },
        moderationHistory: [
          {
            id: 'mod-1',
            action: 'suspend',
            reason: 'ละเมิดกฎการขาย',
            messageToUser: null,
            suspendedUntil: '2026-10-01T00:00:00.0000000Z',
            previousStatus: 'active',
            performedByUserId: 'admin-1',
            performedByName: 'แอดมินเอ',
            createdAt: '2026-09-10T03:00:00.0000000Z',
          },
        ],
      }),
    });
    const admin = buildService();

    const result = await admin.getUser('user-2');

    expect(result.accountStatus).toBe('suspended');
    expect(result.accountStatusChangedByName).toBe('แอดมินเอ');
    expect(result.sellerStats).toEqual({
      studioName: 'ร้านครูสมชาย',
      isVerified: true,
      rating: 4.5,
      totalDocuments: 20,
      totalSalesCount: 12,
      grossRevenue: 8500,
      lifetimeNetEarnings: 6800,
      pendingBalance: 1200,
    });
    expect(result.moderationHistory).toHaveLength(1);
    expect(result.moderationHistory[0]).toEqual({
      id: 'mod-1',
      action: 'suspend',
      reason: 'ละเมิดกฎการขาย',
      messageToUser: null,
      suspendedUntil: '2026-10-01T00:00:00.0000000Z',
      previousStatus: 'active',
      performedByUserId: 'admin-1',
      performedByName: 'แอดมินเอ',
      createdAt: '2026-09-10T03:00:00.0000000Z',
    });
  });

  it('§3.3: POSTs to /suspend and answers with the detail that replaces page state', async () => {
    stubRoute('POST', '/api/admin/users/user-1/suspend', {
      body: detail({
        accountStatus: 'suspended',
        suspendedUntil: '2026-10-01T00:00:00.0000000Z',
        accountStatusReason: 'สแปม',
      }),
    });
    const admin = buildService();

    const result = await admin.suspendUser('user-1', {
      reason: 'สแปม',
      until: '2026-10-01T00:00:00.000Z',
      messageToUser: null,
    });

    expect(result.accountStatus).toBe('suspended');
    expect(result.accountStatusReason).toBe('สแปม');
    expect(requestedUrls.at(-1)).toContain('/api/admin/users/user-1/suspend');
  });

  it('§3.4: POSTs to /ban', async () => {
    stubRoute('POST', '/api/admin/users/user-1/ban', {
      body: detail({ accountStatus: 'banned', accountStatusReason: 'ฉ้อโกง' }),
    });
    const admin = buildService();

    const result = await admin.banUser('user-1', { reason: 'ฉ้อโกง', messageToUser: null });

    expect(result.accountStatus).toBe('banned');
    expect(result.suspendedUntil).toBeNull();
    expect(requestedUrls.at(-1)).toContain('/api/admin/users/user-1/ban');
  });

  it('§3.5: POSTs to /reinstate', async () => {
    stubRoute('POST', '/api/admin/users/user-1/reinstate', { body: detail() });
    const admin = buildService();

    const result = await admin.reinstateUser('user-1', { reason: 'ตรวจสอบแล้วไม่ผิด' });

    expect(result.accountStatus).toBe('active');
    expect(requestedUrls.at(-1)).toContain('/api/admin/users/user-1/reinstate');
  });

  it('§4.5: reports and rethrows a 409 so the page can surface the server message', async () => {
    stubRoute('POST', '/api/admin/users/user-1/ban', {
      status: 409,
      body: { message: 'บัญชีนี้ถูกแบนอยู่แล้ว' },
    });
    const report = vi.fn();
    TestBed.configureTestingModule({
      providers: [AdminService, { provide: ApiFailureReporter, useValue: { report } }],
    });
    const admin = TestBed.inject(AdminService);

    await expect(admin.banUser('user-1', { reason: 'ซ้ำ' })).rejects.toBeTruthy();
    expect(report).toHaveBeenCalledTimes(1);
  });
});

/**
 * payout-request-slip-verification v1 (docs/contracts/payout-request-slip-verification.md §3.7,
 * §3.12) — round 2: wired to the real generated SDK after backend gate 1 passed and
 * `npm run generate:api` re-ran against the live backend.
 */
function payoutSlipBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'slip-1',
    payoutId: 'payout-1',
    provider: 'mock',
    verificationStatus: 'matched',
    providerReference: 'MOCK-REF-1',
    parsedAmount: 500,
    parsedTransferredAt: '2026-09-10T00:00:00.000Z',
    parsedReceiverNameMasked: 'สมชาย ใจดี',
    parsedReceiverAccountLast4: '1234',
    parsedSenderBankCode: 'KBANK',
    mismatchReasons: [],
    providerErrorCode: null,
    providerErrorMessage: null,
    fileUrl: '/api/admin/payouts/payout-1/slips/slip-1/file',
    uploadedAt: '2026-09-10T00:05:00.000Z',
    uploadedByName: 'Admin One',
    ...over,
  };
}

describe('AdminService — setPayoutStatus (payout-request-slip-verification v1 §3.12)', () => {
  let requestBodies: string[];

  beforeEach(() => {
    requestBodies = [];
    const stubbed = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requestBodies.push(await request.clone().text());
      return stubbed(input, init);
    }) as typeof globalThis.fetch;
  });

  it('sends reason when status is "failed"', async () => {
    stubRoute('POST', '/api/admin/payouts/payout-1/status', {
      body: { id: 'payout-1', status: 'failed' },
    });
    const admin = buildService();

    await admin.setPayoutStatus('payout-1', 'failed', 'บัญชีปลายทางปิดแล้ว');

    expect(JSON.parse(requestBodies.at(-1) ?? '{}')).toEqual({ status: 'failed', reason: 'บัญชีปลายทางปิดแล้ว' });
  });

  it('sends reason:null when status is not "failed" even if a reason string is passed', async () => {
    stubRoute('POST', '/api/admin/payouts/payout-1/status', {
      body: { id: 'payout-1', status: 'processing' },
    });
    const admin = buildService();

    await admin.setPayoutStatus('payout-1', 'processing', 'ไม่ควรถูกส่ง');

    expect(JSON.parse(requestBodies.at(-1) ?? '{}')).toEqual({ status: 'processing', reason: null });
  });
});

describe('AdminService — uploadPayoutSlip (payout-request-slip-verification v1 §3.7)', () => {
  it('POSTs the file as multipart and maps the returned PayoutSlipResponse', async () => {
    stubRoute('POST', '/api/admin/payouts/payout-1/slip', { body: payoutSlipBody() });
    const admin = buildService();
    const file = new File(['fake-slip-bytes'], 'slip.png', { type: 'image/png' });

    const slip = await admin.uploadPayoutSlip('payout-1', file);

    expect(slip.id).toBe('slip-1');
    expect(slip.verificationStatus).toBe('matched');
    expect(slip.mismatchReasons).toEqual([]);
    expect(slip.fileUrl).toBe('/api/admin/payouts/payout-1/slips/slip-1/file');
  });

  it('rejects (409 duplicate) surfaces the backend message for the caller to catch', async () => {
    stubRoute('POST', '/api/admin/payouts/payout-1/slip', {
      status: 409,
      body: { message: 'สลิปนี้ถูกใช้ยืนยันรายการอื่นแล้ว' },
    });
    const admin = buildService();
    const file = new File(['fake'], 'dup.png', { type: 'image/png' });

    await expect(admin.uploadPayoutSlip('payout-1', file)).rejects.toBeTruthy();
  });
});

describe('AdminService — listPayoutSlips (payout-request-slip-verification v1 §3.7.7)', () => {
  it('maps every slip in the array response', async () => {
    stubRoute('GET', '/api/admin/payouts/payout-1/slips', {
      body: [payoutSlipBody(), payoutSlipBody({ id: 'slip-2', verificationStatus: 'mismatched', mismatchReasons: ['amount_mismatch'] })],
    });
    const admin = buildService();

    const slips = await admin.listPayoutSlips('payout-1');

    expect(slips).toHaveLength(2);
    expect(slips[1].verificationStatus).toBe('mismatched');
    expect(slips[1].mismatchReasons).toEqual(['amount_mismatch']);
  });

  it('returns an empty array when the response has no slips', async () => {
    stubRoute('GET', '/api/admin/payouts/payout-2/slips', { body: [] });
    const admin = buildService();

    const slips = await admin.listPayoutSlips('payout-2');

    expect(slips).toEqual([]);
  });
});

describe('AdminService — reverifyPayoutSlip (payout-request-slip-verification v1 §3.7.5)', () => {
  it('POSTs to the reverify endpoint and maps the updated slip', async () => {
    stubRoute('POST', '/api/admin/payouts/payout-1/slips/slip-1/reverify', {
      body: payoutSlipBody({ verificationStatus: 'provider_error', providerErrorMessage: 'หมดโควต้าการตรวจสลิปชั่วคราว' }),
    });
    const admin = buildService();

    const slip = await admin.reverifyPayoutSlip('payout-1', 'slip-1');

    expect(slip.verificationStatus).toBe('provider_error');
    expect(slip.providerErrorMessage).toBe('หมดโควต้าการตรวจสลิปชั่วคราว');
  });
});

describe('AdminService — completePayoutManually (payout-request-slip-verification v1 §3.7.6)', () => {
  it('POSTs the note and returns the updated AdminPayoutResponse', async () => {
    stubRoute('POST', '/api/admin/payouts/payout-1/complete-manual', {
      body: { id: 'payout-1', status: 'paid', completionNote: 'ตรวจสอบกับธนาคารแล้วโอนสำเร็จจริง' },
    });
    const admin = buildService();

    const result = await admin.completePayoutManually('payout-1', 'ตรวจสอบกับธนาคารแล้วโอนสำเร็จจริง');

    expect(result.status).toBe('paid');
  });

  it('a 400 (note too short) rejects for the page to surface', async () => {
    stubRoute('POST', '/api/admin/payouts/payout-1/complete-manual', {
      status: 400,
      body: { message: 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร' },
    });
    const admin = buildService();

    await expect(admin.completePayoutManually('payout-1', 'สั้นไป')).rejects.toBeTruthy();
  });
});

describe('AdminService — getAffiliates (referral-program v2 §3.10)', () => {
  it('lists affiliate summaries, mapped to the domain model', async () => {
    stubRoute('GET', '/api/admin/affiliates', {
      body: {
        items: [
          {
            userId: 'usr-1',
            displayName: 'สมชาย นักแชร์',
            email: 'somchai@example.com',
            code: 'AFF100',
            commissionRatePercent: 12,
            isActive: true,
            totalClicks: 50,
            totalConversions: 10,
            commissionEarnedTotal: 1500,
          },
        ],
        page: 1,
        pageSize: 10,
        totalCount: 1,
        totalPages: 1,
      },
    });
    const admin = buildService();

    const result = await admin.getAffiliates(1, 10);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].userId).toBe('usr-1');
    expect(result.items[0].code).toBe('AFF100');
    expect(result.totalCount).toBe(1);
  });

  it('returns an empty page and reports the failure when the call fails', async () => {
    stubRoute('GET', '/api/admin/affiliates', { status: 500, body: { message: 'boom' } });
    const admin = buildService();

    const result = await admin.getAffiliates(1, 10);

    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});

describe('AdminService — updateAffiliateSettings (referral-program v2 §3.10)', () => {
  it('PUTs isActive + commissionRatePercentOverride and resolves true on success', async () => {
    stubRoute('PUT', '/api/admin/affiliates/usr-1/settings', {
      body: {
        userId: 'usr-1',
        displayName: 'สมชาย นักแชร์',
        email: 'somchai@example.com',
        code: 'AFF100',
        commissionRatePercent: 8,
        isActive: false,
        totalClicks: 50,
        totalConversions: 10,
        commissionEarnedTotal: 1500,
      },
    });
    const admin = buildService();

    const ok = await admin.updateAffiliateSettings('usr-1', {
      isActive: false,
      commissionRatePercentOverride: 8,
    });

    expect(ok).toBe(true);
  });

  it('resolves false and reports the failure when the call fails', async () => {
    stubRoute('PUT', '/api/admin/affiliates/usr-1/settings', {
      status: 400,
      body: { message: 'อัตราคอมมิชชันต้องอยู่ระหว่าง 0 ถึง 100' },
    });
    const admin = buildService();

    const ok = await admin.updateAffiliateSettings('usr-1', { commissionRatePercentOverride: 999 });

    expect(ok).toBe(false);
  });
});
