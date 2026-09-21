import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BundleCardComponent } from './bundle-card.component';
import type { Bundle } from '../../../core/models';
import { CartService } from '../../../core/services';

const addBundle = vi.fn(async () => ({ ok: true }));

/**
 * Q-07 item 3: the home page's bundle grid ("แพ็กคณิตศาสตร์ ตะลุยโจทย์ #1220" in the QA report)
 * showed "− ฿-350" when a bundle's `price` was greater than its `originalPrice` — `savings()`
 * used to compute the raw, unclamped `originalPrice - price` by hand instead of the shared
 * `calcBundleSaveAmount`/`calcBundleSavePercent` helpers (both `Math.max(0, …)`-guarded) that
 * `document-bundle-cross-sell` already uses elsewhere.
 */
function buildBundle(over: Partial<Bundle> = {}): Bundle {
  return {
    id: 'bun-1',
    slug: 'bun-1',
    title: 'แพ็กคณิตศาสตร์ ตะลุยโจทย์',
    description: 'รวมเอกสารคุ้ม ๆ',
    cover: 'https://example.test/cover.jpg',
    price: 150,
    originalPrice: 200,
    documentIds: ['doc-1', 'doc-2'],
    documentCount: 2,
    seller: {
      id: 'seller-1',
      studioName: 'ครูเอ',
      ownerName: 'เอ',
      avatar: '',
      bio: '',
      joinedAt: '2026-01-01T00:00:00Z',
      rating: 4.5,
      totalSales: 10,
      totalDocuments: 5,
      followerCount: 20,
      responseHours: 1,
      badges: [],
    },
    createdAt: '2026-01-01T00:00:00Z',
    rating: 4.7,
    reviewCount: 12,
    downloads: 340,
    ...over,
  };
}

function render(bundle: Bundle) {
  TestBed.configureTestingModule({
    imports: [BundleCardComponent],
    providers: [provideRouter([]), { provide: CartService, useValue: { addBundle } }],
  });
  const fixture = TestBed.createComponent(BundleCardComponent);
  fixture.componentRef.setInput('bundle', bundle);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => {
  addBundle.mockClear();
  TestBed.resetTestingModule();
});

describe('BundleCardComponent — savings (Q-07 item 3)', () => {
  it('shows the "− ฿N" savings line when originalPrice > price', () => {
    const fixture = render(buildBundle({ price: 150, originalPrice: 200 }));
    const component = fixture.componentInstance;

    expect(component.savings()).toBe(50);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('฿50');
  });

  it('never shows a negative savings amount when price > originalPrice (bad data)', () => {
    const fixture = render(buildBundle({ price: 551, originalPrice: 201 }));
    const component = fixture.componentInstance;

    expect(component.savings()).toBe(0);
    expect(component.savingsPercent()).toBe(0);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('-350');
    expect(text).not.toContain('−-');
  });

  it('hides the savings line entirely (not "− ฿0") when there is nothing to save', () => {
    const fixture = render(buildBundle({ price: 200, originalPrice: 200 }));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('−');
  });
  it('adds the bundle to the cart from the card buy button', async () => {
    const fixture = render(buildBundle());
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');

    button?.click();
    await fixture.whenStable();

    expect(addBundle).toHaveBeenCalledWith('bun-1');
  });
});
