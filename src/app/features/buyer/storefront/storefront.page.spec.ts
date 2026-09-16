import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { of } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BuyerStorefrontPage } from './storefront.page';
import { AuthService, BundleService, CatalogService, FollowService } from '../../../core/services';
import { idleActionState } from '../../../core/services/action-state';
import type { SellerProfileResponse } from '../../../core/api/types.gen';
import type { DocumentItem, SellerSalesByMonthPoint } from '../../../core/models';

/**
 * seller-pricing-and-storefront-stats v1 §3.3/§4 — AC-15/AC-16: the storefront's 6-month
 * units-sold bar chart. `CatalogService.sellerSalesByMonth` is a round-1 stub that always stays
 * `[]` (see catalog.service.ts) — these specs drive it directly via a fake so both the
 * "all-zero ⇒ hidden" (round-1 default) and "has data ⇒ visible, bars scaled to the max month"
 * paths are covered without waiting for round 2's SDK regen.
 */
function sellerProfile(over: Partial<SellerProfileResponse> = {}): SellerProfileResponse {
  return {
    id: 'seller-1',
    studioName: 'Siri Studio',
    ownerName: 'คุณสิริ',
    avatarUrl: null,
    bannerUrl: null,
    bio: 'ร้านเอกสารคุณภาพ',
    joinedAt: '2025-01-01T00:00:00Z',
    rating: 4.8,
    totalSales: 120,
    totalDocuments: 30,
    followerCount: 50,
    responseHours: 2,
    isVerified: true,
    badges: [],
    specialties: [],
    ...over,
  };
}

function render(salesByMonth: SellerSalesByMonthPoint[]) {
  const fakeCatalog: Partial<CatalogService> = {
    sellerProfile: signal<SellerProfileResponse | null>(sellerProfile()).asReadonly(),
    sellerProfileState: signal(idleActionState()).asReadonly(),
    sellerDocuments: signal<DocumentItem[]>([]),
    sellerDocumentsState: signal(idleActionState()).asReadonly(),
    sellerSalesByMonth: signal(salesByMonth).asReadonly(),
    loadSellerProfile: vi.fn(async () => sellerProfile()),
    loadSellerDocuments: vi.fn(),
  };
  const fakeBundle: Partial<BundleService> = { getBySellerId: () => [] };
  const fakeFollow: Partial<FollowService> = {
    isFollowing: () => false,
    hydrateFromApi: vi.fn(async () => {}),
    setFollowing: vi.fn(),
    toggle: vi.fn(async () => false),
  };

  TestBed.configureTestingModule({
    imports: [BuyerStorefrontPage],
    providers: [
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'seller-1' })) } },
      { provide: CatalogService, useValue: fakeCatalog },
      { provide: BundleService, useValue: fakeBundle },
      { provide: FollowService, useValue: fakeFollow },
      { provide: NzMessageService, useValue: { success: vi.fn(), info: vi.fn() } },
    ],
  });

  const fixture = TestBed.createComponent(BuyerStorefrontPage);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance };
}

afterEach(() => TestBed.resetTestingModule());

describe('BuyerStorefrontPage — sales-by-month chart (seller-pricing-and-storefront-stats v1 §4)', () => {
  it('AC-15: hides the chart section entirely when all 6 months are 0 (round-1 default: [])', () => {
    const { fixture, component } = render([]);

    expect(component.totalUnitsSoldInWindow()).toBe(0);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ยอดขายรายเดือน');
  });

  it('AC-15: hides the chart when salesByMonth is populated but every month is 0', () => {
    const zeroed: SellerSalesByMonthPoint[] = [
      { month: 'Apr', unitsSold: 0 },
      { month: 'May', unitsSold: 0 },
      { month: 'Jun', unitsSold: 0 },
      { month: 'Jul', unitsSold: 0 },
      { month: 'Aug', unitsSold: 0 },
      { month: 'Sep', unitsSold: 0 },
    ];
    const { fixture, component } = render(zeroed);

    expect(component.totalUnitsSoldInWindow()).toBe(0);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ยอดขายรายเดือน');
  });

  it('AC-16: shows the chart with 6 bars when at least one month has sales, scaled to the max month', () => {
    const data: SellerSalesByMonthPoint[] = [
      { month: 'Apr', unitsSold: 0 },
      { month: 'May', unitsSold: 3 },
      { month: 'Jun', unitsSold: 0 },
      { month: 'Jul', unitsSold: 10 },
      { month: 'Aug', unitsSold: 5 },
      { month: 'Sep', unitsSold: 2 },
    ];
    const { fixture, component } = render(data);

    expect(component.totalUnitsSoldInWindow()).toBe(20);
    expect(component.maxUnitsSold()).toBe(10);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยอดขายรายเดือน');

    const bars = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.bg-gradient-to-t.from-pink-400.to-pink-200',
    );
    expect(bars.length).toBe(6);
    // Jul (10 units) is the max month → 100% height.
    const julBarHeight = (bars[3] as HTMLElement).style.height;
    expect(julBarHeight).toBe('100%');
    // May (3 units) → 30% of the max (10).
    const mayBarHeight = (bars[1] as HTMLElement).style.height;
    expect(mayBarHeight).toBe('30%');
  });

  it('AC-16: the floor of 1 in maxUnitsSold avoids divide-by-zero when only one non-zero month exists', () => {
    const data: SellerSalesByMonthPoint[] = [
      { month: 'Apr', unitsSold: 0 },
      { month: 'May', unitsSold: 0 },
      { month: 'Jun', unitsSold: 0 },
      { month: 'Jul', unitsSold: 0 },
      { month: 'Aug', unitsSold: 0 },
      { month: 'Sep', unitsSold: 1 },
    ];
    const { component } = render(data);

    expect(component.maxUnitsSold()).toBe(1);
    expect(component.totalUnitsSoldInWindow()).toBe(1);
  });
});

