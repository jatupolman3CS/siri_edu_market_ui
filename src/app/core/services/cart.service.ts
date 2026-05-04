import { Injectable, computed, signal } from '@angular/core';
import { CartItem, DocumentItem } from '../models';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly _items = signal<CartItem[]>([]);
  private readonly _drawerOpen = signal<boolean>(false);

  readonly items = this._items.asReadonly();
  readonly drawerOpen = this._drawerOpen.asReadonly();

  readonly count = computed(() => this._items().length);

  readonly subtotal = computed(() =>
    this._items().reduce((sum, item) => sum + item.document.price, 0),
  );

  readonly originalSubtotal = computed(() =>
    this._items().reduce(
      (sum, item) =>
        sum + (item.document.originalPrice ?? item.document.price),
      0,
    ),
  );

  readonly savings = computed(() =>
    Math.max(0, this.originalSubtotal() - this.subtotal()),
  );

  readonly tax = computed(() => Math.round(this.subtotal() * 0.07));

  readonly total = computed(() => this.subtotal() + this.tax());

  add(document: DocumentItem): boolean {
    if (this._items().some((i) => i.document.id === document.id)) {
      return false;
    }
    this._items.update((items) => [
      ...items,
      { document, addedAt: new Date().toISOString() },
    ]);
    this.openDrawer();
    return true;
  }

  remove(documentId: string): void {
    this._items.update((items) =>
      items.filter((i) => i.document.id !== documentId),
    );
  }

  clear(): void {
    this._items.set([]);
  }

  has(documentId: string): boolean {
    return this._items().some((i) => i.document.id === documentId);
  }

  openDrawer(): void {
    this._drawerOpen.set(true);
  }

  closeDrawer(): void {
    this._drawerOpen.set(false);
  }

  toggleDrawer(): void {
    this._drawerOpen.update((v) => !v);
  }
}
