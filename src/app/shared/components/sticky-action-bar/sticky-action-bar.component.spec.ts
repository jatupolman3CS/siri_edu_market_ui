import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StickyActionBarComponent } from './sticky-action-bar.component';
import { LayoutChromeService, ViewportService } from '../../../core/layout';

@Component({
  standalone: true,
  imports: [StickyActionBarComponent],
  template: `
    @if (show()) {
      <app-sticky-action-bar>
        <span class="price">฿99</span>
        <button type="button" class="buy">ซื้อเลย</button>
      </app-sticky-action-bar>
    }
  `,
})
class HostComponent {
  readonly show = signal(true);
}

/** Minimal stand-in for the browser `ResizeObserver` (jsdom has none). */
class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = [];
  readonly observed: { target: Element; options?: ResizeObserverOptions }[] = [];
  disconnected = false;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element, options?: ResizeObserverOptions): void {
    this.observed.push({ target, options });
  }

  unobserve(): void {
    /* not used by the component */
  }

  disconnect(): void {
    this.disconnected = true;
  }

  /** Delivers one entry for the observed bar; `blockSize: null` omits `borderBoxSize` (old Safari). */
  emit(blockSize: number | null): void {
    const target = this.observed[0].target;
    const entry = {
      target,
      borderBoxSize: blockSize === null ? undefined : [{ blockSize, inlineSize: 360 }],
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
}

async function setup(phone: boolean) {
  const isPhone = signal(phone);
  TestBed.configureTestingModule({
    providers: [{ provide: ViewportService, useValue: { isPhone } }],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const chrome = TestBed.inject(LayoutChromeService);
  return { fixture, chrome, isPhone };
}

function spacerOf(el: HTMLElement): HTMLElement {
  const spacer = el.querySelector<HTMLElement>('.sticky-action-bar__spacer');
  if (!spacer) {
    throw new Error('spacer not rendered');
  }
  return spacer;
}

describe('StickyActionBarComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeResizeObserver.instances.length = 0;
  });

  it('projects its content and renders a spacer', async () => {
    const { fixture } = await setup(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="sticky-action-bar"] .buy')?.textContent).toBe('ซื้อเลย');
    expect(el.querySelector('[data-testid="sticky-action-bar"] .price')).not.toBeNull();
    expect(el.querySelector('.sticky-action-bar__spacer')).not.toBeNull();
  });

  it('registers on init and unregisters on destroy while on phone', async () => {
    const { fixture, chrome } = await setup(true);
    expect(chrome.actionBarActive()).toBe(true);

    fixture.componentInstance.show.set(false);
    fixture.detectChanges();
    expect(chrome.actionBarActive()).toBe(false);
  });

  it('does not register at >=744', async () => {
    const { fixture, chrome } = await setup(false);
    expect(chrome.actionBarActive()).toBe(false);

    fixture.componentInstance.show.set(false);
    fixture.detectChanges();
    expect(chrome.actionBarActive()).toBe(false);
  });

  it('stays balanced when the tier changes while alive', async () => {
    const { fixture, chrome, isPhone } = await setup(true);
    expect(chrome.actionBarActive()).toBe(true);

    isPhone.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(chrome.actionBarActive()).toBe(false);

    isPhone.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(chrome.actionBarActive()).toBe(true);

    fixture.componentInstance.show.set(false);
    fixture.detectChanges();
    expect(chrome.actionBarActive()).toBe(false);

    // A second, unrelated bar still counts from zero.
    chrome.registerActionBar();
    expect(chrome.actionBarActive()).toBe(true);
    chrome.unregisterActionBar();
    expect(chrome.actionBarActive()).toBe(false);
  });

  describe('spacer height (G-11)', () => {
    it('keeps the SCSS fallback height when ResizeObserver is unavailable', async () => {
      vi.stubGlobal('ResizeObserver', undefined);
      const { fixture } = await setup(true);

      expect(spacerOf(fixture.nativeElement).style.height).toBe('');
    });

    it('observes the bar border-box and sizes the spacer to its rendered height', async () => {
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      const { fixture, chrome } = await setup(true);
      const el = fixture.nativeElement as HTMLElement;

      expect(FakeResizeObserver.instances).toHaveLength(1);
      const observer = FakeResizeObserver.instances[0];
      expect(observer.observed).toHaveLength(1);
      expect(observer.observed[0].target).toBe(el.querySelector('[data-testid="sticky-action-bar"]'));
      expect(observer.observed[0].options).toEqual({ box: 'border-box' });
      // Unmeasured: still the fallback.
      expect(spacerOf(el).style.height).toBe('');

      // A label wrapped to two lines: 12 + 60 + 12 padding + 1 border.
      observer.emit(85);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(spacerOf(el).style.height).toBe('85px');
      // Also reported for layouts with content below the page (buyer footer).
      expect(chrome.actionBarHeight()).toBe(85);

      // Shrinks back (fractional heights kept as-is).
      observer.emit(72.5);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(spacerOf(el).style.height).toBe('72.5px');
      expect(chrome.actionBarHeight()).toBe(72.5);

      // Hidden (host display:none at >=744) measures 0: drop back to the fallback.
      observer.emit(0);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(spacerOf(el).style.height).toBe('');
      expect(chrome.actionBarHeight()).toBeNull();
    });

    it('falls back to the layout box when the entry has no borderBoxSize', async () => {
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      const { fixture } = await setup(true);
      const el = fixture.nativeElement as HTMLElement;
      const bar = el.querySelector<HTMLElement>('[data-testid="sticky-action-bar"]');
      if (!bar) {
        throw new Error('bar not rendered');
      }
      vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height: 97 } as DOMRect);

      FakeResizeObserver.instances[0].emit(null);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(spacerOf(el).style.height).toBe('97px');
    });

    it('disconnects the observer and clears its reported height on destroy', async () => {
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      const { fixture, chrome } = await setup(true);
      const observer = FakeResizeObserver.instances[0];
      expect(observer.disconnected).toBe(false);
      observer.emit(85);
      expect(chrome.actionBarHeight()).toBe(85);

      fixture.componentInstance.show.set(false);
      fixture.detectChanges();
      expect(observer.disconnected).toBe(true);
      expect(chrome.actionBarHeight()).toBeNull();
    });
  });
});
