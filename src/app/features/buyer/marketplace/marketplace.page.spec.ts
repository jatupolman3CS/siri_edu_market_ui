import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BuyerMarketplacePage } from './marketplace.page';
import {
  AdsService,
  CartService,
  CatalogService,
  DiscoveryService,
  PlatformStatsService,
  RecentlyViewedService,
  WishlistService,
} from '../../../core/services';
import { idleActionState, loadingActionState, type ActionState } from '../../../core/services/action-state';
import { mapDocument } from '../../../core/api-mappers/mappers';
import type { Category, DiscoveryBlock, DocumentItem, PlatformStats } from '../../../core/models';

/**
 * real-data-stats v1 §4 (project-owner instruction, round 2 dispatch notes) — marketplace hero
 * "กว่า N เอกสารจากครีเอเตอร์ตัวจริงทั่วประเทศ" now reads `PlatformStatsService.stats()`
 * (same source home/auth-layout already bind to) instead of the hardcoded "กว่า 12,000".
 */
const DEFAULT_FILTERS = {
  search: '',
  categoryIds: [] as string[],
  subcategoryIds: [] as string[],
  gradeLevels: [] as string[],
  resourceTypes: [] as string[],
  formats: [] as string[],
  standards: [] as string[],
  minPrice: 0,
  maxPrice: 1000,
  minRating: 0,
  freeOnly: false,
  sort: 'popular' as const,
};

function buildCatalogFake(categories: Category[] = []) {
  return {
    initForMarketplace: vi.fn(),
    loadCategories: vi.fn(),
    loadCategoryDetailBySlug: vi.fn(),
    categories: () => categories,
    documents: (): DocumentItem[] => [],
    freeResources: (): DocumentItem[] => [],
    newArrivals: (): DocumentItem[] => [],
    // marketplace-redesign v1 §Screens 2: rail 2 ("ยอดนิยม") data source.
    trending: (): DocumentItem[] => [],
    filtered: () => [],
    resultTotal: () => 0,
    filters: () => DEFAULT_FILTERS,
    tab: () => 'all' as const,
    catalogState: () => idleActionState(),
    catalogHasMore: () => false,
    loadCatalog: vi.fn(),
    loadMoreCatalog: vi.fn(),
    setFilters: vi.fn(),
    setTab: vi.fn(),
    resetFilters: vi.fn(),
    getCategoryBySlug: () => undefined,
    getSubcategoryBySlug: () => undefined,
    getCategoryById: () => undefined,
    getSubcategoryById: () => undefined,
    marketplaceResults: (): DocumentItem[] => [],
    marketplaceResultsState: () => idleActionState(),
    marketplaceResultsPage: () => 1,
    marketplaceResultsPageSize: () => 24,
    marketplaceResultsTotalCount: () => 0,
    marketplaceResultsTotalPages: () => 1,
    marketplaceHasMore: () => false,
    marketplacePageSizeOptions: [12, 24, 48],
    loadMarketplaceResultsPage: vi.fn(),
    loadMoreMarketplaceResults: vi.fn(function (this: any) {
      this.loadMarketplaceResultsPage(this.marketplaceResultsPage() + 1);
    }),
    setMarketplacePageSize: vi.fn(),
    retryMarketplaceResults: vi.fn(),
  };
}

function buildPlatformStatsFake(stats: PlatformStats | undefined) {
  return {
    stats: () => stats,
    statsState: () => idleActionState(),
    loadStats: vi.fn(),
  };
}

function buildDiscoveryFake(discovery: DiscoveryBlock | null = null, state: ActionState = idleActionState()) {
  return {
    popularTerms: () => discovery?.popularTerms ?? [],
    popularPersonalized: () => false,
    popularTermsState: () => idleActionState(),
    loadPopularTerms: vi.fn(),
    discovery: () => discovery,
    discoveryState: () => state,
    loadDiscovery: vi.fn(),
  };
}

/** seller-ads-promotion v1 §4.3 (AC-38). */
function buildAdsFake() {
  return {
    recordImpressions: vi.fn(),
    recordClick: vi.fn(),
  };
}