describe('BuyerStorefrontPage — toggleFollow', () => {
  it('updates follower count when follow state changes', async () => {
    let following = false;
    const fakeCatalog: Partial<CatalogService> = {
      sellerProfile: signal<SellerProfileResponse | null>(sellerProfile()).asReadonly(),
      sellerProfileState: signal(idleActionState()).asReadonly(),
      sellerDocuments: signal<DocumentItem[]>([]),
      sellerDocumentsState: signal(idleActionState()).asReadonly(),
      sellerSalesByMonth: signal([]).asReadonly(),
      loadSellerProfile: vi.fn(async () => sellerProfile()),
      loadSellerDocuments: vi.fn(),
      updateSellerFollowerCount: vi.fn(),
    };
    const fakeFollow: Partial<FollowService> = {
      isFollowing: vi.fn(() => following),
      hydrateFromApi: vi.fn(async () => {}),
      setFollowing: vi.fn(),
      toggle: vi.fn(async () => {
        following = !following;
        return following;
      }),
    };
    const fakeAuth = {
      isAuthenticated: () => true,
      user: signal({ id: 'buyer-user' }),
    };
    const fakeMessage = { success: vi.fn(), info: vi.fn(), warning: vi.fn() };

    TestBed.configureTestingModule({
      imports: [BuyerStorefrontPage],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'seller-1' })) } },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: fakeCatalog },
        { provide: BundleService, useValue: { getBySellerId: () => [] } },
        { provide: FollowService, useValue: fakeFollow },
        { provide: NzMessageService, useValue: fakeMessage },
      ],
    });

    const fixture = TestBed.createComponent(BuyerStorefrontPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    await component.toggleFollow();
    expect(fakeCatalog.updateSellerFollowerCount).toHaveBeenCalledWith(1, 'seller-1');
    expect(fakeMessage.success).toHaveBeenCalled();

    // Toggle again (unfollow)
    await component.toggleFollow();
    expect(fakeCatalog.updateSellerFollowerCount).toHaveBeenCalledWith(-1, 'seller-1');
    expect(fakeMessage.info).toHaveBeenCalled();
  });

  it('does not update follower count if toggle follow fails / state unchanged', async () => {
    const fakeCatalog: Partial<CatalogService> = {
      sellerProfile: signal<SellerProfileResponse | null>(sellerProfile()).asReadonly(),
      sellerProfileState: signal(idleActionState()).asReadonly(),
      sellerDocuments: signal<DocumentItem[]>([]),
      sellerDocumentsState: signal(idleActionState()).asReadonly(),
      sellerSalesByMonth: signal([]).asReadonly(),
      loadSellerProfile: vi.fn(async () => sellerProfile()),
      loadSellerDocuments: vi.fn(),
      updateSellerFollowerCount: vi.fn(),
    };
    const fakeFollow: Partial<FollowService> = {
      isFollowing: vi.fn(() => false), // stays false
      hydrateFromApi: vi.fn(async () => {}),
      setFollowing: vi.fn(),
      toggle: vi.fn(async () => false), // fails and returns false
    };
    const fakeAuth = {
      isAuthenticated: () => true,
      user: signal({ id: 'buyer-user' }),
    };
    const fakeMessage = { success: vi.fn(), info: vi.fn(), warning: vi.fn() };

    TestBed.configureTestingModule({
      imports: [BuyerStorefrontPage],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'seller-1' })) } },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: fakeCatalog },
        { provide: BundleService, useValue: { getBySellerId: () => [] } },
        { provide: FollowService, useValue: fakeFollow },
        { provide: NzMessageService, useValue: fakeMessage },
      ],
    });

    const fixture = TestBed.createComponent(BuyerStorefrontPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    await component.toggleFollow();
    expect(fakeCatalog.updateSellerFollowerCount).not.toHaveBeenCalled();
    expect(fakeMessage.success).not.toHaveBeenCalled();
    expect(fakeMessage.info).not.toHaveBeenCalled();
  });
});

