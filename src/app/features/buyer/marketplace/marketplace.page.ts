import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
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
  PlatformStatsService,
  RecentlyViewedService,
} from '../../../core/services';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import {
  Bundle,
  Category,
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
  readonly platformStats = inject(PlatformStatsService);
  private readonly ads = inject(AdsService);
  readonly i18n = inject(TranslationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly compactPipe = new CompactPipe();

  /** Local search input value, submitted only on magnifying glass click or Enter press */
  readonly searchTerm = signal<string>('');

  /**
   * real-data-stats v1 §4 (project-owner instruction — see round 2 dispatch notes): the hero's
   * "กว่า 12,000 เอกสารจากครีเอเตอร์ตัวจริงทั่วประเทศ" was a hardcoded number, same figure the
   * home page already binds to `platformStats.stats()?.totalApprovedDocuments` (§4.2). Drops the
   * "กว่า N เอกสาร" clause entirely while stats haven't loaded yet, rather than showing a stale
   * hardcoded count.
   *
   * marketplace-redesign v1 dropped the hero banner from the template (§Overview "ตัดออก"), but
   * this computed + its dedicated spec describe stay — not rendered anywhere right now, kept as
   * pre-existing behavior outside this redesign's scope.
   */
  readonly heroDescription = computed(() => {
    const isEn = this.i18n.currentLang() === 'en';
    const totalDocs = this.platformStats.stats()?.totalApprovedDocuments;
    if (isEn) {
      const base =
        totalDocs != null
          ? `Over ${this.compactPipe.transform(totalDocs)} documents from verified creators nationwide`
          : 'Quality educational documents from verified creators nationwide';
      return `${base} — use filters on the left to find what you need`;
    }
    const base =
      totalDocs != null
        ? `กว่า ${this.compactPipe.transform(totalDocs)} เอกสารจากครีเอเตอร์ตัวจริงทั่วประเทศ`
        : 'เอกสารคุณภาพจากครีเอเตอร์ตัวจริงทั่วประเทศ';
    return `${base} — ใช้ตัวกรองด้านซ้ายเพื่อค้นหาที่ใช่`;
  });

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

  readonly allDocumentsCount = computed(() => {
    const total = this.catalog.marketplaceResultsTotalCount();
    return total > 0 ? total : this.catalog.documents().length;
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
   * gate-2 deviation B fix (integrator-qa, marketplace-redesign v1 §Screens/Views rail 3 table):
   * "ถ้า `DocumentItem` มี field ที่บอกว่ามีตัวอย่างให้อ่านฟรี (preview pages) ให้รวมเอกสารเหล่านั้น
   * ด้วย โดยเรียงฟรีก่อน". Merges `catalog.freeResources()` (`isFree`) with the rest of
   * `catalog.documents()` that have `previewPages > 0` — the two are disjoint partitions of
   * `documents()` (an `isFree` doc is already in the first half), so no de-dup pass is needed.
   * Still the "ฟรี" tab badge's source of truth post-redesign (marketplace-home-redesign v2 §4.2
   * kept this unchanged — only the rails that used to also read this were removed).
   */
  readonly freeAndPreviewDocuments = computed<DocumentItem[]>(() => {
    const free = this.catalog.freeResources();
    const previewOnly = this.catalog
      .documents()
      .filter((d) => !d.isFree && d.previewPages > 0);
    return [...free, ...previewOnly];
  });

  readonly tabs = computed<MarketplaceUiTabViewModel[]>(() => [
    { value: 'all', label: this.i18n.t('marketplace.tabAll'), count: this.allDocumentsCount() },
    { value: 'free', label: this.i18n.t('marketplace.tabFree'), count: this.freeAndPreviewDocuments().length },
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
    this.activeUiTab() !== 'package'
      ? 'grid grid-cols-1 gap-6 items-start lg:grid-cols-[256px_minmax(0,1fr)]'
      : 'grid grid-cols-1 gap-6 items-start',
  );

  readonly singleSelectedCategoryWithSubs = computed<Category | null>(() => {
    const ids = this.catalog.filters().categoryIds;
    if (ids.length !== 1) return null;
    const cat = this.catalog.getCategoryById(ids[0]);
    return cat && cat.subcategories && cat.subcategories.length > 0 ? cat : null;
  });

  /** marketplace-paged-results v1 §4.3: results panel's own scroll container (AC-12). */
  readonly resultsPanel = viewChild<ElementRef<HTMLDivElement>>('resultsPanel');
  private readonly sentinel = viewChild<ElementRef<HTMLDivElement>>('sentinel');
  private observer: IntersectionObserver | null = null;
  private readonly destroyRef = inject(DestroyRef);

  /** Accumulated documents for lazy load / "โหลดเพิ่มเติม" */
  readonly accumulatedDocs = signal<DocumentItem[]>([]);

  readonly hasMore = computed(() => {
    const total = this.catalog.marketplaceResultsTotalCount();
    if (total === 0) return false;
    return this.accumulatedDocs().length < total;
  });

  /**
   * marketplace-home-redesign v2 §4.2 ("Tab 'package' — งานใหม่"): accumulate pattern แยกจาก
   * `accumulatedDocs` เพื่อไม่ให้ปนกัน — round 1 stub เสมอว่างเพราะ `BundleService.searchPager`
   * ยัง TODO(contract) อยู่.
   */
  readonly accumulatedBundles = signal<Bundle[]>([]);

  readonly hasMoreBundles = computed(() => {
    const total = this.bundles.bundleResultsTotalCount();
    if (total === 0) return false;
    return this.accumulatedBundles().length < total;
  });

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

  loadMore(): void {
    if (this.catalog.marketplaceResultsState().status === 'loading') return;
    if (!this.hasMore()) return;
    const nextPage = this.catalog.marketplaceResultsPage() + 1;
    this.catalog.loadMarketplaceResultsPage(nextPage);
  }

  retryLoadMore(): void {
    this.catalog.retryMarketplaceResults();
  }

  loadMoreBundles(): void {
    if (this.bundles.bundleResultsState().status === 'loading') return;
    if (!this.hasMoreBundles()) return;
    void this.bundles.loadBundleResultsPage(this.bundles.bundleResultsPage() + 1);
  }

  retryBundleResults(): void {
    this.bundles.retryBundleResults();
  }

  constructor() {
    // Explicit init to avoid root service auto-fetching on unrelated pages.
    this.catalog.resetFilters();
    this.catalog.initForMarketplace();
    // real-data-stats v1 §4: no-op if another page already loaded this (cached in the service).
    this.platformStats.loadStats();

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

    // Accumulate documents on page progression, reset on page 1
    effect(() => {
      const page = this.catalog.marketplaceResultsPage();
      const state = this.catalog.marketplaceResultsState();
      const newResults = this.catalog.marketplaceResults();

      if (state.status === 'idle') {
        if (page <= 1) {
          this.accumulatedDocs.set(newResults);
        } else {
          this.accumulatedDocs.update((prev) => {
            const existingIds = new Set(prev.map((d) => d.id));
            const fresh = newResults.filter((d) => !existingIds.has(d.id));
            return [...prev, ...fresh];
          });
        }
      }
    });

    // Same accumulate-on-page-progression pattern as accumulatedDocs above, for the "แพ็กเกจ" tab.
    effect(() => {
      const page = this.bundles.bundleResultsPage();
      const state = this.bundles.bundleResultsState();
      const newResults = this.bundles.bundleResults();

      if (state.status === 'idle') {
        if (page <= 1) {
          this.accumulatedBundles.set(newResults);
        } else {
          this.accumulatedBundles.update((prev) => {
            const existingIds = new Set(prev.map((b) => b.id));
            const fresh = newResults.filter((b) => !existingIds.has(b.id));
            return [...prev, ...fresh];
          });
        }
      }
    });

    // Reset resultsPanel scroll to top ONLY on page 1 / filter change (not when loading more)
    effect(() => {
      if (
        this.catalog.marketplaceResultsState().status === 'loading' &&
        this.catalog.marketplaceResultsPage() <= 1
      ) {
        const el = this.resultsPanel()?.nativeElement;
        if (el) el.scrollTop = 0;
      }
    });

    afterNextRender(() => {
      if (typeof IntersectionObserver !== 'undefined') {
        this.observer = new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting) {
              if (this.activeUiTab() === 'package') {
                this.loadMoreBundles();
              } else {
                this.loadMore();
              }
            }
          },
          { root: this.resultsPanel()?.nativeElement ?? null, rootMargin: '120px' },
        );
      }
    });

    effect(() => {
      const el = this.sentinel()?.nativeElement;
      if (el && this.observer) {
        this.observer.disconnect();
        this.observer.observe(el);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.observer?.disconnect();
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

  toggleCategory(id: string): void {
    const ids = this.catalog.filters().categoryIds;
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
    this.catalog.setFilters({
      subcategoryIds: ids.includes(id)
        ? ids.filter((x) => x !== id)
        : [...ids, id],
    });
  }

  toggleGrade(g: GradeLevel): void {
    const list = this.catalog.filters().gradeLevels;
    this.catalog.setFilters({
      gradeLevels: list.includes(g) ? list.filter((x) => x !== g) : [...list, g],
    });
  }

  toggleResourceType(t: ResourceType): void {
    const list = this.catalog.filters().resourceTypes;
    this.catalog.setFilters({
      resourceTypes: list.includes(t) ? list.filter((x) => x !== t) : [...list, t],
    });
  }

  toggleStandard(s: string): void {
    const list = this.catalog.filters().standards;
    this.catalog.setFilters({
      standards: list.includes(s) ? list.filter((x) => x !== s) : [...list, s],
    });
  }

  toggleFormat(f: string): void {
    const list = this.catalog.filters().formats;
    this.catalog.setFilters({
      formats: list.includes(f) ? list.filter((x) => x !== f) : [...list, f],
    });
  }

  setPriceRangeOption(option: PriceRangeKey): void {
    switch (option) {
      case 'all':
        this.catalog.setFilters({ freeOnly: false, minPrice: 0, maxPrice: 1000 });
        break;
      case 'free':
        this.catalog.setFilters({ freeOnly: true, minPrice: 0, maxPrice: 1000 });
        break;
      case 'lt100':
        this.catalog.setFilters({ freeOnly: false, minPrice: 0, maxPrice: 99 });
        break;
      case '100-199':
        this.catalog.setFilters({ freeOnly: false, minPrice: 100, maxPrice: 199 });
        break;
      case 'gte200':
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
    } else {
      this.catalog.setTab(tab);
    }
  }

  selectTab(tab: MarketplaceUiTab): void {
    this.applyUiTab(tab);
    this.updateQueryParams({ tab });
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