function render(
  catalog: ReturnType<typeof buildCatalogFake>,
  platformStats: ReturnType<typeof buildPlatformStatsFake>,
  query: Record<string, string> = {},
  discovery: ReturnType<typeof buildDiscoveryFake> = buildDiscoveryFake(),
  ads: ReturnType<typeof buildAdsFake> = buildAdsFake(),
) {
  TestBed.configureTestingModule({
    imports: [BuyerMarketplacePage],
    providers: [
      provideRouter([]),
      { provide: CatalogService, useValue: catalog },
      { provide: RecentlyViewedService, useValue: { count: () => 0, items: () => [], clear: vi.fn() } },
      { provide: PlatformStatsService, useValue: platformStats },
      { provide: CartService, useValue: { has: () => false, add: vi.fn() } },
      { provide: WishlistService, useValue: { has: () => false, toggle: vi.fn(), refresh: vi.fn() } },
      { provide: DiscoveryService, useValue: discovery },
      { provide: AdsService, useValue: ads },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(convertToParamMap(query)),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(BuyerMarketplacePage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('BuyerMarketplacePage — hero description (real-data-stats v1 §4)', () => {
  it('drops the "กว่า N เอกสาร" clause while platform stats have not loaded yet', () => {
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined));

    const page = fixture.componentInstance;
    expect(page.heroDescription()).toBe(
      'เอกสารคุณภาพจากครีเอเตอร์ตัวจริงทั่วประเทศ — ใช้ตัวกรองด้านซ้ายเพื่อค้นหาที่ใช่',
    );
    expect(page.heroDescription()).not.toMatch(/\d/);
  });

  it('binds the real totalApprovedDocuments count once platform stats load, replacing the old hardcoded "12,000"', () => {
    const fixture = render(
      buildCatalogFake(),
      buildPlatformStatsFake({
        totalApprovedDocuments: 15420,
        totalSellers: 100,
        totalDownloads: 1,
        reviewCount: 1,
        feeRatePercent: 10,
      }),
    );

    const page = fixture.componentInstance;
    expect(page.heroDescription()).toBe(
      'กว่า 15k เอกสารจากครีเอเตอร์ตัวจริงทั่วประเทศ — ใช้ตัวกรองด้านซ้ายเพื่อค้นหาที่ใช่',
    );
  });

  it('calls platformStats.loadStats() on construction (no-op if another page already loaded it)', () => {
    const platformStats = buildPlatformStatsFake(undefined);
    render(buildCatalogFake(), platformStats);

    expect(platformStats.loadStats).toHaveBeenCalled();
  });
});


describe('Marketplace search URL', () => {
  it('automatically applies the incoming query after clearing previous filters', () => {
    const catalog = buildCatalogFake();
    render(catalog, buildPlatformStatsFake(undefined), { q: '  TOEIC  ' });
    expect(catalog.resetFilters).toHaveBeenCalled();
    expect(catalog.setFilters).toHaveBeenCalledWith({ search: 'TOEIC' });
  });
  it('opens all documents for an empty query', () => {
    const catalog = buildCatalogFake();
    render(catalog, buildPlatformStatsFake(undefined));
    expect(catalog.resetFilters).toHaveBeenCalled();
    expect(catalog.setFilters).not.toHaveBeenCalled();
  });
});

describe('Marketplace clear search', () => {
  it('clears search on clearSearch()', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog, buildPlatformStatsFake(undefined), { q: 'ชีวะ' });
    const page = fixture.componentInstance;
    expect(page.searchTerm()).toBe('ชีวะ');

    page.clearSearch();
    expect(page.searchTerm()).toBe('');
    expect(catalog.setFilters).toHaveBeenCalledWith({ search: '' });
  });
});

/**
 * marketplace-redesign v1 §State Management / §Interactions — browse vs. list mode, the 4
 * segmented tabs (`all`/`new`/`popular`/`free`), and the "หน้ารวม" reset button.
 */
describe('BuyerMarketplacePage — browse/list mode (marketplace-redesign v1)', () => {
  it('starts in browse mode when there is no query and no active filter', () => {
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    expect(page.view()).toBe('browse');
    expect(page.listMode()).toBe(false);
  });

  it('enters list mode as soon as any filter is active, without touching view() (§Interactions)', () => {
    const catalog = buildCatalogFake();
    const baseFilters = catalog.filters();
    catalog.filters = () => ({ ...baseFilters, categoryIds: ['cat-1'] });
    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    expect(page.view()).toBe('browse');
    expect(page.listMode()).toBe(true);
  });

  it('deep-links into list mode via ?view=list', () => {
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined), { view: 'list' });
    const page = fixture.componentInstance;

    expect(page.view()).toBe('list');
    expect(page.listMode()).toBe(true);
  });

  it('exposes exactly 4 segmented tabs in order: all, new, popular, free', () => {
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    expect(page.tabs().map((t) => t.value)).toEqual(['all', 'new', 'popular', 'free']);
  });

  it('selectTab("new") enters list mode, sets the catalog tab, and highlights "new"', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    page.selectTab('new');

    expect(page.view()).toBe('list');
    expect(page.activeUiTab()).toBe('new');
    expect(catalog.setTab).toHaveBeenCalledWith('new');
  });

  it('selectTab("popular") maps to catalog tab "all" + sort "popular" (no dedicated MarketplaceTab)', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    page.selectTab('popular');

    expect(page.activeUiTab()).toBe('popular');
    expect(catalog.setTab).toHaveBeenCalledWith('all');
    expect(catalog.setFilters).toHaveBeenCalledWith({ sort: 'popular' });
  });

  it('goToBrowse() resets filters + the active tab and returns to browse mode', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    page.selectTab('free');
    catalog.resetFilters.mockClear();
    page.goToBrowse();

    expect(page.view()).toBe('browse');
    expect(page.activeUiTab()).toBe('all');
    expect(catalog.resetFilters).toHaveBeenCalled();
  });
});

