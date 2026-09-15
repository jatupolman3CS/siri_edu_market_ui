import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  AdminFeedbackListItemResponse,
  AdminFeedbackDetailResponse,
  UpdateFeedbackStatusRequest,
  PagedResponse,
  AdminSellerRow,
  AnnouncementAdmin,
  Category,
  DocumentItem,
  SubcategoryAdmin,
  AdminUserRow,
  AdminUserDetail,
  AdminUsersQuery,
  AdminUsersSort,
  AdminUserAccountStatus,
  AdminUserModerationActionType,
  AdminUserModerationEntry,
  AdminUserPurchaseStats,
  AdminUserSellerStats,
  AdminAffiliateSummary,
  SuspendUserRequest,
  BanUserRequest,
  ReinstateUserRequest,
  PayoutSlip,
  AdminWalletSummary,
  WalletEntry,
  AdminMlRecommendationOverview,
} from '../models';
import { AdminTransaction } from '../models';
import {
  deleteApiAdminAnnouncementsById,
  deleteApiAdminCategoriesById,
  deleteApiAdminCategoriesByCategoryIdSubcategoriesById,
  deleteApiAdminFeedbackById,
  getApiAdminAffiliates,
  getApiAdminAnnouncements,
  getApiAdminAnnouncementsById,
  getApiAdminFeedback,
  getApiAdminFeedbackById,
  getApiAdminCategories,
  getApiAdminCategoriesByCategoryIdSubcategories,
  getApiAdminCategoriesByCategoryIdSubcategoriesById,
  getApiAdminAudit,
  getApiAdminDashboard,
  getApiAdminDocumentGenerationCategories,
  getApiAdminDocumentGenerationRuns,
  getApiAdminPayouts,
  getApiAdminPayoutsByPayoutIdSlips,
  getApiFilesPresignedByKey,
  getApiAdminReports,
  getApiAdminSellers,
  getApiAdminSettings,
  getApiAdminStorageUsage,
  getApiAdminSystemConfigJobToggles,
  getApiAdminTransactions,
  getApiAdminUsers,
  getApiAdminUsersByUserId,
  getApiAdminMlRecommendationsOverview,
  getApiAdminUsersByUserIdWallet,
  getApiAdminUsersByUserIdWalletEntries,
  getApiAdminWatermarkCopies,
  getApiAnnouncementsActive,
  postApiAdminAnnouncements,
  postApiAdminCategories,
  postApiAdminCategoriesByCategoryIdSubcategories,
  postApiAdminDocumentGenerationRun,
  postApiAdminDocumentsPendingSearch,
  postApiAdminDocumentsByIdAiPrescreen,
  postApiAdminDocumentsByIdApprove,
  postApiAdminDocumentsByIdReject,
  postApiAdminDocumentsByIdReportsByReportIdResolve,
  postApiAdminOrdersByOrderIdRefund,
  postApiAdminPayoutsByPayoutIdCompleteManual,
  postApiAdminPayoutsByPayoutIdSlip,
  postApiAdminPayoutsByPayoutIdSlipsBySlipIdReverify,
  postApiAdminPayoutsByPayoutIdStatus,
  postApiAdminFeedbackByIdStatus,
  postApiAdminUsersByUserIdBan,
  postApiAdminUsersByUserIdReinstate,
  postApiAdminUsersByUserIdSuspend,
  putApiAdminAffiliatesByUserIdSettings,
  putApiAdminAnnouncementsById,
  putApiAdminCategoriesById,
  putApiAdminCategoriesByCategoryIdSubcategoriesById,
  putApiAdminSettings,
  putApiAdminSystemConfigJobTogglesByJobKey,
} from '../api';
import type {
  AdminDashboardResponse,
  AdminAuditLogResponse,
  PagedResponseOfAdminFeedbackListItemResponse,
  AdminOpenReportResponse,
  AdminPayoutResponse,
  AdminSellersSort,
  AdminUserDetailResponse,
  AdminUserListItemResponse,
  AdminUserModerationEntryResponse,
  AdminUserPurchaseStatsResponse,
  AdminUserSellerStatsResponse,
  AdminWatermarkCopyResponse,
  DocumentGenerationCategoryStatusResponse,
  DocumentGenerationRunResponse,
  PagedResponseOfAdminAuditLogResponse,
  PagedResponseOfAdminOpenReportResponse,
  CreateCategoryRequest,
  CreateSubcategoryRequest,
  PlatformSettingsResponse,
  StorageUsageResponse,
  SystemConfigJobToggleItem,
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
  /** payout-request-slip-verification v1 §3.9 — `0` = ไม่จำกัด. */
  payoutMaxTHB: number;
  /** payout-request-slip-verification v1 §3.9/§4.5 — ISO `yyyy-MM-dd`, `null` = parse ไม่ได้/ยังไม่ตั้งค่า. */
  nextPayoutDate: string | null;
  /** watermark-completion v1 §3.2 — platform-wide watermark policy (always sent by backend). */
  watermarkPolicy: WatermarkPolicy;
  watermarkDefaultEnabled: boolean;
  watermarkForensicEnabled: boolean;
  watermarkCopyRetentionDays: number;
  watermarkDefaultSubtitle: string | null;
}

/** watermark-completion v1 §2.2/§3.2 — the 3 values `watermarkPolicy` may hold. */
export type WatermarkPolicy = 'seller_choice' | 'required_when_supported' | 'required_always';

