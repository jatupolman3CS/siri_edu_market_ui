import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BuyerMarketplacePage } from './marketplace.page';
import {
  AdsService,
  BundleService,
  CartService,
  CatalogService,
  PlatformStatsService,
  RecentlyViewedService,
  WishlistService,
} from '../../../core/services';
import { idleActionState, type ActionState } from '../../../core/services/action-state';
import { mapDocument } from '../../../core/api-mappers/mappers';
import type { Bundle, Category, DocumentItem, PlatformStats } from '../../../core/models';

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

/**
 * marketplace-home-redesign v2 §4.2: `filters`/`setFilters`/`resetFilters` are backed by a real
 * signal here (not static return values) so `toggleCategory()`'s bug-fix logic (AC-2a/2b) — which
 * reads `catalog.filters()` right after calling `catalog.setFilters()` — behaves the same way the
 * real `CatalogService` does across consecutive calls in one test.
 */
function buildCatalogFake(categories: Category[] = []) {
  const filtersSignal = signal({ ...DEFAULT_FILTERS });
  return {
    initForMarketplace: vi.fn(),
    loadCategoryDetailBySlug: vi.fn(),
    categories: () => categories,
    documents: (): DocumentItem[] => [],
    freeResources: (): DocumentItem[] => [],
    filters: () => filtersSignal(),
    setFilters: vi.fn((patch: Record<string, unknown>) => {
      filtersSignal.update((f) => ({ ...f, ...patch }));
    }),
    setTab: vi.fn(),
    resetFilters: vi.fn(() => filtersSignal.set({ ...DEFAULT_FILTERS })),
    getCategoryBySlug: (slug: string) => categories.find((c) => c.slug === slug),
    getSubcategoryBySlug: () => undefined,
    getCategoryById: (id: string) => categories.find((c) => c.id === id),
    getSubcategoryById: () => undefined,
    marketplaceResults: (): DocumentItem[] => [],
    marketplaceResultsState: () => idleActionState(),
    marketplaceResultsPage: () => 1,
    marketplaceResultsPageSize: () => 16,
    marketplaceResultsTotalCount: () => 0,
    marketplaceResultsTotalPages: () => 1,
    marketplaceHasMore: () => false,
    marketplacePageSizeOptions: [12, 16, 24, 48],
    loadMarketplaceResultsPage: vi.fn(),
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

function buildBundle(id: string, over: Partial<Bundle> = {}): Bundle {
  return {
    id,
    slug: id,
    title: `แพ็กเกจ ${id}`,
    description: 'รวมเอกสารคุ้ม ๆ',
    cover: '',
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

/**
 * marketplace-home-redesign v2 §4.2: `BundleService.searchPager` round-1 stub — `bundleResults`
 * defaults to `[]` (never mock data), `bundleResultsState`/`bundleResultsPage` are real signals so
 * the page's own "load more"/accumulate effect can be exercised the same way it is against the
 * real service.
 */
function buildBundleFake(bundleResults: Bundle[] = [], state: ActionState = idleActionState()) {
  const page = signal(1);
  return {
    bundleResults: () => bundleResults,
    bundleResultsState: () => state,
    bundleResultsTotalCount: () => bundleResults.length,
    bundleResultsTotalPages: () => 1,
    bundleResultsPage: page.asReadonly(),
    bundleResultsPageSize: () => 16,
    loadBundleResultsPage: vi.fn(),
    retryBundleResults: vi.fn(),
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
  bundles: ReturnType<typeof buildBundleFake> = buildBundleFake(),
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
      { provide: BundleService, useValue: bundles },
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

function buildDoc(id: string): DocumentItem {
  return mapDocument({ id, slug: id, title: `เอกสาร ${id}`, shortDescription: '', price: 100 });
}

function buildCategory(over: Partial<Category>): Category {
  return {
    id: 'cat-1',
    name: 'การศึกษา',
    slug: 'education',
    icon: '📚',
    color: '#F9A8D4',
    description: '',
    documentCount: 100,
    ...over,
  };
}

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
 * marketplace-home-redesign v2 §1 ข้อ 8 / AC-8a/8c: this page is a single view now — no more
 * `view`/`listMode()`/`goToBrowse()`/rails/"ดูทั้งหมด" closing CTA. Entering `/marketplace` with no
 * filter shows the category chip row + results grid immediately.
 */
describe('BuyerMarketplacePage — single view, no browse mode (marketplace-home-redesign v2 AC-8a/8c)', () => {
  it('has no dead `view`/`listMode`/`goToBrowse` left over from marketplace-redesign v1', () => {
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance as unknown as Record<string, unknown>;

    expect(page['view']).toBeUndefined();
    expect(page['listMode']).toBeUndefined();
    expect(page['goToBrowse']).toBeUndefined();
  });

  it('never renders the old "← หน้ารวม" button or the browse-mode closing CTA', () => {
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toContain('หน้ารวม');
    expect(text).not.toContain('ดูเอกสารทั้งหมด');
  });

  it('shows the category chip row unconditionally (no more `@if (!listMode())` gate)', () => {
    const catalog = buildCatalogFake([buildCategory({ id: 'cat-1', name: 'คณิตศาสตร์' })]);
    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('คณิตศาสตร์');
    expect(text).toContain('ทั้งหมด'); // "ทั้งหมด" chip
  });
});

/**
 * marketplace-home-redesign v2 §1 ข้อ 2 / §0 (bug fix), AC-2a/2b: clicking a category chip
 * directly (top row or sidebar) must hydrate its subcategories the same way a `?category=slug`
 * deep link already does.
 */
describe('BuyerMarketplacePage — toggleCategory hydrates subcategories (marketplace-home-redesign v2 AC-2a/2b)', () => {
  it('AC-2a: selecting exactly one category calls loadCategoryDetailBySlug with its slug', () => {
    const cat = buildCategory({ id: 'cat-math', slug: 'math', name: 'คณิตศาสตร์' });
    const catalog = buildCatalogFake([cat]);
    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    page.toggleCategory('cat-math');

    expect(catalog.loadCategoryDetailBySlug).toHaveBeenCalledWith('math');
  });

  it('does not call loadCategoryDetailBySlug once more than one category ends up selected', () => {
    const catA = buildCategory({ id: 'cat-a', slug: 'a' });
    const catB = buildCategory({ id: 'cat-b', slug: 'b' });
    const catalog = buildCatalogFake([catA, catB]);
    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    page.toggleCategory('cat-a');
    catalog.loadCategoryDetailBySlug.mockClear();
    page.toggleCategory('cat-b'); // now 2 categories selected

    expect(catalog.loadCategoryDetailBySlug).not.toHaveBeenCalled();
  });

  it('AC-2b: switching from one selected category to another re-hydrates the new one', () => {
    const catA = buildCategory({ id: 'cat-a', slug: 'a' });
    const catB = buildCategory({ id: 'cat-b', slug: 'b' });
    const catalog = buildCatalogFake([catA, catB]);
    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    page.toggleCategory('cat-a');
    expect(catalog.loadCategoryDetailBySlug).toHaveBeenCalledWith('a');

    page.toggleCategory('cat-a'); // deselect
    page.toggleCategory('cat-b'); // select the new one

    expect(catalog.loadCategoryDetailBySlug).toHaveBeenCalledWith('b');
  });

  it('does not call loadCategoryDetailBySlug when no category ends up selected', () => {
    const cat = buildCategory({ id: 'cat-math', slug: 'math' });
    const catalog = buildCatalogFake([cat]);
    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    page.toggleCategory('cat-math');
    catalog.loadCategoryDetailBySlug.mockClear();
    page.toggleCategory('cat-math'); // deselect back to none

    expect(catalog.loadCategoryDetailBySlug).not.toHaveBeenCalled();
  });
});

/**
 * marketplace-home-redesign v2 §1 ข้อ 4/8 / §4.2, AC-4c/4d/4e: toolbar tabs shrink to
 * `'all' | 'free' | 'package'` — the new "แพ็กเกจ" tab searches bundles with the current search
 * term and renders `app-bundle-card`, never `app-document-card`.
 */
describe('BuyerMarketplacePage — tabs (marketplace-home-redesign v2 §4.2, AC-4c/4d/4e)', () => {
  it('AC-4e: exposes exactly 3 tabs in order: all, free, package', () => {
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined));
    const page = fixture.componentInstance;

    expect(page.tabs().map((t) => t.value)).toEqual(['all', 'free', 'package']);
  });

  it('the "package" tab badge shows no count until it has been activated once this session (§4.2)', () => {
    const bundles = buildBundleFake([buildBundle('b-1')]);
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined), {}, bundles);
    const page = fixture.componentInstance;

    expect(page.tabs().find((t) => t.value === 'package')?.count).toBeNull();
  });

  it('selectTab("package") sets the catalog tab to "bundles" and fetches page 1 with the current search term (AC-4c/4d)', () => {
    const catalog = buildCatalogFake();
    const bundles = buildBundleFake();
    const fixture = render(catalog, buildPlatformStatsFake(undefined), {}, bundles);
    const page = fixture.componentInstance;

    catalog.setFilters({ search: '  TOEIC  ' });
    page.selectTab('package');

    expect(page.activeUiTab()).toBe('package');
    expect(catalog.setTab).toHaveBeenCalledWith('bundles');
    expect(bundles.loadBundleResultsPage).toHaveBeenCalledWith(1, 'TOEIC');
  });

  it('shows the real badge count once the "package" tab has been activated', () => {
    const bundles = buildBundleFake([buildBundle('b-1'), buildBundle('b-2')]);
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined), {}, bundles);
    const page = fixture.componentInstance;

    page.selectTab('package');

    expect(page.tabs().find((t) => t.value === 'package')?.count).toBe(2);
  });

  it('selectTab("all") / selectTab("free") set the catalog tab directly and never call BundleService', () => {
    const catalog = buildCatalogFake();
    const bundles = buildBundleFake();
    const fixture = render(catalog, buildPlatformStatsFake(undefined), {}, bundles);
    const page = fixture.componentInstance;

    page.selectTab('free');

    expect(catalog.setTab).toHaveBeenCalledWith('free');
    expect(bundles.loadBundleResultsPage).not.toHaveBeenCalled();
  });

  it('§4.2 query param migration: legacy ?tab=new falls back to "all" silently (no throw)', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog, buildPlatformStatsFake(undefined), { tab: 'new' });

    expect(fixture.componentInstance.activeUiTab()).toBe('all');
    expect(catalog.setTab).toHaveBeenCalledWith('all');
  });

  it('§4.2 query param migration: legacy ?tab=popular falls back to "all" silently (no throw)', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog, buildPlatformStatsFake(undefined), { tab: 'popular' });

    expect(fixture.componentInstance.activeUiTab()).toBe('all');
    expect(catalog.setTab).toHaveBeenCalledWith('all');
  });

  it('AC-4c: a deep link with ?tab=package renders app-bundle-card, not app-document-card', () => {
    const bundle = buildBundle('b-1');
    const bundles = buildBundleFake([bundle]);
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined), { tab: 'package' }, bundles);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-bundle-card')).not.toBeNull();
    expect(el.querySelector('app-document-card')).toBeNull();
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

    render(catalog, buildPlatformStatsFake(undefined), {}, buildBundleFake(), ads);

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

    render(catalog, buildPlatformStatsFake(undefined), {}, buildBundleFake(), ads);

    expect(ads.recordImpressions).toHaveBeenCalledWith(expect.any(Array), []);
  });
});

describe('Marketplace results pagination', () => {
  it('keeps the filters sidebar visible on the package tab', () => {
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined));
    const sidebar = (fixture.nativeElement as HTMLElement).querySelector('aside');

    fixture.componentInstance.selectTab('package');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('aside')).toBe(sidebar);
  });

  it('loads the selected page from the pagination below the document grid', () => {
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
    const fixture = render(catalog, buildPlatformStatsFake(undefined));

    const pagination = (fixture.nativeElement as HTMLElement).querySelector('app-pagination');
    const nextButton = pagination?.querySelector('button[aria-label]');
    const buttons = pagination?.querySelectorAll<HTMLButtonElement>('button[aria-label]');
    expect(pagination).not.toBeNull();
    expect(nextButton).not.toBeNull();

    buttons?.[buttons.length - 1].click();
    fixture.detectChanges();

    expect(catalog.loadMarketplaceResultsPage).toHaveBeenCalledWith(2);
  });
});
