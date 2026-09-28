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
  RecentlyViewedService,
  WishlistService,
} from '../../../core/services';
import { idleActionState, type ActionState } from '../../../core/services/action-state';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { mapDocument } from '../../../core/api-mappers/mappers';
import type { Bundle, Category, DocumentItem } from '../../../core/models';

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
    leaveMarketplace: vi.fn(),
    loadFreeResources: vi.fn(),
    freeTotalCount: (): number | null => null,
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
    marketplaceResultsPageSize: () => 20,
    marketplaceResultsTotalCount: () => 0,
    marketplaceResultsTotalPages: () => 1,
    marketplaceHasMore: () => false,
    marketplacePageSizeOptions: [12, 20, 24, 40, 48],
    loadMarketplaceResultsPage: vi.fn(),
    setMarketplacePageSize: vi.fn(),
    retryMarketplaceResults: vi.fn(),
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
    bundleResultsPageSize: () => 20,
    bundleResultsPageSizeOptions: [12, 20, 24, 40, 48],
    setBundleResultsPageSize: vi.fn(),
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

describe('Marketplace search URL', () => {
  it('automatically applies the incoming query after clearing previous filters', () => {
    const catalog = buildCatalogFake();
    render(catalog, { q: '  TOEIC  ' });
    expect(catalog.resetFilters).toHaveBeenCalled();
    expect(catalog.setFilters).toHaveBeenCalledWith({ search: 'TOEIC' });
  });
  it('opens all documents for an empty query', () => {
    const catalog = buildCatalogFake();
    render(catalog);
    expect(catalog.resetFilters).toHaveBeenCalled();
    expect(catalog.setFilters).not.toHaveBeenCalled();
  });
});

