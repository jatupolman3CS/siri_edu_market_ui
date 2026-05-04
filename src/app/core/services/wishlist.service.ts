import { Injectable, computed, signal } from '@angular/core';
import { DocumentItem } from '../models';

const STORAGE_KEY = 'siriedu.wishlist';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly _items = signal<DocumentItem[]>(this.loadInitial());

  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().length);

  has(id: string): boolean {
    return this._items().some((d) => d.id === id);
  }

  toggle(doc: DocumentItem): boolean {
    if (this.has(doc.id)) {
      this._items.update((list) => list.filter((d) => d.id !== doc.id));
      this.persist();
      return false;
    }
    this._items.update((list) => [doc, ...list]);
    this.persist();
    return true;
  }

  remove(id: string): void {
    this._items.update((list) => list.filter((d) => d.id !== id));
    this.persist();
  }

  clear(): void {
    this._items.set([]);
    this.persist();
  }

  private loadInitial(): DocumentItem[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._items()));
    } catch {
      // ignore
    }
  }
}
