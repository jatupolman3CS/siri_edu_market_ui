import { Injectable, computed, inject, signal } from '@angular/core';
import { Bundle, DocumentItem } from '../models';
import { mapBundle, mapBundleDetail } from '../api-mappers/mappers';
import {
  deleteApiSellerBundlesByBundleId,
  getApiMarketplaceBundles,
  getApiMarketplaceBundlesById,
  getApiMarketplaceDocumentsByIdBundles,
  getApiSellerBundles,
  getApiSellerBundlesCandidates,
  postApiSellerBundles,
  putApiSellerBundlesByBundleId,
} from '../api';
import type {
  PagedResponseOfSellerBundleResponse,
  SaveBundleRequest,
  SellerBundleItemResponse,
  SellerBundleResponse,
} from '../api/types.gen';
import { unwrapSdkResult } from './api-result';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { createInfinitePager } from './infinite-pager';
import { createServerPager } from './server-pager';

@Injectable({ providedIn: 'root' })
export class BundleService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _bundlesState = signal<ActionState>(idleActionState());
  /** Q-04: full-detail bundles keyed by id — the only cache with a real `documents` array. */
  private readonly _bundleDetails = signal<Map<string, Bundle>>(new Map());
  private readonly _bundleDocuments = signal<Map<string, DocumentItem[]>>(new Map());
  private readonly _bundleDetailState = signal<ActionState>(idleActionState());

  private readonly pager = createInfinitePager<Bundle>({
    pageSize: 12,
    errorMessage: 'โหลดแพ็กเกจไม่สำเร็จ',
    fetch: async (Page, PageSize) => {
      const result = await getApiMarketplaceBundles({ query: { Page, PageSize } });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapBundle),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  readonly bundles = this.pager.items;
  readonly hasMore = this.pager.hasMore;
  readonly bundlesState = this._bundlesState.asReadonly();
  readonly bundleDetailState = this._bundleDetailState.asReadonly();
  readonly count = computed(() => this.bundles().length);

  readonly featured = computed(() =>
    [...this.bundles()].sort((a, b) => b.rating - a.rating).slice(0, 4),
  );

  /**
   * marketplace-home-redesign v2 §4.2 (round 2 — SDK wired): tab "แพ็กเกจ" ในหน้า marketplace —
   * pager ใหม่แยกจาก `pager`/`featured()` ด้านบนโดยสิ้นเชิง (ห้ามใช้ตัวเดียวกัน จะกระทบ home strip /
   * `/bundles`). Backend extend `GET /api/marketplace/bundles` เพิ่ม `Q`/`Sort` แล้ว (gate 1 ผ่าน) —
   * `Sort` ไม่ส่งค่าเลย ปล่อยให้ backend fallback เป็น `"newest"` เอง (ตาม spec §3.1 — tab นี้ไม่มี
   * ตัวเลือก sort ของตัวเอง).
   */
  private readonly searchPager = createServerPager<Bundle, string>({
    pageSize: 24,
    errorMessage: 'ค้นหาแพ็กเกจไม่สำเร็จ',
    fetch: async (page, pageSize, q) => {
      const term = q?.trim();
      const result = await getApiMarketplaceBundles({
        query: { Page: page, PageSize: pageSize, Q: term ? term : undefined },
      });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapBundle),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  readonly bundleResults = this.searchPager.items;
  readonly bundleResultsState = this.searchPager.state;
  readonly bundleResultsTotalCount = this.searchPager.totalCount;
  readonly bundleResultsPage = this.searchPager.page;

  /** Last `Q` used — kept so `loadMore`-style calls (page > 1) reuse the same search term. */
  private _bundleResultsQuery = '';

  /**
   * marketplace-home-redesign v2 §4.2: `page <= 1` reloads from page 1 with `q` (defaults to the
   * last-used term so infinite-scroll "โหลดเพิ่มเติม" calls with `page > 1` don't need to repeat
   * it) — mirrors `CatalogService.loadMarketplaceResultsPage`'s reset-vs-append split.
   */
  async loadBundleResultsPage(page: number, q?: string): Promise<void> {
    if (q !== undefined) this._bundleResultsQuery = q;
    try {
      if (page <= 1) {
        await this.searchPager.reloadFromPage1(this._bundleResultsQuery);
      } else {
        await this.searchPager.onPageChange(page);
      }
    } catch (e) {
      this.apiFail.report('ค้นหาแพ็กเกจ', e);
    }
  }

  /** ลองใหม่ "หน้าเดิม" ที่ error ไว้ (ไม่กระโดดกลับหน้า 1) — ตาม pattern เดียวกับ catalog.service.ts. */
  retryBundleResults(): void {
    void this.loadBundleResultsPage(this.searchPager.page());
  }

  constructor() {
    void this.refreshBundles();
  }

  async refreshBundles(): Promise<void> {
    this._bundlesState.set(loadingActionState());
    try {
      await this.pager.loadFirst();
      this._bundlesState.set(idleActionState());
    } catch (e) {
      this.apiFail.report('โหลดแพ็กเกจ', e);
      this._bundlesState.set(errorActionState('โหลดแพ็กเกจไม่สำเร็จ'));
    }
  }

  loadMore(): Promise<void> {
    return this.pager.loadMore();
  }

  /** Prefers the full-detail cache (has real `documentIds`) over the paged-list cache. */
  getById(id: string): Bundle | undefined {
    return this._bundleDetails().get(id) ?? this.bundles().find((b) => b.id === id);
  }

  /**
   * Q-04: the member documents of a bundle, only available once `loadBundleDetail(id)` resolves
   * — the paged bundle list this service otherwise runs on never carries them.
   */
  getDocuments(id: string): DocumentItem[] {
    return this._bundleDocuments().get(id) ?? [];
  }

  /** Loads (and caches) a single bundle's full detail — call from the bundle-detail page. */
  loadBundleDetail(id: string): void {
    if (!id) return;
    void (async () => {
      this._bundleDetailState.set(loadingActionState());
      try {
        const result = await getApiMarketplaceBundlesById({ path: { id } });
        const data = unwrapSdkResult(result);
        const { bundle, documents } = mapBundleDetail(data);
        this._bundleDetails.update((map) => new Map(map).set(id, bundle));
        this._bundleDocuments.update((map) => new Map(map).set(id, documents));
        this._bundleDetailState.set(idleActionState());
      } catch (e) {
        this.apiFail.report('โหลดรายละเอียดแพ็กเกจ', e);
        this._bundleDetailState.set(errorActionState('โหลดรายละเอียดแพ็กเกจไม่สำเร็จ'));
      }
    })();
  }

  /** Bundles that include a given document */
  getRelatedBundles(documentId: string): Bundle[] {
    return this.bundles().filter((b) => b.documentIds.includes(documentId));
  }

  /** Bundles published by a seller */
  getBySellerId(sellerId: string): Bundle[] {
    return this.bundles().filter((b) => b.seller.id === sellerId);
  }

  // ===== F-04: the seller's own bundles =====
  // Buyers could already browse and buy bundles; nothing could create one, so the only bundles
  // that existed were the seeder's. These call the seller-scoped endpoints. Errors are left to
  // the page, which is the layer that knows which action the seller was performing.

  /**
   * backend-wide-pagination-and-seller-directory v1 §3.2: `GET /api/seller/bundles` now returns
   * `PagedResponse<SellerBundleResponse>` (breaking response shape) instead of a bare array —
   * `page`/`pageSize` default to the controller's own defaults (`1`/`50`) when omitted.
   */
  async listMyBundles(page?: number, pageSize?: number): Promise<PagedResponseOfSellerBundleResponse> {
    return unwrapSdkResult(await getApiSellerBundles({ query: { page, pageSize } }));
  }

  /** The seller's approved documents, for the picker in the bundle form. */
  async listBundleCandidates(): Promise<SellerBundleItemResponse[]> {
    return unwrapSdkResult(await getApiSellerBundlesCandidates()) ?? [];
  }

  /**
   * Create when `bundleId` is null, replace otherwise.
   *
   * `throwOnError` rather than unwrapSdkResult because the server's rejections here carry the
   * reason the seller needs to read — "ราคาต้องถูกกว่าผลรวมราคาปกติ" and the like — and
   * ApiFailureReporter already surfaces that message from the thrown error.
   */
  async saveMyBundle(
    bundleId: string | null,
    body: SaveBundleRequest,
  ): Promise<SellerBundleResponse> {
    const result = bundleId
      ? await putApiSellerBundlesByBundleId({ path: { bundleId }, body, throwOnError: true })
      : await postApiSellerBundles({ body, throwOnError: true });
    return result.data;
  }

  async deleteMyBundle(bundleId: string): Promise<void> {
    await deleteApiSellerBundlesByBundleId({ path: { bundleId }, throwOnError: true });
  }

  // ===== document-bundle-cross-sell v1: "ในแพ็กเกจที่คุ้มกว่า" on document detail =====
  // Round 2 (SDK wired): calls the real `GET /api/marketplace/documents/{id}/bundles` endpoint
  // (spec §3.1). The page loads this non-blocking, so failures (including the document
  // genuinely not existing — 404 per AC-4) are reported via `ApiFailureReporter` and resolved
  // as `[]` rather than thrown, keeping the section silently hidden instead of showing a
  // page-wide error banner.

  /** Bundles that contain `documentId`, for the document-detail cross-sell section. */
  async loadBundlesContainingDocument(documentId: string, limit = 3): Promise<Bundle[]> {
    try {
      const result = await getApiMarketplaceDocumentsByIdBundles({
        path: { id: documentId },
        query: { Page: 1, PageSize: limit },
      });
      const data = unwrapSdkResult(result);
      return (data.items ?? []).map(mapBundle);
    } catch (e) {
      this.apiFail.report('โหลดแพ็กเกจที่มีเอกสารนี้', e);
      return [];
    }
  }
}

// ===== document-bundle-cross-sell v1 §4: savePercent/saveAmount — computed here (not in the
// template) from `BundleResponse.price`/`originalPrice`, per the contract's decision to reuse
// the existing DTO rather than add a `savePercent` field server-side. =====

/** `round((1 - price / originalPrice) * 100)`, or `0` when there is nothing to save. */
export function calcBundleSavePercent(price: number, originalPrice: number): number {
  return originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : 0;
}

/** `max(0, originalPrice - price)` — never negative even if the data is inconsistent. */
export function calcBundleSaveAmount(price: number, originalPrice: number): number {
  return Math.max(0, originalPrice - price);
}
