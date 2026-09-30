import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';

/**
 * Layout tiers (docs/contracts/responsive-ui.md §1):
 * phone <744 · tablet 744–1023 · laptop 1024–1279 · desktop >=1280.
 * The boundaries match tailwind.config.js `screens` (md 744 / lg 1024 / xl 1280).
 */
export type ViewportTier = 'phone' | 'tablet' | 'laptop' | 'desktop';

/** Media queries for the lower bound of each tier above phone. */
export const VIEWPORT_QUERIES = {
  tabletUp: '(min-width: 744px)',
  laptopUp: '(min-width: 1024px)',
  desktop: '(min-width: 1280px)',
} as const;

/**
 * Shared viewport tier signal driven by `matchMedia` change listeners (no resize polling).
 * Defaults to `'desktop'` when `window` / `matchMedia` is unavailable (SSR, jsdom unit tests).
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly tierState = signal<ViewportTier>('desktop');

  readonly tier: Signal<ViewportTier> = this.tierState.asReadonly();
  readonly isPhone: Signal<boolean> = computed(() => this.tier() === 'phone');
  readonly isTabletUp: Signal<boolean> = computed(() => this.tier() !== 'phone');
  readonly isLaptopUp: Signal<boolean> = computed(() => this.tier() === 'laptop' || this.tier() === 'desktop');
  readonly isDesktop: Signal<boolean> = computed(() => this.tier() === 'desktop');

  constructor() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const lists = [
      window.matchMedia(VIEWPORT_QUERIES.tabletUp),
      window.matchMedia(VIEWPORT_QUERIES.laptopUp),
      window.matchMedia(VIEWPORT_QUERIES.desktop),
    ];
    const [tabletUp, laptopUp, desktop] = lists;

    const update = (): void => {
      this.tierState.set(
        desktop.matches ? 'desktop' : laptopUp.matches ? 'laptop' : tabletUp.matches ? 'tablet' : 'phone',
      );
    };

    update();
    for (const list of lists) {
      list.addEventListener('change', update);
    }

    inject(DestroyRef).onDestroy(() => {
      for (const list of lists) {
        list.removeEventListener('change', update);
      }
    });
  }
}
