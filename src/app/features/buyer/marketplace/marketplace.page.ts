import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzSelectModule } from 'ng-zorro-antd/select';
import {
  AdsService,
  BundleService,
  CatalogService,
  MAX_FILTER_VALUES_PER_DIMENSION,
  RecentlyViewedService,
} from '../../../core/services';
import {
  Bundle,
  DocumentItem,
  GRADE_LEVEL_LABELS,
  GradeLevel,
  RESOURCE_TYPE_LABELS,
  ResourceType,
} from '../../../core/models';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslationService, TranslatePipe } from '../../../core/i18n';

/**
 * marketplace-home-redesign v2 §1 ข้อ 8 / §4.2: หน้านี้เหลือ view เดียว (chip หมวดหมู่ + sidebar
 * filter + grid ผลลัพธ์เสมอ) — `view`/`listMode()`/`goToBrowse()`/rails "มาใหม่"/"ยอดนิยม"/"ฟรี"/
 * CRM discovery block/ปุ่ม "ดูทั้งหมด" ปิดท้าย ถูกตัดออกทั้งหมด (CRM discovery ย้ายไป home.page.ts).
 */
type MarketplaceUiTab = 'all' | 'free' | 'package';
type FilterGroupKey = 'category' | 'grade' | 'resourceType' | 'price' | 'rating' | 'format' | 'standard';
type PriceRangeKey = 'all' | 'free' | 'lt100' | '100-199' | 'gte200';

interface MarketplaceUiTabViewModel {
  value: MarketplaceUiTab;
  label: string;
  /** `null` = ไม่แสดงตัวเลข badge (ยังไม่เคยกดเข้าแท็บ "แพ็กเกจ" ในเซสชันนี้ — §4.2). */
  count: number | null;
}

