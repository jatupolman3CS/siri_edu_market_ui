import { Injectable, computed, signal } from '@angular/core';
import { LibraryItem, Order } from '../models';
import { MOCK_LIBRARY, MOCK_ORDERS } from '../mock/library.mock';

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly _library = signal<LibraryItem[]>(MOCK_LIBRARY);
  private readonly _orders = signal<Order[]>(MOCK_ORDERS);

  readonly library = this._library.asReadonly();
  readonly orders = this._orders.asReadonly();

  readonly totalDocuments = computed(() => this._library().length);

  readonly totalDownloads = computed(() =>
    this._library().reduce((s, l) => s + l.downloadCount, 0),
  );

  readonly totalSpent = computed(() =>
    this._orders()
      .filter((o) => o.status !== 'awaiting_payment' && o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.total, 0),
  );

  download(documentId: string): void {
    this._library.update((items) =>
      items.map((i) =>
        i.document.id === documentId
          ? {
              ...i,
              downloadCount: i.downloadCount + 1,
              lastDownloadAt: new Date().toISOString(),
            }
          : i,
      ),
    );
  }
}
