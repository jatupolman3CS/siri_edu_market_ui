import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_SELLER_INSIGHTS,
  DEFAULT_STORE_READINESS,
  DocumentItem,
  DocumentPricingHint,
  SellerBalanceEntry,
  SellerQnaItem,
  SellerStats,
} from '../models';
import {
  mapSellerBalanceEntry,
  mapSellerDocument,
  mapSellerDocumentSummary,
  mapSellerQna,
  mapSellerStats,
} from '../api-mappers/mappers';
import {
  deleteApiSellerDocumentsById,
  deleteApiSellerPayoutsByPayoutId,
  deleteApiSellerStoreSectionsBySectionId,
  getApiSellerBalanceEntries,
  getApiSellerDashboard,
  getApiSellerDocuments,
  getApiSellerDocumentsById,
  getApiSellerDocumentsPricingHint,
  getApiSellerEarnings,
  getApiSellerPayouts,
  getApiSellerQna,
  getApiSellerReviews,
  getApiSellerStoreSections,
  postApiFilesUpload,
  postApiSellerDocuments,
  postApiSellerDocumentsAutofillSuggestion,
  postApiSellerDocumentsByIdAutofillSuggestion,
  postApiSellerPayouts,
  postApiSellerReviewsByReviewIdReply,
  postApiSellerQnaByQuestionIdAnswer,
  postApiSellerQnaByQuestionIdDraftAnswer,
  postApiSellerStoreSections,
  putApiSellerQnaByQuestionIdFaq,
  putApiSellerStoreSectionsBySectionId,
} from '../api';
import type {
  CreateDocumentRequest,
  GetApiSellerReviewsResponse,
  PayoutResponse,
  SaveStoreSectionRequest,
  SellerAutofillResponse,
  SellerDocumentResponse,
  SellerReviewResponse,
  StoreSectionResponse,
  SellerEarningsResponse,
  UploadResponse,
} from '../api/types.gen';
import { extractErrorCode, extractErrorStatus, unwrapSdkResult, type SdkResult } from './api-result';
import { putApiSellerDocumentsById, type UpdateSellerDocumentRequest } from '../api/seller-document-update';
import {
  getApiSellerDocumentsByIdMainFiles,
  getApiSellerDocumentsByIdMainFilesByFileIdDownloadUrl,
  postApiSellerDocumentsByIdMainFiles,
  putApiSellerDocumentsByIdListedMainFile,
} from '../api/seller-document-main-files';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { createInfinitePager, type PagedResult } from './infinite-pager';

export interface SellerPayoutRow {
  id: string;
  grossAmount: number;
  fee: number;
  netAmount: number;
  status: string;
  bankAccount: string;
  /** `payout-request-slip-verification v1 §3.1`: `bank` | `promptpay` | null. */
  destinationType: string | null;
  requestedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  /** Latest e-slip verification status for this payout, if any (§3.4). */
  slipStatus: string | null;
}

function toSellerPayoutRow(p: PayoutResponse): SellerPayoutRow {
  return {
    id: p.id ?? '',
    grossAmount: p.grossAmount ?? 0,
    fee: p.fee ?? 0,
    netAmount: p.netAmount ?? 0,
    status: p.status ?? 'pending',
    bankAccount: p.bankAccount ?? '',
    destinationType: p.destinationType ?? null,
    requestedAt: p.requestedAt ?? '',
    paidAt: p.paidAt ?? null,
    cancelledAt: p.cancelledAt ?? null,
    slipStatus: p.slipStatus ?? null,
  };
}

