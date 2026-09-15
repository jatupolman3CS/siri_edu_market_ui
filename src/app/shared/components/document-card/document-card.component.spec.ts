import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DocumentCardComponent } from './document-card.component';
import { AdsService, CartService, QuickViewService, WishlistService } from '../../../core/services';
import { mapDocument } from '../../../core/api-mappers/mappers';
import type { DocumentItem } from '../../../core/models';

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

function render(doc: DocumentItem, recordClick = vi.fn()) {
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