@Component({
  selector: 'app-buyer-marketplace',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    NzSelectModule,
    DocumentCardComponent,
    BundleCardComponent,
    IconComponent,
    EmptyStateComponent,
    PaginationComponent,
    ImgFallbackDirective,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './marketplace.page.html',
  styleUrl: './marketplace.page.scss',
})
export class BuyerMarketplacePage {
  readonly catalog = inject(CatalogService);
  readonly bundles = inject(BundleService);
  readonly recent = inject(RecentlyViewedService);
  private readonly ads = inject(AdsService);
  readonly i18n = inject(TranslationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Local search input value, submitted only on magnifying glass click or Enter press */
  readonly searchTerm = signal<string>('');

  readonly formats = ['pdf', 'docx', 'pptx', 'xlsx', 'zip'];
  readonly grades: GradeLevel[] = [
    'kindergarten', 'primary-early', 'primary-late', 'secondary-early',
    'secondary-late', 'university', 'adult', 'all-ages',
  ];
  readonly resourceTypes: ResourceType[] = [
    'lesson-summary', 'worksheet', 'lesson-plan', 'mind-map',
    'practice-test', 'template', 'presentation', 'cheat-sheet',
    'thesis', 'guide',
  ];
  readonly standards = [
    'TGAT', 'TPAT', 'A-Level', 'O-NET', 'IELTS', 'TOEIC', 'TOEFL',
  ];

  readonly priceOptions: ReadonlyArray<{ value: PriceRangeKey; labelKey: string }> = [
    { value: 'all', labelKey: 'marketplace.priceOptionAll' },
    { value: 'free', labelKey: 'marketplace.priceOptionFree' },
    { value: 'lt100', labelKey: 'marketplace.priceOptionLt100' },
    { value: '100-199', labelKey: 'marketplace.priceOption100to199' },
    { value: 'gte200', labelKey: 'marketplace.priceOptionGte200' },
  ];

  readonly ratingOptions: ReadonlyArray<{ value: number; labelKey: string }> = [
    { value: 0, labelKey: 'marketplace.ratingAll' },
    { value: 3.5, labelKey: 'marketplace.rating35' },
    { value: 4, labelKey: 'marketplace.rating4' },
    { value: 4.5, labelKey: 'marketplace.rating45' },
  ];

  // ===== marketplace-home-redesign v2 §4.2 State Management =====

  readonly activeUiTab = signal<MarketplaceUiTab>('all');
  readonly displayedDocs = signal<DocumentItem[]>([]);
  readonly displayedBundles = signal<Bundle[]>([]);
  private readonly loadMoreSentinel = viewChild<ElementRef<HTMLElement>>('loadMoreSentinel');
  private displayedDocPage = 0;
  private displayedBundlePage = 0;
  private lastDocResults: DocumentItem[] | undefined;
  private lastBundleResults: Bundle[] | undefined;
  private appendDocPage = 0;
  private appendBundlePage = 0;
  /** §4.2: true once the "แพ็กเกจ" tab has been activated at least once this session. */
  readonly packageTabActivated = signal(false);
  readonly openGroups = signal<Record<FilterGroupKey, boolean>>({
    category: true,
    grade: true,
    resourceType: true,
    price: true,
    rating: false,
    format: false,
    standard: false,
  });

  readonly anyActive = computed(() => {
    const f = this.catalog.filters();
    return (
      f.search ||
      f.categoryIds.length ||
      f.subcategoryIds.length ||
      f.gradeLevels.length ||
      f.resourceTypes.length ||
      f.formats.length ||
      f.standards.length ||
      f.freeOnly ||
      f.minPrice > 0 ||
      f.maxPrice < 1000 ||
      f.minRating > 0
    );
  });

  readonly priceRange = computed<PriceRangeKey>(() => {
    const f = this.catalog.filters();
    if (f.freeOnly) return 'free';
    if (f.minPrice === 0 && f.maxPrice === 99) return 'lt100';
    if (f.minPrice === 100 && f.maxPrice === 199) return '100-199';
    if (f.minPrice === 200 && f.maxPrice === 1000) return 'gte200';
    return 'all';
  });

  private cachedAllDocCount = 0;

  readonly allDocumentsCount = computed(() => {
    const total = this.catalog.marketplaceResultsTotalCount();
    if (this.activeUiTab() === 'all' && total > 0) {
      this.cachedAllDocCount = total;
      return total;
    }
    if (this.cachedAllDocCount > 0) return this.cachedAllDocCount;
    return total;
  });

  readonly marketSubtitle = computed(() => {
    const search = this.catalog.filters().search.trim();
    if (search) return this.i18n.t('marketplace.subtitleSearch', { q: search });
    switch (this.activeUiTab()) {
      case 'free':
        return this.i18n.t('marketplace.subtitleFree');
      case 'package':
        return this.i18n.t('marketplace.subtitlePackage');
      default:
        return this.i18n.t('marketplace.subtitleAll');
    }
  });

  /**
   * marketplace-redesign §7 KI-4: the "ฟรี" badge used to be `freeResources().length` (only the first
   * page of `/free`, max 24) plus preview-only *paid* docs from `documents()` — so it was capped and
   * counted docs the "ฟรี" tab (`FreeOnly=true`) never shows, then jumped on entering the tab. Now:
   * on the tab itself = the server total of what's on screen; elsewhere = `totalCount` of
   * `GET /api/marketplace/free` (the same `FreeOnly` search, unfiltered). `null` (no badge) until
   * that total is known — never a made-up number.
   */
  readonly freeDocumentsCount = computed<number | null>(() => {
    // On the tab itself a settled total (0 included — filters can leave no free doc) wins; while
    // it's still loading it would be the previous tab's total, so fall back to /free's.
    if (this.activeUiTab() === 'free' && this.catalog.marketplaceResultsState().status === 'idle') {
      return this.catalog.marketplaceResultsTotalCount();
    }
    return this.catalog.freeTotalCount();
  });

  /**
   * marketplace-redesign §7 KI-6 / marketplace-home-redesign v2 §4.2: on the "แพ็กเกจ" tab the
   * category/grade/resource-type/rating/format/standard groups have no effect (bundles endpoint
   * takes `Q`/`Sort` only) — the sidebar stays (layout kept, per the 2026-09-17 decision that
   * un-hid it) but those groups render disabled (`inert`). Price stays live: it leaves the tab.
   */
  readonly filtersUnsupported = computed(() => this.activeUiTab() === 'package');

  readonly tabs = computed<MarketplaceUiTabViewModel[]>(() => [
    { value: 'all', label: this.i18n.t('marketplace.tabAll'), count: this.allDocumentsCount() },
    { value: 'free', label: this.i18n.t('marketplace.tabFree'), count: this.freeDocumentsCount() },
    {
      value: 'package',
      label: this.i18n.t('marketplace.tabPackage'),
      count: this.packageTabActivated() ? this.bundles.bundleResultsTotalCount() : null,
    },
  ]);

  /**
   * Angular class bindings can't host raw Tailwind arbitrary-value brackets/commas
   * (`[class.lg:grid-cols-[256px_minmax(0,1fr)]]` isn't valid template syntax) — a plain
   * `[class]` string binding sidesteps that instead of reaching for `NgClass`.
   */
  readonly resultsGridClass = computed(() =>
    'grid grid-cols-1 gap-6 items-start lg:grid-cols-[256px_minmax(0,1fr)]',
  );

  gradeLabel(g: GradeLevel): string {
    return this.i18n.t(`gradeLevels.${g}` as any) || GRADE_LEVEL_LABELS[g];
  }
  resourceLabel(t: ResourceType): string {
    return this.i18n.t(`resourceTypes.${t}` as any) || RESOURCE_TYPE_LABELS[t];
  }

  priceRangeLabel(): string {
    const key = this.priceRange();
    if (key === 'all') return '';
    const option = this.priceOptions.find((o) => o.value === key);
    return option ? this.i18n.t(option.labelKey) : '';
  }

  changePage(page: number): void {
    if (this.catalog.marketplaceResultsState().status === 'loading') return;
    this.appendDocPage = 0;
    this.catalog.loadMarketplaceResultsPage(page);
    this.scrollToTop();
  }

  changePageSize(pageSize: number): void {
    this.appendDocPage = 0;
    this.catalog.setMarketplacePageSize(pageSize);
    this.scrollToTop();
  }

  changeBundlePage(page: number): void {
    if (this.bundles.bundleResultsState().status === 'loading') return;
    this.appendBundlePage = 0;
    void this.bundles.loadBundleResultsPage(page);
    this.scrollToTop();
  }

  changeBundlePageSize(pageSize: number): void {
    this.appendBundlePage = 0;
    this.bundles.setBundleResultsPageSize(pageSize);
    this.scrollToTop();
  }

  loadMoreResults(): void {
    if (this.activeUiTab() === 'package') {
      if (this.bundles.bundleResultsState().status !== 'idle') return;
      const next = this.bundles.bundleResultsPage() + 1;
      if (next > this.bundles.bundleResultsTotalPages()) return;
      this.appendBundlePage = next;
      void this.bundles.loadBundleResultsPage(next);
      return;
    }

    if (this.catalog.marketplaceResultsState().status !== 'idle') return;
    const next = this.catalog.marketplaceResultsPage() + 1;
    if (next > this.catalog.marketplaceResultsTotalPages()) return;
    this.appendDocPage = next;
    this.catalog.loadMarketplaceResultsPage(next);
  }

  retryBundleResults(): void {
    this.bundles.retryBundleResults();
  }

  constructor() {
    // Explicit init to avoid root service auto-fetching on unrelated pages.
    // marketplace-redesign §7 KI-3: filters are reset *before* the results panel is activated,
    // and every filter/tab change made synchronously from here (incl. the queryParamMap
    // subscriber below, which emits synchronously) coalesces into ONE `/marketplace/search`.
    this.catalog.resetFilters();
    this.catalog.initForMarketplace();
    inject(DestroyRef).onDestroy(() => this.catalog.leaveMarketplace());
    // KI-4: only for the "ฟรี" badge's `freeTotalCount()`.
    this.catalog.loadFreeResources();

    effect(() => {
      const status = this.catalog.marketplaceResultsState().status;
      const page = this.catalog.marketplaceResultsPage();
      const docs = this.catalog.marketplaceResults();
      if (status !== 'idle') return;
      if (page === this.displayedDocPage && docs === this.lastDocResults) return;
      if (page === this.appendDocPage && page === this.displayedDocPage + 1) {
        this.displayedDocs.update((current) => [...current, ...docs]);
      } else {
        this.displayedDocs.set(docs);
      }
      this.displayedDocPage = page;
      this.lastDocResults = docs;
      this.appendDocPage = 0;
    });

    effect(() => {
      const status = this.bundles.bundleResultsState().status;
      const page = this.bundles.bundleResultsPage();
      const items = this.bundles.bundleResults();
      if (status !== 'idle') return;
      if (page === this.displayedBundlePage && items === this.lastBundleResults) return;
      if (page === this.appendBundlePage && page === this.displayedBundlePage + 1) {
        this.displayedBundles.update((current) => [...current, ...items]);
      } else {
        this.displayedBundles.set(items);
      }
      this.displayedBundlePage = page;
      this.lastBundleResults = items;
      this.appendBundlePage = 0;
    });

    effect((onCleanup) => {
      const target = this.loadMoreSentinel()?.nativeElement;
      if (!target || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) this.loadMoreResults();
        },
        { rootMargin: '240px' },
      );
      observer.observe(target);
      onCleanup(() => observer.disconnect());
    });

