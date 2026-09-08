import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BuyerMarketplacePage } from './marketplace.page';
import {
  BundleService,
  CatalogService,
  PlatformStatsService,
  RecentlyViewedService,
} from '../../../core/services';
import { idleActionState } from '../../../core/services/action-state';
import type { Category, PlatformStats } from '../../../core/models';

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
    documents: () => [],
    freeResources: () => [],
    newArrivals: () => [],
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
    marketplaceResults: () => [],
    marketplaceResultsState: () => idleActionState(),
    marketplaceResultsPage: () => 1,
    marketplaceResultsPageSize: () => 24,
    marketplaceResultsTotalCount: () => 0,
    marketplaceResultsTotalPages: () => 1,
    marketplacePageSizeOptions: [12, 24, 48],
    loadMarketplaceResultsPage: vi.fn(),
    setMarketplacePageSize: vi.fn(),
    retryMarketplaceResults: vi.fn(),
  };
}

function buildBundleFake() {
  return {
    bundles: () => [],
    bundlesState: () => idleActionState(),
    hasMore: () => false,
    loadMore: vi.fn(),
  };
}

function buildPlatformStatsFake(stats: PlatformStats | undefined) {
  return {
    stats: () => stats,
    statsState: () => idleActionState(),
    loadStats: vi.fn(),
  };
}

function render(catalog: ReturnType<typeof buildCatalogFake>, platformStats: ReturnType<typeof buildPlatformStatsFake>, query: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    imports: [BuyerMarketplacePage],
    providers: [
      provideRouter([]),
      { provide: CatalogService, useValue: catalog },
      { provide: BundleService, useValue: buildBundleFake() },
      { provide: RecentlyViewedService, useValue: { count: () => 0, items: () => [], clear: vi.fn() } },
      { provide: PlatformStatsService, useValue: platformStats },
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

describe('Marketplace explicit search submission', () => {
  it('keeps typing local in searchTerm and only triggers catalog filter on applySearch / button click', async () => {
    const catalog = buildCatalogFake();
    const fixture = render(catalog, buildPlatformStatsFake(undefined));
    await fixture.whenStable();

    const input = (fixture.nativeElement as HTMLElement).querySelector('input[name="marketplaceSearch"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    input.value = 'คณิต ม.ปลาย';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    // typing alone does NOT call setFilters with the new search
    expect(catalog.setFilters).not.toHaveBeenCalledWith({ search: 'คณิต ม.ปลาย' });

    // clicking the search button or submitting form triggers search
    const searchBtn = input.form?.querySelector('button[type="submit"]') as HTMLButtonElement;
    searchBtn.click();
    await fixture.whenStable();

    expect(catalog.setFilters).toHaveBeenCalledWith({ search: 'คณิต ม.ปลาย' });
  });

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

describe('Marketplace results panel (marketplace-paged-results v1)', () => {
  it('AC-9: renders the search button as a flex sibling of the input, not an absolute overlay', () => {
    const fixture = render(buildCatalogFake(), buildPlatformStatsFake(undefined));

    const input = (fixture.nativeElement as HTMLElement).querySelector(
      'input[name="marketplaceSearch"]',
    ) as HTMLInputElement;
    const form = input.closest('form') as HTMLElement;
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement;

    expect(button).not.toBeNull();
    expect(button.parentElement).toBe(form);
    expect(form.classList.contains('flex')).toBe(true);
    expect(button.classList.contains('btn-icon')).toBe(true);
    expect(getComputedStyle(button).position).not.toBe('absolute');
  });

  it('clicking a page number in <app-pagination> calls catalog.loadMarketplaceResultsPage with the target page', () => {
    const catalog = buildCatalogFake();
    catalog.marketplaceResultsTotalPages = () => 3;
    catalog.marketplaceResultsPage = () => 1;
    const fixture = render(catalog, buildPlatformStatsFake(undefined));

    const pageButtons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('app-pagination nav button'),
    ) as HTMLButtonElement[];
    const page2Button = pageButtons.find((b) => b.textContent?.trim() === '2');
    expect(page2Button).toBeDefined();

    page2Button!.click();
    fixture.detectChanges();

    expect(catalog.loadMarketplaceResultsPage).toHaveBeenCalledWith(2);
  });
});

