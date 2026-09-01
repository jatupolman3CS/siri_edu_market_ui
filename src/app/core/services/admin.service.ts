import { Injectable, computed, inject, signal } from '@angular/core';
import type { Category, DocumentItem, Seller, SubcategoryAdmin } from '../models';
import { AdminTransaction } from '../models';
import {
  deleteApiAdminCategoriesById,
  deleteApiAdminCategoriesByCategoryIdSubcategoriesById,
  getApiAdminCategories,
  getApiAdminCategoriesByCategoryIdSubcategories,
  getApiAdminCategoriesByCategoryIdSubcategoriesById,
  getApiAdminAudit,
  getApiAdminDashboard,
  getApiAdminPayouts,
  getApiAdminReports,
  getApiAdminSellers,
  getApiAdminSettings,
  getApiAdminStorageUsage,
  getApiAdminTransactions,
  postApiAdminCategories,
  postApiAdminCategoriesByCategoryIdSubcategories,
  postApiAdminDocumentsPendingSearch,
  postApiAdminDocumentsByIdApprove,
  postApiAdminDocumentsByIdReject,
  postApiAdminDocumentsByIdReportsByReportIdResolve,
  postApiAdminOrdersByOrderIdRefund,
  postApiAdminPayoutsByPayoutIdStatus,
  putApiAdminCategoriesById,
  putApiAdminCategoriesByCategoryIdSubcategoriesById,
  putApiAdminSettings,
} from '../api';
import type {
  AdminDashboardResponse,
  AdminAuditLogResponse,
  AdminOpenReportResponse,
  AdminPayoutResponse,
  PagedResponseOfAdminAuditLogResponse,
  PagedResponseOfAdminOpenReportResponse,
  CreateCategoryRequest,
  CreateSubcategoryRequest,
  PlatformSettingsResponse,
  StorageUsageResponse,
  UpdateCategoryRequest,
  UpdateSubcategoryRequest,
} from '../api/types.gen';

/**
 * AUD-014: the settings and storage endpoints used to be called through `client.gen`
 * directly, which kept them outside the generated SDK and invisible to `verify:api-drift`.
 * They go through the SDK now; these interfaces stay as the service's own contract because
 * every field on the generated response is optional, and the admin settings form needs a
 * complete object to bind to.
 */
export interface PlatformSettings {
  feeRatePercent: number;
  vatPercent: number;
  payoutMinTHB: number;
  payoutSchedule: string;
}

export interface StorageUsage {
  bucketName: string;
  objectCount: number;
  totalBytes: number;
  isConfigured: boolean;
}

function toPlatformSettings(res: PlatformSettingsResponse): PlatformSettings {
  return {
    feeRatePercent: res.feeRatePercent ?? 0,
    vatPercent: res.vatPercent ?? 0,
    payoutMinTHB: res.payoutMinTHB ?? 0,
    payoutSchedule: res.payoutSchedule ?? '',
  };
}