/**
 * watermark-completion v1 §3.2/§4.1 — body of `PUT /api/admin/settings`.
 *
 * Deliberately *not* the same shape as `PlatformSettings`: the 4 original fields are
 * full-replace, while the 5 watermark fields are nullable with "omitted = leave the stored value
 * alone" semantics, so the admin page may only send the ones the operator actually touched.
 * Sending them unconditionally would let a stale form overwrite a policy changed elsewhere.
 */
export interface PlatformSettingsUpdate {
  feeRatePercent: number;
  vatPercent: number;
  payoutMinTHB: number;
  payoutSchedule: string;
  watermarkPolicy?: WatermarkPolicy;
  watermarkDefaultEnabled?: boolean;
  watermarkForensicEnabled?: boolean;
  watermarkCopyRetentionDays?: number;
  /** `''` clears the stored subtitle back to null (§3.2). */
  watermarkDefaultSubtitle?: string;
}

/**
 * watermark-completion v1 §3.3 — one row of `GET /api/admin/watermark-copies`. Kept as the
 * service's own contract (same reasoning as `PlatformSettings` above): every field on the
 * generated `AdminWatermarkCopyResponse` is optional, and the lookup table needs complete rows.
 */
export interface AdminWatermarkCopy {
  id: string;
  watermarkToken: string;
  documentId: string;
  documentTitle: string;
  documentFormat: string;
  sellerId: string;
  sellerName: string;
  recipientUserId: string;
  recipientName: string;
  recipientEmail: string;
  orderId: string | null;
  accessSource: string;
  watermarkApplied: boolean;
  watermarkMode: string;
  failureReason: string | null;
  storageKey: string | null;
  sizeBytes: number | null;
  renderDurationMs: number | null;
  createdAt: string;
  lastAccessedAt: string;
  purgedAt: string | null;
}

export interface AdminWatermarkCopyQuery {
  token?: string;
  documentId?: string;
  userId?: string;
  page?: number;
  pageSize?: number;
}

export interface StorageUsage {
  bucketName: string;
  objectCount: number;
  totalBytes: number;
  isConfigured: boolean;
}

/**
 * system-config-job-toggle v1 §4 (`docs/contracts/system-config-job-toggle.md`) — one of the 4
 * fixed background-job toggles shown on the Admin Settings page. Kept as the service's own
 * contract (same reasoning as `PlatformSettings`/`StorageUsage` above): the generated
 * `SystemConfigJobToggleItem` marks every field but `jobKey` optional, and the toggle rows need
 * a complete object to bind to.
 */
export interface SystemConfigJobToggle {
  jobKey: string;
  category: string | null;
  displayName: string | null;
  description: string | null;
  enabled: boolean;
  updatedAt: string | null;
}

/**
 * category-content-auto-generation v1 §3.1/§4 (`docs/contracts/category-content-auto-generation.md`)
 * — response of `GET /api/admin/document-generation/categories`. Kept as the service's own
 * contract (same reasoning as `SystemConfigJobToggle` above): the generated
 * `DocumentGenerationCategoryStatusResponse` marks `hasGeneratedDocument` optional, and callers
 * need a complete object to bind to.
 */
export interface DocumentGenerationEligibleCategory {
  categoryId: string;
  name: string;
  hasGeneratedDocument: boolean;
}

/**
 * category-content-auto-generation v1 §3.1/§4 — shape of `DocumentGenerationRunResponse`
 * (used by `POST .../run` and `GET .../runs`[`/{id}`]).
 */
export interface DocumentGenerationRun {
  id: string;
  triggeredBy: 'Scheduled' | 'Manual';
  triggeredByUserId: string | null;
  startedAt: string;
  completedAt: string | null;
  status: 'Success' | 'PartialFailure' | 'Failed';
  categoriesScanned: number;
  documentsGenerated: number;
  failureCount: number;
  errorSummary: string | null;
  generatedDocumentIds: string[];
}

/**
 * announcement-popup v1 §3.1/§4 (`docs/contracts/announcement-popup.md`) — matches the generated
 * `CreateAnnouncementRequest`/`UpdateAnnouncementRequest` field-for-field (the contract defines
 * both with the same shape, and so does the generated SDK — two structurally identical types).
 * Kept as one shared, fully-required interface rather than switching callers to the two generated
 * (all-fields-but-title/images-optional) types: `announcements-admin.page.ts` always fills in
 * every field before calling either `createAnnouncement`/`updateAnnouncement`, and a value of this
 * shape is assignable to both generated request types as-is (no conversion needed) since it has no
 * fields beyond what they declare.
 */
export interface AnnouncementImageRequest {
  id: string | null;
  imageUrl: string;
  linkUrl: string | null;
  altText: string | null;
  sortOrder: number;
}

export interface AnnouncementRequest {
  title: string;
  isEnabled: boolean;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  images: AnnouncementImageRequest[];
}

function toWatermarkPolicy(value: string | null | undefined): WatermarkPolicy {
  switch ((value ?? '').trim()) {
    case 'seller_choice':
    case 'required_always':
      return (value ?? '').trim() as WatermarkPolicy;
    default:
      // watermark-completion v1 §2.2: `required_when_supported` is the platform default, so it
      // is also the safest reading of a value this build does not recognise.
      return 'required_when_supported';
  }
}

