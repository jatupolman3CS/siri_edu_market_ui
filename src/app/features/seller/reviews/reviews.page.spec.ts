import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SellerService, type SellerReviewStats } from '../../../core/services';
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
  /** security-review-followups v1 §4.2 (FIX-07): what `loadReviewStats()` resolves to (default null). */
  reviewStats?: SellerReviewStats | null;
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
    loadReviewStats: vi.fn(async (): Promise<SellerReviewStats | null> => opts.reviewStats ?? null),
    replyToReview: vi.fn(async (reviewId: string, replyText: string) => ({
      id: reviewId,
      documentTitle: 'Doc',
      buyerName: 'Buyer',
      buyerAvatarUrl: '',
      rating: 5,
      comment: 'Great',
      createdAt: '2026-01-01T10:00:00Z',
      sellerReplyText: replyText,
      sellerRepliedAt: '2026-01-01T11:00:00Z',
    })),
  };

  TestBed.configureTestingModule({
    imports: [SellerReviewsPage],
    providers: [provideRouter([]), { provide: SellerService, useValue: fakeSeller }],
  });

  const fixture = TestBed.createComponent(SellerReviewsPage);
  fixture.detectChanges();
  return Object.assign(fixture, { fakeSeller });
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

  it('does not derive the stats cards from the loaded rows (FIX-07 round 2)', async () => {
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
          sellerRepliedAt: '2026-01-01T12:00:00Z',
        },
      ],
      reviewStats: null,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.reviewStats()).toEqual({ positivePct: 0, replyPct: 0, avgHours: null });
  });
});

/** responsive-ui v1.4 gate fix (G1-5) F93 / R-5: authored text wraps instead of widening the page. */
describe('SellerReviewsPage — long authored text (responsive v1.4)', () => {
  it('buyer name, comment and reply break long tokens, and the name column can shrink', async () => {
    const long = 'Studio' + 'x'.repeat(60);
    const fixture = render({
      reviews: [
        {
          id: 'r1',
          documentTitle: long,
          buyerName: long,
          buyerAvatarUrl: '',
          rating: 4,
          comment: long,
          createdAt: '2026-01-01T00:00:00Z',
          sellerReplyText: long,
          sellerRepliedAt: '2026-01-02T00:00:00Z',
        },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const holders = Array.from(root.querySelectorAll<HTMLElement>('li.card-tile *')).filter(
      (el) => el.children.length === 0 && el.textContent?.trim() === long,
    );
    // buyer name, comment and seller reply (the document title is a one-line ellipsis inside its link)
    const wrapped = holders.filter((el) => el.classList.contains('[overflow-wrap:anywhere]'));
    expect(wrapped.length).toBe(3);
    const name = wrapped[0];
    expect(name.parentElement?.classList.contains('min-w-0')).toBe(true);
  });
});

/**
 * security-review-followups v1 §1.4 AC-07-9/10 / §4.2 round 2 (FIX-07): the stats cards show only
 * the backend aggregate over ALL reviews. Stats unavailable (`null`) → `0%` / `—`, the page never
 * fetches a 100-review sample to compute them itself, and a successful reply reloads them once.
 */
describe('SellerReviewsPage — server review stats (FIX-07)', () => {
  const twoRows = [
    {
      id: 'r1',
      documentTitle: 'Doc 1',
      buyerName: 'Buyer 1',
      buyerAvatarUrl: '',
      rating: 5,
      comment: 'Great',
      createdAt: '2026-01-01T10:00:00Z',
      sellerReplyText: 'Thank you!',
      sellerRepliedAt: '2026-01-01T12:00:00Z',
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
  ];

  const serverStats: SellerReviewStats = {
    totalCount: 102,
    positiveCount: 85,
    positivePercent: 83,
    repliedCount: 34,
    replyPercent: 33,
    averageReplyHours: 7.25,
  };

  it('shows the backend aggregate instead of the row-based calculation', async () => {
    const fixture = render({ reviews: twoRows, reviewStats: serverStats });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.fakeSeller.loadReviewStats).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.reviewStats()).toEqual({
      positivePct: 83,
      replyPct: 33,
      avgHours: 7.25,
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('83%');
    expect(text).toContain('33%');
  });

  it('keeps the backend numbers when the page or page size changes', async () => {
    const fixture = render({ reviews: twoRows, reviewStats: serverStats });
    await fixture.whenStable();
    const page = fixture.componentInstance;

    page.onPageChange(2);
    await fixture.whenStable();
    page.onPageSizeChange(50);
    await fixture.whenStable();

    expect(page.reviewStats()).toEqual({ positivePct: 83, replyPct: 33, avgHours: 7.25 });
  });

  it('shows 0% / — when loadReviewStats() resolves null (AC-07-10)', async () => {
    const fixture = render({ reviews: twoRows, reviewStats: null });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.fakeSeller.loadReviewStats).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.serverStats()).toBeNull();
    expect(fixture.componentInstance.reviewStats()).toEqual({ positivePct: 0, replyPct: 0, avgHours: null });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('0%');
    expect(text).toContain('—');
  });

  it('never loads a review sample to compute the stats itself (AC-07-10)', async () => {
    const fixture = render({ reviews: twoRows, reviewStats: serverStats });
    await fixture.whenStable();
    const page = fixture.componentInstance;

    page.onPageChange(2);
    await fixture.whenStable();
    page.startReply(page.items()[1]);
    page.replyDraft.set('ขอบคุณค่ะ');
    await page.submitReply('r2');
    await fixture.whenStable();

    expect(fixture.fakeSeller.loadReviews).not.toHaveBeenCalled();
    for (const call of fixture.fakeSeller.loadReviewsPaged.mock.calls) {
      expect(call[1]).not.toBe(100);
    }
  });

  it('reloads the stats exactly once after a successful reply', async () => {
    const fixture = render({ reviews: twoRows, reviewStats: serverStats });
    await fixture.whenStable();
    const page = fixture.componentInstance;
    expect(fixture.fakeSeller.loadReviewStats).toHaveBeenCalledTimes(1);

    page.startReply(page.items()[1]);
    page.replyDraft.set('ขอบคุณค่ะ');
    await page.submitReply('r2');
    await fixture.whenStable();

    expect(fixture.fakeSeller.replyToReview).toHaveBeenCalledWith('r2', 'ขอบคุณค่ะ');
    expect(fixture.fakeSeller.loadReviewStats).toHaveBeenCalledTimes(2);
  });

  it('does not reload the stats when the reply fails', async () => {
    const fixture = render({ reviews: twoRows, reviewStats: serverStats });
    await fixture.whenStable();
    const page = fixture.componentInstance;
    fixture.fakeSeller.replyToReview.mockResolvedValueOnce(null as never);

    page.replyDraft.set('ขอบคุณค่ะ');
    await page.submitReply('r2');
    await fixture.whenStable();

    expect(fixture.fakeSeller.loadReviewStats).toHaveBeenCalledTimes(1);
  });
});
