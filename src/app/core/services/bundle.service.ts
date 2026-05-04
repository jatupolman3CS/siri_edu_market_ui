import { Injectable, computed, signal } from '@angular/core';
import { Bundle } from '../models';
import { MOCK_BUNDLES } from '../mock/bundles.mock';

@Injectable({ providedIn: 'root' })
export class BundleService {
  private readonly _bundles = signal<Bundle[]>(MOCK_BUNDLES);

  readonly bundles = this._bundles.asReadonly();
  readonly count = computed(() => this._bundles().length);

  readonly featured = computed(() =>
    [...this._bundles()].sort((a, b) => b.rating - a.rating).slice(0, 4),
  );

  getById(id: string): Bundle | undefined {
    return this._bundles().find((b) => b.id === id);
  }

  /** Bundles that include a given document */
  getRelatedBundles(documentId: string): Bundle[] {
    return this._bundles().filter((b) => b.documentIds.includes(documentId));
  }

  /** Bundles published by a seller */
  getBySellerId(sellerId: string): Bundle[] {
    return this._bundles().filter((b) => b.seller.id === sellerId);
  }
}
