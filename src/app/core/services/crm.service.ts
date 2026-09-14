import { Injectable, inject, signal } from '@angular/core';
import type {
  AdminDemandGap,
  AdminRecommendationTrace,
  AdminTraceCandidate,
  AdminTraceFacet,
  AdminTraceMatch,
  CrmDocumentAlertDocument,
  CrmDocumentAlertOverview,
  CrmFacetType,
  CrmInterest,
  CrmLabeledValue,
  CrmOverview,
  CrmSegment,
  CrmSegmentKind,
  CrmSegmentSummary,
  CrmSearchTermSummary,
  CrmFacetSummary,
  CrmSegmentUser,
  CrmSignalCounts,
  CrmUserDetail,
  CrmUserFacet,
  MyCrmProfile,
} from '../models';
import {
  deleteApiMeCrm,
  getApiAdminCrmDemandGaps,
  getApiAdminCrmDocumentAlerts,
  getApiAdminCrmOverview,
  getApiAdminCrmSegmentsByCodeUsers,
  getApiAdminCrmUsersByUserId,
  getApiAdminCrmUsersByUserIdRecommendationTrace,
  getApiMeCrm,
  putApiMeCrmTracking,
} from '../api';
import type {
  AdminCrmDocumentAlertDocumentResponse,
  AdminCrmDocumentAlertOverviewResponse,
  AdminCrmFacetResponse,
  AdminCrmFacetSummaryResponse,
  AdminCrmLabeledValueResponse,
  AdminCrmOverviewResponse,
  AdminCrmSearchTermResponse,
  AdminCrmSegmentResponse,
  AdminCrmSegmentSummaryResponse,
  AdminCrmSegmentUserResponse,
  AdminCrmUserDetailResponse,
  AdminDemandGapResponse,
  AdminRecommendationTraceResponse,
  AdminTraceCandidateResponse,
  AdminTraceFacetResponse,
  AdminTraceMatchResponse,
  MyCrmInterestResponse,
  MyCrmProfileResponse,
  MyCrmSegmentResponse,
  MyCrmSignalCountsResponse,
} from '../api/types.gen';
import { unwrapSdkResult } from './api-result';
import { toRecommendationStrategy } from './catalog.service';
import { createServerPager, type ServerPager } from './server-pager';

// ====== crm-core v1 §3 response mappers ======
// Every field on the generated DTOs below is required per the contract (§3.1-§3.6), so mappers
// mostly pass values straight through; `?? []` on arrays and the enum-string casts below are
// defensive in the same spirit as `AdminService`'s mappers (`toAdminUserRow` etc.) rather than a
// sign the backend is expected to omit anything.

function toCrmInterest(res: MyCrmInterestResponse): CrmInterest {
  return {
    facetType: res.facetType as CrmFacetType,
    value: res.value,
    label: res.label,
    score: res.score,
    reason: res.reason,
  };
}

function toCrmSegment(res: MyCrmSegmentResponse): CrmSegment {
  return {
    code: res.code,
    label: res.label,
    kind: res.kind as CrmSegmentKind,
    reason: res.reason,
  };
}

/** §3.6 `AdminCrmSegmentResponse` carries `assignedAt` too — {@link CrmSegment} doesn't, so this drops it. */
function toAdminCrmSegment(res: AdminCrmSegmentResponse): CrmSegment {
  return {
    code: res.code,
    label: res.label,
    kind: res.kind as CrmSegmentKind,
    reason: res.reason,
  };
}

function toCrmSignalCounts(res: MyCrmSignalCountsResponse): CrmSignalCounts {
  return {
    documentViews: res.documentViews,
    searches: res.searches,
    purchases: res.purchases,
    subscriptionAccesses: res.subscriptionAccesses,
    wishlistItems: res.wishlistItems,
    cartItems: res.cartItems,
    sellerFollows: res.sellerFollows,
    reviews: res.reviews,
    declaredInterests: res.declaredInterests,
  };
}

