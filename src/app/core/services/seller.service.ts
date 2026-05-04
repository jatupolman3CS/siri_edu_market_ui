import { Injectable, computed, signal } from '@angular/core';
import { DocumentItem, SellerStats } from '../models';
import { MOCK_DOCUMENTS } from '../mock/documents.mock';
import { MOCK_SELLER_STATS } from '../mock/library.mock';

@Injectable({ providedIn: 'root' })
export class SellerService {
  // Pretend the current seller owns the first 4 docs + a couple of pending ones.
  private readonly _myDocs = signal<DocumentItem[]>(MOCK_DOCUMENTS.slice(0, 8));
  private readonly _stats = signal<SellerStats>(MOCK_SELLER_STATS);

  readonly myDocuments = this._myDocs.asReadonly();
  readonly stats = this._stats.asReadonly();

  readonly approvedCount = computed(
    () => this._myDocs().filter((d) => d.status === 'approved').length,
  );

  readonly pendingCount = computed(
    () => this._myDocs().filter((d) => d.status === 'pending').length,
  );

  remove(id: string): void {
    this._myDocs.update((docs) => docs.filter((d) => d.id !== id));
  }
}
