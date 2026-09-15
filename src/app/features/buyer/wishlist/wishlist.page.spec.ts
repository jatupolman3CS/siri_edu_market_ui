import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { BuyerWishlistPage } from './wishlist.page';
import {
  AdsService,
  CartService,
  QuickViewService,
  WishlistService,
} from '../../../core/services';
import { mapDocument } from '../../../core/api-mappers/mappers';
import type { DocumentItem } from '../../../core/models';

/**
 * wishlist-price-drop-alerts v1 (docs/contracts/wishlist-price-drop-alerts.md §3.3, §4) — AC-20:
 * the "ราคาลดแล้ว!" badge renders for wishlist items whose `hasPriceDropped` came back `true`,
 * and never for the rest. Badge sits outside `DocumentCardComponent` (§4), so this asserts against
 * the page's own template, not the card's.
 */
function buildDoc(id: string, over: Partial<DocumentItem> = {}): DocumentItem {
  return {
    ...mapDocument({ id, slug: id, title: `เอกสาร ${id}`, shortDescription: '', price: 100 }),
    ...over,
  };
}

function render(items: DocumentItem[]) {
  TestBed.configureTestingModule({
    imports: [BuyerWishlistPage],
    providers: [
      provideRouter([{ path: 'marketplace', component: BuyerWishlistPage }]),
      {
        provide: WishlistService,
        useValue: {
          items: signal(items),
          hasMore: signal(false),
          count: signal(items.length),
          state: signal({ status: 'idle' }),
          has: () => false,
          toggle: vi.fn(),
          refresh: vi.fn(),
          loadMore: vi.fn(),
          clear: vi.fn(),
        },
      },
      { provide: CartService, useValue: { has: () => false, add: vi.fn() } },
      { provide: QuickViewService, useValue: { open: vi.fn() } },
      { provide: AdsService, useValue: { recordClick: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(BuyerWishlistPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('BuyerWishlistPage — wishlist-price-drop-alerts v1 §4 (AC-20)', () => {
  it('shows "ราคาลดแล้ว!" badge for a document whose hasPriceDropped is true', () => {
    const fixture = render([buildDoc('doc-1', { hasPriceDropped: true })]);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ราคาลดแล้ว!');
  });

  it('never shows the badge when hasPriceDropped is false', () => {
    const fixture = render([buildDoc('doc-1', { hasPriceDropped: false })]);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ราคาลดแล้ว!');
  });

  it('never shows the badge when hasPriceDropped is undefined', () => {
    const fixture = render([buildDoc('doc-1', { hasPriceDropped: undefined })]);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ราคาลดแล้ว!');
  });

  it('shows the badge only for the dropped document when the list is mixed', () => {
    const fixture = render([
      buildDoc('doc-1', { hasPriceDropped: true }),
      buildDoc('doc-2', { hasPriceDropped: false }),
    ]);

    const badges = (fixture.nativeElement as HTMLElement).querySelectorAll('.pill.bg-pink-500');
    const badgeTexts = Array.from(badges).map((el) => el.textContent?.trim());
    expect(badgeTexts.some((t) => t?.includes('ราคาลดแล้ว!'))).toBe(true);
    expect(badges.length).toBe(1);
  });
});
