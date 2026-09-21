import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { DocumentCardComponent } from './document-card.component';
import { OptimizedImageComponent } from '../optimized-image/optimized-image.component';
import { AdsService, CartService, QuickViewService, WishlistService } from '../../../core/services';
import { mapDocument } from '../../../core/api-mappers/mappers';
import type { DocumentItem } from '../../../core/models';
import { DEFAULT_LOGO_ASSET_PATH } from '../../directives/img-fallback.directive';

/**
 * seller-ads-promotion v1 (docs/contracts/seller-ads-promotion.md §1.4 "frontend spec", §4.1,
 * §4.3, §4.4) — AC-33/AC-38: the "โฆษณา" badge (DEC-9: visible without hover, reuses the
 * existing `isBestseller`/`isFeatured` pill pattern) and the click-before-navigate wiring through
 * `AdsService` (never the SDK directly — component must go through the service).
 */
function buildDoc(over: Partial<DocumentItem> = {}): DocumentItem {
  return {
    ...mapDocument({ id: 'doc-1', slug: 'doc-1', title: 'สรุปเคมี ม.6', shortDescription: '', price: 100 }),
    ...over,
  };
}

function render(doc: DocumentItem, recordClick = vi.fn(), density?: 'default' | 'compact') {
  TestBed.configureTestingModule({
    imports: [DocumentCardComponent],
    providers: [
      provideRouter([{ path: 'document/:id', component: DocumentCardComponent }]),
      { provide: CartService, useValue: { has: () => false, add: vi.fn() } },
      { provide: WishlistService, useValue: { has: () => false, toggle: vi.fn() } },
      { provide: QuickViewService, useValue: { open: vi.fn() } },
      { provide: AdsService, useValue: { recordClick } },
    ],
  });
  const fixture = TestBed.createComponent(DocumentCardComponent);
  fixture.componentRef.setInput('doc', doc);
  if (density) fixture.componentRef.setInput('density', density);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('DocumentCardComponent — seller-ads-promotion v1 §4.1/§4.3/§4.4 (AC-33/AC-38)', () => {
  it('shows the "โฆษณา" badge, visible without hover, when isSponsored is true', () => {
    const fixture = render(buildDoc({ isSponsored: true, sponsoredCampaignId: 'camp-1' }));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('โฆษณา');
  });

  it('never renders the badge when isSponsored is false/undefined', () => {
    const fixture = render(buildDoc({ isSponsored: false }));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('โฆษณา');
  });

  it('fires AdsService.recordClick(sponsoredCampaignId) on a sponsored card\'s cover click, before navigation', async () => {
    const recordClick = vi.fn();
    const fixture = render(buildDoc({ isSponsored: true, sponsoredCampaignId: 'camp-42' }), recordClick);

    const coverLink = (fixture.nativeElement as HTMLElement).querySelector('a');
    coverLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(recordClick).toHaveBeenCalledWith('camp-42');
  });

  it('never calls recordClick on a non-sponsored card\'s click', async () => {
    const recordClick = vi.fn();
    const fixture = render(buildDoc({ isSponsored: false }), recordClick);

    const coverLink = (fixture.nativeElement as HTMLElement).querySelector('a');
    coverLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(recordClick).not.toHaveBeenCalled();
  });

  it('never prevents navigation in onSponsoredNavigate (§4.3: fire, never block)', () => {
    const fixture = render(buildDoc({ isSponsored: true, sponsoredCampaignId: 'camp-1' }));
    const component = fixture.componentInstance;

    expect(() => component.onSponsoredNavigate()).not.toThrow();
  });
});

/**
 * marketplace-cover-preview-count v1 (docs/contracts/marketplace-cover-preview-count.md §4) —
 * AC-10 dot indicator, AC-11 hover auto-cycle, AC-12 hover-out reset, AC-13 destroy cleanup.
 * Only the `density="compact"` branch is in scope (§0 item 2 / §5: the `@else` default-density
 * branch is dead code and untouched).
 *
 * Judgment call: the spec's verify note names `fakeAsync`/`tick()`, but this repo is zoneless and
 * ships no `zone.js` (confirmed: no `zone.js` dependency, `@angular/build:unit-test` runs on
 * Vitest) — `fakeAsync`/`tick` from `@angular/core/testing` require zone.js patches and cannot
 * work here. `vi.useFakeTimers()` / `vi.advanceTimersByTime()` are the Vitest-native equivalent
 * and exercise the same virtual-time advance + pending-timer assertions the AC list asks for.
 */
describe('DocumentCardComponent — marketplace-cover-preview-count v1 §4 (AC-10..AC-13)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const gallery = ['/img/p1.jpg', '/img/p2.jpg', '/img/p3.jpg'];

  it('AC-10: renders one dot per gallery image, only when gallery.length > 1, index 0 active on first load', () => {
    const fixture = render(buildDoc({ gallery }), vi.fn(), 'compact');
    const component = fixture.componentInstance;

    const dots = (fixture.nativeElement as HTMLElement).querySelectorAll('a.relative.block span.transition-colors');
    expect(dots.length).toBe(gallery.length);
    expect(component.activeGalleryIndex()).toBe(0);
  });

  it('AC-10: renders no dots when the card has 1 or fewer gallery images', () => {
    const fixture = render(buildDoc({ gallery: ['/img/only.jpg'] }), vi.fn(), 'compact');

    const dots = (fixture.nativeElement as HTMLElement).querySelectorAll('a.relative.block span.transition-colors');
    expect(dots.length).toBe(0);
  });

  it('AC-11: cycles displayedCoverUrl()/activeGalleryIndex() forward on hover, wrapping the last index back to 0', () => {
    const fixture = render(buildDoc({ gallery }), vi.fn(), 'compact');
    const component = fixture.componentInstance;
    const coverLink = (fixture.nativeElement as HTMLElement).querySelector('a') as HTMLElement;

    coverLink.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    fixture.detectChanges();
    expect(component.activeGalleryIndex()).toBe(0);

    vi.advanceTimersByTime(1400);
    fixture.detectChanges();
    expect(component.activeGalleryIndex()).toBe(1);
    expect(component.displayedCoverUrl()).toBe(gallery[1]);

    vi.advanceTimersByTime(1400);
    fixture.detectChanges();
    expect(component.activeGalleryIndex()).toBe(2);

    // wrap: last index -> back to 0
    vi.advanceTimersByTime(1400);
    fixture.detectChanges();
    expect(component.activeGalleryIndex()).toBe(0);
    expect(component.displayedCoverUrl()).toBe(gallery[0]);
  });

  it('AC-11: never starts a cycle for a card with 1 or fewer gallery images', () => {
    const fixture = render(buildDoc({ gallery: ['/img/only.jpg'] }), vi.fn(), 'compact');
    const component = fixture.componentInstance;
    const coverLink = (fixture.nativeElement as HTMLElement).querySelector('a') as HTMLElement;

    coverLink.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    fixture.detectChanges();
    vi.advanceTimersByTime(5000);
    fixture.detectChanges();

    expect(component.activeGalleryIndex()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('AC-12: mouseleave resets to index 0 and stops the cycle — time passing after leave changes nothing', () => {
    const fixture = render(buildDoc({ gallery }), vi.fn(), 'compact');
    const component = fixture.componentInstance;
    const coverLink = (fixture.nativeElement as HTMLElement).querySelector('a') as HTMLElement;

    coverLink.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(1400 * 2);
    fixture.detectChanges();
    expect(component.activeGalleryIndex()).toBe(2);

    coverLink.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    fixture.detectChanges();
    expect(component.activeGalleryIndex()).toBe(0);

    vi.advanceTimersByTime(5000);
    fixture.detectChanges();
    expect(component.activeGalleryIndex()).toBe(0);
  });

  it('AC-13: ngOnDestroy clears the pending cycle timer while hovering (no leaked interval)', () => {
    const fixture = render(buildDoc({ gallery }), vi.fn(), 'compact');
    const coverLink = (fixture.nativeElement as HTMLElement).querySelector('a') as HTMLElement;

    coverLink.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    fixture.detectChanges();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    fixture.destroy();

    expect(vi.getTimerCount()).toBe(0);
  });
});

/**
 * image-upload-optimization v2 §4 (AC-28) — cover now renders through the reusable
 * `app-optimized-image` component instead of a bare `<img appImgFallback>`. Only the default
 * (non-compact) branch is covered here — the compact branch's hover-cycle behavior above is
 * untouched by this feature.
 */
describe('DocumentCardComponent — image-upload-optimization v2 (AC-28)', () => {
  it('renders the cover through app-optimized-image', () => {
    const fixture = render(buildDoc());
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-optimized-image')).not.toBeNull();
    const img = el.querySelector('app-optimized-image img') as HTMLImageElement;
    expect(img.src).toBe(buildDoc().cover);
  });

  it('still falls back to the default logo when the cover fails to load (fallback preserved)', () => {
    const fixture = render(buildDoc());
    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector('app-optimized-image img') as HTMLImageElement;

    img.dispatchEvent(new Event('error'));

    expect(img.src.endsWith(DEFAULT_LOGO_ASSET_PATH)).toBe(true);
  });

  it('does not enable the lightbox on the cover (navigation to the detail page takes priority)', () => {
    const fixture = render(buildDoc());
    const optimizedImage = fixture.debugElement.query(By.directive(OptimizedImageComponent));

    expect((optimizedImage.componentInstance as OptimizedImageComponent).lightbox()).toBe(false);
  });
});