export type SellerReviewRow = {
  id: string;
  documentId?: string;
  documentTitle: string;
  documentCoverUrl?: string | null;
  documentSlug?: string | null;
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
    storeReadiness: DEFAULT_STORE_READINESS,
    insights: DEFAULT_SELLER_INSIGHTS,
  });

  private readonly _earnings = signal<SellerEarningsResponse | null>(null);
  readonly earnings = this._earnings.asReadonly();

  /**
   * QA fix: `RequireSellerProfileFilter` now answers a clean `403` (ProblemDetails code
   * `seller_profile_required`) from the dashboard/documents/bundles endpoints for a caller
   * (typically an Admin) with no `SELLER_PROFILE` row, instead of a demo-looking identity or a
   * bare 500. Studio pages read this to show a friendly "no store yet" state instead of the
   * generic connection-failure toast.
   */
  private readonly _sellerProfileRequired = signal(false);
  readonly sellerProfileRequired = this._sellerProfileRequired.asReadonly();

  /** True when `error` is the expected `403 seller_profile_required` — never the generic toast. */
  private handleSellerScopedError(context: string, error: unknown): void {
    if (extractErrorStatus(error) === 403 && extractErrorCode(error) === 'seller_profile_required') {
      this._sellerProfileRequired.set(true);
      return;
    }
    this.apiFail.report(context, error);
  }

  /**
   * real-data-stats v1 §3.5: `SellerEarningsResponse.nextPayoutDate` — `null` means the backend
   * couldn't parse `PLATFORM_SETTING.PayoutSchedule` (§3.5), which hides the "โอนรอบถัดไป" line
   * per §4.6/§4.5.
   */
  readonly nextPayoutDate = computed(() => this._earnings()?.nextPayoutDate ?? null);

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
      // store-readiness-score v1 §4 "การแบ่งงาน" (รอบสอง): `mapSellerStats` now maps the real
      // `d.storeReadiness` field directly (post-regen) — no more override at the call site.
      // seller-analytics-insights v1 §4 "การแบ่งงาน" (รอบสอง): `mapSellerStats` now maps the real
      // `d.insights` field via `mapSellerInsights` (post-regen) — no more override at the call site.
      if (data) this._stats.set(mapSellerStats(data));
      this._sellerProfileRequired.set(false);
    } catch (e) {
      this.handleSellerScopedError('โหลดแดชบอร์ดผู้ขาย', e);
    }
  }

  async loadEarnings(): Promise<void> {
    try {
      const result = await getApiSellerEarnings();
      const data = unwrapSdkResult(result);
      if (data) this._earnings.set(data);
      this._sellerProfileRequired.set(false);
    } catch (e) {
      this.handleSellerScopedError('โหลดรายได้ของฉัน', e);
    }
  }

  /**
   * payout-request-slip-verification v1 §3.1 (breaking change from GAP-02's original shape):
   * the seller now names an `amount` (and optional `note`) instead of always asking for the
   * entire available balance — the destination account is composed by the server from
   * `SELLER_PAYOUT_ACCOUNT` and is never sent by the client any more.
   *
   * The four disable-reasons in §4.2 (no payout account / below minimum / open request /
   * submitting) are all pre-checked by the page before this is ever called, so a `400`/`409`
   * here is a race (balance or account changed between renders) — reported via the same toast
   * every other write in this service uses, with the backend's own Thai sentence attached by
   * `ApiFailureReporter.formatDetail`.
   */
  async requestPayout(amount: number, note?: string): Promise<{ ok: boolean }> {
    try {
      await postApiSellerPayouts({
        body: { amount, note: note?.trim() || null },
        throwOnError: true,
      });
      await this.loadEarnings();
      return { ok: true };
    } catch (e) {
      if (extractErrorStatus(e) === 403 && extractErrorCode(e) === 'seller_profile_required') {
        this._sellerProfileRequired.set(true);
        return { ok: false };
      }
      this.apiFail.report('ขอถอนเงิน', e);
      return { ok: false };
    }
  }

  /** `DELETE /api/seller/payouts/{payoutId}` (§3.2) — cancels the seller's own `pending` request. */
  async cancelPayout(payoutId: string): Promise<{ ok: boolean }> {
    try {
      await deleteApiSellerPayoutsByPayoutId({ path: { payoutId }, throwOnError: true });
      await this.loadEarnings();
      return { ok: true };
    } catch (e) {
      this.apiFail.report('ยกเลิกคำขอถอนเงิน', e);
      return { ok: false };
    }
  }

  /** `GET /api/seller/balance-entries` (§3.5) — the "ประวัติยอดเงิน" ledger section on §4.2/§4.4. */
  async loadBalanceEntriesPaged(
    page = 1,
    pageSize = 20,
  ): Promise<PagedResult<SellerBalanceEntry>> {
    try {
      const result = await getApiSellerBalanceEntries({ query: { Page: page, PageSize: pageSize } });
      const data = unwrapSdkResult(result);
      this._sellerProfileRequired.set(false);
      return {
        items: (data.items ?? []).map(mapSellerBalanceEntry),
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 1,
      };
    } catch (e) {
      this.handleSellerScopedError('โหลดประวัติยอดเงิน', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 1 };
    }
  }

  async refreshDocuments(): Promise<void> {
    try {
      await this.docsPager.loadFirst();
      this._sellerProfileRequired.set(false);
    } catch (e) {
      this.handleSellerScopedError('โหลดเอกสารของฉัน', e);
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

  async listDocumentsPaged(query: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PagedResult<DocumentItem>> {
    try {
      const result = await getApiSellerDocuments({
        query: {
          Page: query.page ?? 1,
          PageSize: query.pageSize ?? 10,
          Status: query.status && query.status !== 'all' ? query.status : undefined,
          Search: query.search || undefined,
        },
      });
      const data = unwrapSdkResult(result);
      this._sellerProfileRequired.set(false);
      return {
        items: (data.items ?? []).map(mapSellerDocumentSummary),
        page: data.page ?? query.page ?? 1,
        pageSize: data.pageSize ?? query.pageSize ?? 10,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 1,
      };
    } catch (e) {
      this.handleSellerScopedError('โหลดเอกสารของฉัน', e);
      return {
        items: [],
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 10,
        totalCount: 0,
        totalPages: 1,
      };
    }
  }

  /**
   * payout-request-slip-verification v1 §3.4/round 2: wired to the real generated
   * `getApiSellerPayouts` now that backend gate 1 passed and `npm run generate:api` re-ran
   * against the live backend — round 1 (GAP-02) called this through a hand-typed `client.get`
   * because no SDK helper existed yet.
   */
  async loadPayoutsPaged(
    page = 1,
    pageSize = 10,
  ): Promise<PagedResult<SellerPayoutRow>> {
    try {
      const result = await getApiSellerPayouts({ query: { Page: page, PageSize: pageSize } });
      const data = unwrapSdkResult(result);
      this._sellerProfileRequired.set(false);
      return {
        items: (data.items ?? []).map(toSellerPayoutRow),
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 1,
      };
    } catch (e) {
      this.handleSellerScopedError('โหลดประวัติการถอนเงิน', e);
      return {
        items: [],
        page,
        pageSize,
        totalCount: 0,
        totalPages: 1,
      };
    }
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

  /**
   * seller-pricing-and-storefront-stats v1 §3.1/§4: competitor price range (avg/min/max/sample
   * size) for OTHER approved, non-free documents sharing at least one category — helps a seller
   * set a competitive price at the upload page's step 3. `categoryIds` empty → skip the request
   * entirely (nothing to filter by).
   *
   * No `apiFail`/error toast on purpose (§4 "การตัดสินใจ: ไม่ toast ตอน error") — this is a
   * nice-to-have box on the upload flow, not core; a failed request just hides it (AC-10), same
   * as `sampleSize < 3`.
   */
  async getDocumentPricingHint(
    categoryIds: string[],
    excludeDocumentId?: string,
  ): Promise<DocumentPricingHint | null> {
    if (categoryIds.length === 0) return null;
    try {
      const result = await getApiSellerDocumentsPricingHint({
        query: { CategoryIds: categoryIds, ExcludeDocumentId: excludeDocumentId },
      });
      const data = unwrapSdkResult(result);
      return {
        sampleSize: data.sampleSize ?? 0,
        minPrice: data.minPrice ?? null,
        maxPrice: data.maxPrice ?? null,
        averagePrice: data.averagePrice ?? null,
      };
    } catch {
      return null;
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
    const res = await this.loadReviewsPaged(page, pageSize);
    return res.items;
  }

  /**
   * Server-side paginated reviews list returning totalCount for pagination component.
   */
  async loadReviewsPaged(
    page = 1,
    pageSize = 20,
  ): Promise<{ items: SellerReviewRow[]; totalCount: number; page: number; pageSize: number; totalPages: number }> {
    try {
      const result = await getApiSellerReviews({ query: { Page: page, PageSize: pageSize } });
      const data = unwrapSdkResult(result as SdkResult<GetApiSellerReviewsResponse>);
      this._sellerProfileRequired.set(false);
      return {
        items: (data.items ?? []).map((r) => ({
          id: r.id ?? '',
          documentId: r.documentId,
          documentTitle: r.documentTitle ?? '',
          documentCoverUrl: r.documentCoverUrl,
          documentSlug: r.documentSlug,
          buyerName: r.buyerName ?? '',
          buyerAvatarUrl: r.buyerAvatarUrl ?? '',
          rating: r.rating ?? 0,
          comment: r.comment ?? '',
          createdAt: r.createdAt ?? '',
          sellerReplyText: r.sellerReplyText,
          sellerRepliedAt: r.sellerRepliedAt,
        })),
        totalCount: data.totalCount ?? 0,
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalPages: data.totalPages ?? 1,
      };
    } catch (e) {
      this.handleSellerScopedError('โหลดรีวิวลูกค้า', e);
      return { items: [], totalCount: 0, page, pageSize, totalPages: 0 };
    }
  }

  async replyToReview(reviewId: string, replyText: string): Promise<SellerReviewRow | null> {
    try {
      const result = await postApiSellerReviewsByReviewIdReply({
        path: { reviewId },
        body: { replyText: replyText.trim() },
      });
      const r = unwrapSdkResult(result as SdkResult<SellerReviewResponse>);
      return {
        id: r.id ?? '',
        documentId: r.documentId,
        documentTitle: r.documentTitle ?? '',
        documentCoverUrl: r.documentCoverUrl,
        documentSlug: r.documentSlug,
        buyerName: r.buyerName ?? '',
        buyerAvatarUrl: r.buyerAvatarUrl ?? '',
        rating: r.rating ?? 0,
        comment: r.comment ?? '',
        createdAt: r.createdAt ?? '',
        sellerReplyText: r.sellerReplyText,
        sellerRepliedAt: r.sellerRepliedAt,
      };
    } catch (e) {
      this.handleSellerScopedError('ตอบกลับรีวิวลูกค้า', e);
      throw e;
    }
  }

  // ===== F-01: seller Q&A =====
  // /seller/qna reached these through the `core/api` barrel, which the old guard rule did
  // not match. The pages keep their own error reporting — they are the only place that knows
  // which action the seller was performing — so these methods only call and unwrap.

  async listQuestions(
    unansweredOnly: boolean,
    page = 1,
    pageSize = 50,
  ): Promise<SellerQnaItem[]> {
    const result = await getApiSellerQna({
      query: { Page: page, PageSize: pageSize, unansweredOnly },
    });
    return (unwrapSdkResult(result).items ?? []).map(mapSellerQna);
  }

  async answerQuestion(questionId: string, answer: string): Promise<void> {
    await postApiSellerQnaByQuestionIdAnswer({
      path: { questionId },
      body: { answer },
      throwOnError: true,
    });
  }

  /** AI-03: Generates an AI draft answer for a buyer question on this seller's listing. */
  async draftQnaAnswer(questionId: string): Promise<string> {
    const result = await postApiSellerQnaByQuestionIdDraftAnswer({ path: { questionId } });
    const data = unwrapSdkResult(result);
    return data?.draftAnswer ?? '';
  }

  /**
   * document-faq-tab v1.1 §3.1: `PUT /api/seller/qna/{questionId}/faq` pins/unpins an answered
   * question as FAQ (`sortOrder` controls its position within the FAQ tab).
   */
  async setQnaFaq(questionId: string, isFaq: boolean, sortOrder: number): Promise<void> {
    await putApiSellerQnaByQuestionIdFaq({
      path: { questionId },
      body: { isFaq, sortOrder },
      throwOnError: true,
    });
  }

  // ===== F-01: storefront sections =====

  async listStoreSections(): Promise<StoreSectionResponse[]> {
    return unwrapSdkResult(await getApiSellerStoreSections()) ?? [];
  }

  /** Create when `sectionId` is null, update otherwise — the page's form covers both. */
  async saveStoreSection(sectionId: string | null, body: SaveStoreSectionRequest): Promise<void> {
    if (sectionId) {
      await putApiSellerStoreSectionsBySectionId({
        path: { sectionId },
        body,
        throwOnError: true,
      });
      return;
    }
    await postApiSellerStoreSections({ body, throwOnError: true });
  }

  async deleteStoreSection(sectionId: string): Promise<void> {
    await deleteApiSellerStoreSectionsBySectionId({
      path: { sectionId },
      throwOnError: true,
    });
  }

  // ===== AI-01: Listing Autofill =====
  async getAutofillSuggestion(params: {
    documentId?: string;
    storageKey?: string;
    fileName?: string;
    sampleText?: string;
  }): Promise<SellerAutofillResponse> {
    try {
      if (params.documentId) {
        const result = await postApiSellerDocumentsByIdAutofillSuggestion({
          path: { id: params.documentId },
        });
        return unwrapSdkResult(result) ?? { isSuccess: false };
      } else {
        const result = await postApiSellerDocumentsAutofillSuggestion({
          body: {
            documentId: params.documentId ?? null,
            storageKey: params.storageKey ?? null,
            fileName: params.fileName ?? null,
            sampleText: params.sampleText ?? null,
          },
        });
        return unwrapSdkResult(result) ?? { isSuccess: false };
      }
    } catch {
      return { isSuccess: false, failureReason: 'Network error or service unavailable' };
    }
  }
}
