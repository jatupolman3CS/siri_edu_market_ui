import { Injectable, computed, inject, signal } from '@angular/core';
import {
  BoughtTogetherItem,
  Category,
  CrmFacetType,
  DocumentItem,
  GradeLevel,
  RecommendationExplanation,
  RecommendationStrategy,
  ResourceType,
  Seller,
  SellerSalesByMonthPoint,
  Subcategory,
} from '../models';
import {
  mapBoughtTogetherItem,
  mapCategory,
  mapCategoryDetail,
  mapDocument,
  mapDocumentDetail,
  mapSellerProfile,
} from '../api-mappers/mappers';
import type { DocumentEntrySource } from './navigation-source.service';
import type { MarketplaceSearchResponse } from '../api/types.gen';
import {
  getApiMarketplaceCatalog,
  getApiMarketplaceCategories,
  getApiMarketplaceCategoriesBySlug,
  getApiMarketplaceDocumentsById,
  getApiMarketplaceDocumentsByIdBoughtTogether,
  getApiMarketplaceDocumentsByIdPreview,
  getApiMarketplaceDocumentsByIdRelated,
  getApiMarketplaceFree,
  getApiMarketplaceRecommended,
  getApiMarketplaceSearch,
  getApiSellersBySellerIdProfile,
  postApiMarketplaceDocumentsByIdQna,
  postApiMarketplaceDocumentsByIdReport,
  postApiMarketplaceDocumentsByIdView,
} from '../api';
import type {
  MarketplaceDocumentPreviewResponse,
  RecommendationExplanationResponse,
  SellerProfileResponse,
} from '../api/types.gen';
import { unwrapSdkResult, type SdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { TranslationService } from '../i18n/translation.service';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';
import { createInfinitePager } from './infinite-pager';
import { createServerPager } from './server-pager';

/**
 * Tokenizes a search query into up to 8 distinct lower-cased tokens (>=2 chars each)
 * so long phrases like "ใบงานเรื่องร่างกาย" can match documents where the words
 * are spread across title / description / tags.
 */
function tokenizeSearch(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/\s+/)) {
    const t = part.trim().toLowerCase();
    if (t.length < 2) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 8) break;
  }
  if (out.length === 0) {
    const fallback = raw.trim().toLowerCase();
    if (fallback.length > 0) out.push(fallback);
  }
  return out;
}

export interface CatalogFilters {
  search: string;
  categoryIds: string[];
  subcategoryIds: string[];
  gradeLevels: GradeLevel[];
  resourceTypes: ResourceType[];
  formats: string[];
  standards: string[];
  minPrice: number;
  maxPrice: number;
  minRating: number;
  freeOnly: boolean;
  sort: 'newest' | 'popular' | 'price-asc' | 'price-desc' | 'rating';
}

export type MarketplaceTab = 'all' | 'free' | 'top-rated' | 'new' | 'bundles';

/**
 * Page size for the scoped document lists (one category / one seller). 100 is the
 * server-side clamp in MarketplacePublicService, and neither page paginates yet.
 */
const SCOPED_PAGE_SIZE = 100;

