import { TestBed } from '@angular/core/testing';
import { ViewportService } from './viewport.service';

/** Minimal controllable MediaQueryList driven by a shared fake viewport width. */
class FakeMediaQueryList {
  private readonly listeners = new Set<() => void>();
  constructor(
    readonly media: string,
    private readonly minWidth: number,
    private readonly viewport: { width: number },
  ) {}
  get matches(): boolean {
    return this.viewport.width >= this.minWidth;
  }
  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener);
  }
  emit(): void {
    for (const listener of this.listeners) listener();
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

describe('ViewportService', () => {
  const originalMatchMedia = window.matchMedia;
  let viewport: { width: number };
  let lists: FakeMediaQueryList[];

  function installMatchMedia(width: number): void {
    viewport = { width };
    lists = [];
    window.matchMedia = ((query: string) => {
      const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
      const list = new FakeMediaQueryList(query, min, viewport);
      lists.push(list);
      return list as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
  }

  function resize(width: number): void {
    viewport.width = width;
    for (const list of lists) list.emit();
  }

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it.each([
    [360, 'phone'],
    [743, 'phone'],
    [744, 'tablet'],
    [1023, 'tablet'],
    [1024, 'laptop'],
    [1279, 'laptop'],
    [1280, 'desktop'],
    [1440, 'desktop'],
  ] as const)('maps width %d to tier %s', (width, tier) => {
    installMatchMedia(width);
    const service = TestBed.inject(ViewportService);
    expect(service.tier()).toBe(tier);
  });

  it('derives the boolean helpers from the tier', () => {
    installMatchMedia(375);
    const service = TestBed.inject(ViewportService);
    expect(service.isPhone()).toBe(true);
    expect(service.isTabletUp()).toBe(false);
    expect(service.isLaptopUp()).toBe(false);
    expect(service.isDesktop()).toBe(false);

    resize(820);
    expect(service.tier()).toBe('tablet');
    expect(service.isPhone()).toBe(false);
    expect(service.isTabletUp()).toBe(true);
    expect(service.isLaptopUp()).toBe(false);

    resize(1180);
    expect(service.tier()).toBe('laptop');
    expect(service.isLaptopUp()).toBe(true);
    expect(service.isDesktop()).toBe(false);

    resize(1440);
    expect(service.isDesktop()).toBe(true);
    expect(service.isLaptopUp()).toBe(true);
    expect(service.isTabletUp()).toBe(true);
  });

  it('follows matchMedia change events', () => {
    installMatchMedia(1280);
    const service = TestBed.inject(ViewportService);
    expect(service.tier()).toBe('desktop');
    resize(393);
    expect(service.tier()).toBe('phone');
  });

  it('removes its listeners when the injector is destroyed', () => {
    installMatchMedia(1024);
    TestBed.inject(ViewportService);
    expect(lists.every((list) => list.listenerCount === 1)).toBe(true);
    TestBed.resetTestingModule();
    expect(lists.every((list) => list.listenerCount === 0)).toBe(true);
  });

  it('defaults to desktop when matchMedia is unavailable', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    const service = TestBed.inject(ViewportService);
    expect(service.tier()).toBe('desktop');
    expect(service.isDesktop()).toBe(true);
  });
});