    // seller-ads-promotion v1 §4.3 (AC-38): fire impressions once per rendered result set.
    // `marketplaceResults()` is a `computed()` that returns a fresh array only when one of its
    // dependencies (the fetched page / filters / tab) actually changes — an OnPush re-render that
    // doesn't touch any of those returns the same cached array reference, so `AdsService`'s
    // reference-keyed dedup (§4.3: "กันยิงซ้ำตอน re-render") holds without this page inventing its
    // own key. `isSponsored`/`sponsoredCampaignId` only exist on `/marketplace/search` results
    // (DEC-6) — every other list this signal can hold simply has no sponsored items, so
    // `recordImpressions` no-ops there.
    effect(() => {
      const docs = this.catalog.marketplaceResults();
      const sponsoredCampaignIds = docs
        .filter((d) => d.isSponsored)
        .map((d) => d.sponsoredCampaignId);
      this.ads.recordImpressions(docs, sponsoredCampaignIds);
    });

    // marketplace-home-redesign v2 §4.2 "Query param migration": `?q=`, `?category=`,
    // `?subcategory=`, `?tab=all|free|package` — `tab=new`/`tab=popular` from an old bookmark
    // fall back to "all" silently (no throw, no redirect).
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const q = (params.get('q') ?? '').trim();
        this.searchTerm.set(q);
        const cat = params.get('category');
        const sub = params.get('subcategory');
        const tabParam = params.get('tab');