function toPlatformSettings(res: PlatformSettingsResponse): PlatformSettings {
  return {
    feeRatePercent: res.feeRatePercent ?? 0,
    vatPercent: res.vatPercent ?? 0,
    payoutMinTHB: res.payoutMinTHB ?? 0,
    payoutSchedule: res.payoutSchedule ?? '',
    payoutMaxTHB: res.payoutMaxTHB ?? 0,
    nextPayoutDate: res.nextPayoutDate ?? null,
    // watermark-completion v1 §3.2 — always present on the wire; defaults mirror §2.2 so a
    // partially-populated response can never render an empty policy card.
    watermarkPolicy: toWatermarkPolicy(res.watermarkPolicy),
    watermarkDefaultEnabled: res.watermarkDefaultEnabled ?? true,
    watermarkForensicEnabled: res.watermarkForensicEnabled ?? true,
    watermarkCopyRetentionDays: res.watermarkCopyRetentionDays ?? 90,
    watermarkDefaultSubtitle: res.watermarkDefaultSubtitle ?? null,
  };
}

/** watermark-completion v1 §3.3 — fills in every field the lookup table binds to. */
function toAdminWatermarkCopy(res: AdminWatermarkCopyResponse): AdminWatermarkCopy {
  return {
    id: res.id ?? '',
    watermarkToken: res.watermarkToken ?? '',
    documentId: res.documentId ?? '',
    documentTitle: res.documentTitle ?? '',
    documentFormat: res.documentFormat ?? '',
    sellerId: res.sellerId ?? '',
    sellerName: res.sellerName ?? '',
    recipientUserId: res.recipientUserId ?? '',
    recipientName: res.recipientName ?? '',
    recipientEmail: res.recipientEmail ?? '',
    orderId: res.orderId ?? null,
    accessSource: res.accessSource ?? '',
    watermarkApplied: res.watermarkApplied ?? false,
    watermarkMode: res.watermarkMode ?? 'none',
    failureReason: res.failureReason ?? null,
    storageKey: res.storageKey ?? null,
    sizeBytes: res.sizeBytes ?? null,
    renderDurationMs: res.renderDurationMs ?? null,
    createdAt: res.createdAt ?? '',
    lastAccessedAt: res.lastAccessedAt ?? '',
    purgedAt: res.purgedAt ?? null,
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

function toSystemConfigJobToggle(res: SystemConfigJobToggleItem): SystemConfigJobToggle {
  return {
    jobKey: res.jobKey,
    category: res.category ?? null,
    displayName: res.displayName ?? null,
    description: res.description ?? null,
    enabled: res.enabled ?? false,
    updatedAt: res.updatedAt ?? null,
  };
}

/**
 * category-content-auto-generation v1 §3.1 — `triggeredBy`/`status` are generated as bare
 * `string` (the OpenAPI schema doesn't emit string-literal enums), so this mapper narrows them
 * to the fixed set §3.1 documents. Backend only ever emits these exact values.
 */
function toDocumentGenerationRun(res: DocumentGenerationRunResponse): DocumentGenerationRun {
  return {
    id: res.id,
    triggeredBy: res.triggeredBy as DocumentGenerationRun['triggeredBy'],
    triggeredByUserId: res.triggeredByUserId ?? null,
    startedAt: res.startedAt,
    completedAt: res.completedAt ?? null,
    status: res.status as DocumentGenerationRun['status'],
    categoriesScanned: res.categoriesScanned ?? 0,
    documentsGenerated: res.documentsGenerated ?? 0,
    failureCount: res.failureCount ?? 0,
    errorSummary: res.errorSummary ?? null,
    generatedDocumentIds: res.generatedDocumentIds ?? [],
  };
}

function toDocumentGenerationEligibleCategory(
  res: DocumentGenerationCategoryStatusResponse,
): DocumentGenerationEligibleCategory {
  return {
    categoryId: res.categoryId,
    name: res.name,
    hasGeneratedDocument: res.hasGeneratedDocument ?? false,
  };
}

// ====== Admin user management mappers (admin-user-management v2 §3.1-§3.5) ======

/**
 * §3.0: `accountStatus` is always one of three lowercase literals, but the generated DTO types it
 * as a bare `string`. Anything else would be a backend contract break — fall back to `active`
 * rather than letting an unknown literal leak into the union the templates switch on.
 */
function toAdminUserAccountStatus(value: string | undefined): AdminUserAccountStatus {
  return value === 'suspended' || value === 'banned' || value === 'active' ? value : 'active';
}

/** §3.2 `AdminUserModerationEntry.action` — same reasoning as {@link toAdminUserAccountStatus}. */
function toAdminUserModerationAction(value: string | undefined): AdminUserModerationActionType {
  return value === 'ban' || value === 'reinstate' || value === 'suspend' ? value : 'suspend';
}

/**
 * §3.1 `AdminUsersSort` travels as the numeric enum `Newest=0, Oldest=1, MostSpent=2,
 * MostEarned=3, NameAsc=4` (same as `AdminSellersSort`), so the readable string the page binds to
 * its `<select>` is translated here, in the one place that touches the SDK.
 */
const ADMIN_USERS_SORT_TO_API: Record<AdminUsersSort, number> = {
  newest: 0,
  oldest: 1,
  most_spent: 2,
  most_earned: 3,
  name_asc: 4,
};

function toAdminUserRow(res: AdminUserListItemResponse): AdminUserRow {
  return {
    id: res.id,
    displayName: res.displayName,
    email: res.email,
    avatarUrl: res.avatarUrl ?? null,
    roles: res.roles ?? [],
    studioName: res.studioName ?? null,
    isEmailVerified: res.isEmailVerified,
    accountStatus: toAdminUserAccountStatus(res.accountStatus),
    suspendedUntil: res.suspendedUntil ?? null,
    totalPurchaseAmount: res.totalPurchaseAmount,
    totalOrderCount: res.totalOrderCount,
    totalSalesAmount: res.totalSalesAmount,
    totalSalesCount: res.totalSalesCount,
    joinedAt: res.joinedAt,
  };
}

function toAdminUserPurchaseStats(
  res: AdminUserPurchaseStatsResponse | undefined,
): AdminUserPurchaseStats {
  return {
    totalPurchaseAmount: res?.totalPurchaseAmount ?? 0,
    totalOrderCount: res?.totalOrderCount ?? 0,
    refundedAmount: res?.refundedAmount ?? 0,
    refundedOrderCount: res?.refundedOrderCount ?? 0,
    lastOrderAt: res?.lastOrderAt ?? null,
  };
}

/** §3.2: `sellerStats` is `null` — not an empty object — for a user with no `SELLER_PROFILE`. */
function toAdminUserSellerStats(
  res: AdminUserSellerStatsResponse | null | undefined,
): AdminUserSellerStats | null {
  if (!res) return null;
  return {
    studioName: res.studioName,
    isVerified: res.isVerified,
    rating: res.rating,
    totalDocuments: res.totalDocuments,
    totalSalesCount: res.totalSalesCount,
    grossRevenue: res.grossRevenue,
    lifetimeNetEarnings: res.lifetimeNetEarnings,
    pendingBalance: res.pendingBalance,
  };
}

function toAdminUserModerationEntry(
  res: AdminUserModerationEntryResponse,
): AdminUserModerationEntry {
  return {
    id: res.id,
    action: toAdminUserModerationAction(res.action),
    reason: res.reason,
    messageToUser: res.messageToUser ?? null,
    suspendedUntil: res.suspendedUntil ?? null,
    previousStatus: toAdminUserAccountStatus(res.previousStatus),
    performedByUserId: res.performedByUserId ?? null,
    performedByName: res.performedByName ?? null,
    createdAt: res.createdAt,
  };
}

function toAdminUserDetail(res: AdminUserDetailResponse): AdminUserDetail {
  return {
    id: res.id,
    displayName: res.displayName,
    email: res.email,
    avatarUrl: res.avatarUrl ?? null,
    roles: res.roles ?? [],
    studioName: res.studioName ?? null,
    isEmailVerified: res.isEmailVerified,
    accountStatus: toAdminUserAccountStatus(res.accountStatus),
    suspendedUntil: res.suspendedUntil ?? null,
    totalPurchaseAmount: res.totalPurchaseAmount,
    totalOrderCount: res.totalOrderCount,
    accountStatusReason: res.accountStatusReason ?? null,
    accountStatusMessage: res.accountStatusMessage ?? null,
    accountStatusChangedAt: res.accountStatusChangedAt ?? null,
    accountStatusChangedBy: res.accountStatusChangedBy ?? null,
    accountStatusChangedByName: res.accountStatusChangedByName ?? null,
    isSeller: res.isSeller,
    sellerApplicationStatus: res.sellerApplicationStatus ?? null,
    purchaseStats: toAdminUserPurchaseStats(res.purchaseStats),
    sellerStats: toAdminUserSellerStats(res.sellerStats),
    moderationHistory: (res.moderationHistory ?? []).map(toAdminUserModerationEntry),
    joinedAt: res.joinedAt,
  };
}
import {
  mapAdminAffiliateSummary,
  mapAdminPendingToDocumentItem,
  mapAdminTransaction,
  mapAnnouncementAdmin,
  mapCategory,
  mapPayoutSlip,
  mapSubcategoryAdmin,
  mapAdminWalletSummary,
  mapWalletEntry,
  mapAdminMlRecommendationOverview,
} from '../api-mappers/mappers';
import { extractErrorStatus, unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { createInfinitePager, type PagedResult } from './infinite-pager';
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
  private readonly _jobToggles = signal<SystemConfigJobToggle[]>([]);

  readonly dashboard = this._dashboard.asReadonly();
  readonly adminCategories = this._adminCategories.asReadonly();
  readonly settings = this._settings.asReadonly();
  readonly storageUsage = this._storageUsage.asReadonly();
  readonly jobToggles = this._jobToggles.asReadonly();

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

  readonly transactions = this.txnsPager.items;
  readonly transactionsState = this.txnsPager.state;
  readonly transactionsHasMore = this.txnsPager.hasMore;
  readonly pendingDocuments = this.pendingPager.items;
  readonly pendingState = this.pendingPager.state;
  readonly pendingHasMore = this.pendingPager.hasMore;

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

  async listTransactionsPaged(
    page = 1,
    pageSize = 10,
  ): Promise<PagedResult<AdminTransaction>> {
    try {
      const result = await getApiAdminTransactions({ query: { Page: page, PageSize: pageSize } });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapAdminTransaction),
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 1,
      };
    } catch (e) {
      this.apiFail.report('โหลดธุรกรรมแอดมิน', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 1 };
    }
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

  /** AI-09: Run AI prescreen check on a pending document. */
  async prescreenDocument(id: string): Promise<void> {
    try {
      const result = await postApiAdminDocumentsByIdAiPrescreen({ path: { id } });
      unwrapSdkResult(result);
      await this.refreshPendingDocuments();
    } catch (e) {
      this.apiFail.report('ประเมินความเสี่ยงด้วย AI', e);
      throw e;
    }
  }

  /**
   * backend-wide-pagination-and-seller-directory v1 §4.2: table-result search, page-based (not
   * an infinite pager — mirrors `loadDocumentGenerationRuns`'s error-handling shape) so the page
   * component owns paging state the same way `documents.page.ts` does for its own filter form.
   */
  async searchSellers(query: {
    page: number;
    pageSize: number;
    q?: string;
    verifiedOnly?: boolean;
    joinedFrom?: string;
    joinedTo?: string;
    sort?: AdminSellersSort;
  }): Promise<PagedResult<AdminSellerRow>> {
    try {
      const result = unwrapSdkResult(
        await getApiAdminSellers({
          query: {
            Page: query.page,
            PageSize: query.pageSize,
            Q: query.q || undefined,
            VerifiedOnly: query.verifiedOnly || undefined,
            JoinedFrom: query.joinedFrom || undefined,
            JoinedTo: query.joinedTo || undefined,
            Sort: query.sort,
          },
        }),
      );
      return {
        items: (result.items ?? []).map(
          (s): AdminSellerRow => ({
            id: s.id ?? '',
            studioName: s.studioName ?? '',
            ownerName: s.ownerName ?? '',
            email: s.email ?? '',
            avatarUrl: s.avatarUrl ?? null,
            isVerified: s.isVerified ?? false,
            totalDocuments: s.totalDocuments ?? 0,
            totalSales: s.totalSales ?? 0,
            totalRevenue: s.totalRevenue ?? 0,
            joinedAt: s.joinedAt ?? '',
          }),
        ),
        page: result.page,
        pageSize: result.pageSize,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      };
    } catch (e) {
      this.apiFail.report('ค้นหาผู้ขาย', e);
      return { items: [], page: query.page, pageSize: query.pageSize, totalCount: 0, totalPages: 1 };
    }
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

  /**
   * watermark-completion v1 §3.2/§4.1: takes `PlatformSettingsUpdate`, not `PlatformSettings` —
   * the caller decides which watermark fields to include, and an omitted one keeps its stored
   * value instead of being overwritten by whatever the form happened to be showing.
   */
  async saveSettings(req: PlatformSettingsUpdate): Promise<PlatformSettings | null> {
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

  // ========== Watermark copy lookup (watermark-completion v1 §3.3/§4.2) ==========

  /**
   * watermark-completion v1 §3.3: forensic lookup of a `WMK-XXXXXXXX` code an admin found in a
   * leaked file. Returns the rows as they came — "not found" is an empty list (the endpoint
   * answers 200 with `items: []`, never 404), and the caller decides how to phrase that.
   *
   * Failures are reported centrally and rethrown so the card can tell "nothing matched" apart
   * from "the lookup itself failed".
   */
  async searchWatermarkCopies(query: AdminWatermarkCopyQuery = {}): Promise<AdminWatermarkCopy[]> {
    const token = query.token?.trim();
    try {
      const result = await getApiAdminWatermarkCopies({
        query: {
          ...(token ? { token } : {}),
          ...(query.documentId ? { documentId: query.documentId } : {}),
          ...(query.userId ? { userId: query.userId } : {}),
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 20,
        },
      });
      return (unwrapSdkResult(result).items ?? []).map(toAdminWatermarkCopy);
    } catch (e) {
      this.apiFail.report('ค้นหารหัสสำเนาเอกสาร', e);
      throw e;
    }
  }

  // ========== Background job toggles (system-config-job-toggle v1) ==========
  // docs/contracts/system-config-job-toggle.md §3-4.

  async loadJobToggles(): Promise<SystemConfigJobToggle[]> {
    try {
      const items = (
        unwrapSdkResult(await getApiAdminSystemConfigJobToggles()) ?? []
      ).map(toSystemConfigJobToggle);
      this._jobToggles.set(items);
      return items;
    } catch (e) {
      this.apiFail.report('โหลดสถานะงานอัตโนมัติเบื้องหลัง', e);
      this._jobToggles.set([]);
      return [];
    }
  }

  async updateJobToggle(jobKey: string, enabled: boolean): Promise<SystemConfigJobToggle | null> {
    try {
      const item = toSystemConfigJobToggle(
        unwrapSdkResult(
          await putApiAdminSystemConfigJobTogglesByJobKey({
            path: { jobKey },
            body: { enabled },
          }),
        ),
      );
      this._jobToggles.update((toggles) =>
        toggles.map((t) => (t.jobKey === jobKey ? item : t)),
      );
      return item;
    } catch (e) {
      this.apiFail.report('อัปเดตสถานะงานอัตโนมัติเบื้องหลัง', e);
      throw e;
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

  async listPayoutsPaged(
    status: string | undefined,
    page = 1,
    pageSize = 10,
  ): Promise<PagedResult<AdminPayoutResponse>> {
    try {
      const result = await getApiAdminPayouts({
        query: { Page: page, PageSize: pageSize, ...(status ? { status } : {}) },
      });
      const data = unwrapSdkResult(result);
      return {
        items: data.items ?? [],
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 1,
      };
    } catch (e) {
      this.apiFail.report('โหลดรายการถอนเงิน', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 1 };
    }
  }

  /**
   * payout-request-slip-verification v1 §3.12: `reason` is now required by the backend when
   * `status === 'failed'` (it becomes `PAYOUT.FailureReason` and reverses the ledger hold) —
   * ignored for every other status.
   */
  async setPayoutStatus(
    payoutId: string,
    status: 'processing' | 'paid' | 'failed',
    reason?: string,
  ): Promise<void> {
    await postApiAdminPayoutsByPayoutIdStatus({
      path: { payoutId },
      body: { status, reason: status === 'failed' ? (reason ?? null) : null },
      throwOnError: true,
    });
  }

  // ========== Payout e-slip verification (payout-request-slip-verification v1 §3.7) ==========
  // docs/contracts/payout-request-slip-verification.md §3.7-§3.7.8/§4.5.

  /** `POST /api/admin/payouts/{payoutId}/slip` (§3.7, multipart) — upload + auto-verify an e-Slip. */
  async uploadPayoutSlip(payoutId: string, file: File): Promise<PayoutSlip> {
    const result = await postApiAdminPayoutsByPayoutIdSlip({
      path: { payoutId },
      body: { file },
    });
    return mapPayoutSlip(unwrapSdkResult(result));
  }

  /** `GET /api/admin/payouts/{payoutId}/slips` (§3.7.7) — every slip uploaded for this payout. */
  async listPayoutSlips(payoutId: string): Promise<PayoutSlip[]> {
    const result = await getApiAdminPayoutsByPayoutIdSlips({ path: { payoutId } });
    return (unwrapSdkResult(result) ?? []).map(mapPayoutSlip);
  }

  /** `POST /api/admin/payouts/{payoutId}/slips/{slipId}/reverify` (§3.7.5). */
  async reverifyPayoutSlip(payoutId: string, slipId: string): Promise<PayoutSlip> {
    const result = await postApiAdminPayoutsByPayoutIdSlipsBySlipIdReverify({
      path: { payoutId, slipId },
    });
    return mapPayoutSlip(unwrapSdkResult(result));
  }

  /** `POST /api/admin/payouts/{payoutId}/complete-manual` (§3.7.6) — `note` must be >= 10 chars. */
  async completePayoutManually(payoutId: string, note: string): Promise<AdminPayoutResponse> {
    const result = await postApiAdminPayoutsByPayoutIdCompleteManual({
      path: { payoutId },
      body: { note },
    });
    return unwrapSdkResult(result);
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

  /** system-feedback v1 §3.4 */
  async listFeedback(
    status?: string,
    type?: string,
    role?: string,
    page = 1,
    pageSize = 50,
  ): Promise<PagedResponseOfAdminFeedbackListItemResponse> {
    const result = await getApiAdminFeedback({
      query: {
        status: status || undefined,
        type: type || undefined,
        role: role || undefined,
        page,
        pageSize,
      },
    });
    return unwrapSdkResult(result);
  }

  /** system-feedback v1 §3.5 */
  async getFeedback(id: string): Promise<AdminFeedbackDetailResponse> {
    const result = await getApiAdminFeedbackById({
      path: { id },
    });
    return unwrapSdkResult(result);
  }

  /** system-feedback v1 §3.6 */
  async updateFeedbackStatus(
    id: string,
    request: UpdateFeedbackStatusRequest,
  ): Promise<AdminFeedbackDetailResponse> {
    const result = await postApiAdminFeedbackByIdStatus({
      path: { id },
      body: request,
    });
    return unwrapSdkResult(result);
  }

  /** system-feedback v1 §3.7 */
  async deleteFeedback(id: string): Promise<void> {
    const result = await deleteApiAdminFeedbackById({
      path: { id },
    });
    if (result.error !== undefined) throw result.error;
  }

  /** system-feedback v1 §0.3 / §4.1: count of 'new' feedbacks for admin badge */
  async countNewFeedback(): Promise<number> {
    const res = await this.listFeedback('new', undefined, undefined, 1, 1);
    return res.totalCount ?? 0;
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

  // ========== Document generation (category-content-auto-generation v1) ==========
  // docs/contracts/category-content-auto-generation.md §3-4. Wired to the generated SDK after
  // backend gate-1 passed and `npm run generate:api` was re-run against the live backend.

  async loadDocumentGenerationCategories(): Promise<DocumentGenerationEligibleCategory[]> {
    try {
      const items = unwrapSdkResult(await getApiAdminDocumentGenerationCategories()) ?? [];
      return items.map(toDocumentGenerationEligibleCategory);
    } catch (e) {
      this.apiFail.report('โหลดรายการหมวดหมู่สำหรับสร้างเอกสารอัตโนมัติ', e);
      return [];
    }
  }

  /**
   * §4: unlike the rest of this service, a `409` (another run already in flight) must NOT go
   * through `apiFail.report`'s generic "{context} — {detail}" toast — the backend's Thai message
   * (§3.2) is already user-facing and the page shows it verbatim. Other errors still report
   * normally before rethrowing (same pattern as `approveDocument`/`updateJobToggle`).
   */
  async runDocumentGeneration(categoryId: string | null): Promise<DocumentGenerationRun | null> {
    try {
      const result = await postApiAdminDocumentGenerationRun({ body: { categoryId } });
      return toDocumentGenerationRun(unwrapSdkResult(result));
    } catch (e) {
      if (extractErrorStatus(e) === 409) {
        throw e;
      }
      this.apiFail.report('สั่งสร้างเอกสารอัตโนมัติ', e);
      throw e;
    }
  }

  async loadDocumentGenerationRuns(
    page: number,
    pageSize: number,
  ): Promise<PagedResult<DocumentGenerationRun>> {
    try {
      const result = unwrapSdkResult(
        await getApiAdminDocumentGenerationRuns({ query: { Page: page, PageSize: pageSize } }),
      );
      return {
        items: (result.items ?? []).map(toDocumentGenerationRun),
        page: result.page,
        pageSize: result.pageSize,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      };
    } catch (e) {
      this.apiFail.report('โหลดประวัติการรันสร้างเอกสารอัตโนมัติ', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 1 };
    }
  }

  /**
   * Protected document files (`Documents.FileStorageKey` / `DocumentMainFiles.StorageKey`) 404
   * on a direct `<a href>` link in production — the browser navigates without the JWT the
   * `CanReadAsync` check needs, so `EfStorageAccessPolicy` sees an anonymous request and denies
   * it. This calls the authenticated presigned-URL endpoint instead (same pattern as
   * `LibraryService.download`): the auth check happens on the API call, which carries the
   * Bearer token via the interceptor, and the resulting URL is presigned so opening it
   * afterwards needs no auth header at all.
   */
  async getFileDownloadUrl(key: string, inline: boolean = false): Promise<string | null> {
    try {
      const result = await getApiFilesPresignedByKey({
        path: { key },
        query: inline ? { inline } : undefined,
      });
      const data = unwrapSdkResult(result) as { url?: string } | undefined;
      return data?.url ?? null;
    } catch (e) {
      this.apiFail.report('ขอลิงก์ดาวน์โหลดไฟล์', e);
      return null;
    }
  }

  // ========== Announcement admin (announcement-popup v1) ==========
  // docs/contracts/announcement-popup.md §3-4. Wired to the generated SDK after backend gate 1
  // passed and `npm run generate:api` was re-run against the live backend — same pattern as
  // `listSubcategories`/`createSubcategory`/`updateSubcategory`/`deleteSubcategory` above (errors
  // propagate uncaught; `announcements-admin.page.ts` owns the reporting via its own toasts).

  async listAnnouncements(): Promise<AnnouncementAdmin[]> {
    const result = await getApiAdminAnnouncements();
    const data = unwrapSdkResult(result);
    return (data ?? []).map(mapAnnouncementAdmin);
  }

  async getAnnouncement(id: string): Promise<AnnouncementAdmin | null> {
    const result = await getApiAdminAnnouncementsById({ path: { id } });
    const data = unwrapSdkResult(result);
    return data ? mapAnnouncementAdmin(data) : null;
  }

  async createAnnouncement(request: AnnouncementRequest): Promise<AnnouncementAdmin | null> {
    const result = await postApiAdminAnnouncements({ body: request });
    const data = unwrapSdkResult(result);
    return data ? mapAnnouncementAdmin(data) : null;
  }

  async updateAnnouncement(
    id: string,
    request: AnnouncementRequest,
  ): Promise<AnnouncementAdmin | null> {
    const result = await putApiAdminAnnouncementsById({ path: { id }, body: request });
    const data = unwrapSdkResult(result);
    return data ? mapAnnouncementAdmin(data) : null;
  }

  async deleteAnnouncement(id: string): Promise<void> {
    const result = await deleteApiAdminAnnouncementsById({ path: { id } });
    if (result.error !== undefined) throw result.error;
  }

  // ====== Admin User Management (admin-user-management v1 §3, §4.5) ======

  /**
   * §3.1 `GET /api/admin/users`. Swallows the failure like {@link searchSellers} — the table is a
   * read-only view, so an empty page plus the `ApiFailureReporter` toast is the whole story.
   */
  async searchUsers(query: AdminUsersQuery): Promise<PagedResult<AdminUserRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    try {
      const result = unwrapSdkResult(
        await getApiAdminUsers({
          query: {
            Page: page,
            PageSize: pageSize,
            Q: query.q || undefined,
            Role: query.role || undefined,
            Status: query.status || undefined,
            JoinedFrom: query.joinedFrom || undefined,
            JoinedTo: query.joinedTo || undefined,
            Sort: query.sort ? ADMIN_USERS_SORT_TO_API[query.sort] : undefined,
          },
        }),
      );
      return {
        items: (result.items ?? []).map(toAdminUserRow),
        page: result.page ?? page,
        pageSize: result.pageSize ?? pageSize,
        totalCount: result.totalCount ?? 0,
        totalPages: result.totalPages ?? 0,
      };
    } catch (e) {
      this.apiFail.report('ค้นหาผู้ใช้', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 0 };
    }
  }

  /**
   * §3.2 `GET /api/admin/users/{userId}`. Rethrows after reporting (§4.5) so the page can show the
   * server's own Thai sentence with `apiFail.formatDetail(e)` — the same applies to the three
   * moderation commands below, whose 403/409 messages are the point of the interaction.
   */
  async getUser(userId: string): Promise<AdminUserDetail> {
    try {
      const result = await getApiAdminUsersByUserId({ path: { userId } });
      return toAdminUserDetail(unwrapSdkResult(result));
    } catch (e) {
      this.apiFail.report('โหลดข้อมูลผู้ใช้', e);
      throw e;
    }
  }

  /** §3.3 `POST /api/admin/users/{userId}/suspend` — answers with the detail that replaces state. */
  async suspendUser(userId: string, body: SuspendUserRequest): Promise<AdminUserDetail> {
    try {
      const result = await postApiAdminUsersByUserIdSuspend({ path: { userId }, body });
      return toAdminUserDetail(unwrapSdkResult(result));
    } catch (e) {
      this.apiFail.report('ระงับบัญชีผู้ใช้', e);
      throw e;
    }
  }

  /** §3.4 `POST /api/admin/users/{userId}/ban`. */
  async banUser(userId: string, body: BanUserRequest): Promise<AdminUserDetail> {
    try {
      const result = await postApiAdminUsersByUserIdBan({ path: { userId }, body });
      return toAdminUserDetail(unwrapSdkResult(result));
    } catch (e) {
      this.apiFail.report('แบนบัญชีผู้ใช้', e);
      throw e;
    }
  }

  /** §3.5 `POST /api/admin/users/{userId}/reinstate`. */
  async reinstateUser(userId: string, body: ReinstateUserRequest): Promise<AdminUserDetail> {
    try {
      const result = await postApiAdminUsersByUserIdReinstate({ path: { userId }, body });
      return toAdminUserDetail(unwrapSdkResult(result));
    } catch (e) {
      this.apiFail.report('ปลดระงับบัญชีผู้ใช้', e);
      throw e;
    }
  }

  /** referral-program v2 §3.10/§4.1: `GET /api/admin/affiliates` — paged affiliate summaries. */
  async getAffiliates(
    page = 1,
    pageSize = 10,
  ): Promise<PagedResponse<AdminAffiliateSummary>> {
    try {
      const result = await getApiAdminAffiliates({ query: { Page: page, PageSize: pageSize } });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapAdminAffiliateSummary),
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 0,
      };
    } catch (e) {
      this.apiFail.report('โหลดรายการลิงก์พันธมิตร', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 0 };
    }
  }

  /**
   * referral-program v2 §3.10/§4.1 (+ v3 §1.6/§4.2): `PUT /api/admin/affiliates/{userId}/settings`
   * — toggle `isActive` and/or set a per-affiliate commission-rate override (`null` clears it
   * back to the global rate). An omitted/`null` `commissionRatePercentOverride` on the wire
   * always means "clear" (§3.10) — callers that don't intend to change it (e.g. the table's
   * quick `isActive` toggle) must echo back the row's current
   * `AdminAffiliateSummary.commissionRatePercentOverride` value themselves (see
   * `affiliates.page.ts::toggleActive`).
   */
  async updateAffiliateSettings(
    userId: string,
    input: { isActive?: boolean; commissionRatePercentOverride?: number | null },
  ): Promise<boolean> {
    try {
      const result = await putApiAdminAffiliatesByUserIdSettings({
        path: { userId },
        body: {
          isActive: input.isActive ?? true,
          commissionRatePercentOverride: input.commissionRatePercentOverride ?? null,
        },
      });
      unwrapSdkResult(result);
      return true;
    } catch (e) {
      this.apiFail.report('บันทึกการตั้งค่าลิงก์พันธมิตร', e);
      return false;
    }
  }

  /** buyer-wallet v1 §3.8: GET /api/admin/users/{userId}/wallet */
  async getUserWallet(userId: string): Promise<AdminWalletSummary | null> {
    try {
      const result = await getApiAdminUsersByUserIdWallet({ path: { userId } });
      const data = unwrapSdkResult(result);
      return mapAdminWalletSummary(data);
    } catch (e) {
      this.apiFail.report('โหลดข้อมูลกระเป๋าเงินผู้ใช้', e);
      return null;
    }
  }

  /** buyer-wallet v1 §3.9: GET /api/admin/users/{userId}/wallet/entries */
  async getUserWalletEntries(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PagedResponse<WalletEntry>> {
    try {
      const result = await getApiAdminUsersByUserIdWalletEntries({
        path: { userId },
        query: { Page: page, PageSize: pageSize },
      });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapWalletEntry),
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 0,
      };
    } catch (e) {
      this.apiFail.report('โหลดประวัติกระเป๋าเงินผู้ใช้', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 0 };
    }
  }

  /**
   * ml-embedding-recommendations v1 §3.2/§4.2: `GET /api/admin/ml/recommendations/overview` —
   * read-only monitoring card, no query params, no auto-create/action.
   */
  async getMlRecommendationOverview(): Promise<AdminMlRecommendationOverview | null> {
    try {
      const result = await getApiAdminMlRecommendationsOverview();
      const data = unwrapSdkResult(result);
      return mapAdminMlRecommendationOverview(data);
    } catch (e) {
      this.apiFail.report('โหลดสถานะระบบแนะนำสินค้า', e);
      return null;
    }
  }
}
