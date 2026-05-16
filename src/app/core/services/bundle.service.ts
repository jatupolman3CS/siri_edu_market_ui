import { Injectable, computed, inject, signal } from '@angular/core';
import { Bundle } from '../models';
import { mapBundle } from '../api-mappers/mappers';
import { getApiMarketplaceBundles, getApiMarketplaceBundlesById } from '../api';
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
}
