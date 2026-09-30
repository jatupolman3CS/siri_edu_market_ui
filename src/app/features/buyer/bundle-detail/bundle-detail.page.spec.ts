import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BuyerBundleDetailPage } from './bundle-detail.page';
import { BundleService, CartService, WishlistService } from '../../../core/services';
import type { Bundle } from '../../../core/models';
import { idleActionState, loadingActionState, type ActionState } from '../../../core/services/action-state';

/**
 * responsive-ui v1 §4.6 (archetype B) / U2-4: the bundle page keeps its price card as the
 * sticky side column (>=744) and adds a phone-only sticky action bar whose CTAs call the same
 * `addAllToCart()` handler as the price card.
 */
function buildBundle(over: Partial<Bundle> = {}): Bundle {
  return {
    id: 'b-1',
    slug: 'b-1',
    title: 'แพ็กเกจสรุป ม.6',
    description: 'รวมเอกสารคุ้ม ๆ',
    cover: '',
    price: 150,
    originalPrice: 200,
    documentIds: [],
    documentCount: 0,
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

function render(bundle: Bundle | undefined, detailState: ActionState = idleActionState()) {
  const cart = { addBundle: vi.fn(async () => {}), has: () => false, add: vi.fn() };
  TestBed.configureTestingModule({
    imports: [BuyerBundleDetailPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'b-1' })) } },
      {
        provide: BundleService,
        useValue: {
          getById: () => bundle,
          getDocuments: () => [],
          loadBundleDetail: vi.fn(),
          bundleDetailState: () => detailState,
        },
      },
      { provide: CartService, useValue: cart },
      { provide: WishlistService, useValue: { has: () => false, toggle: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(BuyerBundleDetailPage);
  fixture.detectChanges();
  return { fixture, cart, el: fixture.nativeElement as HTMLElement };
}

afterEach(() => TestBed.resetTestingModule());

describe('BuyerBundleDetailPage — responsive layout (responsive-ui v1 §4.6 / U2-4)', () => {
  it('renders a phone sticky action bar with the price and both CTAs', () => {
    const { el } = render(buildBundle());
    const bar = el.querySelector('app-sticky-action-bar [data-testid="bundle-action-bar"]') as HTMLElement;

    expect(bar).toBeTruthy();
    expect(bar.textContent).toContain('150');
    expect(bar.querySelector('[data-testid="bundle-bar-add"]')).toBeTruthy();
    expect(bar.querySelector('[data-testid="bundle-bar-buy"]')).toBeTruthy();
    // A 5-digit price leaves ~75px per label at 360: labels wrap, never end in "…", and are not
    // clamped either (v1.4 §4.3, F125: the clamp cut them off under 150–200% text).
    expect(bar.querySelectorAll('button span.line-clamp-2').length).toBe(0);
    expect(bar.querySelector('button span.truncate')).toBeNull();
    bar.querySelectorAll('button span').forEach((span) => {
      expect(span.className).toContain('[overflow-wrap:anywhere]');
    });
  });

  it('both action-bar CTAs add the bundle through the same handler as the price card', async () => {
    const { el, cart } = render(buildBundle());
    (el.querySelector('[data-testid="bundle-bar-add"]') as HTMLButtonElement).click();
    (el.querySelector('[data-testid="bundle-bar-buy"]') as HTMLButtonElement).click();
    await Promise.resolve();

    expect(cart.addBundle).toHaveBeenCalledTimes(2);
    expect(cart.addBundle).toHaveBeenCalledWith('b-1');
  });

  it('keeps the price card in a sticky side column from 744px (300px column on tablet)', () => {
    const { el } = render(buildBundle());
    const side = el.querySelector('[data-testid="bundle-side"]') as HTMLElement;

    expect(side.className).toContain('md:sticky');
    expect(side.closest('section')?.className).toContain('md:grid-cols-[minmax(0,1fr)_300px]');
    expect(side.querySelector('[data-testid="bundle-price-card"]')).toBeTruthy();
  });

  it('renders no action bar for an unknown bundle', () => {
    const { el } = render(undefined);
    expect(el.querySelector('app-sticky-action-bar')).toBeNull();
  });
});

describe('BuyerBundleDetailPage — v1.4 fixes', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('F118: the savings banner prints the currency once (the translation already carries it)', () => {
    const { el } = render(buildBundle({ price: 150, originalPrice: 350 }));
    const text = el.textContent ?? '';
    expect(text).toContain('ถึง 200 บาท!');
    expect(text).not.toMatch(/฿\s*฿/);
    expect(text).not.toMatch(/฿[\d,.]+\s*บาท/);
  });

  it('shows a skeleton, not "not found", while the bundle is still loading', () => {
    const { el } = render(undefined, loadingActionState());
    expect(el.querySelector('[data-testid="bundle-detail-loading"]')).not.toBeNull();
    expect(el.textContent).not.toContain('ไม่พบแพ็กเกจเอกสาร');
  });

  it('F15: breadcrumb links are 44px targets', () => {
    const { el } = render(buildBundle());
    const crumbs = el.querySelectorAll('nav a');
    expect(crumbs.length).toBe(2);
    crumbs.forEach((a) => expect(a.className).toContain('min-h-11'));
  });
});