/**
 * gate-2 fix (integrator-qa report, marketplace-redesign v1 §Screens/Views ข้อ 2 + rail-3 table):
 * rail "ดูทั้งหมด {n}" / segmented-tab counts must reflect the *real* group total, not the 5/6/8
 * hard-capped arrays `newArrivals()`/`trending()`/`freeResources()` return for display, and the
 * "ฟรี" rail must also include documents with `previewPages > 0` (not just `isFree`).
 */
describe('BuyerMarketplacePage — rail/tab total counts (gate-2 deviation A/B fix)', () => {
  function docWithCreatedAt(id: string, createdAt: string): DocumentItem {
    return { ...buildDoc(id), createdAt };
  }

  function docWithPreview(id: string, previewPages: number, isFree = false): DocumentItem {
    return { ...buildDoc(id), previewPages, isFree };
  }

  it('Deviation A: "new" rail/tab count is the real total of documents created within 10 days, not the 6-item newArrivals() cap', () => {
    const catalog = buildCatalogFake();
    const now = new Date();
    const within10Days = (daysAgo: number) =>
      new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    // 8 documents created within the last 10 days — more than the 6-item slice() cap
    // `catalog.newArrivals()` itself uses internally.
    const recentDocs = Array.from({ length: 8 }, (_, i) => docWithCreatedAt(`new-${i}`, within10Days(1)));
    const staleDoc = docWithCreatedAt('old-1', within10Days(30));
    catalog.documents = () => [...recentDocs, staleDoc];
    catalog.newArrivals = () => recentDocs.slice(0, 6);

    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    expect(page.newArrivalsTotalCount()).toBe(8);
    expect(page.newArrivalsTotalCount()).not.toBe(catalog.newArrivals().length);
    expect(page.rails().find((r) => r.key === 'new')?.viewAllLabel).toBe('ดูทั้งหมด 8 รายการ');
    expect(page.tabs().find((t) => t.value === 'new')?.count).toBe(8);
  });

  it('Deviation A: "popular" rail/tab count falls back to the raw document total when the backend total is unavailable (not the 8-item trending() cap)', () => {
    const catalog = buildCatalogFake();
    const docs = Array.from({ length: 12 }, (_, i) => buildDoc(`doc-${i}`));
    catalog.documents = () => docs;
    catalog.trending = () => docs.slice(0, 8);
    // marketplaceResultsTotalCount() defaults to 0 in buildCatalogFake() — allDocumentsCount()
    // falls back to documents().length in that case.

    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    expect(page.trendingTotalCount()).toBe(12);
    expect(page.trendingTotalCount()).not.toBe(catalog.trending().length);
    expect(page.rails().find((r) => r.key === 'popular')?.viewAllLabel).toBe('ดูทั้งหมด 12 รายการ');
    expect(page.tabs().find((t) => t.value === 'popular')?.count).toBe(12);
  });

  /**
   * integrator-qa gate-3 fix (marketplace-redesign v1 §Screens/Views rail "ยอดนิยม"): its
   * "ดูทั้งหมด" button maps to `tab='all' + sort='popular'`, i.e. the exact same set as "ทั้งหมด" —
   * so its true total must equal `allDocumentsCount()` / `marketplaceResultsTotalCount()` (the
   * backend total of the whole marketplace), not `catalog.documents().length`, which in browse
   * mode is capped to a single page (24) and silently under-counts once the real pool is larger.
   */
  it('gate-3: "popular" rail/tab count reads the backend marketplace total, not the page-capped documents() array length', () => {
    const catalog = buildCatalogFake();
    // Only 12 documents loaded on the current page, but the backend reports 3,000 total —
    // trendingTotalCount() must report the backend total, never the loaded page length.
    const docs = Array.from({ length: 12 }, (_, i) => buildDoc(`doc-${i}`));
    catalog.documents = () => docs;
    catalog.trending = () => docs.slice(0, 8);
    catalog.marketplaceResultsTotalCount = () => 3000;

    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    expect(page.trendingTotalCount()).toBe(3000);
    expect(page.trendingTotalCount()).toBe(page.allDocumentsCount());
    expect(page.trendingTotalCount()).not.toBe(catalog.documents().length);
    expect(page.rails().find((r) => r.key === 'popular')?.viewAllLabel).toBe('ดูทั้งหมด 3000 รายการ');
    expect(page.tabs().find((t) => t.value === 'popular')?.count).toBe(3000);
  });

  it('Deviation B: the "free" rail merges isFree documents with preview-only documents (free first), and its count includes both groups', () => {
    const catalog = buildCatalogFake();
    const free = [docWithPreview('free-1', 0, true), docWithPreview('free-2', 0, true)];
    const previewOnly = [docWithPreview('preview-1', 5, false)];
    const neitherDoc = docWithPreview('plain-1', 0, false);
    catalog.freeResources = () => free;
    catalog.documents = () => [...free, ...previewOnly, neitherDoc];

    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    const merged = page.freeAndPreviewDocuments();
    expect(merged.map((d) => d.id)).toEqual(['free-1', 'free-2', 'preview-1']);
    expect(page.rails().find((r) => r.key === 'free')?.viewAllLabel).toBe('ดูทั้งหมด 3 รายการ');
    expect(page.tabs().find((t) => t.value === 'free')?.count).toBe(3);
  });
});