const DEFAULT_FILTERS: CatalogFilters = {
  search: '',
  categoryIds: [],
  subcategoryIds: [],
  gradeLevels: [],
  resourceTypes: [],
  formats: [],
  standards: [],
  minPrice: 0,
  maxPrice: 1000,
  minRating: 0,
  freeOnly: false,
  sort: 'popular',
};

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly translation = inject(TranslationService);

  private readonly _documents = signal<DocumentItem[]>([]);
  private readonly _categories = signal<Category[]>([]);
  private readonly _subcategories = signal<Subcategory[]>([]);
  private readonly _filters = signal<CatalogFilters>({ ...DEFAULT_FILTERS });
  private readonly _tab = signal<MarketplaceTab>('all');
  /** Cache of fully-loaded document details keyed by id. */
  private readonly _documentDetails = signal<Map<string, DocumentItem>>(new Map());

  /** True once loadCategories() has completed successfully at least once. */
  private _categoriesLoaded = false;

  private readonly _catalogState = signal<ActionState>(idleActionState());
  private readonly _freeState = signal<ActionState>(idleActionState());
  private readonly _categoriesState = signal<ActionState>(idleActionState());
  private readonly _documentDetailState = signal<ActionState>(idleActionState());
  /**
   * Bug #8: a 404 (the document genuinely doesn't exist / was removed) is not a transient
   * failure — showing the generic "ลองใหม่อีกครั้ง" retry alongside it promises a retry that can
   * never succeed. Tracked separately from `documentDetailState` so the page can tell the two
   * apart without string-matching the error message.
   */
  private readonly _documentDetailNotFound = signal<boolean>(false);
  private readonly catalogPager = createInfinitePager<DocumentItem>({
    pageSize: 24,
    errorMessage: this.translation.t('errors.context.loadCatalog'),
    fetch: async (Page, PageSize) => {
      const result = await getApiMarketplaceCatalog({ query: { Page, PageSize } });
      const data = unwrapSdkResult(result);
      return {
        items: (data.documents?.items ?? []).map(mapDocument),
        page: data.documents?.page,
        pageSize: data.documents?.pageSize,
        totalCount: data.documents?.totalCount,
        totalPages: data.documents?.totalPages,
      };
    },
  });

  /** When set, list rows come from `/marketplace/search` (server filter). Otherwise from catalog pager. */
  private readonly _listSource = signal<'catalog' | 'search'>('catalog');
  private readonly _searchPage = signal(1);
  private readonly _searchTotalCount = signal<number | null>(null);
  private _listRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private _fetchGeneration = 0;

  private readonly freePager = createInfinitePager<DocumentItem>({
    pageSize: 24,
    errorMessage: this.translation.t('errors.context.loadFreeDocuments'),
    fetch: async (Page, PageSize) => {
      const result = await getApiMarketplaceFree({ query: { Page, PageSize } });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapDocument),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  /**
   * marketplace-paged-results v1 §4.2: server-side page-based pager for the marketplace results
   * panel — separate from `_documents`/`catalogPager`/`freePager` so home/free/category-detail
   * (which still share `_documents` via infinite-scroll) are untouched.
   */
  private readonly marketplacePager = createServerPager<DocumentItem>({
    pageSize: 40,
    pageSizeOptions: [12, 20, 24, 40, 48],
    errorMessage: this.translation.t('errors.context.searchDocuments'),
    fetch: async (page, pageSize) => {
      const result = await getApiMarketplaceSearch(this.buildSearchOptions(page, pageSize));
      const data = unwrapSdkResult(result as SdkResult<MarketplaceSearchResponse>);
      return {
        items: (data.items ?? []).map(mapDocument),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  readonly marketplaceResultsState = this.marketplacePager.state;
  readonly marketplaceResultsPage = this.marketplacePager.page;
  readonly marketplaceResultsPageSize = this.marketplacePager.pageSize;
  readonly marketplaceResultsTotalCount = this.marketplacePager.totalCount;
  readonly marketplaceResultsTotalPages = this.marketplacePager.totalPages;
  readonly marketplacePageSizeOptions = this.marketplacePager.pageSizeOptions;

  /**
   * ผลลัพธ์ของหน้าปัจจุบันเท่านั้น (ไม่สะสมข้ามหน้าเหมือน catalogPager/freePager) — กรองซ้ำฝั่ง client
   * เฉพาะกรณี multi-select เกิน 1 ค่าต่อ dimension ที่ /marketplace/search รับได้แค่ค่าเดียว
   * (ตรรกะเดียวกับที่ `filtered()` เดิมใช้กับ branch 'search') — กรองเฉพาะ "หน้านี้" ไม่ใช่ทั้งชุด
   */
  readonly marketplaceResults = computed<DocumentItem[]>(() => {
    const f = this._filters();
    const t = this._tab();
    let docs = [...this.marketplacePager.items()];
    if (t === 'top-rated') docs = docs.filter((d) => d.rating >= 4.7);
    if (f.categoryIds.length > 1) docs = docs.filter((d) => f.categoryIds.some((id) => d.categoryIds.includes(id)));
    if (f.subcategoryIds.length > 1) docs = docs.filter((d) => d.subcategoryId != null && f.subcategoryIds.includes(d.subcategoryId));
    if (f.minRating > 0) docs = docs.filter((d) => d.rating >= f.minRating);
    if (f.formats.length > 1) docs = docs.filter((d) => f.formats.includes(d.format));
    if (f.gradeLevels.length > 1) docs = docs.filter((d) => d.gradeLevels.some((g) => f.gradeLevels.includes(g)));
    if (f.resourceTypes.length > 1) docs = docs.filter((d) => f.resourceTypes.includes(d.resourceType));
    if (f.standards.length > 1) docs = docs.filter((d) => (d.standards ?? []).some((s) => f.standards.includes(s)));
    return docs;
  });

  loadMarketplaceResultsPage(page: number): void {
    void this.safeMarketplaceFetch(() => this.marketplacePager.onPageChange(page));
  }

  readonly marketplaceHasMore = computed(() => {
    return this.marketplacePager.page() < this.marketplacePager.totalPages();
  });

  loadMoreMarketplaceResults(): void {
    if (!this.marketplaceHasMore()) return;
    this.loadMarketplaceResultsPage(this.marketplacePager.page() + 1);
  }

  setMarketplacePageSize(size: number): void {
    void this.safeMarketplaceFetch(() => this.marketplacePager.onPageSizeChange(size));
  }

  /** ลองใหม่ "หน้าเดิม" ที่ error ไว้ (ไม่กระโดดกลับหน้า 1) — ตาม AC-8 */
  retryMarketplaceResults(): void {
    void this.safeMarketplaceFetch(() => this.marketplacePager.onPageChange(this.marketplacePager.page()));
  }

  private refreshMarketplaceResults(): void {
    void this.safeMarketplaceFetch(() => this.marketplacePager.reloadFromPage1());
  }

  /** เหมือน infinite-pager.ts's loadMore() — กลืน rejection ไว้ (createServerPager.executeFetch rethrow)
   *  เพราะ error ถูกบันทึกใน marketplacePager.state ให้ template อ่านอยู่แล้ว ผู้เรียกเป็น fire-and-forget */
  private async safeMarketplaceFetch(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (e) {
      this.apiFail.report('errors.context.searchDocuments', e);
    }
  }

  readonly documents = this._documents.asReadonly();
  readonly categories = this._categories.asReadonly();
  readonly subcategories = this._subcategories.asReadonly();
  readonly filters = this._filters.asReadonly();
  readonly tab = this._tab.asReadonly();

  readonly catalogState = this._catalogState.asReadonly();
  readonly freeState = this._freeState.asReadonly();
  readonly categoriesState = this._categoriesState.asReadonly();
  readonly documentDetailState = this._documentDetailState.asReadonly();
  readonly documentDetailNotFound = this._documentDetailNotFound.asReadonly();
  readonly catalogHasMore = computed(() => {
    if (this._listSource() === 'search') {
      const total = this._searchTotalCount();
      if (total == null) return false;
      return this._documents().length < total;
    }
    return this.catalogPager.hasMore();
  });
  /** Exact server total only when no additional client-side filtering is applied. */
  readonly resultTotal = computed(() => {
    const f = this.filters();
    if (this.tab() === 'top-rated' || f.minRating > 0 ||
        [f.categoryIds, f.subcategoryIds, f.formats, f.gradeLevels,
         f.resourceTypes, f.standards].some(values => values.length > 1)) return null;
    return this._listSource() === 'search'
      ? this._searchTotalCount()
      : this.catalogPager.totalCount();
  });
  readonly freeHasMore = this.freePager.hasMore;

  constructor() {
    // Intentionally do not auto-fetch in a root singleton service.
    // Pages should call init/load methods explicitly to avoid unnecessary API calls.
  }

  /** Call from Home page. Loads just enough data for the home feed. */
  initForHome(): void {
    // Q-07 item 1: the home page's "หมวดหมู่" section reads `categories()`, but this never
    // called `loadCategories()` — only `initForMarketplace()` did — so the section rendered
    // empty on every visit that started at "/".
    this.loadCategories();
    void this.syncListWithBackend();
  }

  /** Call from Marketplace page. Loads categories and the list. */
  initForMarketplace(): void {
    this.loadCategories();
    void this.syncListWithBackend();
  }

  // ─── API Loaders ────────────────────────────────────────────────────────────

  loadCatalog(): void {
    void this.syncListWithBackend();
  }

  loadMoreCatalog(): void {
    void (async () => {
      if (this._tab() === 'bundles') return;
      this._catalogState.set(loadingActionState());
      try {
        if (this._listSource() === 'search') {
          await this.runSearchPage(this._searchPage() + 1, false);
        } else {
          await this.catalogPager.loadMore();
          this._documents.set(this.catalogPager.items());
        }
        this._catalogState.set(idleActionState());
      } catch (e) {
        this.apiFail.report('errors.context.loadMoreDocuments', e);
        this._catalogState.set(errorActionState('โหลดรายการเอกสารไม่สำเร็จ'));
      }
    })();
  }

  private scheduleListRefresh(immediate: boolean): void {
    if (this._tab() === 'bundles') return;
    if (this._listRefreshTimer != null) {
      clearTimeout(this._listRefreshTimer);
      this._listRefreshTimer = null;
    }
    if (immediate) {
      void this.syncListWithBackend();
      this.refreshMarketplaceResults();
      return;
    }
    this._listRefreshTimer = setTimeout(() => {
      this._listRefreshTimer = null;
      void this.syncListWithBackend();
      this.refreshMarketplaceResults();
    }, 320);
  }

  private needsServerList(f: CatalogFilters, tab: MarketplaceTab): boolean {
    if (tab === 'bundles') return false;
    if (f.search.trim()) return true;
    if (f.categoryIds.length) return true;
    if (f.subcategoryIds.length) return true;
    if (f.freeOnly) return true;
    if (tab === 'free') return true;
    if (tab === 'new' || tab === 'top-rated') return true;
    if (f.minPrice > 0 || f.maxPrice < 1000) return true;
    if (f.formats.length) return true;
    if (f.gradeLevels.length) return true;
    if (f.resourceTypes.length) return true;
    if (f.standards.length) return true;
    if (f.minRating > 0) return true;
    return false;
  }

  private resolveApiSort(f: CatalogFilters, tab: MarketplaceTab): string {
    if (tab === 'new') return 'newest';
    if (tab === 'top-rated') return 'rating';
    switch (f.sort) {
      case 'newest':
        return 'newest';
      case 'price-asc':
        return 'price-asc';
      case 'price-desc':
        return 'price-desc';
      case 'rating':
        return 'rating';
      default:
        return 'popular';
    }
  }

  private buildSearchOptions(
    page: number,
    pageSize = 24,
  ): NonNullable<Parameters<typeof getApiMarketplaceSearch>[0]> {
    const f = this._filters();
    const t = this._tab();
    const query: NonNullable<
      NonNullable<Parameters<typeof getApiMarketplaceSearch>[0]>['query']
    > = {
      Page: page,
      PageSize: pageSize,
      Sort: this.resolveApiSort(f, t),
    };
    const term = f.search.trim();
    if (term) query.Q = term;
    if (f.categoryIds.length === 1) query.CategoryId = f.categoryIds[0];
    if (f.subcategoryIds.length === 1) query.SubcategoryId = f.subcategoryIds[0];
    if (f.freeOnly || t === 'free') query.FreeOnly = true;
    if (f.minPrice > 0) query.MinPrice = f.minPrice;
    if (f.maxPrice < 1000) query.MaxPrice = f.maxPrice;
    if (f.formats.length === 1) query.Format = f.formats[0];
    if (f.gradeLevels.length === 1) query.GradeLevel = f.gradeLevels[0];
    if (f.resourceTypes.length === 1) query.ResourceType = f.resourceTypes[0];
    if (f.standards.length === 1) query.Standard = f.standards[0];
    return { query };
  }

  private async runSearchPage(
    page: number,
    replace: boolean,
    gen: number = ++this._fetchGeneration,
  ): Promise<void> {
    const result = await getApiMarketplaceSearch(this.buildSearchOptions(page));
    if (gen !== this._fetchGeneration) return;
    const data = unwrapSdkResult(result as SdkResult<MarketplaceSearchResponse>);
    const batch = (data.items ?? []).map(mapDocument);
    this._searchPage.set(data.page ?? page);
    this._searchTotalCount.set(data.totalCount ?? null);
    if (replace) {
      this._documents.set(batch);
    } else {
      this._documents.update((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        const merged = [...prev];
        for (const d of batch) {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            merged.push(d);
          }
        }
        return merged;
      });
    }
  }

  private async syncListWithBackend(): Promise<void> {
    if (this._tab() === 'bundles') return;

    const f = this._filters();
    const t = this._tab();
    const useSearch = this.needsServerList(f, t);
    // Q-07 item 2: stamp *this* refresh with a generation token before either branch's request
    // goes out, not just inside the search branch — so a slower `/catalog` response can't
    // clobber a faster, newer `/search` response typed a moment later (or vice versa). Every tab
    // badge count (marketplace.page.ts `tabs()`) reads `documents()`/`freeResources()`/etc, all
    // derived from the same `_documents` signal, so a clobbered value used to make counts revert
    // to stale numbers — most visibly on "ทั้งหมด" since it's the raw, unfiltered length.
    const gen = ++this._fetchGeneration;

    this._catalogState.set(loadingActionState());
    try {
      if (useSearch) {
        this._listSource.set('search');
        await this.runSearchPage(1, true, gen);
      } else {
        this._listSource.set('catalog');
        this._searchTotalCount.set(null);
        this._searchPage.set(1);
        this.catalogPager.reset();
        await this.catalogPager.loadFirst();
        if (gen !== this._fetchGeneration) return;
        this._documents.set(this.catalogPager.items());
      }
      this._catalogState.set(idleActionState());
    } catch (e) {
      this.apiFail.report(
        useSearch ? 'errors.context.searchDocuments' : 'errors.context.loadCatalog',
        e,
      );
      this._catalogState.set(
        errorActionState(
          useSearch ? 'ค้นหาเอกสารไม่สำเร็จ' : 'โหลดรายการเอกสารไม่สำเร็จ',
        ),
      );
    }
  }

  loadCategories(): void {
    void (async () => {
      this._categoriesState.set(loadingActionState());
      try {
        const result = await getApiMarketplaceCategories();
        const data = unwrapSdkResult(result);
        const cats = (data ?? []).map(mapCategory);
        this._categories.set(cats);
        this._categoriesLoaded = true;
        this._categoriesState.set(idleActionState());
      } catch (e) {
        this.apiFail.report('errors.context.loadCategories', e);
        this._categoriesState.set(errorActionState('โหลดหมวดหมู่ไม่สำเร็จ'));
      }
    })();
  }

  /**
   * Loads the category list unless a previous load already succeeded.
   * Pages that need categories on entry (including deep links / F5) call this;
   * loadCategories() stays the unconditional refresh behind the retry buttons.
   * The flag — not `_categories().length` — is the success marker, because
   * loadCategoryDetailBySlug() also seeds a single category into that array.
   */
  ensureCategories(): void {
    if (this._categoriesLoaded) return;
    if (this._categoriesState().status === 'loading') return;
    this.loadCategories();
  }

  loadFreeResources(): void {
    void (async () => {
      this._freeState.set(loadingActionState());
      try {
        await this.freePager.loadFirst();
        const freeItems = this.freePager.items();
        if (freeItems.length) {
          this._documents.update((docs) => {
            const byId = new Map(docs.map((d) => [d.id, d]));
            for (const item of freeItems) byId.set(item.id, item);
            return [...byId.values()];
          });
        }
        this._freeState.set(idleActionState());
      } catch (e) {
        this.apiFail.report('errors.context.loadFreeDocuments', e);
        this._freeState.set(errorActionState('โหลดเอกสารฟรีไม่สำเร็จ'));
      }
    })();
  }

  loadMoreFreeResources(): void {
    void (async () => {
      this._freeState.set(loadingActionState());
      try {
        await this.freePager.loadMore();
        const freeItems = this.freePager.items();
        if (freeItems.length) {
          this._documents.update((docs) => {
            const byId = new Map(docs.map((d) => [d.id, d]));
            for (const item of freeItems) byId.set(item.id, item);
            return [...byId.values()];
          });
        }
        this._freeState.set(idleActionState());
      } catch (e) {
        this.apiFail.report('errors.context.loadMoreFreeDocuments', e);
        this._freeState.set(errorActionState('โหลดเอกสารฟรีไม่สำเร็จ'));
      }
    })();
  }

  /**
   * personalized-recommendations v1 §4: home-page "แนะนำสำหรับคุณ" module. Fixed-size (not paged —
   * this is a curated home module, not a browsable list, same reasoning as `PlatformStatsResponse`
   * having no paging at all). Safe to call for both logged-in and anonymous callers — the backend
   * always resolves a strategy, this never needs to check auth state first.
   *
   * Error → same `ApiFailureReporter` convention as the rest of this service (§4 "การตัดสินใจ:
   * error → รายงานผ่าน ApiFailureReporter"): reported for observability, but the section itself
   * has no error UI of its own — clearing both signals just makes it not render (AC-12).
   */
  loadRecommended(take = 8): void {
    void (async () => {
      try {
        const result = await getApiMarketplaceRecommended({ query: { Take: take } });
        const data = unwrapSdkResult(result);
        this._recommended.set((data.items ?? []).map(mapDocument));
        this._recommendedStrategy.set(toRecommendationStrategy(data.strategy));
        // crm-driven-discovery v1 §3.3: 3 new fields on this *same* response (§3.3 "ประกาศ
        // supersede") — strategyReason is the §4.3 subtitle, gatePassed is true only on the
        // `crm-personalized` branch, explanations is a parallel array to `items` joined
        // client-side on `documentId` (§3.3 "ทำไมถึงใช้ parallel array").
        this._recommendedReason.set(data.strategyReason ?? '');
        this._recommendedGatePassed.set(data.gatePassed ?? false);
        this._recommendedExplanations.set(mapRecommendationExplanations(data.explanations));
      } catch (e) {
        this._recommended.set([]);
        this._recommendedStrategy.set(null);
        this._recommendedReason.set('');
        this._recommendedGatePassed.set(false);
        this._recommendedExplanations.set(new Map());
        this.apiFail.report('errors.context.loadRecommendations', e);
      }
    })();
  }

  private readonly _categoryDetailState = signal<ActionState>(idleActionState());
  private readonly _categoryDocuments = signal<DocumentItem[]>([]);
  private readonly _categoryDocumentsState = signal<ActionState>(idleActionState());

  readonly categoryDetailState = this._categoryDetailState.asReadonly();
  readonly categoryDocuments = this._categoryDocuments.asReadonly();
  readonly categoryDocumentsState = this._categoryDocumentsState.asReadonly();

  /** Resolves with the loaded category so callers can chain on its id. */
  async loadCategoryDetailBySlug(slug: string): Promise<Category | null> {
    if (!slug) return null;
    this._categoryDetailState.set(loadingActionState());
    try {
      const res = await getApiMarketplaceCategoriesBySlug({ path: { slug } });
      const detail = unwrapSdkResult(res);
      const mapped = mapCategoryDetail(detail);

      // Upsert. On a deep link the list cache is still empty, so a map()-only
      // update dropped the category that had just been fetched and
      // getCategoryBySlug() reported a 404 the server never sent.
      this._categories.update((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        byId.set(mapped.id, mapped);
        return [...byId.values()];
      });

      // Hydrate subcategories for this category only (lazy-load; avoids N+1).
      const subs = mapped.subcategories ?? [];
      if (subs.length) {
        this._subcategories.update((prev) => {
          const byId = new Map(prev.map((s) => [s.id, s]));
          for (const s of subs) byId.set(s.id, s);
          return [...byId.values()];
        });
      }

      this._categoryDetailState.set(idleActionState());
      return mapped;
    } catch (e) {
      this.apiFail.report('errors.context.loadCategoryDetail', e);
      this._categoryDetailState.set(
        errorActionState('โหลดรายละเอียดหมวดหมู่ไม่สำเร็จ'),
      );
      return null;
    }
  }

  /**
   * One-shot `/marketplace/search` fetch kept out of the shared marketplace list.
   * The category and storefront pages show a slice of the catalog that the home
   * feed never contains, so filtering `documents()` leaves them empty on a deep link.
   */
  private async fetchScopedDocuments(
    query: NonNullable<
      NonNullable<Parameters<typeof getApiMarketplaceSearch>[0]>['query']
    >,
  ): Promise<DocumentItem[]> {
    const result = await getApiMarketplaceSearch({ query });
    const data = unwrapSdkResult(result as SdkResult<MarketplaceSearchResponse>);
    return (data.items ?? []).map(mapDocument);
  }

  /** Loads the documents of one category — call from the category detail page. */
  loadCategoryDocuments(categoryId: string): void {
    if (!categoryId) {
      this._categoryDocuments.set([]);
      this._categoryDocumentsState.set(idleActionState());
      return;
    }
    void (async () => {
      this._categoryDocumentsState.set(loadingActionState());
      try {
        this._categoryDocuments.set(
          await this.fetchScopedDocuments({
            CategoryId: categoryId,
            Page: 1,
            PageSize: SCOPED_PAGE_SIZE,
            Sort: 'popular',
          }),
        );
        this._categoryDocumentsState.set(idleActionState());
      } catch (e) {
        this.apiFail.report('errors.context.loadCategoryDocuments', e);
        this._categoryDocuments.set([]);
        this._categoryDocumentsState.set(
          errorActionState('โหลดเอกสารในหมวดหมู่ไม่สำเร็จ'),
        );
      }
    })();
  }

  /**
   * Optional: server-side search via OpenAPI contract.
   * UI can keep local filtering, but this enables full backend-driven search later.
   */
  async searchRemote(query: Parameters<typeof getApiMarketplaceSearch>[0] extends
    | undefined
    | infer O
    ? O
    : never): Promise<void> {
    try {
      const result = await getApiMarketplaceSearch(query as never);
      const data = unwrapSdkResult(result);
      this._documents.set((data.items ?? []).map(mapDocument));
    } catch (e) {
      this.apiFail.report('errors.context.searchDocuments', e);
    }
  }

  /**
   * Loads (and caches) the full document detail — call from document-detail page.
   *
   * `entrySource` (seller-analytics-insights v1 §4): the traffic source `NavigationSourceService`
   * classified for this navigation, forwarded to `logDocumentView` as a fire-and-forget analytics
   * call — never awaited, never blocks/affects this method's own state.
   */
  loadDocumentDetail(id: string, entrySource?: DocumentEntrySource): void {
    if (!id) return;
    void (async () => {
      this._documentDetailState.set(loadingActionState());
      this._documentDetailNotFound.set(false);
      try {
        const result = await getApiMarketplaceDocumentsById({
          path: { id },
        });
        const doc = unwrapSdkResult(result);
        const item = mapDocumentDetail(doc);
        const cachedProfile = item.seller?.id ? this._sellerProfiles().get(item.seller.id) : undefined;
        if (cachedProfile) {
          item.seller = {
            ...item.seller,
            followerCount: cachedProfile.followerCount,
            rating: cachedProfile.rating,
            totalDocuments: cachedProfile.totalDocuments,
            totalSales: cachedProfile.totalSales,
            badges: cachedProfile.badges?.length ? cachedProfile.badges : item.seller.badges,
          };
        }
        this._documentDetails.update((map) => new Map(map).set(id, item));
        this._documentDetailState.set(idleActionState());
        this.logDocumentView(id, entrySource);
        if (item.seller?.id) {
          void this.fetchSellerProfile(item.seller.id);
        }
      } catch (e) {
        if (extractHttpStatus(e) === 404) {
          // Bug #8: a real 404 — don't spam the "โหลด...ไม่สำเร็จ" toast for something that
          // isn't a network/server failure, and don't offer a retry that can never work.
          this._documentDetailNotFound.set(true);
          this._documentDetailState.set(errorActionState('ไม่พบเอกสารนี้'));
          return;
        }
        this.apiFail.report('errors.context.loadDocumentDetail', e);
        this._documentDetailState.set(errorActionState('โหลดรายละเอียดเอกสารไม่สำเร็จ'));
      }
    })();
  }

  /**
   * seller-analytics-insights v1 §4 "การแบ่งงาน" (รอบสอง): fire-and-forget view-tracking call for
   * `/document/{id}` mounts (not quick-view, not preview — see AC-16/AC-20 and contract §0).
   * Never awaited by the caller, never surfaces an error to the user (AC-16) — best-effort
   * analytics only, no retry.
   */
  private logDocumentView(id: string, entrySource?: DocumentEntrySource): void {
    void (async () => {
      try {
        await postApiMarketplaceDocumentsByIdView({
          path: { id },
          body: { source: entrySource?.source ?? 'direct', searchTerm: entrySource?.searchTerm ?? null },
          throwOnError: true,
        });
      } catch {
        // best-effort analytics เท่านั้น — ห้ามโชว์ error ให้ user เห็นเด็ดขาด, ห้าม retry
      }
    })();
  }

  /** Refreshes related documents via API, returns them as a signal update. */
  loadRelated(documentId: string, limit = 4): void {
    void (async () => {
      try {
        await getApiMarketplaceDocumentsByIdRelated({
          path: { id: documentId },
          query: { Page: 1, PageSize: limit },
        });
      } catch (e) {
        this.apiFail.report('errors.context.loadRelatedDocuments', e);
      }
    })();
  }

  readonly featured = computed(() =>
    this._documents().filter((d) => d.isFeatured).slice(0, 6),
  );

  readonly bestsellers = computed(() =>
    this._documents().filter((d) => d.isBestseller).slice(0, 8),
  );

  readonly editorsPicks = computed(() =>
    this._documents().filter((d) => d.isEditorsPick).slice(0, 6),
  );

  readonly freeResources = computed(() =>
    this._documents().filter((d) => d.isFree),
  );

  /**
   * personalized-recommendations v1 §4: home-page "แนะนำสำหรับคุณ" module. Not derived from
   * `_documents()` like `trending`/`newArrivals` above — the backend already returns the exact
   * ranked+filtered list (purchase-history match or popular-fallback), so this is its own signal
   * populated by `loadRecommended()` rather than a client-side re-derivation.
   */
  private readonly _recommended = signal<DocumentItem[]>([]);
  readonly recommended = this._recommended.asReadonly();

  /**
   * crm-driven-discovery v1 §3.3/§4.2/§4.4: widened from the 2-value union
   * `personalized-recommendations v1 §3.1` used to `RecommendationStrategy` (4 values) — a
   * UI-side type only (not sourced from the SDK). Unknown/future values from the backend map to
   * `'popular-fallback'` defensively (see `toRecommendationStrategy` below).
   */
  private readonly _recommendedStrategy = signal<RecommendationStrategy | null>(null);
  readonly recommendedStrategy = this._recommendedStrategy.asReadonly();

  /** crm-driven-discovery v1 §3.3/§4.2 — Thai subtitle sentence for the "แนะนำสำหรับคุณ" section (§4.3), read straight from `strategyReason` (see `loadRecommended` below). */
  private readonly _recommendedReason = signal<string>('');
  readonly recommendedReason = this._recommendedReason.asReadonly();

  /** crm-driven-discovery v1 §3.3 — `true` only when `strategy === 'crm-personalized'`. */
  private readonly _recommendedGatePassed = signal<boolean>(false);
  readonly recommendedGatePassed = this._recommendedGatePassed.asReadonly();

  /**
   * crm-driven-discovery v1 §3.3/§4.2: keyed by `documentId` — built once per `loadRecommended()`
   * call, never `.find()`-ed per card in a template. A missing key means "no explanation for this
   * item" (branch other than `crm-personalized`, or backend genuinely has none) — callers must
   * tolerate that (§3.3 "ต้องทนกรณีหาไม่เจอ"), never treat it as an error.
   */
  private readonly _recommendedExplanations = signal<Map<string, RecommendationExplanation>>(new Map());
  readonly recommendedExplanations = this._recommendedExplanations.asReadonly();

  readonly trending = computed(() =>
    [...this._documents()].sort((a, b) => b.downloads - a.downloads).slice(0, 8),
  );

  readonly newArrivals = computed(() =>
    [...this._documents()]
      .sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 6),
  );

  readonly filtered = computed(() => {
    const f = this._filters();
    const t = this._tab();
    let docs = [...this._documents()];

    if (this._listSource() === 'search') {
      if (t === 'top-rated') {
        docs = docs.filter((d) => d.rating >= 4.7);
      }
      if (f.categoryIds.length > 1) {
        docs = docs.filter((d) => f.categoryIds.some((id) => d.categoryIds.includes(id)));
      }
      if (f.subcategoryIds.length > 1) {
        docs = docs.filter(
          (d) => d.subcategoryId && f.subcategoryIds.includes(d.subcategoryId),
        );
      }
      if (f.minRating > 0) {
        docs = docs.filter((d) => d.rating >= f.minRating);
      }
      if (f.formats.length > 1) {
        docs = docs.filter((d) => f.formats.includes(d.format));
      }
      if (f.gradeLevels.length > 1) {
        docs = docs.filter((d) =>
          d.gradeLevels.some((g) => f.gradeLevels.includes(g)),
        );
      }
      if (f.resourceTypes.length > 1) {
        docs = docs.filter((d) => f.resourceTypes.includes(d.resourceType));
      }
      if (f.standards.length > 1) {
        docs = docs.filter((d) =>
          (d.standards ?? []).some((s) => f.standards.includes(s)),
        );
      }
      return docs;
    }

    // Tab filtering (client-side catalog browse)
    switch (t) {
      case 'free':
        docs = docs.filter((d) => d.isFree);
        break;
      case 'top-rated':
        docs = docs.filter((d) => d.rating >= 4.7);
        break;
      case 'new':
        docs = [...docs].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      // 'bundles' is handled at marketplace level via BundleService
    }

    if (f.search.trim()) {
      const tokens = tokenizeSearch(f.search);
      if (tokens.length) {
        docs = docs.filter((d) => {
          const title = d.title.toLowerCase();
          const shortDesc = d.shortDescription.toLowerCase();
          const desc = (d.description ?? '').toLowerCase();
          const tags = d.tags.map((t) => t.toLowerCase());
          return tokens.every(
            (t) =>
              title.includes(t) ||
              shortDesc.includes(t) ||
              desc.includes(t) ||
              tags.some((tag) => tag.includes(t)),
          );
        });
      }
    }

    if (f.categoryIds.length) {
      docs = docs.filter((d) => f.categoryIds.some((id) => d.categoryIds.includes(id)));
    }
    if (f.subcategoryIds.length) {
      docs = docs.filter(
        (d) => d.subcategoryId && f.subcategoryIds.includes(d.subcategoryId),
      );
    }
    if (f.gradeLevels.length) {
      docs = docs.filter((d) =>
        d.gradeLevels.some((g) => f.gradeLevels.includes(g)),
      );
    }
    if (f.resourceTypes.length) {
      docs = docs.filter((d) => f.resourceTypes.includes(d.resourceType));
    }
    if (f.formats.length) {
      docs = docs.filter((d) => f.formats.includes(d.format));
    }
    if (f.standards.length) {
      docs = docs.filter((d) =>
        (d.standards ?? []).some((s) => f.standards.includes(s)),
      );
    }
    docs = docs.filter(
      (d) => d.price >= f.minPrice && d.price <= f.maxPrice,
    );
    if (f.minRating > 0) {
      docs = docs.filter((d) => d.rating >= f.minRating);
    }
    if (f.freeOnly) {
      docs = docs.filter((d) => d.isFree);
    }

    if (t !== 'new') {
      switch (f.sort) {
        case 'newest':
          docs.sort((a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
          );
          break;
        case 'price-asc':
          docs.sort((a, b) => a.price - b.price);
          break;
        case 'price-desc':
          docs.sort((a, b) => b.price - a.price);
          break;
        case 'rating':
          docs.sort((a, b) => b.rating - a.rating);
          break;
        case 'popular':
        default:
          docs.sort((a, b) => b.downloads - a.downloads);
      }
    }

    return docs;
  });

  setTab(tab: MarketplaceTab): void {
    this._tab.set(tab);
    this.scheduleListRefresh(true);
  }

  setFilters(patch: Partial<CatalogFilters>): void {
    this._filters.update((f) => ({ ...f, ...patch }));
    const keys = Object.keys(patch);
    const debounce = keys.length === 1 && keys[0] === 'search';
    this.scheduleListRefresh(!debounce);
  }

  resetFilters(): void {
    this._filters.set({ ...DEFAULT_FILTERS });
    this._tab.set('all');
    this.scheduleListRefresh(true);
  }

  getById(id: string): DocumentItem | undefined {
    return this._documentDetails().get(id) ?? this._documents().find((d) => d.id === id);
  }

  getCategoryById(id: string): Category | undefined {
    return this._categories().find((c) => c.id === id);
  }

  getCategoryBySlug(slug: string): Category | undefined {
    return this._categories().find((c) => c.slug === slug);
  }

  getSubcategoryById(id: string): Subcategory | undefined {
    return this._subcategories().find((s) => s.id === id);
  }

  getSubcategoryBySlug(slug: string): Subcategory | undefined {
    return this._subcategories().find((s) => s.slug === slug);
  }

  getSubcategoriesOf(categoryId: string): Subcategory[] {
    return this._subcategories().filter((s) => s.parentId === categoryId);
  }

  // ─── Seller Profile ─────────────────────────────────────────────────────────

  private readonly _sellerProfile = signal<SellerProfileResponse | null>(null);
  private readonly _sellerProfileState = signal<ActionState>(idleActionState());
  private readonly _sellerDocuments = signal<DocumentItem[]>([]);
  private readonly _sellerDocumentsState = signal<ActionState>(idleActionState());
  private readonly _sellerProfiles = signal<Map<string, Seller>>(new Map());
  private readonly _inFlightSellerProfiles = new Map<string, Promise<Seller | null>>();
  private readonly _failedSellerProfileIds = new Set<string>();

  readonly sellerProfile = this._sellerProfile.asReadonly();
  readonly sellerProfileState = this._sellerProfileState.asReadonly();
  readonly sellerDocuments = this._sellerDocuments.asReadonly();
  readonly sellerDocumentsState = this._sellerDocumentsState.asReadonly();
  readonly sellerProfiles = this._sellerProfiles.asReadonly();

  /**
   * seller-pricing-and-storefront-stats v1 §3.3/§4: 6-month units-sold history for the public
   * storefront's sales chart. Separate signal (not read off `sellerProfile()` directly) — kept
   * that way post-regen too so the storefront page's `computed()`s stay decoupled from
   * `SellerProfileResponse`'s exact shape. `[]` (all-zero) hides the chart section per AC-15.
   */
  private readonly _sellerSalesByMonth = signal<SellerSalesByMonthPoint[]>([]);
  readonly sellerSalesByMonth = this._sellerSalesByMonth.asReadonly();

  async loadSellerProfile(sellerId: string): Promise<SellerProfileResponse | null> {
    if (!sellerId) return null;

    this._sellerProfileState.set(loadingActionState());
    try {
      const result = await getApiSellersBySellerIdProfile({ path: { sellerId } });
      const data = unwrapSdkResult(result);
      this._sellerProfile.set(data);
      this._failedSellerProfileIds.delete(sellerId);
      const seller = mapSellerProfile(data);
      this._sellerProfiles.update((map) => new Map(map).set(sellerId, seller));
      this.syncSellerToDocuments(seller);
      this._sellerSalesByMonth.set(
        (data.salesByMonth ?? []).map((m) => ({
          month: m.month ?? '',
          unitsSold: m.unitsSold ?? 0,
        })),
      );
      this._sellerProfileState.set(idleActionState());
      return data;
    } catch (e) {
      this._failedSellerProfileIds.add(sellerId);
      this.apiFail.report('errors.context.loadSellerInfo', e);
      this._sellerProfileState.set(errorActionState('โหลดข้อมูลผู้ขายไม่สำเร็จ'));
      this._sellerProfile.set(null);
      this._sellerSalesByMonth.set([]);
      return null;
    }
  }

  async fetchSellerProfile(sellerId: string): Promise<Seller | null> {
    if (!sellerId) return null;
    const cached = this._sellerProfiles().get(sellerId);
    if (cached) return cached;
    if (this._failedSellerProfileIds.has(sellerId)) return null;

    const inFlight = this._inFlightSellerProfiles.get(sellerId);
    if (inFlight) return inFlight;

    const promise = (async () => {
      try {
        const result = await getApiSellersBySellerIdProfile({ path: { sellerId } });
        const data = unwrapSdkResult(result);
        const seller = mapSellerProfile(data);
        this._sellerProfiles.update((map) => new Map(map).set(sellerId, seller));
        this.syncSellerToDocuments(seller);
        return seller;
      } catch {
        this._failedSellerProfileIds.add(sellerId);
        return null;
      } finally {
        this._inFlightSellerProfiles.delete(sellerId);
      }
    })();

    this._inFlightSellerProfiles.set(sellerId, promise);
    return promise;
  }

  loadSellerProfilesForDocuments(docs: DocumentItem[]): void {
    const ids = docs
      .map((d) => d.seller?.id)
      .filter((id, idx, arr): id is string => Boolean(id) && arr.indexOf(id) === idx)
      .slice(0, 6);

    for (const id of ids) {
      if (
        !this._sellerProfiles().has(id) &&
        !this._failedSellerProfileIds.has(id) &&
        !this._inFlightSellerProfiles.has(id)
      ) {
        void this.fetchSellerProfile(id);
      }
    }
  }

  private syncSellerToDocuments(seller: Seller): void {
    const sellerId = seller.id;
    if (!sellerId) return;

    this._documentDetails.update((map) => {
      let changed = false;
      const newMap = new Map(map);
      for (const [docId, doc] of newMap.entries()) {
        if (doc.seller && doc.seller.id === sellerId) {
          newMap.set(docId, {
            ...doc,
            seller: {
              ...doc.seller,
              followerCount: seller.followerCount,
              rating: seller.rating,
              totalDocuments: seller.totalDocuments,
              totalSales: seller.totalSales,
              studioName: seller.studioName || doc.seller.studioName,
              ownerName: seller.ownerName || doc.seller.ownerName,
              avatar: seller.avatar || doc.seller.avatar,
              bio: seller.bio || doc.seller.bio,
              badges: seller.badges?.length ? seller.badges : doc.seller.badges,
              specialties: seller.specialties ?? doc.seller.specialties,
            },
          });
          changed = true;
        }
      }
      return changed ? newMap : map;
    });

    this._documents.update((docs) =>
      docs.map((doc) =>
        doc.seller && doc.seller.id === sellerId
          ? {
              ...doc,
              seller: {
                ...doc.seller,
                followerCount: seller.followerCount,
                rating: seller.rating,
                totalDocuments: seller.totalDocuments,
                totalSales: seller.totalSales,
                studioName: seller.studioName || doc.seller.studioName,
                ownerName: seller.ownerName || doc.seller.ownerName,
                avatar: seller.avatar || doc.seller.avatar,
                bio: seller.bio || doc.seller.bio,
                badges: seller.badges?.length ? seller.badges : doc.seller.badges,
                specialties: seller.specialties ?? doc.seller.specialties,
              },
            }
          : doc,
      ),
    );

    this._sellerDocuments.update((docs) =>
      docs.map((doc) =>
        doc.seller && doc.seller.id === sellerId
          ? {
              ...doc,
              seller: {
                ...doc.seller,
                followerCount: seller.followerCount,
                rating: seller.rating,
                totalDocuments: seller.totalDocuments,
                totalSales: seller.totalSales,
                studioName: seller.studioName || doc.seller.studioName,
                ownerName: seller.ownerName || doc.seller.ownerName,
                avatar: seller.avatar || doc.seller.avatar,
                bio: seller.bio || doc.seller.bio,
                badges: seller.badges?.length ? seller.badges : doc.seller.badges,
                specialties: seller.specialties ?? doc.seller.specialties,
              },
            }
          : doc,
      ),
    );
  }

  setSellerFollowerCount(sellerId: string, followerCount: number): void {
    if (!sellerId) return;
    const clamped = Math.max(0, followerCount);
    const current = this._sellerProfile();
    if (current && current.id === sellerId) {
      this._sellerProfile.set({
        ...current,
        followerCount: clamped,
      });
    }

    this._sellerProfiles.update((map) => {
      let s = map.get(sellerId);
      if (!s) {
        const matchingDoc =
          Array.from(this._documentDetails().values()).find((d) => d.seller?.id === sellerId) ??
          this._documents().find((d) => d.seller?.id === sellerId);
        if (matchingDoc?.seller) {
          s = matchingDoc.seller;
        }
      }
      if (!s) return map;
      const copy = new Map(map);
      copy.set(sellerId, {
        ...s,
        followerCount: clamped,
      });
      return copy;
    });

    this._documentDetails.update((map) => {
      let changed = false;
      const newMap = new Map(map);
      for (const [docId, doc] of newMap.entries()) {
        if (doc.seller && doc.seller.id === sellerId && doc.seller.followerCount !== clamped) {
          newMap.set(docId, {
            ...doc,
            seller: {
              ...doc.seller,
              followerCount: clamped,
            },
          });
          changed = true;
        }
      }
      return changed ? newMap : map;
    });

    this._documents.update((docs) =>
      docs.map((doc) =>
        doc.seller && doc.seller.id === sellerId && doc.seller.followerCount !== clamped
          ? {
              ...doc,
              seller: {
                ...doc.seller,
                followerCount: clamped,
              },
            }
          : doc,
      ),
    );

    this._sellerDocuments.update((docs) =>
      docs.map((doc) =>
        doc.seller && doc.seller.id === sellerId && doc.seller.followerCount !== clamped
          ? {
              ...doc,
              seller: {
                ...doc.seller,
                followerCount: clamped,
              },
            }
          : doc,
      ),
    );
  }

  updateSellerFollowerCount(delta: number, sellerId?: string): void {
    const current = this._sellerProfile();
    if (current && (!sellerId || current.id === sellerId)) {
      this._sellerProfile.set({
        ...current,
        followerCount: Math.max(0, (current.followerCount ?? 0) + delta),
      });
    }

    const targetSellerId = sellerId ?? current?.id;
    if (targetSellerId) {
      this._sellerProfiles.update((map) => {
        let s = map.get(targetSellerId);
        if (!s) {
          const matchingDoc =
            Array.from(this._documentDetails().values()).find((d) => d.seller?.id === targetSellerId) ??
            this._documents().find((d) => d.seller?.id === targetSellerId);
          if (matchingDoc?.seller) {
            s = matchingDoc.seller;
          }
        }
        if (!s) return map;
        const copy = new Map(map);
        copy.set(targetSellerId, {
          ...s,
          followerCount: Math.max(0, (s.followerCount ?? 0) + delta),
        });
        return copy;
      });

      this._documentDetails.update((map) => {
        let changed = false;
        const newMap = new Map(map);
        for (const [docId, doc] of newMap.entries()) {
          if (doc.seller && doc.seller.id === targetSellerId) {
            newMap.set(docId, {
              ...doc,
              seller: {
                ...doc.seller,
                followerCount: Math.max(0, (doc.seller.followerCount ?? 0) + delta),
              },
            });
            changed = true;
          }
        }
        return changed ? newMap : map;
      });

      this._documents.update((docs) =>
        docs.map((doc) =>
          doc.seller && doc.seller.id === targetSellerId
            ? {
                ...doc,
                seller: {
                  ...doc.seller,
                  followerCount: Math.max(0, (doc.seller.followerCount ?? 0) + delta),
                },
              }
            : doc,
        ),
      );

      this._sellerDocuments.update((docs) =>
        docs.map((doc) =>
          doc.seller && doc.seller.id === targetSellerId
            ? {
                ...doc,
                seller: {
                  ...doc.seller,
                  followerCount: Math.max(0, (doc.seller.followerCount ?? 0) + delta),
                },
              }
            : doc,
        ),
      );
    }
  }

  /** Loads the documents of one seller — call from the storefront page. */
  loadSellerDocuments(sellerId: string): void {
    if (!sellerId) {
      this._sellerDocuments.set([]);
      this._sellerDocumentsState.set(idleActionState());
      return;
    }
    void (async () => {
      this._sellerDocumentsState.set(loadingActionState());
      try {
        this._sellerDocuments.set(
          await this.fetchScopedDocuments({
            SellerId: sellerId,
            Page: 1,
            PageSize: SCOPED_PAGE_SIZE,
            Sort: 'popular',
          }),
        );
        this._sellerDocumentsState.set(idleActionState());
      } catch (e) {
        this.apiFail.report('errors.context.loadStoreDocuments', e);
        this._sellerDocuments.set([]);
        this._sellerDocumentsState.set(
          errorActionState('โหลดเอกสารของร้านไม่สำเร็จ'),
        );
      }
    })();
  }

  countByGrade(grade: GradeLevel): number {
    return this._documents().filter((d) => d.gradeLevels.includes(grade)).length;
  }

  countByResourceType(type: ResourceType): number {
    return this._documents().filter((d) => d.resourceType === type).length;
  }

  getRelated(documentId: string, limit = 4): DocumentItem[] {
    const doc = this.getById(documentId);
    if (!doc) return [];
    const docCats = new Set(doc.categoryIds);
    if (docCats.size === 0) return [];
    return this._documents()
      .filter((d) => d.id !== documentId && d.categoryIds.some((id) => docCats.has(id)))
      .slice(0, limit);
  }

  // ===== ml-embedding-recommendations v1 §3.1/§4.3: "มักซื้อคู่กับเอกสารนี้" =====
  // Same shape as `BundleService.loadBundlesContainingDocument` (document-bundle-cross-sell):
  // the page loads this non-blocking, so a failure resolves as `[]` (section hidden silently)
  // rather than throwing — there is no error banner for this section (§4.3).

  /** Documents historically bought together with `documentId`, ranked strongest-first. */
  async loadBoughtTogether(documentId: string, take = 6): Promise<BoughtTogetherItem[]> {
    try {
      const result = await getApiMarketplaceDocumentsByIdBoughtTogether({
        path: { id: documentId },
        query: { Take: take },
      });
      const data = unwrapSdkResult(result);
      return (data.items ?? [])
        .map(mapBoughtTogetherItem)
        .filter((item): item is BoughtTogetherItem => item !== null);
    } catch (e) {
      this.apiFail.report('errors.context.loadFrequentlyBought', e);
      return [];
    }
  }

  /**
   * F-01: the document detail page called these two through the `core/api` barrel, which the
   * old guard rule did not match. Both are marketplace reads/writes about one document, so
   * they belong with the rest of the catalog surface rather than in a new service.
   *
   * Neither result is cached: the preview is watermarked per request, and a question has no
   * client-side state the page keeps beyond "sent".
   */
  async loadDocumentPreview(documentId: string): Promise<MarketplaceDocumentPreviewResponse> {
    return unwrapSdkResult(await getApiMarketplaceDocumentsByIdPreview({ path: { id: documentId } }));
  }

  async askDocumentQuestion(documentId: string, question: string): Promise<void> {
    await postApiMarketplaceDocumentsByIdQna({
      path: { id: documentId },
      body: { question },
      throwOnError: true,
    });
  }

  /**
   * F-09 (N-05): report a document.
   *
   * Until now the only endpoint that could create a DOCUMENT_REPORT was admin-only, so a buyer
   * who found their own work being resold had no way to say so. The server rejects a second
   * open report from the same person with 409.
   */
  async reportDocument(documentId: string, category: string, details: string): Promise<void> {
    await postApiMarketplaceDocumentsByIdReport({
      path: { id: documentId },
      body: { category, details },
      throwOnError: true,
    });
  }
}

const KNOWN_RECOMMENDATION_STRATEGIES: ReadonlySet<string> = new Set<RecommendationStrategy>([
  'crm-personalized',
  'purchase-history',
  'declared-interest',
  'popular-fallback',
]);

/**
 * crm-driven-discovery v1 §4.2: "ค่าที่ไม่รู้จักจาก backend → map เป็น 'popular-fallback'" — keeps
 * a 5th value added to the backend's `RecommendationStrategy` static class later from crashing the
 * §4.3 strategy→title map instead of failing loudly.
 */
export function toRecommendationStrategy(raw: string | undefined): RecommendationStrategy {
  return raw != null && KNOWN_RECOMMENDATION_STRATEGIES.has(raw) ? (raw as RecommendationStrategy) : 'popular-fallback';
}

/**
 * crm-driven-discovery v1 §3.3/§4.2: `RecommendationExplanationResponse[]` → `Map<documentId,
 * RecommendationExplanation>`, built once per `loadRecommended()` call (never re-derived per
 * card in a template — §3.3 "สร้าง Map ครั้งเดียวตอน map response ห้าม find() ใน template").
 */
export function mapRecommendationExplanations(
  explanations: Array<RecommendationExplanationResponse> | undefined,
): Map<string, RecommendationExplanation> {
  const map = new Map<string, RecommendationExplanation>();
  for (const e of explanations ?? []) {
    if (!e.documentId) continue;
    map.set(e.documentId, {
      documentId: e.documentId,
      reason: e.reason ?? '',
      relevanceScore: e.relevanceScore ?? 0,
      matchedFacetType: (e.matchedFacetType as CrmFacetType | null) ?? null,
      matchedFacetValue: e.matchedFacetValue ?? null,
      matchedFacetLabel: e.matchedFacetLabel ?? null,
    });
  }
  return map;
}

/** Same shape `unwrapSdkResult` throws (`{ status }`) — mirrors `order.service.ts`'s `extractStatus`. */
function extractHttpStatus(error: unknown): number | undefined {
  if (error == null || typeof error !== 'object') return undefined;
  const o = error as Record<string, unknown>;
  if (typeof o['status'] === 'number') return o['status'] as number;
  const r = o['response'] as Record<string, unknown> | undefined;
  if (r && typeof r['status'] === 'number') return r['status'] as number;
  return undefined;
}
