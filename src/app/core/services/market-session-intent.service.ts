import { Injectable, signal } from '@angular/core';

export type MarketSessionIntent = 'buyer' | 'seller';

const STORAGE_KEY = 'siriedu.marketIntent';

@Injectable({ providedIn: 'root' })
export class MarketSessionIntentService {
  private readonly _intent = signal<MarketSessionIntent>(this.readStored());

  readonly intent = this._intent.asReadonly();

  private readStored(): MarketSessionIntent {
    if (typeof localStorage === 'undefined') return 'buyer';
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'seller' ? 'seller' : 'buyer';
  }

  setIntent(next: MarketSessionIntent): void {
    this._intent.set(next);
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, next);
  }

  /** Called on sign-out so the next account does not inherit mode. */
  reset(): void {
    this._intent.set('buyer');
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  }
}
