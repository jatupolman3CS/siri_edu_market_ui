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
    const path = url.pathname.replace('/SIRIEDUMARKET.Api', '');
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
