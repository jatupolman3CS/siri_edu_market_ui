import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

/** CSS custom property on <html> carrying {@link LayoutChromeService.actionBarHeight} in px. */
export const ACTION_BAR_LIVE_HEIGHT_VAR = '--action-bar-live-h';

/**
 * Coordinates the phone chrome (docs/contracts/responsive-ui.md §4.3): while at least one
 * `<app-sticky-action-bar>` is alive on phone, the bottom tab bar hides itself and layouts
 * skip `.pb-bottom-nav` (the action bar's own spacer reserves the space instead).
 *
 * The bars also report their rendered height here, for a layout that has content *after* the
 * page (the buyer footer): the in-page spacer sits above that content, so the layout reserves
 * the bar's height again below it (G-11 — nothing ends up hidden behind the bar).
 *
 * The same height is mirrored to `--action-bar-live-h` on <html> (removed when no bar is measured):
 * styles.scss uses it as the phone `scroll-padding-bottom`, so keyboard focus scrolled into view
 * stops above the bar instead of underneath it (WCAG 2.4.11).
 */
@Injectable({ providedIn: 'root' })
export class LayoutChromeService {
  private readonly actionBarCount = signal(0);
  private readonly actionBarHeights = signal<ReadonlyMap<object, number>>(new Map());

  /** True while >=1 sticky action bar is registered. */
  readonly actionBarActive: Signal<boolean> = computed(() => this.actionBarCount() > 0);

  /**
   * Tallest measured border-box height (px, safe-area padding included) among the live sticky
   * action bars, or `null` when none has been measured (no `ResizeObserver`, or hidden at >=744).
   */
  readonly actionBarHeight: Signal<number | null> = computed(() => {
    let tallest: number | null = null;
    for (const height of this.actionBarHeights().values()) {
      tallest = tallest === null ? height : Math.max(tallest, height);
    }
    return tallest;
  });

  constructor() {
    const root = inject(DOCUMENT, { optional: true })?.documentElement;
    if (root) {
      effect(() => {
        const height = this.actionBarHeight();
        if (height === null) {
          root.style.removeProperty(ACTION_BAR_LIVE_HEIGHT_VAR);
        } else {
          root.style.setProperty(ACTION_BAR_LIVE_HEIGHT_VAR, `${height}px`);
        }
      });
    }
  }

  registerActionBar(): void {
    this.actionBarCount.update((count) => count + 1);
  }

  /** Counter is clamped at 0 — an unbalanced extra call never makes it negative. */
  unregisterActionBar(): void {
    this.actionBarCount.update((count) => Math.max(0, count - 1));
  }

  /** Records (or with `null`, forgets) the measured height of the bar identified by `owner`. */
  setActionBarHeight(owner: object, height: number | null): void {
    const current = this.actionBarHeights();
    if (height === null ? !current.has(owner) : current.get(owner) === height) {
      return;
    }
    const next = new Map(current);
    if (height === null) {
      next.delete(owner);
    } else {
      next.set(owner, height);
    }
    this.actionBarHeights.set(next);
  }
}