/** §3.1/§3.2 `MyCrmProfileResponse` — body of both `GET /api/me/crm` and `PUT /api/me/crm/tracking`. */
function toMyCrmProfile(res: MyCrmProfileResponse): MyCrmProfile {
  return {
    trackingEnabled: res.trackingEnabled,
    computedAt: res.computedAt,
    interestConfidence: res.interestConfidence,
    topInterests: (res.topInterests ?? []).map(toCrmInterest),
    segments: (res.segments ?? []).map(toCrmSegment),
    signalCounts: toCrmSignalCounts(res.signalCounts),
    dataRetentionDays: res.dataRetentionDays,
  };
}

function toCrmSegmentSummary(res: AdminCrmSegmentSummaryResponse): CrmSegmentSummary {
  return {
    code: res.code,
    label: res.label,
    kind: res.kind as CrmSegmentKind,
    description: res.description,
    userCount: res.userCount,
  };
}

function toCrmSearchTermSummary(res: AdminCrmSearchTermResponse): CrmSearchTermSummary {
  return {
    term: res.term,
    searchCount: res.searchCount,
    zeroResultCount: res.zeroResultCount,
    userCount: res.userCount,
  };
}

function toCrmFacetSummary(res: AdminCrmFacetSummaryResponse): CrmFacetSummary {
  return {
    facetType: res.facetType as CrmFacetType,
    value: res.value,
    label: res.label,
    userCount: res.userCount,
    averageScore: res.averageScore,
  };
}

/** §3.4 `AdminCrmOverviewResponse` — `GET /api/admin/crm/overview`. */
function toCrmOverview(res: AdminCrmOverviewResponse): CrmOverview {
  return {
    profileCount: res.profileCount,
    computedProfileCount: res.computedProfileCount,
    trackingOptOutCount: res.trackingOptOutCount,
    lastComputedAt: res.lastComputedAt,
    averageConfidence: res.averageConfidence,
    signalRowCount: res.signalRowCount,
    segments: (res.segments ?? []).map(toCrmSegmentSummary),
    topSearchTerms: (res.topSearchTerms ?? []).map(toCrmSearchTermSummary),
    topFacets: (res.topFacets ?? []).map(toCrmFacetSummary),
  };
}

/** §3.5 `AdminCrmSegmentUserResponse` — one row of `GET /api/admin/crm/segments/{code}/users`. */
function toCrmSegmentUser(res: AdminCrmSegmentUserResponse): CrmSegmentUser {
  return {
    userId: res.userId,
    displayName: res.displayName,
    email: res.email,
    interestConfidence: res.interestConfidence,
    topCategoryLabel: res.topCategoryLabel,
    lastActivityAt: res.lastActivityAt,
    assignedAt: res.assignedAt,
  };
}

function toCrmLabeledValue(res: AdminCrmLabeledValueResponse): CrmLabeledValue {
  return { value: res.value, label: res.label };
}

function toCrmUserFacet(res: AdminCrmFacetResponse): CrmUserFacet {
  return {
    facetType: res.facetType as CrmFacetType,
    value: res.value,
    label: res.label,
    score: res.score,
    normalizedScore: res.normalizedScore,
    signalCount: res.signalCount,
    topSignal: res.topSignal,
    isDeclared: res.isDeclared,
    lastSignalAt: res.lastSignalAt,
  };
}

/** §3.6 `AdminCrmUserDetailResponse` — `GET /api/admin/crm/users/{userId}`, feeds `CrmUserPanelComponent`. */
function toCrmUserDetail(res: AdminCrmUserDetailResponse): CrmUserDetail {
  return {
    userId: res.userId,
    displayName: res.displayName,
    email: res.email,
    trackingEnabled: res.trackingEnabled,
    computedAt: res.computedAt,
    interestConfidence: res.interestConfidence,
    engagementScore: res.engagementScore,
    signalCount: res.signalCount,
    lastActivityAt: res.lastActivityAt,
    lastPurchaseAt: res.lastPurchaseAt,
    purchaseCount: res.purchaseCount,
    declaredCategories: (res.declaredCategories ?? []).map(toCrmLabeledValue),
    facets: (res.facets ?? []).map(toCrmUserFacet),
    segments: (res.segments ?? []).map(toAdminCrmSegment),
    signalBreakdown: toCrmSignalCounts(res.signalBreakdown),
  };
}