describe('Marketplace clear search', () => {
  it('clears search on clearSearch()', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog, { q: 'ชีวะ' });
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
    const fixture = render(buildCatalogFake());
    const page = fixture.componentInstance as unknown as Record<string, unknown>;

    expect(page['view']).toBeUndefined();
    expect(page['listMode']).toBeUndefined();
    expect(page['goToBrowse']).toBeUndefined();
  });

  it('never renders the old "← หน้ารวม" button or the browse-mode closing CTA', () => {
    const fixture = render(buildCatalogFake());
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toContain('หน้ารวม');
    expect(text).not.toContain('ดูเอกสารทั้งหมด');
  });

  it('does not render top category chips row (categories are filtered via sidebar)', () => {
    const catalog = buildCatalogFake([buildCategory({ id: 'cat-1', name: 'คณิตศาสตร์' })]);
    const fixture = render(catalog);
    const el = fixture.nativeElement as HTMLElement;

    // Categories are present in the sidebar filter
    expect(el.querySelector('aside')?.textContent).toContain('คณิตศาสตร์');
    // Top category chips row is removed — next element after header is the results container
    const header = el.querySelector('header');
    expect(header?.nextElementSibling?.classList.contains('animate-slide-up')).toBe(true);
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
    const fixture = render(catalog);
    const page = fixture.componentInstance;

    page.toggleCategory('cat-math');

    expect(catalog.loadCategoryDetailBySlug).toHaveBeenCalledWith('math');
  });

  it('does not call loadCategoryDetailBySlug once more than one category ends up selected', () => {
    const catA = buildCategory({ id: 'cat-a', slug: 'a' });
    const catB = buildCategory({ id: 'cat-b', slug: 'b' });
    const catalog = buildCatalogFake([catA, catB]);
    const fixture = render(catalog);
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
    const fixture = render(catalog);
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
    const fixture = render(catalog);
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
    const fixture = render(buildCatalogFake());
    const page = fixture.componentInstance;

    expect(page.tabs().map((t) => t.value)).toEqual(['all', 'free', 'package']);
  });

  it('the "package" tab badge shows no count until it has been activated once this session (§4.2)', () => {
    const bundles = buildBundleFake([buildBundle('b-1')]);
    const fixture = render(buildCatalogFake(), {}, bundles);
    const page = fixture.componentInstance;

    expect(page.tabs().find((t) => t.value === 'package')?.count).toBeNull();
  });

  it('selectTab("package") sets the catalog tab to "bundles" and fetches page 1 with the current search term (AC-4c/4d)', () => {
    const catalog = buildCatalogFake();
    const bundles = buildBundleFake();
    const fixture = render(catalog, {}, bundles);
    const page = fixture.componentInstance;

    catalog.setFilters({ search: '  TOEIC  ' });
    page.selectTab('package');

    expect(page.activeUiTab()).toBe('package');
    expect(catalog.setTab).toHaveBeenCalledWith('bundles');
    expect(bundles.loadBundleResultsPage).toHaveBeenCalledWith(1, 'TOEIC');
  });

  it('shows the real badge count once the "package" tab has been activated', () => {
    const bundles = buildBundleFake([buildBundle('b-1'), buildBundle('b-2')]);
    const fixture = render(buildCatalogFake(), {}, bundles);
    const page = fixture.componentInstance;

    page.selectTab('package');

    expect(page.tabs().find((t) => t.value === 'package')?.count).toBe(2);
  });

  it('selectTab("all") / selectTab("free") set the catalog tab directly and never call BundleService', () => {
    const catalog = buildCatalogFake();
    const bundles = buildBundleFake();
    const fixture = render(catalog, {}, bundles);
    const page = fixture.componentInstance;

    page.selectTab('free');

    expect(catalog.setTab).toHaveBeenCalledWith('free');
    expect(bundles.loadBundleResultsPage).not.toHaveBeenCalled();
  });

  it('setPriceRangeOption("free") sets freeOnly filter and syncs activeUiTab', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog);
    const page = fixture.componentInstance;

    page.setPriceRangeOption('free');

    expect(catalog.filters().freeOnly).toBe(true);
    expect(page.priceRange()).toBe('free');
    expect(page.activeUiTab()).toBe('free');
  });

  it('clicking active price option "free" toggles it back to "all"', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog);
    const page = fixture.componentInstance;

    page.setPriceRangeOption('free');
    expect(page.priceRange()).toBe('free');

    // Click again to toggle off
    page.setPriceRangeOption('free');
    expect(page.priceRange()).toBe('all');
    expect(catalog.filters().freeOnly).toBe(false);
    expect(page.activeUiTab()).toBe('all');
  });

  it('selectTab("free") toggles back to "all" when clicked while already active', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog);
    const page = fixture.componentInstance;

    page.selectTab('free');
    expect(page.activeUiTab()).toBe('free');

    page.selectTab('free');
    expect(page.activeUiTab()).toBe('all');
    expect(catalog.setTab).toHaveBeenCalledWith('all');
  });

  it('§4.2 query param migration: legacy ?tab=new falls back to "all" silently (no throw)', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog, { tab: 'new' });

    expect(fixture.componentInstance.activeUiTab()).toBe('all');
    expect(catalog.setTab).toHaveBeenCalledWith('all');
  });

  it('§4.2 query param migration: legacy ?tab=popular falls back to "all" silently (no throw)', () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog, { tab: 'popular' });

    expect(fixture.componentInstance.activeUiTab()).toBe('all');
    expect(catalog.setTab).toHaveBeenCalledWith('all');
  });

  it('AC-4c: a deep link with ?tab=package renders app-bundle-card, not app-document-card', () => {
    const bundle = buildBundle('b-1');
    const bundles = buildBundleFake([bundle]);
    const fixture = render(buildCatalogFake(), { tab: 'package' }, bundles);
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

    render(catalog, {}, buildBundleFake(), ads);

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

    render(catalog, {}, buildBundleFake(), ads);

    expect(ads.recordImpressions).toHaveBeenCalledWith(expect.any(Array), []);
  });
});

