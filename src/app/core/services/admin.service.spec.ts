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

  it('AC-3: creates an announcement (5-10 images) and returns the mapped response', async () => {
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
