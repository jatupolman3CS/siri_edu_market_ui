import { DestroyRef, Injectable, inject } from '@angular/core';
import { DOCUMENT, ViewportScroller } from '@angular/common';
import { Router, Scroll } from '@angular/router';
import { inFlightCount } from '../services/loading';

/** Give up waiting for the page to settle after this long and scroll anyway. */
export const SCROLL_RESTORE_TIMEOUT_MS = 2500;
/** Frames the page must stay settled (no request in flight, tall enough) before restoring. */
const SETTLED_FRAMES = 2;

/**
 * Scroll handling for router navigations (replaces `withInMemoryScrolling`'s
 * `scrollPositionRestoration: 'top'`, which also sent back/forward navigations to the top — on a
 * phone the user had to scroll a long list all over again after opening one item).
 *
 * - back/forward (the router's `Scroll` event carries the saved `position`): list pages reload
 *   their data asynchronously, so restoring right away is clamped by a document that is still
 *   short — and restoring over a loading skeleton is no better: Chrome's scroll anchoring then
 *   drifts the offset as the real rows replace it. Wait (rAF) until no API request is in flight
 *   (core/services/loading) and the document is tall enough for the saved offset, for
 *   {@link SETTLED_FRAMES} frames in a row — or {@link SCROLL_RESTORE_TIMEOUT_MS} passes — then
 *   restore. A user scroll in the meantime wins.
 * - `#anchor`: left to the router (`anchorScrolling: 'enabled'` in app.config.ts).
 * - every other navigation: top of the page, as before.
 *
 * Root service, started once from `provideAppInitializer` in app.config.ts.
 */
@Injectable({ providedIn: 'root' })
export class ScrollRestorationService {
  private readonly router = inject(Router);
  private readonly scroller = inject(ViewportScroller);
  private readonly window = inject(DOCUMENT).defaultView;
  private frame = 0;

  constructor() {
    const win = this.window;
    if (!win || typeof win.requestAnimationFrame !== 'function') return;

    // The router only switches history restoration to manual when it restores itself; without
    // this the browser's own (too early) restoration would fight the one below.
    this.scroller.setHistoryScrollRestoration('manual');

    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof Scroll) this.onScroll(event);
    });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      this.cancel();
    });
  }

  private onScroll(event: Scroll): void {
    if (event.scrollBehavior === 'manual') return;
    this.cancel();
    if (event.position) {
      this.restore(event.position);
    } else if (!event.anchor) {
      this.scroller.scrollToPosition([0, 0], { behavior: 'instant' });
    }
  }

  private restore([x, y]: [number, number]): void {
    const win = this.window;
    if (!win) return;
    const doc = win.document.documentElement;
    const deadline = win.performance.now() + SCROLL_RESTORE_TIMEOUT_MS;
    const startY = win.scrollY;
    let settledFrames = 0;

    const attempt = (): void => {
      this.frame = 0;
      // The user scrolled while the page was still loading — don't yank them back.
      if (Math.abs(win.scrollY - startY) > 1) return;
      const settled = inFlightCount() === 0 && doc.scrollHeight >= y + win.innerHeight;
      settledFrames = settled ? settledFrames + 1 : 0;
      if (settledFrames >= SETTLED_FRAMES || win.performance.now() >= deadline) {
        this.scroller.scrollToPosition([x, y], { behavior: 'instant' });
        return;
      }
      this.frame = win.requestAnimationFrame(attempt);
    };
    attempt();
  }

  private cancel(): void {
    if (this.frame && this.window) {
      this.window.cancelAnimationFrame(this.frame);
    }
    this.frame = 0;
  }
}
