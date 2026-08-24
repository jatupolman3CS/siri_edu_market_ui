import { Injectable, computed, inject, signal } from '@angular/core';
import { DocumentItem, SellerStats } from '../models';
import { mapSellerDocument, mapSellerDocumentSummary, mapSellerStats } from '../api-mappers/mappers';
import {
  deleteApiSellerDocumentsById,
  getApiSellerDashboard,
  getApiSellerDocuments,
  getApiSellerDocumentsById,
  getApiSellerEarnings,
  getApiSellerReviews,
  postApiFilesUpload,
  postApiSellerDocuments,
  postApiSellerDocumentsByIdAiGenerate,
  postApiSellerPayouts,
} from '../api';
import type {
  AiGenerateResponse,
  CreateDocumentRequest,
  GetApiSellerReviewsResponse,
  SellerDocumentResponse,
  UploadResponse,
  SellerEarningsResponse,
} from '../api/types.gen';
import { unwrapSdkResult, type SdkResult } from './api-result';
import { putApiSellerDocumentsById, type UpdateSellerDocumentRequest } from '../api/seller-document-update';
import {
  getApiSellerDocumentsByIdMainFiles,
  getApiSellerDocumentsByIdMainFilesByFileIdDownloadUrl,
  postApiSellerDocumentsByIdMainFiles,
  putApiSellerDocumentsByIdListedMainFile,
} from '../api/seller-document-main-files';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { createInfinitePager } from './infinite-pager';

export type SellerReviewRow = {
  id: string;
  documentTitle: string;
  buyerName: string;
  buyerAvatarUrl: string;
  rating: number;
  comment: string;
  createdAt: string;
  sellerReplyText?: string | null;
  sellerRepliedAt?: string | null;
};