function toStorageUsage(res: StorageUsageResponse): StorageUsage {
  return {
    bucketName: res.bucketName ?? '',
    objectCount: res.objectCount ?? 0,
    totalBytes: res.totalBytes ?? 0,
    isConfigured: res.isConfigured ?? false,
  };
}
import {
  mapAdminPendingToDocumentItem,
  mapAdminSellerCard,
  mapAdminTransaction,
  mapCategory,
  mapSubcategoryAdmin,
} from '../api-mappers/mappers';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { createInfinitePager } from './infinite-pager';
import { getApiAdminDocumentById, type AdminDocumentDetail } from '../api/admin-documents.api';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _pendingQuery = signal<{
    title?: string;
    sellerName?: string;
    postedFrom?: string;
    postedTo?: string;
  }>({});

  private readonly _dashboard = signal<AdminDashboardResponse | null>(null);
  private readonly _adminCategories = signal<Category[]>([]);
  private readonly _settings = signal<PlatformSettings | null>(null);
  private readonly _storageUsage = signal<StorageUsage | null>(null);

  readonly dashboard = this._dashboard.asReadonly();
  readonly adminCategories = this._adminCategories.asReadonly();
  readonly settings = this._settings.asReadonly();
  readonly storageUsage = this._storageUsage.asReadonly();

  /**
   * real-data-stats v1 §3.6: `AdminDashboardResponse.revenueTrendPercent` / `.feesTrendPercent`
   * / `.refundTrendPercent` — `null` means "backend has no baseline to compare against"
   * (previous month = 0, or no `RefundedAt` data yet — §3.6/§2), which hides the trend badge
   * per §4.7 (never rendered as "+0%").
   */
  readonly dashboardTrends = computed(() => {
    const d = this._dashboard();
    return {
      revenueTrendPercent: d?.revenueTrendPercent ?? null,
      feesTrendPercent: d?.feesTrendPercent ?? null,
      refundTrendPercent: d?.refundTrendPercent ?? null,
    };
  });

  private readonly txnsPager = createInfinitePager<AdminTransaction>({
    pageSize: 50,
    errorMessage: 'โหลดธุรกรรมแอดมินไม่สำเร็จ',
    fetch: async (Page, PageSize) => {
      const result = await getApiAdminTransactions({ query: { Page, PageSize } });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapAdminTransaction),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  private readonly pendingPager = createInfinitePager<DocumentItem>({
    pageSize: 50,
    errorMessage: 'โหลดคิวอนุมัติเอกสารไม่สำเร็จ',
    fetch: async (Page, PageSize) => {
      const q = this._pendingQuery();
      const result = await postApiAdminDocumentsPendingSearch({
        body: {
          page: Page,
          pageSize: PageSize,
          title: q.title,
          sellerName: q.sellerName,
          postedFrom: q.postedFrom,
          postedTo: q.postedTo,
        },
      });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapAdminPendingToDocumentItem),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  private readonly sellersPager = createInfinitePager<Seller>({
    pageSize: 50,
    errorMessage: 'โหลดรายชื่อผู้ขายไม่สำเร็จ',
    fetch: async (Page, PageSize) => {
      const result = await getApiAdminSellers({ query: { Page, PageSize } });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapAdminSellerCard),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  readonly transactions = this.txnsPager.items;
  readonly transactionsState = this.txnsPager.state;
  readonly transactionsHasMore = this.txnsPager.hasMore;
  readonly pendingDocuments = this.pendingPager.items;
  readonly pendingState = this.pendingPager.state;
  readonly pendingHasMore = this.pendingPager.hasMore;
  readonly adminSellers = this.sellersPager.items;
  readonly sellersState = this.sellersPager.state;
  readonly sellersHasMore = this.sellersPager.hasMore;

  readonly totalRevenue = computed(() =>
    this.transactions()
      .filter((t) => t.status === 'fulfilled' || t.status === 'paid')
      .reduce((sum, t) => sum + t.amount, 0),
  );

  readonly totalFees = computed(() =>
    this.transactions()
      .filter((t) => t.status === 'fulfilled' || t.status === 'paid')
      .reduce((sum, t) => sum + t.fee, 0),
  );

  readonly successCount = computed(
    () =>
      this.transactions().filter(
        (t) => t.status === 'fulfilled' || t.status === 'paid',
      ).length,
  );

  readonly refundCount = computed(
    () => this.transactions().filter((t) => t.status === 'refunded').length,
  );

  async refreshTransactions(): Promise<void> {
    try {
      await this.txnsPager.loadFirst();
    } catch (e) {
      this.apiFail.report('โหลดธุรกรรมแอดมิน', e);
    }
  }

  loadMoreTransactions(): Promise<void> {
    return this.txnsPager.loadMore();
  }

  async refreshDashboard(): Promise<void> {
    try {
      const result = await getApiAdminDashboard();
      const data = unwrapSdkResult(result);
      this._dashboard.set(data ?? null);
    } catch (e) {
      this.apiFail.report('โหลดแดชบอร์ดแอดมิน', e);
      this._dashboard.set(null);
    }
  }

  async refreshPendingDocuments(query?: {
    title?: string;
    sellerName?: string;
    postedFrom?: string;
    postedTo?: string;
  }): Promise<void> {
    try {
      this._pendingQuery.set(query ?? {});
      await this.pendingPager.loadFirst();
    } catch (e) {
      this.apiFail.report('โหลดคิวอนุมัติเอกสาร', e);
    }
  }

  loadMorePendingDocuments(): Promise<void> {
    return this.pendingPager.loadMore();
  }

  async approveDocument(id: string): Promise<void> {
    try {
      const result = await postApiAdminDocumentsByIdApprove({ path: { id } });
      unwrapSdkResult(result);
      await this.refreshPendingDocuments();
    } catch (e) {
      this.apiFail.report('อนุมัติเอกสาร', e);
      throw e;
    }
  }

  async rejectDocument(id: string, reason: string): Promise<void> {
    try {
      const result = await postApiAdminDocumentsByIdReject({
        path: { id },
        body: { reason },
      });
      unwrapSdkResult(result);
      await this.refreshPendingDocuments();
    } catch (e) {
      this.apiFail.report('ปฏิเสธเอกสาร', e);
      throw e;
    }
  }

  async fetchAdminDocumentDetail(id: string): Promise<AdminDocumentDetail | null> {
    try {
      const result = await getApiAdminDocumentById({ path: { id } });
      return unwrapSdkResult(result) ?? null;
    } catch (e) {
      this.apiFail.report('โหลดรายละเอียดเอกสาร', e);
      return null;
    }
  }

  async refreshSellers(): Promise<void> {
    try {
      await this.sellersPager.loadFirst();
    } catch (e) {
      this.apiFail.report('โหลดรายชื่อผู้ขาย', e);
    }
  }

  loadMoreSellers(): Promise<void> {
    return this.sellersPager.loadMore();
  }

  async refreshAdminCategories(): Promise<void> {
    try {
      const result = await getApiAdminCategories();
      const data = unwrapSdkResult(result);
      this._adminCategories.set((data ?? []).map(mapCategory));
    } catch (e) {
      this.apiFail.report('โหลดหมวดหมู่ (แอดมิน)', e);
      this._adminCategories.set([]);
    }
  }

  async createCategory(request: CreateCategoryRequest): Promise<void> {
    try {
      const result = await postApiAdminCategories({ body: request });
      unwrapSdkResult(result);
      await this.refreshAdminCategories();
    } catch (e) {
      this.apiFail.report('เพิ่มหมวดหมู่', e);
      throw e;
    }
  }

  async updateCategory(
    id: string,
    request: UpdateCategoryRequest,
  ): Promise<void> {
    try {
      const result = await putApiAdminCategoriesById({
        path: { id },
        body: request,
      });
      unwrapSdkResult(result);
      await this.refreshAdminCategories();
    } catch (e) {
      this.apiFail.report('อัปเดตหมวดหมู่', e);
      throw e;
    }
  }

  async deleteCategory(id: string): Promise<void> {
    const result = await deleteApiAdminCategoriesById({ path: { id } });
    if (result.error) {
      this.apiFail.report('ลบหมวดหมู่', result.error);
      throw result.error;
    }
    await this.refreshAdminCategories();
  }

  // ========== Platform settings (admin) ==========

  async loadSettings(): Promise<PlatformSettings | null> {
    try {
      const settings = toPlatformSettings(unwrapSdkResult(await getApiAdminSettings()));
      this._settings.set(settings);
      return settings;
    } catch (e) {
      this.apiFail.report('โหลดการตั้งค่าระบบ', e);
      this._settings.set(null);
      return null;
    }
  }

  async saveSettings(req: PlatformSettings): Promise<PlatformSettings | null> {
    try {
      const settings = toPlatformSettings(
        unwrapSdkResult(await putApiAdminSettings({ body: req })),
      );
      this._settings.set(settings);
      return settings;
    } catch (e) {
      this.apiFail.report('บันทึกการตั้งค่าระบบ', e);
      throw e;
    }
  }

  async loadStorageUsage(): Promise<StorageUsage | null> {
    try {
      const usage = toStorageUsage(unwrapSdkResult(await getApiAdminStorageUsage()));
      this._storageUsage.set(usage);
      return usage;
    } catch (e) {
      this.apiFail.report('โหลดสถิติพื้นที่จัดเก็บ', e);
      this._storageUsage.set(null);
      return null;
    }
  }

  /**
   * F-01: /admin/payouts called getApiAdminPayouts through the `core/api` barrel, which the
   * old guard rule did not match. The call and its unwrapping live here now; the page keeps
   * its own reporting, because it is the only place that knows which action failed.
   *
   * `status` is omitted rather than sent empty for the "all" filter — the endpoint treats a
   * missing status as no filter, and an empty string as a status that matches nothing.
   */
  async listPayouts(
    status: string | undefined,
    page = 1,
    pageSize = 50,
  ): Promise<AdminPayoutResponse[]> {
    const result = await getApiAdminPayouts({
      query: { Page: page, PageSize: pageSize, ...(status ? { status } : {}) },
    });
    return unwrapSdkResult(result).items ?? [];
  }

  async setPayoutStatus(
    payoutId: string,
    status: 'processing' | 'paid' | 'failed',
  ): Promise<void> {
    await postApiAdminPayoutsByPayoutIdStatus({
      path: { payoutId },
      body: { status },
      throwOnError: true,
    });
  }

  /**
   * F-09 (N-05): document reports across every document.
   *
   * Reports were previously readable only from inside a document an admin had already guessed
   * carried one. Paged from the first day — this table grows with every report filed.
   */
  async listReports(
    openOnly: boolean,
    page = 1,
    pageSize = 50,
  ): Promise<PagedResponseOfAdminOpenReportResponse> {
    const result = await getApiAdminReports({
      query: { status: openOnly ? 'open' : 'all', page, pageSize },
    });
    return unwrapSdkResult(result);
  }

  async resolveDocumentReport(documentId: string, reportId: string): Promise<void> {
    await postApiAdminDocumentsByIdReportsByReportIdResolve({
      path: { id: documentId, reportId },
      throwOnError: true,
    });
  }

  /**
   * F-10: the admin audit log across every entity.
   *
   * ADMIN_AUDIT_LOG was only readable as RecentAudit inside one document's detail. Paged
   * because it gains a row on every admin action and never loses one.
   *
   * The date inputs are plain `yyyy-MM-dd`; `to` is pushed to the end of that day so "ถึง 27
   * ส.ค." includes the 27th rather than stopping at midnight.
   */
  /**
   * F-11 (N-06): refunds an order.
   *
   * OrderStatus.Refunded existed and the dashboard counted it, but nothing set it — so that
   * figure was always zero and refunding meant editing the database by hand.
   *
   * throwOnError because the server's rejections carry the reason the admin needs to read:
   * already refunded, never paid, or a seller has already drawn the money.
   */
  async refundOrder(orderId: string): Promise<void> {
    await postApiAdminOrdersByOrderIdRefund({ path: { orderId }, throwOnError: true });
    await this.refreshTransactions();
  }

  async listAuditLog(query: {
    action?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PagedResponseOfAdminAuditLogResponse> {
    const result = await getApiAdminAudit({
      query: {
        action: query.action,
        from: query.from ? `${query.from}T00:00:00Z` : undefined,
        to: query.to ? `${query.to}T23:59:59Z` : undefined,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 50,
      },
    });
    return unwrapSdkResult(result);
  }

  // ========== Subcategory admin (subcategory-admin-crud v1) ==========
  // docs/contracts/subcategory-admin-crud.md §3-4. Errors are intentionally left to propagate
  // (not reported here via ApiFailureReporter) — categories-admin.page.ts owns the reporting for
  // this section because the 409-on-delete flow needs the raw message text to drive the
  // "ปิดใช้งานแทน" shortcut (AC-14), not just a toast. §3.4/3.5/3.6: the 409 body is plain text,
  // not a `ProblemDetails` object, despite what the generated error type says (a cosmetic mismatch
  // in the backend's swagger annotations, confirmed against runtime by integrator-qa) — `unwrapSdkResult`
  // throws `result.error` as-is, and `@hey-api/client-fetch` already falls back to the raw text
  // when a 409 body fails `JSON.parse`, so this string reaches the caller untouched.

  async listSubcategories(categoryId: string): Promise<SubcategoryAdmin[]> {
    const result = await getApiAdminCategoriesByCategoryIdSubcategories({ path: { categoryId } });
    const data = unwrapSdkResult(result);
    return (data ?? []).map(mapSubcategoryAdmin);
  }

  async getSubcategory(categoryId: string, id: string): Promise<SubcategoryAdmin | null> {
    const result = await getApiAdminCategoriesByCategoryIdSubcategoriesById({
      path: { categoryId, id },
    });
    const data = unwrapSdkResult(result);
    return data ? mapSubcategoryAdmin(data) : null;
  }

  async createSubcategory(
    categoryId: string,
    request: CreateSubcategoryRequest,
  ): Promise<SubcategoryAdmin | null> {
    const result = await postApiAdminCategoriesByCategoryIdSubcategories({
      path: { categoryId },
      body: request,
    });
    const data = unwrapSdkResult(result);
    return data ? mapSubcategoryAdmin(data) : null;
  }

  async updateSubcategory(
    categoryId: string,
    id: string,
    request: UpdateSubcategoryRequest,
  ): Promise<SubcategoryAdmin | null> {
    const result = await putApiAdminCategoriesByCategoryIdSubcategoriesById({
      path: { categoryId, id },
      body: request,
    });
    const data = unwrapSdkResult(result);
    return data ? mapSubcategoryAdmin(data) : null;
  }

  async deleteSubcategory(categoryId: string, id: string): Promise<void> {
    const result = await deleteApiAdminCategoriesByCategoryIdSubcategoriesById({
      path: { categoryId, id },
    });
    if (result.error !== undefined) throw result.error;
  }
}