describe('Marketplace results pagination', () => {
  it('appends the next page on load more and replaces results on direct page navigation', () => {
    const catalog = buildCatalogFake();
    const results = signal([buildDoc('doc-1')]);
    const page = signal(1);
    const state = signal<ActionState>(idleActionState());
    catalog.marketplaceResults = results.asReadonly();
    catalog.marketplaceResultsPage = page.asReadonly();
    catalog.marketplaceResultsState = state.asReadonly();
    catalog.marketplaceResultsTotalPages = () => 3;
    catalog.marketplaceResultsTotalCount = () => 60;
    const fixture = render(catalog);

    fixture.componentInstance.loadMoreResults();
    expect(catalog.loadMarketplaceResultsPage).toHaveBeenCalledWith(2);
    state.set({ status: 'loading' } as ActionState);
    page.set(2);
    results.set([buildDoc('doc-2')]);
    state.set(idleActionState());
    fixture.detectChanges();
    expect(fixture.componentInstance.displayedDocs().map((doc) => doc.id)).toEqual(['doc-1', 'doc-2']);

    fixture.componentInstance.changePage(1);
    state.set({ status: 'loading' } as ActionState);
    page.set(1);
    results.set([buildDoc('doc-1')]);
    state.set(idleActionState());
    fixture.detectChanges();
    expect(fixture.componentInstance.displayedDocs().map((doc) => doc.id)).toEqual(['doc-1']);
  });

  it('KI-6: keeps the sidebar on the package tab but disables every group except price, with a hint', () => {
    const fixture = render(buildCatalogFake());
    const el = fixture.nativeElement as HTMLElement;
    const sidebar = el.querySelector('aside');
    const unsupported = ['category', 'grade', 'resourceType', 'rating', 'format', 'standard'];

    // "ทั้งหมด" tab: nothing disabled, no hint.
    for (const g of unsupported) {
      expect(el.querySelector(`[data-filter-group="${g}"]`)?.hasAttribute('inert')).toBe(false);
    }
    expect(el.querySelector('[data-testid="package-filters-hint"]')).toBeNull();

    fixture.componentInstance.selectTab('package');
    fixture.detectChanges();

    // Layout kept (the 2026-09-17 decision) — same sidebar element, not re-created or removed.
    expect(el.querySelector('aside')).toBe(sidebar);
    for (const g of unsupported) {
      const group = el.querySelector(`[data-filter-group="${g}"]`);
      expect(group, g).not.toBeNull();
      expect(group!.hasAttribute('inert'), g).toBe(true);
      expect(group!.getAttribute('aria-disabled'), g).toBe('true');
    }
    // Price still works on this tab (it switches the user back to a document tab).
    const price = el.querySelector('[data-filter-group="price"]');
    expect(price).not.toBeNull();
    expect(price!.hasAttribute('inert')).toBe(false);
    expect(price!.closest('[inert]')).toBeNull();
    expect(el.querySelector('[data-testid="package-filters-hint"]')?.textContent).toContain(
      'ใช้กับเอกสารเท่านั้น',
    );

    fixture.componentInstance.selectTab('all');
    fixture.detectChanges();
    expect(el.querySelector('[data-filter-group="grade"]')?.hasAttribute('inert')).toBe(false);
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
    const fixture = render(catalog);

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

/** marketplace-redesign §7 KI-2: the hero is gone, so is the `/marketplace/stats` fetch that fed it. */
describe('BuyerMarketplacePage — no dead hero stats (marketplace-redesign §7 KI-2)', () => {
  it('has no heroDescription and needs no PlatformStatsService (no /marketplace/stats call)', () => {
    // `render()` provides no PlatformStatsService fake: were it still injected, the real one would
    // be used — this asserts the page no longer depends on it at all.
    const fixture = render(buildCatalogFake());
    const page = fixture.componentInstance as unknown as Record<string, unknown>;

    expect(page['heroDescription']).toBeUndefined();
    expect(page['platformStats']).toBeUndefined();
  });
});

/** marketplace-redesign §7 KI-4: "ฟรี" badge off-tab = server total of /free, never page-1 length. */
describe('BuyerMarketplacePage — "ฟรี" tab badge (marketplace-redesign §7 KI-4)', () => {
  const freeBadge = (page: BuyerMarketplacePage) => page.tabs().find((t) => t.value === 'free')?.count;

  it('shows the /free totalCount while on another tab', () => {
    const catalog = buildCatalogFake();
    catalog.freeTotalCount = () => 137;
    catalog.freeResources = () => [buildDoc('f-1')]; // page-1 length must not leak into the badge
    const fixture = render(catalog);

    expect(freeBadge(fixture.componentInstance)).toBe(137);
  });

  it('shows no number (null) until that total is known — never a made-up count', () => {
    const catalog = buildCatalogFake();
    catalog.freeResources = () => [buildDoc('f-1'), buildDoc('f-2')];
    catalog.documents = () => [{ ...buildDoc('p-1'), previewPages: 3 }];
    const fixture = render(catalog);

    expect(freeBadge(fixture.componentInstance)).toBeNull();
  });

  it('on the "ฟรี" tab itself shows the total of the results on screen', () => {
    const catalog = buildCatalogFake();
    catalog.freeTotalCount = () => 137;
    catalog.marketplaceResultsTotalCount = () => 12;
    const fixture = render(catalog, { tab: 'free' });

    expect(freeBadge(fixture.componentInstance)).toBe(12);
  });
});

/**
 * marketplace-redesign §7 KI-3 — against the REAL CatalogService with a stubbed `fetch`: opening
 * the page (reset + query-param sync + tab) sends exactly one `/marketplace/search`, never
 * `/marketplace/catalog` or `/marketplace/stats`, and one filter/tab change = one more request.
 */
describe('BuyerMarketplacePage — request count (marketplace-redesign §7 KI-3)', () => {
  let realFetch: typeof globalThis.fetch;
  let paths: string[];

  beforeEach(() => {
    paths = [];
    realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      paths.push(path);
      const body =
        path === '/api/marketplace/categories'
          ? []
          : { items: [], page: 1, pageSize: 40, totalCount: 0, totalPages: 1 };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function renderWithRealCatalog(query: Record<string, string>) {
    TestBed.configureTestingModule({
      imports: [BuyerMarketplacePage],
      providers: [
        provideRouter([]),
        { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
        { provide: RecentlyViewedService, useValue: { count: () => 0, items: () => [], clear: vi.fn() } },
        { provide: CartService, useValue: { has: () => false, add: vi.fn() } },
        { provide: WishlistService, useValue: { has: () => false, toggle: vi.fn(), refresh: vi.fn() } },
        { provide: BundleService, useValue: buildBundleFake() },
        { provide: AdsService, useValue: buildAdsFake() },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)) } },
      ],
    });
    const fixture = TestBed.createComponent(BuyerMarketplacePage);
    fixture.detectChanges();
    return fixture;
  }

  const count = (path: string) => paths.filter((p) => p === path).length;

  it('page open with ?q=&tab=free = exactly one /marketplace/search', async () => {
    renderWithRealCatalog({ q: 'คณิต', tab: 'free' });
    await new Promise((resolve) => setTimeout(resolve, 450)); // past the 320ms search debounce

    expect(count('/api/marketplace/search')).toBe(1);
    expect(count('/api/marketplace/catalog')).toBe(0);
    expect(count('/api/marketplace/stats')).toBe(0);
  });

  it('page open with no query = exactly one /marketplace/search', async () => {
    renderWithRealCatalog({});
    await settle();

    expect(count('/api/marketplace/search')).toBe(1);
    expect(count('/api/marketplace/catalog')).toBe(0);
  });

  it('one tab change and one filter change = one request each', async () => {
    const fixture = renderWithRealCatalog({});
    await settle();
    paths.length = 0;

    fixture.componentInstance.selectTab('free'); // setTab + setFilters inside
    await settle();
    expect(count('/api/marketplace/search')).toBe(1);

    paths.length = 0;
    fixture.componentInstance.toggleGrade('primary-early');
    await settle();
    expect(count('/api/marketplace/search')).toBe(1);
    expect(count('/api/marketplace/catalog')).toBe(0);
  });

  it('stops refetching once the page is destroyed', async () => {
    const fixture = renderWithRealCatalog({});
    await settle();
    const catalog = TestBed.inject(CatalogService);
    fixture.destroy();
    paths.length = 0;

    catalog.setFilters({ freeOnly: true });
    await settle();

    expect(count('/api/marketplace/search')).toBe(0);
  });
});

/** marketplace-search-multi-value-filters v1 AC-21: 20 values per dimension max (server 400s above). */
describe('BuyerMarketplacePage — per-dimension value cap (marketplace-search-multi-value-filters v1 AC-21)', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => `cat-${i + 1}`);

  /** render first — the page resets filters on init (query-param sync) — then preset the filters. */
  function renderWith(catalog: ReturnType<typeof buildCatalogFake>, patch: Record<string, unknown>) {
    const fixture = render(catalog);
    catalog.setFilters(patch);
    catalog.setFilters.mockClear();
    catalog.loadCategoryDetailBySlug.mockClear();
    fixture.detectChanges();
    return fixture;
  }
  const hintText = 'เลือกได้สูงสุด 20 รายการต่อกลุ่มตัวกรอง';

  it('toggling a 21st category is a no-op and shows the limit hint', () => {
    const catalog = buildCatalogFake();
    const fixture = renderWith(catalog, { categoryIds: twenty });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="category-max-values-hint"]')?.textContent?.trim()).toBe(hintText);

    fixture.componentInstance.toggleCategory('cat-21');
    fixture.detectChanges();

    expect(catalog.setFilters).not.toHaveBeenCalled();
    expect(catalog.filters().categoryIds).toEqual(twenty);
    expect(catalog.loadCategoryDetailBySlug).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="category-max-values-hint"]')?.textContent?.trim()).toBe(hintText);
  });

  it('removing a value at the cap still works and hides the hint', () => {
    const catalog = buildCatalogFake();
    const fixture = renderWith(catalog, { categoryIds: twenty });
    const el = fixture.nativeElement as HTMLElement;

    fixture.componentInstance.toggleCategory('cat-20');
    fixture.detectChanges();

    expect(catalog.filters().categoryIds).toEqual(twenty.slice(0, 19));
    expect(el.querySelector('[data-testid="category-max-values-hint"]')).toBeNull();
  });

  it('shows no hint below the cap', () => {
    const fixture = renderWith(buildCatalogFake(), { categoryIds: twenty.slice(0, 19) });

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="category-max-values-hint"]')).toBeNull();
  });

  it('caps every other dimension the same way (21st value = no-op)', () => {
    const catalog = buildCatalogFake();
    const values = Array.from({ length: 20 }, (_, i) => `v-${i + 1}`);
    const page = renderWith(catalog, {
      subcategoryIds: values,
      gradeLevels: values,
      resourceTypes: values,
      standards: values,
      formats: values,
    }).componentInstance;

    page.toggleSubcategory('v-21');
    page.toggleGrade('primary-early');
    page.toggleResourceType('worksheet');
    page.toggleStandard('v-21');
    page.toggleFormat('v-21');

    expect(catalog.setFilters).not.toHaveBeenCalled();
  });

  it('shows the hint under the subcategory list once 20 subcategories are selected', () => {
    const catalog = buildCatalogFake([
      buildCategory({
        id: 'cat-1',
        subcategories: [{ id: 'sub-1', parentId: 'cat-1', name: 'ย่อย 1', slug: 'sub-1', documentCount: 1 }],
      }),
    ]);
    const fixture = renderWith(catalog, {
      categoryIds: ['cat-1'],
      subcategoryIds: Array.from({ length: 20 }, (_, i) => `sub-${i + 1}`),
    });

    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="subcategory-max-values-hint"]')
        ?.textContent?.trim(),
    ).toBe(hintText);
  });
});

