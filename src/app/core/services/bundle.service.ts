import { Injectable, computed, inject, signal } from '@angular/core';
import { Bundle } from '../models';
import { mapBundle } from '../api-mappers/mappers';
import {
  deleteApiSellerBundlesByBundleId,
  getApiMarketplaceBundles,
  getApiMarketplaceBundlesById,
  getApiSellerBundles,
  getApiSellerBundlesCandidates,
  postApiSellerBundles,
  putApiSellerBundlesByBundleId,
} from '../api';
import type {
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

@Injectable({ providedIn: 'root' })
export class BundleService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _bundlesState = signal<ActionState>(idleActionState());

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
  readonly count = computed(() => this.bundles().length);

  readonly featured = computed(() =>
    [...this.bundles()].sort((a, b) => b.rating - a.rating).slice(0, 4),
  );

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

  getById(id: string): Bundle | undefined {
    return this.bundles().find((b) => b.id === id);
  }

  /** Loads a single bundle's full detail (fire-and-forget for caching). */
  loadBundleDetail(id: string): void {
    void (async () => {
      try {
        await getApiMarketplaceBundlesById({ path: { id } });
      } catch (e) {
        this.apiFail.report('โหลดรายละเอียดแพ็กเกจ', e);
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

  async listMyBundles(): Promise<SellerBundleResponse[]> {
    return unwrapSdkResult(await getApiSellerBundles()) ?? [];
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
}