// ====== crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.4/§3.5 mappers ======

/** §3.4 `AdminDemandGapResponse` — one row of `GET /api/admin/crm/demand-gaps`. */
function toAdminDemandGap(res: AdminDemandGapResponse): AdminDemandGap {
  return {
    term: res.term ?? '',
    searchCount: res.searchCount ?? 0,
    zeroResultCount: res.zeroResultCount ?? 0,
    zeroResultRate: res.zeroResultRate ?? 0,
    userCount: res.userCount ?? 0,
    lastSeenDate: res.lastSeenDate ?? '',
    matchedFacetLabel: res.matchedFacetLabel ?? null,
  };
}

/** §3.5 `AdminTraceFacetResponse` — one facet of `AdminRecommendationTraceResponse.userFacets`. */
function toAdminTraceFacet(res: AdminTraceFacetResponse): AdminTraceFacet {
  return {
    facetType: res.facetType ?? '',
    facetValue: res.facetValue ?? '',
    facetLabel: res.facetLabel ?? '',
    normalizedScore: res.normalizedScore ?? 0,
    topSignal: res.topSignal ?? '',
    signalCount: res.signalCount ?? 0,
    isDeclared: res.isDeclared ?? false,
  };
}

/** §3.5 `AdminTraceMatchResponse` — one facet's contribution to a candidate's `rawScore`. */
function toAdminTraceMatch(res: AdminTraceMatchResponse): AdminTraceMatch {
  return {
    facetType: res.facetType ?? '',
    facetValue: res.facetValue ?? '',
    facetLabel: res.facetLabel ?? '',
    userScore: res.userScore ?? 0,
    weight: res.weight ?? 0,
    contribution: res.contribution ?? 0,
  };
}

/** §3.5 `AdminTraceCandidateResponse` — one candidate document of `AdminRecommendationTraceResponse.candidates`. */
function toAdminTraceCandidate(res: AdminTraceCandidateResponse): AdminTraceCandidate {
  return {
    documentId: res.documentId ?? '',
    title: res.title ?? '',
    relevanceScore: res.relevanceScore ?? 0,
    rawScore: res.rawScore ?? 0,
    passed: res.passed ?? false,
    excludedReason: res.excludedReason ?? null,
    matchedFacets: (res.matchedFacets ?? []).map(toAdminTraceMatch),
  };
}

/** §3.5 `AdminRecommendationTraceResponse` — `GET /api/admin/crm/users/{userId}/recommendation-trace`. */
function toAdminRecommendationTrace(res: AdminRecommendationTraceResponse): AdminRecommendationTrace {
  return {
    userId: res.userId ?? '',
    displayName: res.displayName ?? '',
    trackingEnabled: res.trackingEnabled ?? false,
    computedAt: res.computedAt ?? null,
    interestConfidence: res.interestConfidence ?? 0,
    minConfidence: res.minConfidence ?? 0,
    topFacetScore: res.topFacetScore ?? 0,
    minTopFacetScore: res.minTopFacetScore ?? 0,
    profileAgeDays: res.profileAgeDays ?? null,
    gatePassed: res.gatePassed ?? false,
    gateFailReason: res.gateFailReason ?? null,
    strategy: toRecommendationStrategy(res.strategy),
    strategyReason: res.strategyReason ?? '',
    candidateCount: res.candidateCount ?? 0,
    qualifiedCount: res.qualifiedCount ?? 0,
    minQualifiedItems: res.minQualifiedItems ?? 0,
    userFacets: (res.userFacets ?? []).map(toAdminTraceFacet),
    candidates: (res.candidates ?? []).map(toAdminTraceCandidate),
  };
}

// ====== crm-targeted-document-alerts v2 (docs/contracts/crm-targeted-document-alerts.md) §3.3 mapper ======

/** §3.3 `AdminCrmDocumentAlertDocumentResponse` — one row of the document-alerts admin table. */
function toCrmDocumentAlertDocument(res: AdminCrmDocumentAlertDocumentResponse): CrmDocumentAlertDocument {
  return {
    documentId: res.documentId,
    documentTitle: res.documentTitle,
    studioName: res.studioName,
    queuedAt: res.queuedAt,
    matchedCount: res.matchedCount,
    sentCount: res.sentCount,
    averageMatchScore: res.averageMatchScore,
  };
}

