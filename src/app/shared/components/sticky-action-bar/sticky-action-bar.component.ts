import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { LayoutChromeService, ViewportService } from '../../../core/layout';

/**
 * Phone-only fixed bottom action bar (docs/contracts/responsive-ui.md §4.3). Content projection
 * only — the consumer puts the price/summary and buttons inside. Renders an in-flow spacer of the
 * same height so page content is never hidden behind it. Host is `display:none` at >=744, where
 * consumers keep their sticky side card.
 *
 * The spacer tracks the bar's real rendered height (G-11): a label that wraps to two lines makes
 * the bar taller than `--action-bar-h`, so a `ResizeObserver` on the bar feeds its border-box
 * height (which already includes the `calc(12px + var(--safe-bottom))` bottom padding) into the
 * spacer. Where `ResizeObserver` is missing (jsdom, very old browsers) the spacer falls back to
 * the SCSS height `calc(var(--action-bar-h) + var(--safe-bottom))`. The same measurement is
 * reported to `LayoutChromeService.actionBarHeight` for layouts with content below the page.
 *
 * While alive on phone it registers with `LayoutChromeService`, which hides the bottom tab bar;
 * the registration follows tier changes and is always balanced on destroy.
 */
@Component({
  selector: 'app-sticky-action-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sticky-action-bar.component.html',
  styleUrl: './sticky-action-bar.component.scss',
})
export class StickyActionBarComponent {
  private readonly chrome = inject(LayoutChromeService);
  private readonly viewport = inject(ViewportService);
  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');
  private registered = false;

  /**
   * Measured border-box height of the fixed bar in px, or `null` while unmeasured / hidden
   * (>=744 the host is `display:none` and the bar measures 0) — `null` keeps the SCSS fallback.
   */
  protected readonly barHeight = signal<number | null>(null);

  constructor() {
    this.sync(this.viewport.isPhone());

    effect(() => {
      const phone = this.viewport.isPhone();
      untracked(() => this.sync(phone));
    });

    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.sync(false);
      this.chrome.setActionBarHeight(this, null);
    });

    // Browser-only; never runs if the component is destroyed before its first render.
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (entry) {
          const height = measureBorderBoxHeight(entry);
          this.barHeight.set(height);
          this.chrome.setActionBarHeight(this, height);
        }
      });
      observer.observe(this.bar().nativeElement, { box: 'border-box' });
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private sync(phone: boolean): void {
    if (phone && !this.registered) {
      this.registered = true;
      this.chrome.registerActionBar();
    } else if (!phone && this.registered) {
      this.registered = false;
      this.chrome.unregisterActionBar();
    }
  }
}

function measureBorderBoxHeight(entry: ResizeObserverEntry): number | null {
  // `borderBoxSize` is missing on Safari < 15.4; fall back to the element's layout box.
  const box: ResizeObserverSize | undefined = entry.borderBoxSize?.[0];
  const height = box ? box.blockSize : entry.target.getBoundingClientRect().height;
  return height > 0 ? height : null;
}
