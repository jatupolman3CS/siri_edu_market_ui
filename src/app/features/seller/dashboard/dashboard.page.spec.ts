import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SellerDashboardPage } from './dashboard.page';
import { PlatformStatsService, SellerService } from '../../../core/services';
import type { PlatformStats, SellerStats } from '../../../core/models';

/**
 * real-data-stats v1 §4.6 — Seller dashboard:
 *  - fee % (was hardcoded 90%/10% in 3 spots) reads `PlatformStatsService.stats()`, fallback 10
 *    only while loading (never a fabricated-looking committed value)
 *  - revenue/rating trend badges hidden entirely (not "+0%"/"+0.00") when the field is null
 *  - "ดาวน์โหลด" trend badge removed outright (no backend field exists for it — §5)
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
    revenueByMonth: [{ month: 'ม.ค.', amount: 1000 }],
    topCategories: [{ category: 'คณิตศาสตร์', sales: 10 }],
    ...over,
  };
}

function render(opts: {
  stats?: Partial<SellerStats>;
  nextPayoutDate?: string | null;
  platformStats?: PlatformStats;
}) {
  const fakeSeller = {
    stats: () => buildStats(opts.stats),
    myDocuments: () => [],
    nextPayoutDate: () => opts.nextPayoutDate ?? null,
    refreshDashboard: vi.fn(async () => {}),
    loadEarnings: vi.fn(async () => {}),
  };
  const fakePlatformStats = {
    stats: () => opts.platformStats,
    loadStats: vi.fn(),
  };

  TestBed.configureTestingModule({
    imports: [SellerDashboardPage],
    providers: [
      provideRouter([]),
      { provide: SellerService, useValue: fakeSeller },
      { provide: PlatformStatsService, useValue: fakePlatformStats },
    ],
  });

  const fixture = TestBed.createComponent(SellerDashboardPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('SellerDashboardPage — fee % (real-data-stats v1 §4.6)', () => {
  it('falls back to 90/10 while platform stats have not loaded (avoids a flash to 0)', () => {
    const fixture = render({ platformStats: undefined });

    const page = fixture.componentInstance;
    expect(page.feeRatePercent()).toBe(10);
    expect(page.sellerSharePercent()).toBe(90);
  });

  it('uses the real feeRatePercent once platform stats load', () => {
    const fixture = render({
      platformStats: {
        totalApprovedDocuments: 1,
        totalSellers: 1,
        totalDownloads: 1,
        reviewCount: 1,
        feeRatePercent: 15,
      },
    });

    const page = fixture.componentInstance;
    expect(page.feeRatePercent()).toBe(15);
    expect(page.sellerSharePercent()).toBe(85);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('85%');
    expect(text).toContain('15%');
  });
});

describe('SellerDashboardPage — trend badges (real-data-stats v1 §3.4/§4.6)', () => {
  it('hides the revenue and rating trend badges when the fields are undefined/null', () => {
    const fixture = render({ stats: { revenueTrendPercent: undefined, ratingTrendDelta: undefined } });

    const page = fixture.componentInstance;
    expect(page.revenueTrendDisplay()).toBeNull();
    expect(page.ratingTrendDisplay()).toBeNull();
  });

  it('shows the formatted revenue/rating trend once the backend sends real values', () => {
    const fixture = render({ stats: { revenueTrendPercent: 18.4, ratingTrendDelta: -0.12 } });

    const page = fixture.componentInstance;
    expect(page.revenueTrendDisplay()).toBe('+18.4%');
    expect(page.ratingTrendDisplay()).toBe('-0.12');
  });

  it('never renders a downloads trend badge — no field exists for it (§5)', () => {
    const fixture = render({});

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('+12%');
  });
});

describe('SellerDashboardPage — โอนรอบถัดไป (real-data-stats v1 §3.5/§4.6)', () => {
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
