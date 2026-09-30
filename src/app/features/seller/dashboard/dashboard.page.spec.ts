import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerDashboardPage } from './dashboard.page';
import { CatalogService, PlatformStatsService, SellerService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { mapSellerDocumentSummary } from '../../../core/api-mappers/mappers';
import { DEFAULT_SELLER_INSIGHTS, DEFAULT_STORE_READINESS } from '../../../core/models';
import type { DocumentItem, DocumentStatus, PlatformStats, SellerStats } from '../../../core/models';

type RecentDocsPage = Awaited<ReturnType<SellerService['listDocumentsPaged']>>;

function recentDoc(id: string, status: DocumentStatus, title = `เอกสาร ${id}`): DocumentItem {
  return mapSellerDocumentSummary({ id, slug: id, title, status, price: 99 });
}

function recentDocsPage(items: DocumentItem[], totalCount = items.length, failed = false): RecentDocsPage {
  return {
    items,
    page: 1,
    pageSize: 5,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / 5)),
    ...(failed ? { failed: true } : {}),
  };
}

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
    storeReadiness: DEFAULT_STORE_READINESS,
    insights: DEFAULT_SELLER_INSIGHTS,
    ...over,
  };
}

function render(opts: {
  stats?: Partial<SellerStats>;
  nextPayoutDate?: string | null;
  platformStats?: PlatformStats;
  categories?: { id: string; name: string }[];
  messageWarning?: (text: string) => void;
  sellerProfileRequired?: boolean;
  /** R-17: false = GET /api/seller/dashboard has not answered successfully yet. */
  dashboardLoaded?: boolean;
  dashboardStatus?: 'idle' | 'loading' | 'success' | 'error';
  refreshDashboard?: () => Promise<void>;
  /** GR3-d: the recent documents card's call (default: answers with no documents). */
  listDocumentsPaged?: (query: { page?: number; pageSize?: number }) => Promise<RecentDocsPage>;
}) {
  const fakeSeller = {
    stats: () => buildStats(opts.stats),
    // GR3-d: /seller never loads this list, so the card must not read it. A row that could only
    // come from here would show up if it did.
    myDocuments: () => [recentDoc('stale-1', 'approved', 'STALE myDocuments row')],
    listDocumentsPaged: opts.listDocumentsPaged ?? vi.fn(async () => recentDocsPage([])),
    nextPayoutDate: () => opts.nextPayoutDate ?? null,
    sellerProfileRequired: () => opts.sellerProfileRequired ?? false,
    dashboardLoaded: () => opts.dashboardLoaded ?? true,
    dashboardState: () =>
      opts.dashboardStatus === 'error'
        ? { status: 'error' as const, message: 'x' }
        : { status: opts.dashboardStatus ?? ('success' as const) },
    refreshDashboard: opts.refreshDashboard ?? vi.fn(async () => {}),
    loadEarnings: vi.fn(async () => {}),
  };
  const fakePlatformStats = {
    stats: () => opts.platformStats,
    loadStats: vi.fn(),
  };
  const fakeCatalog = {
    ensureCategories: vi.fn(),
    getCategoryById: (id: string) => opts.categories?.find((c) => c.id === id),
    categories: () => opts.categories ?? [],
  };

  TestBed.configureTestingModule({
    imports: [SellerDashboardPage],
    providers: [
      provideRouter([]),
      { provide: SellerService, useValue: fakeSeller },
      { provide: PlatformStatsService, useValue: fakePlatformStats },
      { provide: CatalogService, useValue: fakeCatalog },
      { provide: NzMessageService, useValue: { warning: opts.messageWarning ?? vi.fn() } },
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

describe('SellerDashboardPage — ขอถอนเงินทันที (QA fix: no-op button at ฿0 balance)', () => {
  it('disables the button when pendingPayout is ฿0', () => {
    const fixture = render({ stats: { pendingPayout: 0 } });

    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((btn) => btn.textContent?.includes('ขอถอนเงินทันที')) as HTMLButtonElement | undefined;

    expect(button).toBeTruthy();
    expect(button!.disabled).toBe(true);
  });

  it('warns instead of navigating when clicked with nothing to withdraw', () => {
    const warning = vi.fn();
    const fixture = render({ stats: { pendingPayout: 0 }, messageWarning: warning });
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.componentInstance.requestWithdraw();

    expect(warning).toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('enables the button and navigates to /seller/earnings when balance is positive', () => {
    const fixture = render({ stats: { pendingPayout: 5000 } });
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((btn) => btn.textContent?.includes('ขอถอนเงินทันที')) as HTMLButtonElement | undefined;
    expect(button!.disabled).toBe(false);

    fixture.componentInstance.requestWithdraw();

    expect(navigateSpy).toHaveBeenCalledWith(['/seller/earnings']);
  });
});

describe('SellerDashboardPage — seller_profile_required (QA fix: friendly 403 state)', () => {
  it('shows a friendly "no store yet" state instead of the dashboard content', () => {
    const fixture = render({ sellerProfileRequired: true });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('บัญชีนี้ยังไม่มีร้านค้า');
    expect(text).not.toContain('ภาพรวมร้านของคุณ');

    const becomeSellerLink = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href="/become-seller"]',
    );
    expect(becomeSellerLink).toBeTruthy();
  });

  it('shows the normal dashboard when the account has a seller profile', () => {
    const fixture = render({ sellerProfileRequired: false });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ภาพรวมร้านของคุณ');
    expect(text).not.toContain('บัญชีนี้ยังไม่มีร้านค้า');
  });
});

describe('SellerDashboardPage — store readiness bar mount (store-readiness-score v1 AC-13)', () => {
  it('does not render app-store-readiness-bar when sellerProfileRequired() is true', () => {
    const fixture = render({ sellerProfileRequired: true });

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-store-readiness-bar'),
    ).toBeNull();
  });

  it('renders app-store-readiness-bar bound to seller.stats().storeReadiness when sellerProfileRequired() is false', () => {
    const fixture = render({ sellerProfileRequired: false });

    const bar = (fixture.nativeElement as HTMLElement).querySelector('app-store-readiness-bar');
    expect(bar).toBeTruthy();
    // DEFAULT_STORE_READINESS (round 1 placeholder, real-data comes after SDK regen) — the page's
    // "ความสมบูรณ์ของร้าน" title only appears once the readiness bar is actually mounted and bound.
    expect(bar!.textContent).toContain('ความสมบูรณ์ของร้าน 0%');
  });
});

describe('SellerDashboardPage — insights (seller-analytics-insights v1 §4/AC-21)', () => {
  it('shows all 3 empty states when insights is still DEFAULT_SELLER_INSIGHTS (round-1 placeholder / genuinely no data)', () => {
    const fixture = render({});
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Conversion rate ต่อเอกสาร');
    expect(text).toContain('ยังไม่มีข้อมูลการดู');
    expect(text).toContain('คำค้นหาที่พาคนมาเจอร้านคุณ');
    expect(text).toContain('ยังไม่มีคำค้นหา');
    expect(text).toContain('ต้นทาง traffic ของร้านคุณ');
    expect(text).toContain('ยังไม่มีข้อมูล traffic');
  });

  it('renders the document conversion table instead of the empty state when there is at least one row', () => {
    const fixture = render({
      stats: {
        insights: {
          ...DEFAULT_SELLER_INSIGHTS,
          documentConversions: [
            {
              documentId: 'doc-1',
              title: 'สรุปคณิต ม.6',
              viewCount: 120,
              salesCount: 12,
              conversionRatePercent: 10,
            },
          ],
        },
      },
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('สรุปคณิต ม.6');
    expect(text).toContain('120');
    expect(text).toContain('12');
    expect(text).toContain('10.0%');
    expect(text).not.toContain('ยังไม่มีข้อมูลการดู');
  });

  it('renders top search terms as a pill list instead of the empty state', () => {
    const fixture = render({
      stats: {
        insights: {
          ...DEFAULT_SELLER_INSIGHTS,
          topSearchTerms: [{ term: 'เลข ม.3', hitCount: 8 }],
        },
      },
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('เลข ม.3');
    expect(text).toContain('8');
    expect(text).not.toContain('ยังไม่มีคำค้นหา');
  });

  it('renders traffic breakdown percentages instead of the empty state when totalViews > 0', () => {
    const fixture = render({
      stats: {
        insights: {
          ...DEFAULT_SELLER_INSIGHTS,
          trafficBreakdown: {
            totalViews: 100,
            searchViews: 40,
            categoryViews: 35,
            directViews: 25,
            searchPercent: 40,
            categoryPercent: 35,
            directPercent: 25,
          },
        },
      },
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('40.0%');
    expect(text).toContain('35.0%');
    expect(text).toContain('25.0%');
    expect(text).not.toContain('ยังไม่มีข้อมูล traffic');
  });
});

describe('SellerDashboardPage — top categories display', () => {
  it('renders category name directly when category is a human-readable name', () => {
    const fixture = render({
      stats: {
        topCategories: [{ category: 'คณิตศาสตร์', sales: 5 }],
      },
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('คณิตศาสตร์');
    expect(text).toContain('5');
  });

  it('resolves category ID to display name using CatalogService', () => {
    const fixture = render({
      stats: {
        topCategories: [{ category: 'cat-04', sales: 7 }],
      },
      categories: [
        { id: 'cat-04', name: 'วิทยาศาสตร์' },
      ],
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('วิทยาศาสตร์');
    expect(text).not.toContain('cat-04');
    expect(text).toContain('7');
  });
});

describe('SellerDashboardPage — data states (responsive-ui v1.4 R-17, G-27)', () => {
  const q = (fixture: { nativeElement: unknown }, testId: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  const EMPTY_COPY = ['ยังไม่มียอดขาย', 'ยังไม่มีข้อมูลการดู', 'ยังไม่มีคำค้นหา', 'ยังไม่มีเอกสาร'];

  it('shows skeletons — none of the "ยังไม่มี…" empty states — while the dashboard GET is pending', () => {
    const fixture = render({ dashboardLoaded: false, dashboardStatus: 'loading' });
    const root = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.dashboardView()).toBe('loading');
    expect(q(fixture, 'seller-dashboard-loading')?.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelectorAll('app-empty-state').length).toBe(0);
    expect(root.querySelectorAll('app-stat-card').length).toBe(0);
    for (const copy of EMPTY_COPY) expect(root.textContent).not.toContain(copy);
  });

  it('treats the idle state before the first request as loading', () => {
    const fixture = render({ dashboardLoaded: false, dashboardStatus: 'idle' });
    expect(fixture.componentInstance.dashboardView()).toBe('loading');
  });

  it('shows a message and a common.retry that re-issues the dashboard GET when it fails', () => {
    const refreshDashboard = vi.fn(async () => {});
    const fixture = render({ dashboardLoaded: false, dashboardStatus: 'error', refreshDashboard });
    const root = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.dashboardView()).toBe('error');
    expect(q(fixture, 'seller-dashboard-error')?.getAttribute('role')).toBe('alert');
    expect(root.querySelectorAll('app-empty-state').length).toBe(0);
    for (const copy of EMPTY_COPY) expect(root.textContent).not.toContain(copy);
    expect(refreshDashboard).toHaveBeenCalledTimes(1);

    const retry = q(fixture, 'seller-dashboard-retry') as HTMLButtonElement;
    expect(retry.textContent?.trim()).toBe('ลองใหม่อีกครั้ง');
    expect(retry.classList).toContain('btn-pink');
    retry.click();
    expect(refreshDashboard).toHaveBeenCalledTimes(2);
  });

  it('keeps the loaded dashboard on screen while a later refresh is in flight or failed', () => {
    const fixture = render({ dashboardLoaded: true, dashboardStatus: 'error' });
    expect(fixture.componentInstance.dashboardView()).toBe('data');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-stat-card').length).toBe(4);
    expect(q(fixture, 'seller-dashboard-error')).toBeNull();
  });

  it('keeps the static earnings calculator in every state', () => {
    const fixture = render({ dashboardLoaded: false, dashboardStatus: 'loading' });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Earnings Calculator');
  });
});

/** Lets the constructor's pending promises settle, then re-renders. */
async function settle(fixture: { detectChanges: () => void }): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  fixture.detectChanges();
}

describe('SellerDashboardPage — recent documents card (responsive-ui v1.6.1 GR3-d, §4.6 E)', () => {
  const card = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).querySelector('[data-testid="seller-recent-docs"]') as HTMLElement;
  const t = (key: string) => TestBed.inject(TranslationService).t(key);

  it('1. on init calls listDocumentsPaged once, with { page: 1, pageSize: 5 }', async () => {
    const listDocumentsPaged = vi.fn(async () => recentDocsPage([]));
    const fixture = render({ listDocumentsPaged });
    await settle(fixture);

    expect(listDocumentsPaged).toHaveBeenCalledTimes(1);
    expect(listDocumentsPaged).toHaveBeenCalledWith({ page: 1, pageSize: 5 });
  });

  it('2. while the call is pending shows the skeleton and no "ยังไม่มีเอกสาร"', async () => {
    const fixture = render({ listDocumentsPaged: vi.fn(() => new Promise<RecentDocsPage>(() => {})) });
    await settle(fixture);
    const el = card(fixture);

    expect(fixture.componentInstance.recentDocsView()).toBe('loading');
    const skeleton = el.querySelector('[data-testid="seller-recent-docs-loading"]');
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    expect(skeleton?.querySelectorAll('li').length).toBe(5);
    expect(el.textContent).not.toContain(t('seller.noDocumentsYet'));
    expect(el.querySelector('app-empty-state')).toBeNull();
    expect(el.querySelector('[data-testid="seller-recent-docs-error"]')).toBeNull();
  });

  it('3. renders the items as rows (at most 5), each pill with its own document status', async () => {
    const docs = [
      recentDoc('d1', 'approved'),
      recentDoc('d2', 'pending'),
      recentDoc('d3', 'rejected'),
      recentDoc('d4', 'draft'),
      recentDoc('d5', 'approved'),
      recentDoc('d6', 'pending'),
    ];
    const fixture = render({ listDocumentsPaged: vi.fn(async () => recentDocsPage(docs, 11)) });
    await settle(fixture);
    const el = card(fixture);

    const rows = Array.from(el.querySelectorAll('[data-testid="seller-recent-doc"]'));
    expect(rows.length).toBe(5);
    expect(rows[0].textContent).toContain('เอกสาร d1');
    expect(el.textContent).not.toContain('เอกสาร d6');

    const pills = rows.map((row) => row.querySelector('[data-testid="seller-recent-doc-status"]') as HTMLElement);
    expect(pills.slice(0, 4).map((p) => p.textContent?.trim())).toEqual([
      t('seller.statusApproved'),
      t('seller.statusPending'),
      t('seller.statusRejected'),
      t('seller.statusDraft'),
    ]);
    // The pill classes of /seller/documents: rejected and draft no longer read "pending".
    expect(pills.slice(0, 4).map((p) => ['pill-green', 'pill-amber', 'pill-rose', 'pill-soft'].find((c) => p.classList.contains(c)))).toEqual([
      'pill-green',
      'pill-amber',
      'pill-rose',
      'pill-soft',
    ]);
    expect(el.textContent).not.toContain(t('seller.noDocumentsYet'));
  });

  it('3b. never reads SellerService.myDocuments(), which /seller does not load', async () => {
    const fixture = render({ listDocumentsPaged: vi.fn(async () => recentDocsPage([recentDoc('d1', 'approved')])) });
    await settle(fixture);
    expect(card(fixture).textContent).not.toContain('STALE myDocuments row');
  });

  it('4. totalCount 0 shows "ยังไม่มีเอกสาร"', async () => {
    const fixture = render({ listDocumentsPaged: vi.fn(async () => recentDocsPage([], 0)) });
    await settle(fixture);
    const el = card(fixture);

    expect(el.querySelector('app-empty-state')).not.toBeNull();
    expect(el.textContent).toContain(t('seller.noDocumentsYet'));
    expect(el.querySelectorAll('[data-testid="seller-recent-doc"]').length).toBe(0);
    expect(el.querySelector('[data-testid="seller-recent-docs-loading"]')).toBeNull();
  });

  it('5. failed: true shows common.loadFailed + common.retry, no empty state; retry repeats the same call', async () => {
    const listDocumentsPaged = vi
      .fn<(query: { page?: number; pageSize?: number }) => Promise<RecentDocsPage>>()
      .mockResolvedValueOnce(recentDocsPage([], 0, true))
      .mockResolvedValueOnce(recentDocsPage([recentDoc('d1', 'rejected')], 1));
    const fixture = render({ listDocumentsPaged });
    await settle(fixture);
    const el = card(fixture);

    const error = el.querySelector('[data-testid="seller-recent-docs-error"]') as HTMLElement;
    expect(error).not.toBeNull();
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain(t('common.loadFailed'));
    expect(el.textContent).not.toContain(t('seller.noDocumentsYet'));
    expect(el.querySelector('app-empty-state')).toBeNull();

    const retry = el.querySelector('[data-testid="seller-recent-docs-retry"]') as HTMLButtonElement;
    expect(retry.tagName).toBe('BUTTON');
    expect(retry.textContent?.trim()).toBe(t('common.retry'));
    retry.click();
    await settle(fixture);

    expect(listDocumentsPaged).toHaveBeenCalledTimes(2);
    expect(listDocumentsPaged.mock.calls[1]).toEqual(listDocumentsPaged.mock.calls[0]);
    expect(listDocumentsPaged.mock.calls[1][0]).toEqual({ page: 1, pageSize: 5 });
    expect(card(fixture).querySelectorAll('[data-testid="seller-recent-doc"]').length).toBe(1);
    expect(card(fixture).querySelector('[data-testid="seller-recent-doc-status"]')?.textContent?.trim()).toBe(
      t('seller.statusRejected'),
    );
  });
});

describe('SellerDashboardPage — conversion table viewport (responsive-ui v1.6 R-27, U3-8)', () => {
  it('the conversion table sits in a named table viewport with no reset key (all rows, no pager)', async () => {
    const fixture = render({
      stats: {
        insights: {
          ...DEFAULT_SELLER_INSIGHTS,
          documentConversions: [
            { documentId: 'doc-1', title: 'สรุปคณิต ม.6', viewCount: 120, salesCount: 12, conversionRatePercent: 10 },
          ],
        },
      },
    });
    await settle(fixture);
    const table = (fixture.nativeElement as HTMLElement).querySelector('table.rtable') as HTMLTableElement;
    const wrapper = table.parentElement as HTMLElement;

    expect(wrapper.classList.contains('rt-viewport')).toBe(true);
    expect(wrapper.classList.contains('table-scroll')).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-pagination')).toBeNull();
  });
});
