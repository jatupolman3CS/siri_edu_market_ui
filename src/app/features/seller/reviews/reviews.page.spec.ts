import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SellerService } from '../../../core/services';
import { SellerReviewsPage } from './reviews.page';
import { DEFAULT_SELLER_INSIGHTS, DEFAULT_STORE_READINESS } from '../../../core/models';
import type { SellerStats } from '../../../core/models';

/**
 * QA fix: `loadReviews()` used to call `apiFail.report(...)` unconditionally on any error,
 * so an Admin browsing Seller Studio without a `SELLER_PROFILE` row got a noisy red toast on
 * every load of /seller/reviews instead of the same friendly "no store yet" empty state the
 * dashboard/documents/bundles pages already show for the same `403 seller_profile_required`.
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
  sellerProfileRequired?: boolean;
  reviews?: Array<{
    id: string;
    documentTitle: string;
    buyerName: string;
    buyerAvatarUrl: string;
    rating: number;
    comment: string;
    createdAt: string;
    sellerReplyText?: string | null;
    sellerRepliedAt?: string | null;
  }>;
}) {
  const fakeSeller = {
    stats: () => buildStats(opts.stats),
    sellerProfileRequired: () => opts.sellerProfileRequired ?? false,
    refreshDashboard: vi.fn(async () => {}),
    loadReviews: vi.fn(async () => opts.reviews ?? []),
    loadReviewsPaged: vi.fn(async (page = 1, pageSize = 20) => ({
      items: opts.reviews ?? [],
      totalCount: (opts.reviews ?? []).length,
      page,
      pageSize,
      totalPages: 1,
    })),
  };

  TestBed.configureTestingModule({
    imports: [SellerReviewsPage],
    providers: [provideRouter([]), { provide: SellerService, useValue: fakeSeller }],
  });

  const fixture = TestBed.createComponent(SellerReviewsPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('SellerReviewsPage — seller_profile_required (QA fix: friendly 403 state)', () => {
  it('shows a friendly "no store yet" state instead of the reviews content', () => {
    const fixture = render({ sellerProfileRequired: true });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ร้านนี้ยังไม่มีร้านค้า');
    expect(text).not.toContain('รีวิวลูกค้า');

    const becomeSellerLink = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href="/become-seller"]',
    );
    expect(becomeSellerLink).toBeTruthy();
  });

  it('shows the normal reviews page when the account has a seller profile', () => {
    const fixture = render({ sellerProfileRequired: false });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('รีวิวลูกค้า');
    expect(text).not.toContain('ร้านนี้ยังไม่มีร้านค้า');
  });
});

describe('SellerReviewsPage — review rows', () => {
  it('renders loaded review rows', async () => {
    const fixture = render({
      reviews: [
        {
          id: 'r1',
          documentTitle: 'ข้อสอบคณิต ป.6',
          buyerName: 'สมชาย ใจดี',
          buyerAvatarUrl: '',
          rating: 5,
          comment: 'ดีมากเลยค่ะ',
          createdAt: '2026-01-01T00:00:00Z',
          sellerReplyText: null,
          sellerRepliedAt: null,
        },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('สมชาย ใจดี');
    expect(text).toContain('ดีมากเลยค่ะ');
  });

  it('computes reviewStats (positivePct, replyPct, avgHours) accurately from loaded reviews', async () => {
    const fixture = render({
      reviews: [
        {
          id: 'r1',
          documentTitle: 'Doc 1',
          buyerName: 'Buyer 1',
          buyerAvatarUrl: '',
          rating: 5,
          comment: 'Great',
          createdAt: '2026-01-01T10:00:00Z',
          sellerReplyText: 'Thank you!',
          sellerRepliedAt: '2026-01-01T12:00:00Z', // 2 hours
        },
        {
          id: 'r2',
          documentTitle: 'Doc 2',
          buyerName: 'Buyer 2',
          buyerAvatarUrl: '',
          rating: 3,
          comment: 'OK',
          createdAt: '2026-01-02T10:00:00Z',
          sellerReplyText: null,
          sellerRepliedAt: null,
        },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const stats = fixture.componentInstance.reviewStats();
    expect(stats.positivePct).toBe(50); // 1 out of 2 is >= 4
    expect(stats.replyPct).toBe(50); // 1 out of 2 replied
    expect(stats.avgHours).toBeCloseTo(2.0); // 2 hours
  });
});