/**
 * marketplace-search-multi-value-filters v1 AC-19 — against the REAL CatalogService: with two
 * categories selected the toolbar count and the pager come from the server's totalCount/totalPages,
 * not from how many items of the loaded page survive a client-side re-filter (there is none now).
 */
describe('BuyerMarketplacePage — server totals with multi-value filters (marketplace-search-multi-value-filters v1 AC-19)', () => {
  let realFetch: typeof globalThis.fetch;
  let searchUrls: URL[];

  function row(id: string, categoryIds: string[]) {
    return {
      id,
      slug: id,
      title: `เอกสาร ${id}`,
      shortDescription: '',
      price: 100,
      isFree: false,
      format: 'pdf',
      resourceType: 'worksheet',
      averageRating: 4,
      reviewCount: 2,
      downloadCount: 10,
      categoryIds,
      seller: { id: 'seller-1', studioName: 'Siri Studio' },
      createdAt: '2026-08-01T00:00:00Z',
    };
  }

  beforeEach(() => {
    searchUrls = [];
    realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      if (url.pathname === '/api/marketplace/search') searchUrls.push(url);
      const body =
        url.pathname === '/api/marketplace/categories'
          ? []
          : {
              // page 1 of 57 — including an item outside both categories, which is shown as-is
              items: [row('doc-math', ['math']), row('doc-sci', ['sci']), row('doc-art', ['art'])],
              page: 1,
              pageSize: 40,
              totalCount: 57,
              totalPages: 2,
            };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('with two categories selected, the count and pager come from the server total', async () => {
    TestBed.configureTestingModule({
      imports: [BuyerMarketplacePage],
      providers: [
        provideRouter([]),
        { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
        { provide: RecentlyViewedService, useValue: { count: () => 0, items: () => [], clear: vi.fn() } },
        { provide: CartService, useValue: { has: () => false, add: vi.fn() } },
        { provide: WishlistService, useValue: { has: () => false, toggle: vi.fn(), refresh: vi.fn() } },
        { provide: BundleService, useValue: buildBundleFake() },
        { provide: AdsService, useValue: buildAdsFake() },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      ],
    });
    const fixture = TestBed.createComponent(BuyerMarketplacePage);
    fixture.detectChanges();
    await settle();

    fixture.componentInstance.toggleCategory('math');
    fixture.componentInstance.toggleCategory('sci');
    await settle();
    fixture.detectChanges();

    const last = searchUrls.at(-1)!;
    expect(last.searchParams.getAll('CategoryId')).toEqual(['math', 'sci']);

    const catalog = TestBed.inject(CatalogService);
    expect(catalog.marketplaceResults().map((d) => d.id)).toEqual(['doc-math', 'doc-sci', 'doc-art']);
    expect(catalog.marketplaceResultsTotalCount()).toBe(57);
    expect(catalog.marketplaceResultsTotalPages()).toBe(2);
    expect(fixture.componentInstance.allDocumentsCount()).toBe(57);

    const el = fixture.nativeElement as HTMLElement;
    // toolbar "N รายการ" = server total, not the 3 items on this page
    expect(el.querySelector('span.font-bold.text-ink')?.textContent?.trim()).toBe('57');
    expect(el.querySelector('app-pagination')).not.toBeNull();
  });
});
