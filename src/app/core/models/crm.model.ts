// ============================================================
// crm-core v1 (docs/contracts/crm-core.md) §3.1–§3.6 — domain models
// ============================================================
//
// Round 1 (crm-core-fe-1/fe-2): these mirror the response DTOs field-for-field so
// `CrmService`'s stub signatures already match what the regenerated SDK will emit once
// backend/integrator-qa update `openapi.snapshot.json` (round 2 — `crm-core-fe-wire`, §6.7).
// Do not add fields the spec doesn't define.

/**
 * §3.4/§3.6 `CrmFacetType` — camelCase per `MyCrmInterestResponse.facetType` /
 * `AdminCrmFacetResponse.facetType`. `/api/me/crm` only ever returns the first 3 (§3.1 — Seller
 * and PriceBand are deliberately withheld from the buyer view); admin endpoints can return all 6.
 */
export type CrmFacetType =
  | 'category'
  | 'subcategory'
  | 'gradeLevel'
  | 'resourceType'
  | 'seller'
  | 'priceBand';

/** §3.4/§3.5 `CrmSegmentKind` — `MyCrmSegmentResponse.kind` / `AdminCrmSegmentSummaryResponse.kind`. */
export type CrmSegmentKind = 'lifecycle' | 'interest';

/** §3.1 `MyCrmInterestResponse` — one interest facet shown to the buyer, always explainable. */
export interface CrmInterest {
  facetType: CrmFacetType;
  value: string;
  label: string;
  score: number;
  reason: string;
}

/** §3.1/§3.6 `MyCrmSegmentResponse` — one segment the profile belongs to, with its Thai reason. */
export interface CrmSegment {
  code: string;
  label: string;
  kind: CrmSegmentKind;
  reason: string;
}

/** §3.1/§3.6 `MyCrmSignalCountsResponse` — counted live on read, not a job snapshot (§3.6). */
export interface CrmSignalCounts {
  documentViews: number;
  searches: number;
  purchases: number;
  subscriptionAccesses: number;
  wishlistItems: number;
  cartItems: number;
  sellerFollows: number;
  reviews: number;
  declaredInterests: number;
}

/** §3.1/§3.2 `MyCrmProfileResponse` — body of `GET /api/me/crm` and `PUT /api/me/crm/tracking`. */
export interface MyCrmProfile {
  trackingEnabled: boolean;
  computedAt: string | null;
  interestConfidence: number;
  topInterests: CrmInterest[];
  segments: CrmSegment[];
  signalCounts: CrmSignalCounts;
  dataRetentionDays: number;
}

/** §3.4 `AdminCrmSegmentSummaryResponse` — one row of the segment table on `/admin/crm`. */
export interface CrmSegmentSummary {
  code: string;
  label: string;
  kind: CrmSegmentKind;
  description: string;
  userCount: number;
}

/** §3.4 `AdminCrmSearchTermResponse` — one row of the top-search-terms table on `/admin/crm`. */
export interface CrmSearchTermSummary {
  term: string;
  searchCount: number;
  zeroResultCount: number;
  userCount: number;
}

/** §3.4 `AdminCrmFacetSummaryResponse` — one row of the top-category-facets table on `/admin/crm`. */
export interface CrmFacetSummary {
  facetType: CrmFacetType;
  value: string;
  label: string;
  userCount: number;
  averageScore: number;
}

/** §3.4 `AdminCrmOverviewResponse` — `GET /api/admin/crm/overview`. */
export interface CrmOverview {
  profileCount: number;
  computedProfileCount: number;
  trackingOptOutCount: number;
  lastComputedAt: string | null;
  averageConfidence: number;
  signalRowCount: number;
  segments: CrmSegmentSummary[];
  topSearchTerms: CrmSearchTermSummary[];
  topFacets: CrmFacetSummary[];
}

/** §3.5 `AdminCrmSegmentUserResponse` — one row of `GET /api/admin/crm/segments/{code}/users`. */
export interface CrmSegmentUser {
  userId: string;
  displayName: string;
  email: string;
  interestConfidence: number;
  topCategoryLabel: string | null;
  lastActivityAt: string | null;
  assignedAt: string;
}

/** §3.6 `AdminCrmLabeledValueResponse` — one declared category on the admin user-detail panel. */
export interface CrmLabeledValue {
  value: string;
  label: string;
}

/**
 * §3.6 `AdminCrmFacetResponse` — richer than {@link CrmInterest}: carries the raw (pre-normalize)
 * score and covers every {@link CrmFacetType}, not just the 3 the buyer view exposes.
 */
export interface CrmUserFacet {
  facetType: CrmFacetType;
  value: string;
  label: string;
  score: number;
  normalizedScore: number;
  signalCount: number;
  /** camelCase of `CrmContributionType` (e.g. `"purchase"`) — keys the §3.4.5 reason templates. */
  topSignal: string;
  isDeclared: boolean;
  lastSignalAt: string | null;
}

/** §3.6 `AdminCrmUserDetailResponse` — `GET /api/admin/crm/users/{userId}`, feeds `CrmUserPanelComponent`. */
export interface CrmUserDetail {
  userId: string;
  displayName: string;
  email: string;
  trackingEnabled: boolean;
  computedAt: string | null;
  interestConfidence: number;
  engagementScore: number;
  signalCount: number;
  lastActivityAt: string | null;
  lastPurchaseAt: string | null;
  purchaseCount: number;
  declaredCategories: CrmLabeledValue[];
  facets: CrmUserFacet[];
  segments: CrmSegment[];
  signalBreakdown: CrmSignalCounts;
}

// ============================================================
// crm-targeted-document-alerts v2 (docs/contracts/crm-targeted-document-alerts.md) §3.3 — admin-only
// document alert queue overview. No seller/buyer surface per §0.5 decision 7 — see §4.
// ============================================================

/**
 * §3.3 `AdminCrmDocumentAlertDocumentResponse` — one row of the "เอกสารล่าสุดที่ถูกดันเข้าหาผู้ที่สนใจ"
 * table. Deliberately carries no recipient-identifying field (AC-22).
 */
export interface CrmDocumentAlertDocument {
  documentId: string;
  documentTitle: string;
  studioName: string;
  queuedAt: string;
  matchedCount: number;
  sentCount: number;
  averageMatchScore: number;
}

/** §3.3 `AdminCrmDocumentAlertOverviewResponse` — `GET /api/admin/crm/document-alerts`. */
export interface CrmDocumentAlertOverview {
  days: number;
  pendingCount: number;
  sentCount: number;
  suppressedCount: number;
  digestCount: number;
  recipientCount: number;
  documentCount: number;
  averageMatchScore: number;
  lastQueuedAt: string | null;
  lastSentAt: string | null;
  documents: CrmDocumentAlertDocument[];
}
