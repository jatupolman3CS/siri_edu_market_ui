import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PlatformStatsService, SellerService } from '../../../core/services';
import { SellerEarningsPage } from './earnings.page';
import { DEFAULT_SELLER_INSIGHTS, DEFAULT_STORE_READINESS } from '../../../core/models';
import type { PlatformStats, SellerStats } from '../../../core/models';

/**
 * real-data-stats v1 §4.6 — Seller earnings page:
 *  - "ส่วนแบ่งของคุณ" reads `PlatformStatsService.stats()?.feeRatePercent`, fallback 90 while loading
 *  - "เดือนนี้" trend badge hidden entirely when `revenueTrendPercent` is null/undefined
 *  - "โอนรอบถัดไป" line hidden entirely when `nextPayoutDate()` is null
 */
function buildStats(over: Partial<SellerStats> = {}): SellerStats {
  return {
    totalRevenue: 100000,
    monthlyRevenue: 20000,
    totalDownloads: 500,
    monthlyDownloads: 40,
    averageRating: 4.7,
    totalReviews: 40,
    pendingPayout: 5000,
    activeListings: 12,
    pendingApproval: 1,
    followerCount: 80,
    newFollowersThisMonth: 3,
    revenueByMonth: [],
    topCategories: [],
    storeReadiness: DEFAULT_STORE_READINESS,
    insights: DEFAULT_SELLER_INSIGHTS,
    ...over,
  };
}

function render(opts: {
  stats?: Partial<SellerStats>;
  nextPayoutDate?: string | null;
  platformStats?: PlatformStats;
  sellerProfileRequired?: boolean;
}) {
  const fakeSeller = {
    stats: () => buildStats(opts.stats),
    earnings: () => ({ totalEarnings: 5000, pendingBalance: 1200, payouts: [] }),
    nextPayoutDate: () => opts.nextPayoutDate ?? null,
    sellerProfileRequired: () => opts.sellerProfileRequired ?? false,
    loadEarnings: vi.fn(async () => {}),
    refreshDashboard: vi.fn(async () => {}),
    requestPayout: vi.fn(async () => ({ ok: true })),
    loadPayoutsPaged: vi.fn(async () => ({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 1 })),
  };
  const fakePlatformStats = { stats: () => opts.platformStats, loadStats: vi.fn() };

  TestBed.configureTestingModule({
    imports: [SellerEarningsPage],
    providers: [
      provideRouter([]),
      { provide: SellerService, useValue: fakeSeller },
      { provide: PlatformStatsService, useValue: fakePlatformStats },
    ],
  });

  const fixture = TestBed.createComponent(SellerEarningsPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('SellerEarningsPage — fee % (real-data-stats v1 §4.6)', () => {
  it('falls back to 90% while platform stats have not loaded', () => {
    const fixture = render({ platformStats: undefined });

    expect(fixture.componentInstance.sellerSharePercent()).toBe(90);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('90%');
  });

  it('uses the real feeRatePercent once platform stats load', () => {
    const fixture = render({
      platformStats: {
        totalApprovedDocuments: 1,
        totalSellers: 1,
        totalDownloads: 1,
        reviewCount: 1,
        feeRatePercent: 20,
      },
    });

    expect(fixture.componentInstance.sellerSharePercent()).toBe(80);
  });
});

describe('SellerEarningsPage — trend badge (real-data-stats v1 §3.4/§4.6)', () => {
  it('hides the "เดือนนี้" trend badge when revenueTrendPercent is undefined', () => {
    const fixture = render({ stats: { revenueTrendPercent: undefined } });

    expect(fixture.componentInstance.revenueTrendDisplay()).toBeNull();
  });

  it('shows the formatted trend once the backend sends a real value', () => {
    const fixture = render({ stats: { revenueTrendPercent: 18.4 } });

    expect(fixture.componentInstance.revenueTrendDisplay()).toBe('+18.4%');
  });
});

describe('SellerEarningsPage — โอนรอบถัดไป (real-data-stats v1 §3.5/§4.6)', () => {
  it('hides the line entirely when nextPayoutDate is null', () => {
    const fixture = render({ nextPayoutDate: null });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('โอนรอบถัดไป');
  });

  it('shows the formatted date when nextPayoutDate has a value', () => {
    const fixture = render({ nextPayoutDate: '2026-05-15' });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('โอนรอบถัดไป');
    expect(text).toContain('2026');
  });
});

describe('SellerEarningsPage — seller_profile_required (QA fix: friendly 403 state)', () => {
  it('shows a friendly "no store yet" state instead of the earnings content', () => {
    const fixture = render({ sellerProfileRequired: true });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ร้านนี้ยังไม่มีร้านค้า');
    expect(text).not.toContain('รายได้ & Payout');

    const becomeSellerLink = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href="/become-seller"]',
    );
    expect(becomeSellerLink).toBeTruthy();
  });

  it('shows the normal earnings page when the account has a seller profile', () => {
    const fixture = render({ sellerProfileRequired: false });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('รายได้ & Payout');
    expect(text).not.toContain('ร้านนี้ยังไม่มีร้านค้า');
  });
});
