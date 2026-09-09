import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BuyerStorefrontPage } from './storefront.page';
import { BundleService, CatalogService, FollowService } from '../../../core/services';
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
    toggle: () => false,
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
