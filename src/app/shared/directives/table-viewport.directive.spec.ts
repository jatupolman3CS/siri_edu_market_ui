import { Component, WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkScrollable, ScrollDispatcher } from '@angular/cdk/scrolling';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TABLE_VIEWPORT_ROWS, TableViewportDirective } from './table-viewport.directive';
import { ViewportService } from '../../core/layout/viewport.service';

/**
 * responsive-ui v1.6 R-27 (§4.3 v1.6, §1.5 v1.6). jsdom has no layout, so the geometry the
 * directive reads is stubbed per element and `measure()` is called directly.
 */
@Component({
  standalone: true,
  imports: [TableViewportDirective],
  template: `
    <div
      class="card-soft table-scroll"
      appTableViewport
      [rtLabel]="label()"
      [rtLabelledBy]="labelledBy()"
      [rtResetKey]="resetKey()"
    >
      <table class="rtable w-full">
        <thead>
          <tr><th>ชื่อ</th></tr>
        </thead>
        <tbody>
          @for (row of rows(); track row) {
            <tr><td>{{ row }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
class HostComponent {
  readonly rows = signal<number[]>([]);
  readonly label = signal<string | null>('รายการธุรกรรม');
  readonly labelledBy = signal<string | null>(null);
  readonly resetKey = signal<unknown>('a');
}

/** Host box metrics the directive reads (§1.5 v1.6). */
interface HostBox {
  top: number;
  clientTop: number;
  clientHeight: number;
  offsetHeight: number;
  scrollHeight: number;
  clientWidth: number;
  scrollWidth: number;
}

const HEAD_H = 44;
const ROW_H = 50;
const CAPPED_STATE = ['data-rt-capped'];
const SCROLL_STATE = ['data-rt-scrollable', 'tabindex', 'role', 'aria-label', 'aria-labelledby'];

function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 800,
    width: 800,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** Minimal stand-in for the browser `ResizeObserver` (jsdom has none). */
class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  disconnected = false;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }

  emit(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

interface Setup {
  fixture: ComponentFixture<HostComponent>;
  host: HTMLElement;
  table: HTMLTableElement;
  directive: TableViewportDirective;
  isTabletUp: WritableSignal<boolean>;
  /** Re-renders with `n` rows and stubs row i (1-based) at [44 + 50·(i−1), 44 + 50·i]. */
  setRows: (n: number, heightOf?: (i: number) => number) => Promise<void>;
  /** Stubs the host box; unspecified metrics keep their last value. */
  setBox: (box: Partial<HostBox>) => void;
}

async function setup(options: { rows?: number; tabletUp?: boolean; beforeFirstRender?: (host: HTMLElement) => void } = {}): Promise<Setup> {
  const isTabletUp = signal(options.tabletUp ?? true);
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [{ provide: ViewportService, useValue: { isTabletUp } }],
  });
  const fixture = TestBed.createComponent(HostComponent);
  const debugHost = fixture.debugElement.query(By.directive(TableViewportDirective));
  const host = debugHost.nativeElement as HTMLElement;
  options.beforeFirstRender?.(host);
  fixture.detectChanges();
  await fixture.whenStable();

  const table = host.querySelector('table') as HTMLTableElement;
  const thead = table.tHead as HTMLTableSectionElement;
  vi.spyOn(thead, 'getBoundingClientRect').mockReturnValue(rect(0, HEAD_H));

  const box: HostBox = {
    top: 0,
    clientTop: 0,
    clientHeight: 0,
    offsetHeight: 0,
    scrollHeight: 0,
    clientWidth: 800,
    scrollWidth: 800,
  };
  vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() => rect(box.top, box.offsetHeight));
  for (const key of ['clientTop', 'clientHeight', 'offsetHeight', 'scrollHeight', 'clientWidth', 'scrollWidth'] as const) {
    Object.defineProperty(host, key, { configurable: true, get: () => box[key] });
  }

  const setBox = (next: Partial<HostBox>): void => {
    Object.assign(box, next);
  };

  const setRows = async (n: number, heightOf: (i: number) => number = () => ROW_H): Promise<void> => {
    fixture.componentInstance.rows.set(range(n));
    fixture.detectChanges();
    await fixture.whenStable();
    let bottom = box.top + HEAD_H;
    Array.from(table.tBodies[0].rows).forEach((row, index) => {
      const height = heightOf(index + 1);
      const top = bottom;
      bottom += height;
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect(top, height));
    });
    // An uncapped box is as tall as its content (jsdom applies no CSS).
    const content = bottom - box.top;
    setBox({ clientHeight: content, offsetHeight: content + box.clientTop, scrollHeight: content });
  };

  const directive = debugHost.injector.get(TableViewportDirective);
  await setRows(options.rows ?? 0);
  return { fixture, host, table, directive, isTabletUp, setRows, setBox };
}

function capVars(host: HTMLElement): { max: string; head: string } {
  return {
    max: host.style.getPropertyValue('--rt-viewport-max'),
    head: host.style.getPropertyValue('--rt-head-h'),
  };
}

function presentAttrs(host: HTMLElement, names: readonly string[]): string[] {
  return names.filter((name) => host.hasAttribute(name));
}

describe('TableViewportDirective (responsive-ui v1.6 R-27)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeResizeObserver.instances.length = 0;
    TestBed.resetTestingModule();
  });

  it('adds the static rt-viewport class and registers the wrapper with CDK scrolling', async () => {
    const { fixture, host } = await setup({ rows: 2 });
    expect(host.classList.contains('rt-viewport')).toBe(true);
    expect(host.classList.contains('table-scroll')).toBe(true);

    // CDK overlays opened from a row (app-row-more) follow the wrapper's scroll (G-35(k)).
    const scrollable = fixture.debugElement.query(By.directive(TableViewportDirective)).injector.get(CdkScrollable);
    const cell = host.querySelector('td') as HTMLElement;
    expect(TestBed.inject(ScrollDispatcher).getAncestorScrollContainers(cell)).toContain(scrollable);
    expect(TABLE_VIEWPORT_ROWS).toBe(10);
  });

  it('case 1 — 10 rows at tablet-up: no cap, no custom properties, no tab stop or region', async () => {
    const { host, directive } = await setup({ rows: 10 });
    directive.measure();

    expect(presentAttrs(host, [...CAPPED_STATE, ...SCROLL_STATE])).toEqual([]);
    expect(capVars(host)).toEqual({ max: '', head: '' });
    expect(Array.from(host.attributes).some((a) => a.name.startsWith('aria-'))).toBe(false);
    expect(directive.capped()).toBe(false);
    expect(directive.scrollable()).toBe(false);
  });

  it('case 2 — 11 rows: caps at the 10th row bottom (544px) with the thead height (44px)', async () => {
    const { host, directive } = await setup({ rows: 11 });
    directive.measure();

    expect(host.hasAttribute('data-rt-capped')).toBe(true);
    expect(capVars(host)).toEqual({ max: '544px', head: '44px' });
    expect(directive.capped()).toBe(true);
  });

  it('case 3 — a horizontal scrollbar under the scrollport (11px) is added: 555px', async () => {
    const { host, directive, setBox } = await setup({ rows: 11 });
    setBox({ clientHeight: 594, offsetHeight: 605 });
    directive.measure();

    expect(capVars(host).max).toBe('555px');
  });

  it('measures the 10th row in content coordinates: the same cap at any scroll position', async () => {
    const { host, directive, setRows, setBox } = await setup({ rows: 11 });
    // Host 120px down the page, scrolled by 100px: row 10 is at 120 + 544 − 100 on screen.
    setBox({ top: 120 });
    await setRows(11);
    host.scrollTop = 100;
    for (const row of Array.from(host.querySelectorAll('tbody tr'))) {
      const r = row.getBoundingClientRect();
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect(r.top - 100, r.height));
    }
    directive.measure();

    expect(capVars(host).max).toBe('544px');
  });

  it('rounds a fractional 10th-row bottom up', async () => {
    const { host, directive, setRows } = await setup();
    await setRows(11, (i) => (i === 10 ? 50.3 : ROW_H));
    directive.measure();

    expect(capVars(host).max).toBe('545px');
  });

  describe('case 4 — scrollable overflow makes a named, focusable region', () => {
    it('vertical overflow (scrollHeight > clientHeight + 1) with rtLabel → aria-label', async () => {
      const { host, directive, setBox } = await setup({ rows: 11 });
      setBox({ clientHeight: 544, offsetHeight: 544, scrollHeight: 594 });
      directive.measure();

      expect(host.hasAttribute('data-rt-scrollable')).toBe(true);
      expect(host.getAttribute('tabindex')).toBe('0');
      expect(host.getAttribute('role')).toBe('region');
      expect(host.getAttribute('aria-label')).toBe('รายการธุรกรรม');
      expect(host.hasAttribute('aria-labelledby')).toBe(false);
      expect(directive.scrollable()).toBe(true);
    });

    it('horizontal overflow (scrollWidth > clientWidth + 1) with rtLabelledBy="t" → aria-labelledby', async () => {
      const { fixture, host, directive, setBox } = await setup({ rows: 3 });
      fixture.componentInstance.labelledBy.set('t');
      fixture.detectChanges();
      await fixture.whenStable();
      setBox({ clientWidth: 744, scrollWidth: 900 });
      directive.measure();

      expect(host.hasAttribute('data-rt-capped')).toBe(false);
      expect(host.hasAttribute('data-rt-scrollable')).toBe(true);
      expect(host.getAttribute('tabindex')).toBe('0');
      expect(host.getAttribute('role')).toBe('region');
      expect(host.getAttribute('aria-labelledby')).toBe('t');
      expect(host.hasAttribute('aria-label')).toBe(false);
    });

    it('overflow of 1px or less on both axes: none of the five', async () => {
      const { host, directive, setBox } = await setup({ rows: 11 });
      setBox({ clientHeight: 544, offsetHeight: 544, scrollHeight: 594 });
      directive.measure();
      expect(host.hasAttribute('data-rt-scrollable')).toBe(true);

      setBox({ scrollHeight: 545, clientWidth: 800, scrollWidth: 801 });
      directive.measure();

      expect(presentAttrs(host, SCROLL_STATE)).toEqual([]);
      expect(directive.scrollable()).toBe(false);
      // Still capped: the cap and the region are independent.
      expect(host.hasAttribute('data-rt-capped')).toBe(true);
    });

    it('follows a name change while scrolling, and names nothing while not scrolling', async () => {
      const { fixture, host, directive, setBox } = await setup({ rows: 11 });
      setBox({ clientHeight: 544, offsetHeight: 544, scrollHeight: 594 });
      directive.measure();

      fixture.componentInstance.label.set('Transactions');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(host.getAttribute('aria-label')).toBe('Transactions');

      fixture.componentInstance.labelledBy.set('tx-heading');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(host.getAttribute('aria-labelledby')).toBe('tx-heading');
      expect(host.hasAttribute('aria-label')).toBe(false);

      setBox({ scrollHeight: 544 });
      directive.measure();
      fixture.componentInstance.labelledBy.set(null);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(presentAttrs(host, SCROLL_STATE)).toEqual([]);
    });
  });

  it('case 5 — below 744 every attribute and custom property is removed, and measuring adds none', async () => {
    const { fixture, host, directive, isTabletUp, setBox } = await setup({ rows: 11 });
    setBox({ clientHeight: 544, offsetHeight: 544, scrollHeight: 594, clientWidth: 700, scrollWidth: 900 });
    directive.measure();
    expect(presentAttrs(host, [...CAPPED_STATE, ...SCROLL_STATE]).length).toBe(5);

    isTabletUp.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(presentAttrs(host, [...CAPPED_STATE, ...SCROLL_STATE])).toEqual([]);
    expect(capVars(host)).toEqual({ max: '', head: '' });
    expect(directive.capped()).toBe(false);
    expect(directive.scrollable()).toBe(false);

    directive.measure();
    expect(presentAttrs(host, [...CAPPED_STATE, ...SCROLL_STATE])).toEqual([]);
    expect(host.classList.contains('rt-viewport')).toBe(true);

    // Back to tablet-up: measured again.
    isTabletUp.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.hasAttribute('data-rt-capped')).toBe(true);
    expect(capVars(host).max).toBe('544px');
  });

  it('case 6 — a new rtResetKey scrolls to the top; the first value and appended rows do not', async () => {
    const { fixture, host, setRows } = await setup({
      rows: 11,
      // Scrolled before the first change detection: the first key value must leave it alone.
      beforeFirstRender: (el) => {
        el.scrollTop = 300;
      },
    });
    expect(host.scrollTop).toBe(300);

    host.scrollLeft = 40;
    fixture.componentInstance.resetKey.set('b');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.scrollTop).toBe(0);
    expect(host.scrollLeft).toBe(40);

    // "Load more": rows appended without a key change keep the position.
    host.scrollTop = 300;
    await setRows(31);
    expect(host.scrollTop).toBe(300);

    // Same key again (a reload of the same query): no reset either.
    fixture.componentInstance.resetKey.set('b');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.scrollTop).toBe(300);
  });

  it('case 7 — a 10th row of height 0 (not laid out) is not capped', async () => {
    const { host, directive, setRows } = await setup();
    await setRows(11, (i) => (i === 10 ? 0 : ROW_H));
    directive.measure();

    expect(host.hasAttribute('data-rt-capped')).toBe(false);
    expect(capVars(host).max).toBe('');
  });

  it('case 8 — on destroy the observers disconnect and a pending frame is cancelled', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const frames = stubFrames();
    const mutationDisconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');

    const { fixture, host, table } = await setup({ rows: 11 });
    expect(FakeResizeObserver.instances).toHaveLength(1);
    const observer = FakeResizeObserver.instances[0];
    expect([...observer.observed]).toEqual([host, table]);

    // Resize notifications are deferred to one frame, never measured inside the callback.
    const ours = frames.requestedDuring(() => {
      observer.emit();
      observer.emit();
    });
    expect(ours).toHaveLength(1);

    fixture.destroy();

    expect(observer.disconnected).toBe(true);
    expect(mutationDisconnect).toHaveBeenCalled();
    expect(frames.cancel).toHaveBeenCalledWith(ours[0].id);
  });

  it('measures a new row set synchronously from the MutationObserver, before the next frame', async () => {
    const { fixture, host, table } = await setup({ rows: 3 });
    // Stub rows before they exist: the row prototype answers for every row the next render adds.
    const rowRect = vi.spyOn(HTMLTableRowElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLTableRowElement,
    ) {
      const index = Array.from(table.tBodies[0].rows).indexOf(this);
      return rect(HEAD_H + ROW_H * index, ROW_H);
    });
    fixture.componentInstance.rows.set(range(20));
    fixture.detectChanges();
    // Only the mutation-observer microtask: no frame, no timer, no further change detection.
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(host.hasAttribute('data-rt-capped')).toBe(true);
    expect(capVars(host).max).toBe('544px');
    rowRect.mockRestore();
  });

  it('measures resize notifications in the next frame, not in the observer callback', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const frames = stubFrames();
    const { host, setRows } = await setup();
    await setRows(11);
    host.removeAttribute('data-rt-capped');

    const ours = frames.requestedDuring(() => FakeResizeObserver.instances[0].emit());
    expect(ours).toHaveLength(1);
    expect(host.hasAttribute('data-rt-capped')).toBe(false);

    ours[0].callback(0);
    expect(host.hasAttribute('data-rt-capped')).toBe(true);
  });
});

/**
 * Stubs `requestAnimationFrame` / `cancelAnimationFrame` with unique ids. Angular's zoneless
 * scheduler races `setTimeout` with `requestAnimationFrame` too, so tests only look at the frames
 * requested inside `requestedDuring`.
 */
function stubFrames() {
  const requested: { id: number; callback: FrameRequestCallback }[] = [];
  let nextId = 1000;
  const request = vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextId;
    requested.push({ id, callback });
    return id;
  });
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  return {
    cancel,
    requestedDuring(action: () => void) {
      const before = requested.length;
      action();
      return requested.slice(before);
    },
  };
}