/** §3.3 `AdminCrmDocumentAlertOverviewResponse` — `GET /api/admin/crm/document-alerts`. */
function toCrmDocumentAlertOverview(res: AdminCrmDocumentAlertOverviewResponse): CrmDocumentAlertOverview {
  return {
    days: res.days,
    pendingCount: res.pendingCount,
    sentCount: res.sentCount,
    suppressedCount: res.suppressedCount,
    digestCount: res.digestCount,
    recipientCount: res.recipientCount,
    documentCount: res.documentCount,
    averageMatchScore: res.averageMatchScore,
    lastQueuedAt: res.lastQueuedAt,
    lastSentAt: res.lastSentAt,
    documents: (res.documents ?? []).map(toCrmDocumentAlertDocument),
  };
}

/**
 * crm-core v1 (`docs/contracts/crm-core.md`) §3, §4.2 — buyer privacy self-service
 * (`/account/privacy`, §3.1–§3.3) and admin CRM inspection (`/admin/crm/**`, §3.4–§3.6).
 *
 * **Round 2 (crm-core-fe-wire)**: wired to the generated SDK after backend gate 1 passed and
 * `npm run generate:api` was re-run against the live backend — same pattern as `AdminService`'s
 * F-08 stub round did for `searchUsers`/`getUser`/`suspendUser`/etc.
 *
 * Pages call these directly and report failures themselves via `ApiFailureReporter` (same
 * pattern as `AdminSubscriptionsPage.reload()` / `AdminFeedbackPage.reload()`) rather than the
 * service swallowing errors internally — there is nothing useful to fall back to here, so a
 * silent empty state would look like "the user really has no data" instead of "not wired yet".
 * That is why none of the methods below call `ApiFailureReporter` themselves: they only unwrap
 * and rethrow, letting the caller decide how to report.
 */
@Injectable({ providedIn: 'root' })
export class CrmService {
  // ====== Buyer: §3.1–§3.3 ======

  private readonly _myProfile = signal<MyCrmProfile | null>(null);
  private readonly _loadingMine = signal(false);

  readonly myProfile = this._myProfile.asReadonly();
  readonly loadingMine = this._loadingMine.asReadonly();

  /** §3.1 `GET /api/me/crm` — never 404s (AC-11); a caller with no profile yet still gets a 200. */
  async loadMine(): Promise<void> {
    this._loadingMine.set(true);
    try {
      const profile = toMyCrmProfile(unwrapSdkResult(await getApiMeCrm()));
      this._myProfile.set(profile);
    } finally {
      this._loadingMine.set(false);
    }
  }

  /** §3.2 `PUT /api/me/crm/tracking` — idempotent; `enabled=false` also purges existing data server-side. */
  async setTracking(enabled: boolean): Promise<void> {
    const profile = toMyCrmProfile(
      unwrapSdkResult(await putApiMeCrmTracking({ body: { enabled } })),
    );
    this._myProfile.set(profile);
  }

  /** §3.3 `DELETE /api/me/crm` — idempotent 204; does not touch `trackingEnabled` (§3.3 note). */
  async deleteMyData(): Promise<void> {
    const result = await deleteApiMeCrm();
    if (result.error !== undefined) throw result.error;
    // §3.3: deleting purges facets/segments/signals but leaves `trackingEnabled` untouched —
    // reload from the server rather than guessing the reset shape locally.
    await this.loadMine();
  }

  /** Test helper — mirrors `NotificationConfigService.setItemsForTest`. */
  setMyProfileForTest(profile: MyCrmProfile | null): void {
    this._myProfile.set(profile);
  }

  // ====== Admin: §3.4–§3.6 ======

  private readonly _adminOverview = signal<CrmOverview | null>(null);
  private readonly _loadingOverview = signal(false);

  readonly adminOverview = this._adminOverview.asReadonly();
  readonly loadingOverview = this._loadingOverview.asReadonly();

