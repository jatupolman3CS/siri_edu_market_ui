import { Injectable, computed, inject, signal } from '@angular/core';
import { Category, DocumentItem, GradeLevel, ResourceType, Subcategory } from '../models';
import { mapCategory, mapCategoryDetail, mapDocument, mapDocumentDetail } from '../api-mappers/mappers';
import type { MarketplaceSearchResponse } from '../api/types.gen';
import {
  getApiMarketplaceCatalog,
  getApiMarketplaceCategories,
  getApiMarketplaceCategoriesBySlug,
  getApiMarketplaceDocumentsById,
  getApiMarketplaceDocumentsByIdPreview,
  getApiMarketplaceDocumentsByIdRelated,
  getApiMarketplaceFree,
  getApiMarketplaceSearch,
  getApiSellersBySellerIdProfile,
  postApiMarketplaceDocumentsByIdQna,
  postApiMarketplaceDocumentsByIdReport,
} from '../api';
import type {
  MarketplaceDocumentPreviewResponse,
  SellerProfileResponse,
} from '../api/types.gen';
import { unwrapSdkResult, type SdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';
import { createInfinitePager } from './infinite-pager';

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
  private readonly catalogPager = createInfinitePager<DocumentItem>({
    pageSize: 24,
    errorMessage: 'โหลดรายการเอกสารไม่สำเร็จ',
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
    errorMessage: 'โหลดเอกสารฟรีไม่สำเร็จ',
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

  readonly documents = this._documents.asReadonly();
  readonly categories = this._categories.asReadonly();
  readonly subcategories = this._subcategories.asReadonly();
  readonly filters = this._filters.asReadonly();
  readonly tab = this._tab.asReadonly();

  readonly catalogState = this._catalogState.asReadonly();
  readonly freeState = this._freeState.asReadonly();
  readonly categoriesState = this._categoriesState.asReadonly();
  readonly documentDetailState = this._documentDetailState.asReadonly();
  readonly catalogHasMore = computed(() => {
    if (this._listSource() === 'search') {
      const total = this._searchTotalCount();
      if (total == null) return false;
      return this._documents().length < total;
    }
    return this.catalogPager.hasMore();
  });
  readonly freeHasMore = this.freePager.hasMore;

  constructor() {
    // Intentionally do not auto-fetch in a root singleton service.
    // Pages should call init/load methods explicitly to avoid unnecessary API calls.
  }

  /** Call from Home page. Loads just enough data for the home feed. */
  initForHome(): void {
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
        this.apiFail.report('โหลดรายการเอกสารเพิ่มเติม', e);
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
      return;
    }
    this._listRefreshTimer = setTimeout(() => {
      this._listRefreshTimer = null;
      void this.syncListWithBackend();
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
  ): NonNullable<Parameters<typeof getApiMarketplaceSearch>[0]> {
    const f = this._filters();
    const t = this._tab();
    const query: NonNullable<
      NonNullable<Parameters<typeof getApiMarketplaceSearch>[0]>['query']
    > = {
      Page: page,
      PageSize: 24,
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
  ): Promise<void> {
    const gen = ++this._fetchGeneration;
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

    this._catalogState.set(loadingActionState());
    try {
      if (useSearch) {
        this._listSource.set('search');
        await this.runSearchPage(1, true);
      } else {
        this._listSource.set('catalog');
        this._searchTotalCount.set(null);
        this._searchPage.set(1);
        this.catalogPager.reset();
        await this.catalogPager.loadFirst();
        this._documents.set(this.catalogPager.items());
      }
      this._catalogState.set(idleActionState());
    } catch (e) {
      this.apiFail.report(
        useSearch ? 'ค้นหาเอกสาร' : 'โหลดแคตตาล็อกเอกสาร',
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
        this.apiFail.report('โหลดหมวดหมู่', e);
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
        this.apiFail.report('โหลดเอกสารฟรี', e);
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
        this.apiFail.report('โหลดเอกสารฟรีเพิ่มเติม', e);
        this._freeState.set(errorActionState('โหลดเอกสารฟรีไม่สำเร็จ'));
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
      this.apiFail.report('โหลดรายละเอียดหมวดหมู่', e);
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
        this.apiFail.report('โหลดเอกสารในหมวดหมู่', e);
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
      this.apiFail.report('ค้นหาเอกสาร', e);
    }
  }

  /** Loads (and caches) the full document detail — call from document-detail page. */
  loadDocumentDetail(id: string): void {
    if (!id) return;
    void (async () => {
      this._documentDetailState.set(loadingActionState());
      try {
        const result = await getApiMarketplaceDocumentsById({
          path: { id },
        });
        const doc = unwrapSdkResult(result);
        const item = mapDocumentDetail(doc);
        this._documentDetails.update((map) => new Map(map).set(id, item));
        this._documentDetailState.set(idleActionState());
      } catch (e) {
        this.apiFail.report('โหลดรายละเอียดเอกสาร', e);
        this._documentDetailState.set(errorActionState('โหลดรายละเอียดเอกสารไม่สำเร็จ'));
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
        this.apiFail.report('โหลดเอกสารที่เกี่ยวข้อง', e);
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

  readonly sellerProfile = this._sellerProfile.asReadonly();
  readonly sellerProfileState = this._sellerProfileState.asReadonly();
  readonly sellerDocuments = this._sellerDocuments.asReadonly();
  readonly sellerDocumentsState = this._sellerDocumentsState.asReadonly();

  async loadSellerProfile(sellerId: string): Promise<SellerProfileResponse | null> {
    if (!sellerId) return null;

    this._sellerProfileState.set(loadingActionState());
    try {
      const result = await getApiSellersBySellerIdProfile({ path: { sellerId } });
      const data = unwrapSdkResult(result);
      this._sellerProfile.set(data);
      this._sellerProfileState.set(idleActionState());
      return data;
    } catch (e) {
      this.apiFail.report('โหลดข้อมูลผู้ขาย', e);
      this._sellerProfileState.set(errorActionState('โหลดข้อมูลผู้ขายไม่สำเร็จ'));
      this._sellerProfile.set(null);
      return null;
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
        this.apiFail.report('โหลดเอกสารของร้าน', e);
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
