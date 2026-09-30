import {
  DestroyRef,
  Directive,
  ElementRef,
  PLATFORM_ID,
  Signal,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { ViewportService } from '../../core/layout/viewport.service';

/** R-27: in table mode (>=744) a table shows at most this many body rows, then scrolls inside its wrapper. */
export const TABLE_VIEWPORT_ROWS = 10;

const CAPPED_ATTR = 'data-rt-capped';
const SCROLLABLE_ATTR = 'data-rt-scrollable';
const MAX_VAR = '--rt-viewport-max';
const HEAD_VAR = '--rt-head-h';

/**
 * Table viewport (docs/contracts/responsive-ui.md R-27, §4.3 v1.6). Goes on the direct parent of a
 * `.rtable` / `.rtable-pinned` table — the existing `.table-scroll` / `.table-responsive` wrapper —
 * and adds the static class `rt-viewport`.
 *
 * At >=744 (`ViewportService.isTabletUp()`), with more than 10 laid-out body rows, it measures the
 * 10th row's bottom in the wrapper's content coordinates and sets `--rt-viewport-max` /
 * `--rt-head-h` plus `data-rt-capped`; the global CSS in `styles.scss` (§4.5 v1.6) turns that into
 * a max-height (clamped on short windows), a vertical scroll and a sticky, opaque header. While the
 * wrapper scrolls on either axis it is a named, focusable `role="region"` (`data-rt-scrollable`).
 * Below 744 it removes everything it set and does nothing else: rows stay cards in the page flow.
 *
 * `rtResetKey` changes whenever the table's query changes (page, page size, filter, sort …); every
 * change after the first value scrolls the wrapper back to its top. Appended rows ("load more"),
 * a reload of the same query and a new measurement never move the scroll position.
 *
 * `CdkScrollable` registers the wrapper with CDK's `ScrollDispatcher`, so an overlay opened from a
 * row (the `app-row-more` popover, reposition strategy) follows its trigger while the wrapper
 * scrolls.
 */
@Directive({
  selector: '[appTableViewport]',
  standalone: true,
  hostDirectives: [CdkScrollable],
  host: { class: 'rt-viewport' },
})
export class TableViewportDirective {
  /** Id of the visible heading or sr-only `<caption>` that names the table. */
  readonly rtLabelledBy = input<string | null>(null);
  /** Already-translated text of an existing key; used when `rtLabelledBy` is null. */
  readonly rtLabel = input<string | null>(null);
  /** Changes whenever the table's query changes; each change after the first scrolls to the top. */
  readonly rtResetKey = input<unknown>(undefined);

  private readonly cappedState = signal(false);
  private readonly scrollableState = signal(false);

  /** >=744 and more than 10 body rows: the host has `data-rt-capped`. */
  readonly capped: Signal<boolean> = this.cappedState.asReadonly();
  /** >=744 and scrollable overflow on either axis: the host has `data-rt-scrollable`. */
  readonly scrollable: Signal<boolean> = this.scrollableState.asReadonly();

  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly viewport = inject(ViewportService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private mutationObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private observedTable: HTMLTableElement | null = null;
  private frame: number | null = null;
  private destroyed = false;

  constructor() {
    effect(() => {
      this.viewport.isTabletUp();
      untracked(() => this.measure());
    });

    // The name only; attaching or dropping the region itself is measure()'s job.
    effect(() => {
      const labelledBy = this.rtLabelledBy();
      const label = this.rtLabel();
      untracked(() => this.applyName(labelledBy, label));
    });

    let firstKey = true;
    effect(() => {
      this.rtResetKey();
      if (firstKey) {
        firstKey = false;
        return;
      }
      untracked(() => this.resetScroll());
    });

    // Browser-only; never runs when the host is destroyed before its first render.
    afterNextRender(() => {
      this.observe();
      this.measure();
    });

    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  /** Measure now. Public for tests; the directive calls it itself (render, row changes, resizes, tier). */
  measure(): void {
    if (!this.isBrowser || this.destroyed) {
      return;
    }
    if (!this.viewport.isTabletUp()) {
      this.clearCap();
      this.setScrollable(false);
      return;
    }

    const host = this.host;
    const table = this.findTable();
    const tenth = table ? tenthRow(table) : null;
    if (table && tenth) {
      // Bottom border + a classic horizontal scrollbar: the scrollport then ends at the 10th row's
      // bottom whatever the current scroll position.
      const belowScrollport = host.offsetHeight - host.clientTop - host.clientHeight;
      const h10 =
        tenth.getBoundingClientRect().bottom - host.getBoundingClientRect().top + host.scrollTop + belowScrollport;
      const head = table.tHead;
      const headHeight = head ? head.getBoundingClientRect().height : 0;
      this.setVar(MAX_VAR, `${Math.ceil(h10)}px`);
      this.setVar(HEAD_VAR, `${headHeight}px`);
      this.setAttr(CAPPED_ATTR, '');
      this.cappedState.set(true);
    } else {
      this.clearCap();
    }

    // Reading these after the cap applied forces the capped layout, so they already see it.
    const scrolls = host.scrollHeight - host.clientHeight > 1 || host.scrollWidth - host.clientWidth > 1;
    this.setScrollable(scrolls);
  }

  private observe(): void {
    if (this.destroyed) {
      return;
    }
    if (typeof MutationObserver !== 'undefined') {
      // Synchronous (a microtask after the DOM change), so a new row set is capped before it is painted.
      this.mutationObserver = new MutationObserver(() => {
        this.observeTable();
        this.measure();
      });
      this.mutationObserver.observe(this.host, { childList: true, subtree: true });
    }
    if (typeof ResizeObserver !== 'undefined') {
      // Never write inside the callback ("ResizeObserver loop completed with undelivered notifications").
      this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
      this.resizeObserver.observe(this.host);
      this.observeTable();
    }
  }

  /** Keeps the ResizeObserver on the table that is currently the host's child. */
  private observeTable(): void {
    const observer = this.resizeObserver;
    if (!observer) {
      return;
    }
    const table = this.findTable();
    if (table === this.observedTable) {
      return;
    }
    if (this.observedTable) {
      observer.unobserve(this.observedTable);
    }
    this.observedTable = table;
    if (table) {
      observer.observe(table);
    }
  }

  /** One measure per animation frame, however many resize notifications arrive. */
  private scheduleMeasure(): void {
    if (this.frame !== null || this.destroyed || typeof requestAnimationFrame !== 'function') {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.measure();
    });
  }

  private teardown(): void {
    this.destroyed = true;
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.observedTable = null;
    if (this.frame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.frame);
    }
    this.frame = null;
  }

  private findTable(): HTMLTableElement | null {
    return this.host.querySelector<HTMLTableElement>(':scope > table');
  }

  private clearCap(): void {
    this.setVar(MAX_VAR, null);
    this.setVar(HEAD_VAR, null);
    this.setAttr(CAPPED_ATTR, null);
    this.cappedState.set(false);
  }

  private setScrollable(on: boolean): void {
    this.scrollableState.set(on);
    this.setAttr(SCROLLABLE_ATTR, on ? '' : null);
    this.setAttr('tabindex', on ? '0' : null);
    this.setAttr('role', on ? 'region' : null);
    this.applyName(this.rtLabelledBy(), this.rtLabel());
  }

  /** `aria-labelledby` wins over `aria-label`; neither while the wrapper doesn't scroll. */
  private applyName(labelledBy: string | null, label: string | null): void {
    const on = this.scrollableState();
    this.setAttr('aria-labelledby', on && labelledBy ? labelledBy : null);
    this.setAttr('aria-label', on && !labelledBy && label ? label : null);
  }

  /** Instant, never smooth; `scrollLeft` is kept. */
  private resetScroll(): void {
    const host = this.host;
    if (host.scrollTop === 0) {
      return;
    }
    if (typeof host.scrollTo === 'function') {
      host.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      host.scrollTop = 0;
    }
  }

  /** Writes only when the value changes. */
  private setAttr(name: string, value: string | null): void {
    if (value === null) {
      if (this.host.hasAttribute(name)) {
        this.host.removeAttribute(name);
      }
    } else if (this.host.getAttribute(name) !== value) {
      this.host.setAttribute(name, value);
    }
  }

  /** Writes only when the value changes. */
  private setVar(name: string, value: string | null): void {
    const style = this.host.style;
    if (value === null) {
      if (style.getPropertyValue(name) !== '') {
        style.removeProperty(name);
      }
    } else if (style.getPropertyValue(name) !== value) {
      style.setProperty(name, value);
    }
  }
}

/**
 * The 10th of the table's `:scope > tbody > tr` rows that have a non-zero height (expansion rows
 * count; hidden or not-laid-out rows don't), or null when there are 10 or fewer such rows.
 */
function tenthRow(table: HTMLTableElement): HTMLTableRowElement | null {
  let count = 0;
  let tenth: HTMLTableRowElement | null = null;
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      if (row.getBoundingClientRect().height <= 0) {
        continue;
      }
      count++;
      if (count === TABLE_VIEWPORT_ROWS) {
        tenth = row;
      } else if (count > TABLE_VIEWPORT_ROWS) {
        return tenth;
      }
    }
  }
  return null;
}
