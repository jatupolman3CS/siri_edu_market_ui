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

function render(catalog: ReturnType<typeof buildCatalogFake>, platformStats: ReturnType<typeof buildPlatformStatsFake>) {
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
          queryParamMap: of(convertToParamMap({})),
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