/**
 * seo-ssr v1 §1.4 group C (AC-16/AC-17) — dynamic title/meta description/canonical link/JSON-LD
 * (`ProfilePage` wrapping `Organization`, DEC-9: no `aggregateRating`) for `/store/:id`. `Title`/
 * `Meta` are the real Angular services here, so the assertions prove the tags actually land in
 * the DOM.
 */
describe('BuyerStorefrontPage — SEO meta (seo-ssr v1)', () => {
  async function flushMicrotasks(times = 5): Promise<void> {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  }

  function renderWithProfile(profile: SellerProfileResponse, sellerId = 'seller-1') {
    const fakeCatalog: Partial<CatalogService> = {
      sellerProfile: signal<SellerProfileResponse | null>(profile).asReadonly(),
      sellerProfileState: signal(idleActionState()).asReadonly(),
      sellerDocuments: signal<DocumentItem[]>([]),
      sellerDocumentsState: signal(idleActionState()).asReadonly(),
      sellerSalesByMonth: signal([]).asReadonly(),
      loadSellerProfile: vi.fn(async () => profile),
      loadSellerDocuments: vi.fn(),
    };
    const fakeFollow: Partial<FollowService> = {
      isFollowing: () => false,
      hydrateFromApi: vi.fn(async () => {}),
      setFollowing: vi.fn(),
      toggle: vi.fn(async () => false),
    };

    TestBed.configureTestingModule({
      imports: [BuyerStorefrontPage],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: sellerId })) } },
        { provide: CatalogService, useValue: fakeCatalog },
        { provide: BundleService, useValue: { getBySellerId: () => [] } },
        { provide: FollowService, useValue: fakeFollow },
        { provide: NzMessageService, useValue: { success: vi.fn(), info: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(BuyerStorefrontPage);
    fixture.detectChanges();
    return { fixture, titleService: TestBed.inject(Title), meta: TestBed.inject(Meta) };
  }

  afterEach(() => {
    document.getElementById('seo-json-ld')?.remove();
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  it('AC-16: sets document.title, meta description, canonical link, and a parseable ProfilePage/Organization JSON-LD', async () => {
    const profile = sellerProfile({ studioName: 'ครูเอ สตูดิโอ', bio: 'ร้านเอกสารคุณภาพ' });
    const { titleService, meta } = renderWithProfile(profile);
    await flushMicrotasks();

    expect(titleService.getTitle()).toBe('ครูเอ สตูดิโอ — SIRIEDUMARKET');
    expect(meta.getTag('name="description"')?.content).toBe('ร้านเอกสารคุณภาพ');

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe(`${window.location.origin}/store/seller-1`);

    const script = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script!.text) as Record<string, unknown>;
    expect(data['@type']).toBe('ProfilePage');
    const mainEntity = data['mainEntity'] as Record<string, unknown>;
    expect(mainEntity['@type']).toBe('Organization');
    expect(mainEntity['aggregateRating']).toBeUndefined();
  });

  it('AC-17: navigating from one store to another does not leave a stale title/JSON-LD', async () => {
    const sellerA = sellerProfile({ id: 'seller-a', studioName: 'ร้าน A' });
    const { titleService: titleA } = renderWithProfile(sellerA, 'seller-a');
    await flushMicrotasks();
    expect(titleA.getTitle()).toContain('ร้าน A');

    TestBed.resetTestingModule();
    const sellerB = sellerProfile({ id: 'seller-b', studioName: 'ร้าน B' });
    const { titleService: titleB } = renderWithProfile(sellerB, 'seller-b');
    await flushMicrotasks();
    expect(titleB.getTitle()).toContain('ร้าน B');
    expect(titleB.getTitle()).not.toContain('ร้าน A');

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBe(1);
    const data = JSON.parse((scripts[0] as HTMLScriptElement).text) as Record<string, unknown>;
    expect((data['mainEntity'] as Record<string, unknown>)['name']).toBe('ร้าน B');
  });
});