  /** §3.4 `GET /api/admin/crm/overview`. */
  async loadOverview(): Promise<void> {
    this._loadingOverview.set(true);
    try {
      const overview = toCrmOverview(unwrapSdkResult(await getApiAdminCrmOverview()));
      this._adminOverview.set(overview);
    } finally {
      this._loadingOverview.set(false);
    }
  }

  /** Test helper — mirrors `NotificationConfigService.setItemsForTest`. */
  setAdminOverviewForTest(overview: CrmOverview | null): void {
    this._adminOverview.set(overview);
  }

  /**
   * §3.5 `GET /api/admin/crm/segments/{code}/users` — same `ServerPager` shape
   * `SubscriptionService.accessHistoryPagerInstance` already uses (service holds the pager,
   * page reads its signals + calls the 3 proxy methods below).
   */
  private readonly segmentUsersPagerInstance: ServerPager<CrmSegmentUser, string> =
    createServerPager<CrmSegmentUser, string>({
      pageSize: 20,
      errorMessage: 'โหลดสมาชิกของ segment ไม่สำเร็จ',
      fetch: async (page, pageSize, code) => {
        const data = unwrapSdkResult(
          await getApiAdminCrmSegmentsByCodeUsers({
            path: { code: code ?? '' },
            query: { Page: page, PageSize: pageSize },
          }),
        );
        return {
          items: (data.items ?? []).map(toCrmSegmentUser),
          page: data.page ?? page,
          pageSize: data.pageSize ?? pageSize,
          totalCount: data.totalCount ?? 0,
          totalPages: data.totalPages ?? 1,
        };
      },
    });

  readonly segmentUsers = this.segmentUsersPagerInstance.items;
  readonly segmentUsersPage = this.segmentUsersPagerInstance.page;
  readonly segmentUsersPageSize = this.segmentUsersPagerInstance.pageSize;
  readonly segmentUsersTotalCount = this.segmentUsersPagerInstance.totalCount;
  readonly segmentUsersTotalPages = this.segmentUsersPagerInstance.totalPages;
  readonly segmentUsersLoading = this.segmentUsersPagerInstance.loading;

  async loadSegmentUsers(code: string): Promise<void> {
    await this.segmentUsersPagerInstance.reloadFromPage1(code);
  }

  async onSegmentUsersPageChange(page: number): Promise<void> {
    await this.segmentUsersPagerInstance.onPageChange(page);
  }

  async onSegmentUsersPageSizeChange(size: number): Promise<void> {
    await this.segmentUsersPagerInstance.onPageSizeChange(size);
  }

  private readonly _userDetail = signal<CrmUserDetail | null>(null);
  private readonly _loadingUserDetail = signal(false);

  readonly userDetail = this._userDetail.asReadonly();
  readonly loadingUserDetail = this._loadingUserDetail.asReadonly();

  /** §3.6 `GET /api/admin/crm/users/{userId}` — feeds `CrmUserPanelComponent`. */
  async loadUserDetail(userId: string): Promise<void> {
    this._loadingUserDetail.set(true);
    try {
      const detail = toCrmUserDetail(
        unwrapSdkResult(await getApiAdminCrmUsersByUserId({ path: { userId } })),
      );
      this._userDetail.set(detail);
    } finally {
      this._loadingUserDetail.set(false);
    }
  }

  /** Test helper — mirrors `NotificationConfigService.setItemsForTest`. */
  setUserDetailForTest(detail: CrmUserDetail | null): void {
    this._userDetail.set(detail);
  }

  // ====== Admin: crm-driven-discovery v1 §3.4/§3.5 (F-10, ข้อ 13/16) ======
  //
  // Round 2 (crm-driven-discovery-fe-wire): wired to the generated SDK after backend gate 1
  // passed and `npm run generate:api` was re-run against the live backend — same
  // "unwrap+rethrow, caller reports via `ApiFailureReporter`" convention `loadUserDetail` above
  // already uses.

