import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, UrlSerializer, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { NavigationSourceService } from './navigation-source.service';

/**
 * seller-analytics-insights v1 §4 test list — `classifyEntrySource()`:
 *  - AC-17: `/marketplace?q=...` (non-empty, trimmed) → source:"search" + searchTerm
 *  - AC-18: `/category/:slug` or `/marketplace?category=...`/`?subcategory=...` (no q) → source:"category"
 *  - AC-19: everything else, or no prior navigation at all → source:"direct"
 *  - the timing note in §4: `classifyEntrySource()` must read the URL of the *previous* completed
 *    navigation, not the one currently in flight (its `NavigationEnd` hasn't fired yet).
 *
 * `router.events` is replaced with a plain `Subject` we control by hand — `parseUrl` still
 * delegates to the real `UrlSerializer` so path/query parsing behaves exactly like production,
 * without needing an actual route table or real navigation timing.
 */

function buildService(): { service: NavigationSourceService; events$: Subject<NavigationEnd> } {
  const events$ = new Subject<NavigationEnd>();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: Router,
        useFactory: (serializer: UrlSerializer) => ({
          events: events$,
          parseUrl: (url: string) => serializer.parse(url),
        }),
        deps: [UrlSerializer],
      },
    ],
  });
  return { service: TestBed.inject(NavigationSourceService), events$ };
}

function emitNavigationEnd(events$: Subject<NavigationEnd>, url: string): void {
  events$.next(new NavigationEnd(1, url, url));
}

afterEach(() => TestBed.resetTestingModule());

describe('NavigationSourceService — no prior navigation (AC-19: fresh session)', () => {
  it('classifies as direct when nothing has navigated yet', () => {
    const { service } = buildService();

    expect(service.classifyEntrySource()).toEqual({ source: 'direct' });
  });
});

describe('NavigationSourceService — search (AC-17)', () => {
  it('classifies /marketplace?q=... as search with the trimmed search term', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/marketplace?q=' + encodeURIComponent('  เลข ม.3  '));

    expect(service.classifyEntrySource()).toEqual({ source: 'search', searchTerm: 'เลข ม.3' });
  });

  it('an empty/whitespace-only q does not count as search', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/marketplace?q=' + encodeURIComponent('   '));

    expect(service.classifyEntrySource()).toEqual({ source: 'direct' });
  });
});

describe('NavigationSourceService — category (AC-18)', () => {
  it('classifies /category/:slug as category', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/category/math');

    expect(service.classifyEntrySource()).toEqual({ source: 'category' });
  });

  it('classifies /marketplace?category=... (no q) as category', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/marketplace?category=math');

    expect(service.classifyEntrySource()).toEqual({ source: 'category' });
  });

  it('classifies /marketplace?subcategory=... (no q) as category', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/marketplace?subcategory=algebra');

    expect(service.classifyEntrySource()).toEqual({ source: 'category' });
  });

  it('q takes priority over category when both are present', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/marketplace?q=math&category=math');

    expect(service.classifyEntrySource()).toEqual({ source: 'search', searchTerm: 'math' });
  });
});

describe('NavigationSourceService — direct (AC-19: everything else)', () => {
  it('classifies the home page as direct', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/');

    expect(service.classifyEntrySource()).toEqual({ source: 'direct' });
  });

  it('classifies /marketplace with no q/category/subcategory as direct', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/marketplace');

    expect(service.classifyEntrySource()).toEqual({ source: 'direct' });
  });

  it('classifies a seller storefront as direct', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/store/seller-1');

    expect(service.classifyEntrySource()).toEqual({ source: 'direct' });
  });

  it('classifies wishlist as direct', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/wishlist');

    expect(service.classifyEntrySource()).toEqual({ source: 'direct' });
  });

  it('classifies an exam hub landing page as direct', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/tcas');

    expect(service.classifyEntrySource()).toEqual({ source: 'direct' });
  });
});

describe('NavigationSourceService — timing (§4 "หมายเหตุสำคัญเรื่อง timing")', () => {
  it('reflects the previous completed navigation, not the one currently in flight', () => {
    const { service, events$ } = buildService();

    emitNavigationEnd(events$, '/marketplace?q=math');
    // At this point a real document-detail page's constructor would run and call
    // classifyEntrySource() — the NavigationEnd for navigating INTO /document/xyz has not fired
    // yet, so it must still see the marketplace URL.
    expect(service.classifyEntrySource()).toEqual({ source: 'search', searchTerm: 'math' });

    // Only now does the navigation into /document/xyz itself complete.
    emitNavigationEnd(events$, '/document/xyz');
    // A subsequent navigation reads /document/xyz as its "previous" page (not part of the 3-way
    // attribution, so it falls back to direct) — proving the service actually advanced instead of
    // staying stuck on the first value.
    expect(service.classifyEntrySource()).toEqual({ source: 'direct' });
  });
});