describe('Marketplace results panel (marketplace-paged-results v1)', () => {
  it('clicking the "โหลดเพิ่มเติม" button calls catalog.loadMarketplaceResultsPage with the next page', () => {
    const catalog = buildCatalogFake();
    catalog.marketplaceResultsTotalPages = () => 3;
    catalog.marketplaceResultsPage = () => 1;
    catalog.marketplaceHasMore = () => true;
    catalog.marketplaceResultsTotalCount = () => 50;
    catalog.marketplaceResults = () => [
      {
        id: 'doc-1',
        title: 'สรุปชีวะ ม.ปลาย',
        price: 99,
        originalPrice: 150,
        cover: 'https://placehold.co/400x300',
        coverUrl: 'https://placehold.co/400x300',
        gallery: [],
        pageCount: 35,
        rating: 4.8,
        ratingCount: 12,
        seller: { id: 's1', displayName: 'ครูสมชาย', isVerified: true },
      } as any,
    ];
    // marketplace-redesign v1: the results grid only renders in list mode.
    const fixture = render(catalog, buildPlatformStatsFake(undefined), { view: 'list' });

    const loadMoreBtn = (fixture.nativeElement as HTMLElement).querySelector(
      'button.btn-load-more',
    ) as HTMLButtonElement;
    expect(loadMoreBtn).not.toBeNull();

    loadMoreBtn.click();
    fixture.detectChanges();

    expect(catalog.loadMarketplaceResultsPage).toHaveBeenCalledWith(2);
  });
});

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.2/§4.3/§1.4 (F-10, ข้อ 14)
 * — AC-27: the discovery block shows only when `anyActive() === false`, and disappears the moment
 * a search term/filter is applied.
 */
function buildDoc(id: string): DocumentItem {
  return mapDocument({ id, slug: id, title: `เอกสาร ${id}`, shortDescription: '', price: 100 });
}

