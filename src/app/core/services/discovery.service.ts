import { Injectable, inject, signal } from '@angular/core';
import type { DiscoveryBlock, DiscoverySection, PopularSearchTerm } from '../models';
import { getApiMarketplaceDiscovery, getApiMarketplacePopularSearches } from '../api';
import type { DiscoverySectionResponse, PopularSearchTermResponse } from '../api/types.gen';
import { mapDocument } from '../api-mappers/mappers';
import { toRecommendationStrategy } from './catalog.service';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { idleActionState, loadingActionState, type ActionState } from './action-state';

/** §4.2 "caching ฝั่ง client": เรียกซ้ำไม่เกิน 1 ครั้งต่อ 5 นาที (เหมือน `PlatformStatsService`). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** §3.1/§3.2 `PopularSearchTermResponse` → `PopularSearchTerm` — shared by both endpoints. */
function mapPopularSearchTerm(res: PopularSearchTermResponse): PopularSearchTerm {
  return {
    term: res.term ?? '',
    rank: res.rank ?? 0,
    isRising: res.isRising ?? false,
  };
}

/** §3.2 `DiscoverySectionResponse` → `DiscoverySection` — one rail of `/discovery`. */
function mapDiscoverySection(res: DiscoverySectionResponse): DiscoverySection {
  return {
    key: res.key ?? '',
    title: res.title ?? '',
    reason: res.reason ?? '',
    facetType: (res.facetType as DiscoverySection['facetType']) ?? null,
    facetValue: res.facetValue ?? null,
    facetLabel: res.facetLabel ?? null,
    items: (res.items ?? []).map(mapDocument),
  };
}

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.1/§3.2/§4.2 — popular search
 * terms (ข้อ 13) + the "ยังไม่ได้ค้นหาอะไรเลย" discovery block (ข้อ 14). The 3rd piece of the
 * contract (ข้อ 16 — the `/recommended` relevance gate) stays inside `CatalogService`, which
 * already owns that existing endpoint (§3.3) — this service only ever adds the 2 brand-new ones.
 */
@Injectable({ providedIn: 'root' })
export class DiscoveryService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _popularTerms = signal<PopularSearchTerm[]>([]);
  private readonly _popularPersonalized = signal(false);
  private readonly _popularTermsState = signal<ActionState>(idleActionState());

  private readonly _discovery = signal<DiscoveryBlock | null>(null);
  private readonly _discoveryState = signal<ActionState>(idleActionState());

  readonly popularTerms = this._popularTerms.asReadonly();
  readonly popularPersonalized = this._popularPersonalized.asReadonly();
  readonly popularTermsState = this._popularTermsState.asReadonly();
  readonly discovery = this._discovery.asReadonly();
  readonly discoveryState = this._discoveryState.asReadonly();

  private _popularTermsLastLoadedAt = 0;
  private _discoveryLastLoadedAt = 0;

  /** §3.1 `GET /api/marketplace/popular-searches` — home page "ฮิตตอนนี้:" chips (ข้อ 13). */
  async loadPopularTerms(take = 8): Promise<void> {
    if (this.isFresh(this._popularTermsLastLoadedAt) && this._popularTermsState().status !== 'error') return;
    if (this._popularTermsState().status === 'loading') return;
    this._popularTermsState.set(loadingActionState());
    try {
      // §3.1: `take` is clamped `[1,20]` silently server-side — no `400` for this field, so the
      // client never needs to clamp it before sending.
      const result = await getApiMarketplacePopularSearches({ query: { Take: take } });
      const data = unwrapSdkResult(result);
      this._popularTerms.set((data.items ?? []).map(mapPopularSearchTerm));
      this._popularPersonalized.set(data.personalized ?? false);
      this._popularTermsState.set(idleActionState());
    } catch (e) {
      this._popularTerms.set([]);
      this._popularPersonalized.set(false);
      this._popularTermsState.set(idleActionState());
      this.apiFail.report('errors.context.loadPopularSearches', e);
    } finally {
      this._popularTermsLastLoadedAt = Date.now();
    }
  }

  /** §3.2 `GET /api/marketplace/discovery` — `/marketplace`'s "ยังไม่ได้ค้นหาอะไรเลย" block (ข้อ 14). */
  async loadDiscovery(): Promise<void> {
    if (this.isFresh(this._discoveryLastLoadedAt) && this._discoveryState().status !== 'error') return;
    if (this._discoveryState().status === 'loading') return;
    this._discoveryState.set(loadingActionState());
    try {
      const result = await getApiMarketplaceDiscovery();
      const data = unwrapSdkResult(result);
      this._discovery.set({
        strategy: toRecommendationStrategy(data.strategy),
        strategyReason: data.strategyReason ?? '',
        gatePassed: data.gatePassed ?? false,
        sections: (data.sections ?? []).map(mapDiscoverySection),
        popularTerms: (data.popularTerms ?? []).map(mapPopularSearchTerm),
        generatedAt: data.generatedAt ?? '',
      });
      this._discoveryState.set(idleActionState());
    } catch (e) {
      this._discovery.set(null);
      this._discoveryState.set(idleActionState());
      this.apiFail.report('errors.context.loadDiscovery', e);
    } finally {
      this._discoveryLastLoadedAt = Date.now();
    }
  }

  private isFresh(lastLoadedAt: number): boolean {
    return lastLoadedAt > 0 && Date.now() - lastLoadedAt < CACHE_TTL_MS;
  }
}