@Injectable({ providedIn: 'root' })
export class SellerService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly docsQuery = signal<{ status: string; search: string }>({
    status: 'all',
    search: '',
  });

  private readonly _stats = signal<SellerStats>({
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

  private readonly _earnings = signal<SellerEarningsResponse | null>(null);
  readonly earnings = this._earnings.asReadonly();

  private readonly docsPager = createInfinitePager<DocumentItem>({
    pageSize: 24,
    errorMessage: 'โหลดเอกสารของฉันไม่สำเร็จ',
    fetch: async (Page, PageSize) => {
      const q = this.docsQuery();
      const result = await getApiSellerDocuments({
        query: {
          Page,
          PageSize,
          Status: q.status,
          Search: q.search || undefined,
        },
      });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapSellerDocumentSummary),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  readonly myDocuments = this.docsPager.items;
  readonly docsState = this.docsPager.state;
  readonly docsHasMore = this.docsPager.hasMore;
  readonly stats = this._stats.asReadonly();

  readonly approvedCount = computed(
    () => this.myDocuments().filter((d) => d.status === 'approved').length,
  );

  readonly pendingCount = computed(
    () => this.myDocuments().filter((d) => d.status === 'pending').length,
  );

  async refreshDashboard(): Promise<void> {
    try {
      const result = await getApiSellerDashboard();
      const data = unwrapSdkResult(result);
      if (data) this._stats.set(mapSellerStats(data));
    } catch (e) {
      this.apiFail.report('โหลดแดชบอร์ดผู้ขาย', e);
    }
  }

  async loadEarnings(): Promise<void> {
    try {
      const result = await getApiSellerEarnings();
      const data = unwrapSdkResult(result);
      if (data) this._earnings.set(data);
    } catch (e) {
      this.apiFail.report('โหลดรายได้ของฉัน', e);
    }
  }

  /**
   * GAP-02: asks the platform to pay out the available balance. Payouts had no API at
   * all, so the seller earnings page showed money that could never be withdrawn.
   */
  async requestPayout(bankAccount: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await postApiSellerPayouts({ body: { bankAccount }, throwOnError: true });
      await this.loadEarnings();
      return { ok: true };
    } catch (e) {
      this.apiFail.report('ขอถอนเงิน', e);
      return { ok: false, error: 'ขอถอนเงินไม่สำเร็จ' };
    }
  }

  async refreshDocuments(): Promise<void> {
    try {
      await this.docsPager.loadFirst();
    } catch (e) {
      this.apiFail.report('โหลดเอกสารของฉัน', e);
    }
  }

  setDocumentsQuery(next: { status: string; search: string }): void {
    const normalized = {
      status: (next.status || 'all').trim().toLowerCase(),
      search: (next.search || '').trim(),
    };
    const prev = this.docsQuery();
    if (prev.status === normalized.status && prev.search === normalized.search) return;
    this.docsQuery.set(normalized);
    void this.refreshDocuments();
  }

  loadMoreDocuments(): Promise<void> {
    return this.docsPager.loadMore();
  }

  /**
   * Full document + gallery for edit flow (GET /api/seller/documents/{id}).
   * Returns null on failure after reporting to the user.
   */
  async fetchDocumentForEdit(id: string): Promise<DocumentItem | null> {
    try {
      const result = await getApiSellerDocumentsById({ path: { id } });
      const data = unwrapSdkResult(result);
      if (!data) return null;
      return mapSellerDocument(data);
    } catch (e) {
      this.apiFail.report('โหลดเอกสารสำหรับแก้ไข', e);
      return null;
    }
  }

  async fetchDocumentMainFiles(id: string): Promise<NonNullable<DocumentItem['mainFiles']>> {
    try {
      const result = await getApiSellerDocumentsByIdMainFiles({ path: { id } });
      const data = unwrapSdkResult(result);
      if (!data?.length) return [];
      return data
        .map((m) => ({
          id: (m.id ?? '').trim(),
          storageKey: (m.storageKey ?? '').trim(),
          originalFileName: (m.originalFileName ?? '').trim(),
          uploadedAt: (m.uploadedAt ?? '').trim(),
          isListedForSale: !!m.isListedForSale,
        }))
        .filter((m) => m.id !== '' && m.storageKey !== '');
    } catch (e) {
      this.apiFail.report('โหลดรายการไฟล์หลัก', e);
      return [];
    }
  }

  async addDocumentMainFile(
    id: string,
    body: { storageKey: string; originalFileName?: string },
  ): Promise<boolean> {
    try {
      const result = await postApiSellerDocumentsByIdMainFiles({
        path: { id },
        body: {
          storageKey: body.storageKey,
          originalFileName: body.originalFileName ?? null,
        },
      });
      unwrapSdkResult(result);
      return true;
    } catch (e) {
      this.apiFail.report('เพิ่มไฟล์หลัก', e);
      return false;
    }
  }

  async setListedMainFile(id: string, fileId: string): Promise<SellerDocumentResponse | null> {
    try {
      const result = await putApiSellerDocumentsByIdListedMainFile({
        path: { id },
        body: { fileId },
      });
      return unwrapSdkResult(result) ?? null;
    } catch (e) {
      this.apiFail.report('ตั้งไฟล์ที่ขาย', e);
      return null;
    }
  }

  async getMainFileDownloadUrl(
    documentId: string,
    fileId: string,
    expiresSeconds = 600,
  ): Promise<string | null> {
    try {
      const result = await getApiSellerDocumentsByIdMainFilesByFileIdDownloadUrl({
        path: { id: documentId, fileId },
        query: { expiresSeconds },
      });
      const data = unwrapSdkResult(result);
      const url = data?.url?.trim();
      return url || null;
    } catch (e) {
      this.apiFail.report('ดาวน์โหลดไฟล์', e);
      return null;
    }
  }

  async updateDocument(
    id: string,
    body: UpdateSellerDocumentRequest,
  ): Promise<void> {
    try {
      const result = await putApiSellerDocumentsById({ path: { id }, body });
      unwrapSdkResult(result);
      await this.refreshDocuments();
    } catch (e) {
      this.apiFail.report('อัปเดตเอกสาร', e);
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await deleteApiSellerDocumentsById({ path: { id } });
      await this.refreshDocuments();
    } catch (e) {
      this.apiFail.report('ลบเอกสาร', e);
      void this.refreshDocuments();
      throw e;
    }
  }

  /** Upload a single file to /api/files/upload (R2-backed). Returns the storage key + public URL. */
  async uploadFile(file: File): Promise<UploadResponse> {
    try {
      const result = await postApiFilesUpload({ body: { file } });
      return unwrapSdkResult(result);
    } catch (e) {
      this.apiFail.report('อัปโหลดไฟล์', e);
      throw e;
    }
  }

  /** Create a new seller document via /api/seller/documents. */
  async createDocument(req: CreateDocumentRequest): Promise<SellerDocumentResponse> {
    try {
      const result = await postApiSellerDocuments({ body: req });
      const data = unwrapSdkResult(result);
      void this.refreshDocuments();
      return data;
    } catch (e) {
      this.apiFail.report('สร้างเอกสารใหม่', e);
      throw e;
    }
  }

  /**
   * AUD-016: pages must not import sdk.gen directly. Reviews list goes through
   * this service so audit-guard stays clean.
   */
  async loadReviews(page = 1, pageSize = 100): Promise<SellerReviewRow[]> {
    try {
      const result = await getApiSellerReviews({ query: { Page: page, PageSize: pageSize } });
      const data = unwrapSdkResult(result as SdkResult<GetApiSellerReviewsResponse>);
      return (data.items ?? []).map((r) => ({
        id: r.id ?? '',
        documentTitle: r.documentTitle ?? '',
        buyerName: r.buyerName ?? '',
        buyerAvatarUrl: r.buyerAvatarUrl ?? '',
        rating: r.rating ?? 0,
        comment: r.comment ?? '',
        createdAt: r.createdAt ?? '',
        sellerReplyText: r.sellerReplyText,
        sellerRepliedAt: r.sellerRepliedAt,
      }));
    } catch (e) {
      this.apiFail.report('โหลดรีวิวของฉัน', e);
      return [];
    }
  }

  /** AI generate helper via /api/seller/documents/{id}/ai-generate */
  async aiGenerate(documentId: string, tool: string): Promise<AiGenerateResponse> {
    try {
      const result = await postApiSellerDocumentsByIdAiGenerate({
        path: { id: documentId },
        body: { tool },
      });
      return unwrapSdkResult(result);
    } catch (e) {
      this.apiFail.report('AI ช่วยเขียน', e);
      throw e;
    }
  }
}