function buildDiscoverySection() {
  return {
    key: 'interest:category:math',
    title: 'คณิตศาสตร์ที่คุณสนใจ',
    reason: 'เพราะคุณสนใจคณิตศาสตร์',
    facetType: 'category' as const,
    facetValue: 'math',
    facetLabel: 'คณิตศาสตร์',
    items: [buildDoc('doc-1'), buildDoc('doc-2'), buildDoc('doc-3')],
  };
}

function buildDiscoveryBlock(): DiscoveryBlock {
  return {
    strategy: 'declared-interest',
    strategyReason: 'เพราะคุณสนใจคณิตศาสตร์',
    gatePassed: false,
    sections: [buildDiscoverySection()],
    popularTerms: [{ term: 'toeic', rank: 1, isRising: false }],
    generatedAt: '2026-09-14T00:00:00Z',
  };
}

describe('BuyerMarketplacePage — discovery block (crm-driven-discovery v1 §3.2/§4.3, AC-27)', () => {
  it('calls discovery.loadDiscovery() on construction', () => {
    const discovery = buildDiscoveryFake();
    render(buildCatalogFake(), buildPlatformStatsFake(undefined), {}, discovery);

    expect(discovery.loadDiscovery).toHaveBeenCalledTimes(1);
  });

  it('shows the discovery rail + popular chips when anyActive() === false and data is loaded', () => {
    const discovery = buildDiscoveryFake(buildDiscoveryBlock());
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined), {}, discovery);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('คณิตศาสตร์ที่คุณสนใจ');
    expect(text).toContain('toeic');
  });

  it('hides the discovery block entirely when anyActive() === true (a search term is present)', () => {
    const catalog = buildCatalogFake();
    const baseFilters = catalog.filters();
    catalog.filters = () => ({ ...baseFilters, search: 'toeic' });
    const discovery = buildDiscoveryFake(buildDiscoveryBlock());
    const fixture = render(catalog, buildPlatformStatsFake(undefined), {}, discovery);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('คณิตศาสตร์ที่คุณสนใจ');
  });

  it('shows the loading skeleton (not the block) while discoveryState() is loading', () => {
    const discovery = buildDiscoveryFake(null, loadingActionState());
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined), {}, discovery);

    const page = fixture.componentInstance;
    expect(page.showDiscoverySkeleton()).toBe(true);
    expect(page.showDiscoveryBlock()).toBe(false);
  });

  it('renders nothing when sections and popularTerms are both empty', () => {
    const discovery = buildDiscoveryFake({
      strategy: 'popular-fallback',
      strategyReason: '',
      gatePassed: false,
      sections: [],
      popularTerms: [],
      generatedAt: '2026-09-14T00:00:00Z',
    });
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined), {}, discovery);

    const page = fixture.componentInstance;
    expect(page.showDiscoveryBlock()).toBe(false);
    expect(page.showDiscoverySkeleton()).toBe(false);
  });
});

/**
 * seller-ads-promotion v1 §4.3 (AC-38) — impressions fire once per rendered result set, through
 * `AdsService` only (never the SDK directly from this page).
 */
describe('BuyerMarketplacePage — ads impressions (seller-ads-promotion v1 §4.3, AC-38)', () => {
  function sponsoredDoc(id: string, campaignId: string): DocumentItem {
    return { ...buildDoc(id), isSponsored: true, sponsoredCampaignId: campaignId };
  }

  it('calls ads.recordImpressions() with the sponsored campaignIds of the current result set', () => {
    const catalog = buildCatalogFake();
    const docs = [sponsoredDoc('doc-1', 'camp-1'), buildDoc('doc-2')];
    catalog.marketplaceResults = () => docs;
    const ads = buildAdsFake();

    render(catalog, buildPlatformStatsFake(undefined), {}, buildDiscoveryFake(), ads);

    expect(ads.recordImpressions).toHaveBeenCalledTimes(1);
    expect(ads.recordImpressions).toHaveBeenCalledWith(
      docs,
      ['camp-1'],
    );
  });


  it('calls ads.recordImpressions() with an empty array when nothing on the page is sponsored (dedup lives in the service, not here)', () => {
    const catalog = buildCatalogFake();
    catalog.marketplaceResults = () => [buildDoc('doc-1'), buildDoc('doc-2')];
    const ads = buildAdsFake();

    render(catalog, buildPlatformStatsFake(undefined), {}, buildDiscoveryFake(), ads);

    expect(ads.recordImpressions).toHaveBeenCalledWith(expect.any(Array), []);
  });
});