        if (!cat && !sub && !tabParam) {
          this.catalog.resetFilters();
          this.activeUiTab.set('all');
        }
        if (q !== this.catalog.filters().search) {
          this.catalog.setFilters({ search: q });
        }
        if (cat) {
          const c = this.catalog.getCategoryBySlug(cat);
          // Lazy-load subcategories for selected category only.
          void this.catalog.loadCategoryDetailBySlug(cat);
          if (c && !this.catalog.filters().categoryIds.includes(c.id)) {
            this.catalog.setFilters({ categoryIds: [c.id] });
          }
        }
        if (sub) {
          const s = this.catalog.getSubcategoryBySlug(sub);
          if (s && !this.catalog.filters().subcategoryIds.includes(s.id)) {
            this.catalog.setFilters({
              categoryIds: [s.parentId],
              subcategoryIds: [s.id],
            });
          }
        }
        if (tabParam === 'all' || tabParam === 'free' || tabParam === 'package') {
          this.applyUiTab(tabParam);
        } else if (tabParam === 'new' || tabParam === 'popular') {
          this.applyUiTab('all');
        }
      });
  }

  /**
   * marketplace-home-redesign v2 §4.2: updates the `?q=`/category/subcategory query params for
   * bookmarking/sharing through a *real* `Router.navigate()` — a prior attempt used
   * `Location.go()` to dodge the app-wide `withInMemoryScrolling({ scrollPositionRestoration:
   * 'top' })` (app.config.ts) scroll-to-top, but that left the Router's internal `currentUrlTree`
   * bookkeeping stale: pressing browser Back immediately after a search (no real navigation in
   * between) reverted the URL bar via popstate, yet the Router never learned about it, so
   * `ActivatedRoute.queryParamMap` never re-emitted and `searchTerm`/filters stayed stuck on the
   * old value. `NavigationExtras.scroll: 'manual'` is the router's own documented per-navigation
   * escape hatch (see `@angular/router` `NavigationBehaviorOptions.scroll`): the navigation still
   * runs through the full Router pipeline (bookkeeping stays correct, back/forward always sync),
   * it just tells `RouterScroller` to skip the scroll-restoration step for this one navigation —
   * no need to touch the global `app.config.ts` setting at all.
   */
  private updateQueryParams(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      scroll: 'manual',
    });
  }

  private scrollToTop(): void {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0 });
    }
  }

  /**
   * marketplace-redesign v1 §Overview "ตัดออก": the page's own duplicate search box is gone
   * (search now happens through the global header, which navigates here with `?q=`) — only the
   * clear-search affordance (the active "search" chip's ✕) survives on this page.
   */
  clearSearch(): void {
    this.searchTerm.set('');
    this.catalog.setFilters({ search: '' });
    this.updateQueryParams({ q: null });
  }

  /** multi-value-filters v1 (AC-21): the server rejects >20 values per dimension (400). */
  readonly maxFilterValues = MAX_FILTER_VALUES_PER_DIMENSION;

  /** true when toggling `value` would add a value to a dimension already at the cap — callers no-op. */
  private atFilterCap(list: readonly string[], value: string): boolean {
    return !list.includes(value) && list.length >= MAX_FILTER_VALUES_PER_DIMENSION;
  }

  toggleCategory(id: string): void {
    const ids = this.catalog.filters().categoryIds;
    if (this.atFilterCap(ids, id)) return;
    const newIds = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    // also remove subcategories that don't belong to remaining categories
    const remainingCats = new Set(newIds);
    const newSubIds = this.catalog
      .filters()
      .subcategoryIds.filter((sid) => {
        const sub = this.catalog.getSubcategoryById(sid);
        return sub && remainingCats.has(sub.parentId);
      });
    this.catalog.setFilters({
      categoryIds: newIds,
      subcategoryIds: newSubIds,
    });

    // marketplace-home-redesign v2 §1 ข้อ 2 / §0 (bug fix): `catalog.categories()` only ever
    // carries `subcategoryCount` (a number) until `loadCategoryDetailBySlug(slug)` hydrates the
    // real `subcategories` array for that one category — this used to only happen from a
    // `?category=slug` deep link (see the queryParamMap subscriber below), never from clicking a
    // chip directly, so `singleSelectedCategoryWithSubs()` stayed `null` forever on that path.
    if (newIds.length === 1) {
      const cat = this.catalog.getCategoryById(newIds[0]);
      if (cat?.slug) {
        void this.catalog.loadCategoryDetailBySlug(cat.slug);
      }
    }
  }

  clearCategories(): void {
    this.catalog.setFilters({ categoryIds: [], subcategoryIds: [] });
  }

  toggleSubcategory(id: string): void {
    const ids = this.catalog.filters().subcategoryIds;
    if (this.atFilterCap(ids, id)) return;
    this.catalog.setFilters({
      subcategoryIds: ids.includes(id)
        ? ids.filter((x) => x !== id)
        : [...ids, id],
    });
  }

  toggleGrade(g: GradeLevel): void {
    const list = this.catalog.filters().gradeLevels;
    if (this.atFilterCap(list, g)) return;
    this.catalog.setFilters({
      gradeLevels: list.includes(g) ? list.filter((x) => x !== g) : [...list, g],
    });
  }

  toggleResourceType(t: ResourceType): void {
    const list = this.catalog.filters().resourceTypes;
    if (this.atFilterCap(list, t)) return;
    this.catalog.setFilters({
      resourceTypes: list.includes(t) ? list.filter((x) => x !== t) : [...list, t],
    });
  }

  toggleStandard(s: string): void {
    const list = this.catalog.filters().standards;
    if (this.atFilterCap(list, s)) return;
    this.catalog.setFilters({
      standards: list.includes(s) ? list.filter((x) => x !== s) : [...list, s],
    });
  }

  toggleFormat(f: string): void {
    const list = this.catalog.filters().formats;
    if (this.atFilterCap(list, f)) return;
    this.catalog.setFilters({
      formats: list.includes(f) ? list.filter((x) => x !== f) : [...list, f],
    });
  }

  setPriceRangeOption(option: PriceRangeKey): void {
    // Toggle off: clicking the currently active price option resets back to 'all'
    if (this.priceRange() === option && option !== 'all') {
      this.setPriceRangeOption('all');
      return;
    }

    if (this.activeUiTab() === 'package') {
      this.activeUiTab.set(option === 'free' ? 'free' : 'all');
      this.catalog.setTab(option === 'free' ? 'free' : 'all');
      this.updateQueryParams({ tab: option === 'free' ? 'free' : null });
    }

    switch (option) {
      case 'all':
        if (this.activeUiTab() === 'free') {
          this.activeUiTab.set('all');
          this.catalog.setTab('all');
          this.updateQueryParams({ tab: null });
        }
        this.catalog.setFilters({ freeOnly: false, minPrice: 0, maxPrice: 1000 });
        break;
      case 'free':
        this.activeUiTab.set('free');
        this.catalog.setTab('free');
        this.catalog.setFilters({ freeOnly: true, minPrice: 0, maxPrice: 1000 });
        this.updateQueryParams({ tab: 'free' });
        break;
      case 'lt100':
        if (this.activeUiTab() === 'free') {
          this.activeUiTab.set('all');
          this.catalog.setTab('all');
          this.updateQueryParams({ tab: null });
        }
        this.catalog.setFilters({ freeOnly: false, minPrice: 0, maxPrice: 99 });
        break;
      case '100-199':
        if (this.activeUiTab() === 'free') {
          this.activeUiTab.set('all');
          this.catalog.setTab('all');
          this.updateQueryParams({ tab: null });
        }
        this.catalog.setFilters({ freeOnly: false, minPrice: 100, maxPrice: 199 });
        break;
      case 'gte200':
        if (this.activeUiTab() === 'free') {
          this.activeUiTab.set('all');
          this.catalog.setTab('all');
          this.updateQueryParams({ tab: null });
        }
        this.catalog.setFilters({ freeOnly: false, minPrice: 200, maxPrice: 1000 });
        break;
    }
  }

  toggleGroup(key: FilterGroupKey): void {
    this.openGroups.update((g) => ({ ...g, [key]: !g[key] }));
  }

  /**
   * marketplace-home-redesign v2 §4.2: sets the active tab and, for `'package'`, triggers the
   * "แพ็กเกจ" search fetch (page 1) with the search box's *current* term — not re-fetched on every
   * keystroke (§4.2 "หลีกเลี่ยงยิง request คู่ขนานทุก keystroke"), only on entering the tab.
   */
  private applyUiTab(tab: MarketplaceUiTab): void {
    this.activeUiTab.set(tab);
    if (tab === 'package') {
      this.packageTabActivated.set(true);
      this.catalog.setTab('bundles');
      void this.bundles.loadBundleResultsPage(1, this.catalog.filters().search.trim());
    } else if (tab === 'free') {
      this.catalog.setTab('free');
      this.catalog.setFilters({ freeOnly: true, minPrice: 0, maxPrice: 1000 });
    } else {
      this.catalog.setTab('all');
      if (this.catalog.filters().freeOnly) {
        this.catalog.setFilters({ freeOnly: false });
      }
    }
  }

  selectTab(tab: MarketplaceUiTab): void {
    if (tab === 'free' && this.activeUiTab() === 'free') {
      this.selectTab('all');
      return;
    }
    this.applyUiTab(tab);
    this.updateQueryParams({ tab: tab === 'all' ? null : tab });
    this.scrollToTop();
  }

  /** "ล้างทั้งหมด" / "ล้างตัวกรอง" */
  reset(): void {
    this.searchTerm.set('');
    this.catalog.resetFilters();
    this.activeUiTab.set('all');
    this.updateQueryParams({ q: null, category: null, subcategory: null, tab: null });
  }
}
