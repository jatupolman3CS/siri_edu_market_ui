// ============================================================
// crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.1–§3.5 — domain models
// ============================================================
//
// Round 1 (crm-driven-discovery-fe-1/fe-2/fe-3): these mirror the response DTOs field-for-field so
// `DiscoveryService`/`CrmService`'s stub signatures already match what the regenerated SDK will
// emit once backend/integrator-qa update `openapi.snapshot.json` (round 2 — wire SDK).
// Do not add fields the spec doesn't define.

import type { CrmFacetType } from './crm.model';
import type { DocumentItem } from './index';

/**
 * §3.3 `RecommendedDocumentsResponse.strategy` — widened from the 2-value union
 * `personalized-recommendations v1 §3.1` defined to the 4 values this contract supersedes it
 * with (§3.3 "ประกาศ supersede"). `RecommendationStrategy` stays a plain string at the OpenAPI
 * level (`RecommendationStrategy` backend-side is a `static class`, not an enum — §0 ข้อ 2).
 */
export type RecommendationStrategy =
  | 'crm-personalized'
  | 'purchase-history'
  | 'declared-interest'
  | 'popular-fallback';

/** §3.1/§3.2 `PopularSearchTermResponse` — one ranked term, shared by `/popular-searches` and `/discovery`. */
export interface PopularSearchTerm {
  term: string;
  rank: number;
  isRising: boolean;
}

/** §3.1 `PopularSearchesResponse` — `GET /api/marketplace/popular-searches`. */
export interface PopularSearchesResult {
  items: PopularSearchTerm[];
  personalized: boolean;
  windowDays: number;
  generatedAt: string;
}

/**
 * §3.2 `DiscoverySectionResponse` — one rail of `DiscoveryResponse.sections`. `facetType` /
 * `facetValue` / `facetLabel` are `null` together for fallback rows that aren't tied to a facet
 * (§3.2 table).
 */
export interface DiscoverySection {
  key: string;
  title: string;
  reason: string;
  facetType: 'category' | 'subcategory' | 'gradeLevel' | null;
  facetValue: string | null;
  facetLabel: string | null;
  items: DocumentItem[];
}

/** §3.2 `DiscoveryResponse` — `GET /api/marketplace/discovery`. */
export interface DiscoveryBlock {
  strategy: RecommendationStrategy;
  strategyReason: string;
  gatePassed: boolean;
  sections: DiscoverySection[];
  popularTerms: PopularSearchTerm[];
  generatedAt: string;
}

/**
 * §3.3 `RecommendationExplanationResponse` — one item's reason on `GET /api/marketplace/recommended`
 * (parallel array to `items`, joined client-side on `documentId` — see §3.3's "ทำไมถึงใช้ parallel
 * array" note. `matchedFacetType` reuses {@link CrmFacetType} — same literal set).
 */
export interface RecommendationExplanation {
  documentId: string;
  reason: string;
  relevanceScore: number;
  matchedFacetType: CrmFacetType | null;
  matchedFacetValue: string | null;
  matchedFacetLabel: string | null;
}

/** §3.4 `AdminDemandGapResponse` — one row of `GET /api/admin/crm/demand-gaps`. */
export interface AdminDemandGap {
  term: string;
  searchCount: number;
  zeroResultCount: number;
  zeroResultRate: number;
  userCount: number;
  lastSeenDate: string;
  matchedFacetLabel: string | null;
}

/** §3.5 `AdminTraceFacetResponse` — one facet of `AdminRecommendationTraceResponse.userFacets`. */
export interface AdminTraceFacet {
  facetType: string;
  facetValue: string;
  facetLabel: string;
  normalizedScore: number;
  /** camelCase of `CrmContributionType` (same convention as `CrmUserFacet.topSignal`). */
  topSignal: string;
  signalCount: number;
  isDeclared: boolean;
}

/** §3.5 `AdminTraceMatchResponse` — one facet's contribution to a candidate's `rawScore`. */
export interface AdminTraceMatch {
  facetType: string;
  facetValue: string;
  facetLabel: string;
  userScore: number;
  weight: number;
  contribution: number;
}

/** §3.5 `AdminTraceCandidateResponse` — one candidate document of `AdminRecommendationTraceResponse.candidates`. */
export interface AdminTraceCandidate {
  documentId: string;
  title: string;
  relevanceScore: number;
  rawScore: number;
  passed: boolean;
  excludedReason: string | null;
  matchedFacets: AdminTraceMatch[];
}

/** §3.5 `AdminRecommendationTraceResponse` — `GET /api/admin/crm/users/{userId}/recommendation-trace`. */
export interface AdminRecommendationTrace {
  userId: string;
  displayName: string;
  trackingEnabled: boolean;
  computedAt: string | null;
  interestConfidence: number;
  minConfidence: number;
  topFacetScore: number;
  minTopFacetScore: number;
  profileAgeDays: number | null;
  gatePassed: boolean;
  gateFailReason: string | null;
  strategy: RecommendationStrategy;
  strategyReason: string;
  candidateCount: number;
  qualifiedCount: number;
  minQualifiedItems: number;
  userFacets: AdminTraceFacet[];
  candidates: AdminTraceCandidate[];
}
