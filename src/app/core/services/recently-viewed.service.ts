import { Injectable, computed, signal } from '@angular/core';
import { DocumentItem } from '../models';

const STORAGE_KEY = 'siriedu.recentlyViewed';
const MAX_ITEMS = 12;

@Injectable({ providedIn: 'root' })
export class RecentlyViewedService {
  private readonly _items = signal<DocumentItem[]>(this.loadInitial());
  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().length);

  push(doc: DocumentItem): void {
    this._items.update((list) => {
      const filtered = list.filter((d) => d.id !== doc.id);
      return [doc, ...filtered].slice(0, MAX_ITEMS);
    });
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