  /**
   * §3.4 `GET /api/admin/crm/demand-gaps` — "คำค้นที่หาแล้วไม่เจอ (30 วันล่าสุด)" table on
   * `/admin/crm`. Same `ServerPager` shape `segmentUsersPagerInstance` above already uses.
   */
  private readonly demandGapsPagerInstance: ServerPager<AdminDemandGap> =
    createServerPager<AdminDemandGap>({
      pageSize: 20,
      errorMessage: 'โหลดคำค้นที่หาแล้วไม่เจอไม่สำเร็จ',
      fetch: async (page, pageSize) => {
        const data = unwrapSdkResult(
          await getApiAdminCrmDemandGaps({ query: { Page: page, PageSize: pageSize } }),
        );
        return {
          items: (data.items ?? []).map(toAdminDemandGap),
          page: data.page ?? page,
          pageSize: data.pageSize ?? pageSize,
          totalCount: data.totalCount ?? 0,
          totalPages: data.totalPages ?? 1,
        };
      },
    });

  readonly demandGaps = this.demandGapsPagerInstance.items;
  readonly demandGapsPage = this.demandGapsPagerInstance.page;
  readonly demandGapsPageSize = this.demandGapsPagerInstance.pageSize;
  readonly demandGapsTotalCount = this.demandGapsPagerInstance.totalCount;
  readonly demandGapsTotalPages = this.demandGapsPagerInstance.totalPages;
  readonly demandGapsLoading = this.demandGapsPagerInstance.loading;

  async loadDemandGaps(): Promise<void> {
    await this.demandGapsPagerInstance.reloadFromPage1();
  }

  async onDemandGapsPageChange(page: number): Promise<void> {
    await this.demandGapsPagerInstance.onPageChange(page);
  }

  async onDemandGapsPageSizeChange(size: number): Promise<void> {
    await this.demandGapsPagerInstance.onPageSizeChange(size);
  }

  private readonly _recommendationTrace = signal<AdminRecommendationTrace | null>(null);
  private readonly _loadingRecommendationTrace = signal(false);

  readonly recommendationTrace = this._recommendationTrace.asReadonly();
  readonly loadingRecommendationTrace = this._loadingRecommendationTrace.asReadonly();

  /**
   * §3.5 `GET /api/admin/crm/users/{userId}/recommendation-trace` — feeds
   * `RecommendationTracePanelComponent`. `404` (unknown user id) propagates to the caller as-is,
   * same as every other admin lookup in this service.
   */
  async loadRecommendationTrace(userId: string, take = 8): Promise<void> {
    this._loadingRecommendationTrace.set(true);
    try {
      const trace = toAdminRecommendationTrace(
        unwrapSdkResult(
          await getApiAdminCrmUsersByUserIdRecommendationTrace({ path: { userId }, query: { take } }),
        ),
      );
      this._recommendationTrace.set(trace);
    } finally {
      this._loadingRecommendationTrace.set(false);
    }
  }

  /** Test helper — mirrors `setUserDetailForTest`. */
  setRecommendationTraceForTest(trace: AdminRecommendationTrace | null): void {
    this._recommendationTrace.set(trace);
  }

  // ====== Admin: crm-targeted-document-alerts v2 §3.3 (F-12, ข้อ 11) ======

  private readonly _documentAlerts = signal<CrmDocumentAlertOverview | null>(null);
  private readonly _loadingDocumentAlerts = signal(false);

  readonly documentAlerts = this._documentAlerts.asReadonly();
  readonly loadingDocumentAlerts = this._loadingDocumentAlerts.asReadonly();

  /** §3.3 `GET /api/admin/crm/document-alerts` — `days` is clamped server-side to `[1, 30]`. */
  async loadDocumentAlerts(days: number): Promise<void> {
    this._loadingDocumentAlerts.set(true);
    try {
      const overview = toCrmDocumentAlertOverview(
        unwrapSdkResult(await getApiAdminCrmDocumentAlerts({ query: { days } })),
      );
      this._documentAlerts.set(overview);
    } finally {
      this._loadingDocumentAlerts.set(false);
    }
  }

  /** Test helper — mirrors `setUserDetailForTest`. */
  setDocumentAlertsForTest(overview: CrmDocumentAlertOverview | null): void {
    this._documentAlerts.set(overview);
  }
}
