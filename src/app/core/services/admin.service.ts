import { Injectable, computed, inject, signal } from '@angular/core';
import type { Category, DocumentItem, Seller } from '../models';
import { AdminTransaction } from '../models';
import {
  deleteApiAdminCategoriesById,
  getApiAdminCategories,
  getApiAdminDashboard,
  getApiAdminSellers,
  getApiAdminTransactions,
  postApiAdminCategories,
  postApiAdminDocumentsPendingSearch,
  postApiAdminDocumentsByIdApprove,
  postApiAdminDocumentsByIdReject,
  putApiAdminCategoriesById,
} from '../api';
import type {
  AdminDashboardResponse,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '../api/types.gen';
import { client as heyApiClient } from '../api/client.gen';

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
import {
  mapAdminPendingToDocumentItem,
  mapAdminSellerCard,
  mapAdminTransaction,
  mapCategory,
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
      const result = await heyApiClient.get<PlatformSettings>({
        url: '/api/admin/settings',
      });
      if (result.error) throw result.error;
      this._settings.set(result.data ?? null);
      return result.data ?? null;
    } catch (e) {
      this.apiFail.report('โหลดการตั้งค่าระบบ', e);
      this._settings.set(null);
      return null;
    }
  }

  async saveSettings(req: PlatformSettings): Promise<PlatformSettings | null> {
    try {
      const result = await heyApiClient.put<PlatformSettings>({
        url: '/api/admin/settings',
        body: req,
        headers: { 'Content-Type': 'application/json' },
      });
      if (result.error) throw result.error;
      this._settings.set(result.data ?? null);
      return result.data ?? null;
    } catch (e) {
      this.apiFail.report('บันทึกการตั้งค่าระบบ', e);
      throw e;
    }
  }

  async loadStorageUsage(): Promise<StorageUsage | null> {
    try {
      const result = await heyApiClient.get<StorageUsage>({
        url: '/api/admin/storage/usage',
      });
      if (result.error) throw result.error;
      this._storageUsage.set(result.data ?? null);
      return result.data ?? null;
    } catch (e) {
      this.apiFail.report('โหลดสถิติพื้นที่จัดเก็บ', e);
      this._storageUsage.set(null);
      return null;
    }
  }
}
