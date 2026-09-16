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
  CatalogService,
  DiscoveryService,
  PlatformStatsService,
  RecentlyViewedService,
} from '../../../core/services';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import {
  Category,
  DocumentItem,
  GRADE_LEVEL_LABELS,
  GradeLevel,
  RESOURCE_TYPE_LABELS,
  ResourceType,
} from '../../../core/models';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { MarketplaceRailComponent } from '../../../shared/components/marketplace-rail/marketplace-rail.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { PopularSearchChipsComponent } from '../../../shared/components/popular-search-chips/popular-search-chips.component';
import { DiscoveryRailComponent } from '../../../shared/components/discovery-rail/discovery-rail.component';
import { TranslationService, TranslatePipe } from '../../../core/i18n';

/** crm-driven-discovery v1 §4.3: "ระหว่างโหลด...นานสุด 3 วินาที จากนั้นถ้ายังไม่มีข้อมูลให้ซ่อนบล็อก". */
const DISCOVERY_SKELETON_TIMEOUT_MS = 3000;

/**
 * marketplace-redesign v1 §Screens/Views ข้อ 2, rail 1 ("มาใหม่"): "เอกสารที่อัปโหลดภายใน 10
 * วันที่ผ่านมา" — gate-2 deviation A fix (integrator-qa): window used to derive the rail's real
 * total count (`newArrivalsTotalCount` below), not just the 5/6-card display cap.
 */
const NEW_ARRIVALS_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

/** marketplace-redesign v1 §State Management */
type MarketplaceView = 'browse' | 'list';
type MarketplaceUiTab = 'all' | 'new' | 'popular' | 'free';
type FilterGroupKey = 'category' | 'grade' | 'resourceType' | 'price' | 'rating' | 'format' | 'standard';
type PriceRangeKey = 'all' | 'free' | 'lt100' | '100-199' | 'gte200';

interface MarketplaceRailViewModel {
  key: 'new' | 'popular' | 'free';
  eyebrow: string;
  title: string;
  desc: string;
  viewAllLabel: string;
  docs: DocumentItem[];
}

interface MarketplaceUiTabViewModel {
  value: MarketplaceUiTab;
  label: string;
  count: number;
}

@Component({
  selector: 'app-buyer-marketplace',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    NzSelectModule,
    DocumentCardComponent,
    MarketplaceRailComponent,
    IconComponent,
    EmptyStateComponent,
    ImgFallbackDirective,
    PopularSearchChipsComponent,
    DiscoveryRailComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './marketplace.page.html',
  styleUrl: './marketplace.page.scss',
})
export class BuyerMarketplacePage {
  readonly catalog = inject(CatalogService);
  readonly recent = inject(RecentlyViewedService);
  readonly platformStats = inject(PlatformStatsService);
  readonly discovery = inject(DiscoveryService);
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

  // ===== marketplace-redesign v1 §State Management =====

  readonly view = signal<MarketplaceView>('browse');
  readonly activeUiTab = signal<MarketplaceUiTab>('all');
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

  readonly listMode = computed(
    () => this.view() === 'list' || !!this.catalog.filters().search.trim() || !!this.anyActive(),
  );

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
    if (!this.listMode()) return this.i18n.t('marketplace.subtitleBrowse');
    if (search) return this.i18n.t('marketplace.subtitleSearch', { q: search });
    switch (this.activeUiTab()) {
      case 'new':
        return this.i18n.t('marketplace.subtitleNew');
      case 'popular':
        return this.i18n.t('marketplace.subtitlePopular');
      case 'free':
        return this.i18n.t('marketplace.subtitleFree');
      default:
        return this.i18n.t('marketplace.subtitleAll');
    }
  });

  readonly closingCtaLabel = computed(() =>
    this.i18n.t('marketplace.browseAllCta', { n: this.allDocumentsCount() }),
  );

  /**
   * gate-2 deviation A fix (integrator-qa, marketplace-redesign v1 §Screens/Views ข้อ 2): "ตัวเลข
   * {n} ในปุ่ม = จำนวนทั้งหมดของกลุ่มนั้น (ไม่ใช่ 5)". `catalog.newArrivals()`/`trending()` cap
   * their arrays at 6/8 for internal reuse elsewhere in the service, so the rail/tab badge counts
   * can't read `.length` off those directly without silently under-counting once the real pool is
   * bigger than the cap. Both counts derive from `catalog.documents()` — the same raw, unsliced
   * pool `newArrivals()`/`trending()` themselves sort/slice from — so they stay in sync with
   * whatever's currently loaded (grows via infinite scroll, matches the existing "ทั้งหมด" tab
   * count design note in `catalog.service.ts` `syncListWithBackend()`).
   *
   * "มาใหม่" total = documents created within the last 10 days (the rail's own definition, §Copy
   * "เอกสารที่อัปโหลดภายใน 10 วันที่ผ่านมา") rather than every loaded document, since `newArrivals()`
   * itself has no such cutoff (it's just "newest N"). No backend endpoint returns this count
   * directly (no `CreatedAfter`/date filter on `/marketplace/search`) — this is the best true count
   * obtainable client-side without adding a new API call, per integrator-qa gate-2 report option 2.
   */
  readonly newArrivalsTotalCount = computed(() => {
    const cutoff = Date.now() - NEW_ARRIVALS_WINDOW_MS;
    return this.catalog
      .documents()
      .filter((d) => new Date(d.createdAt).getTime() >= cutoff).length;
  });

  /**
   * "ยอดนิยม" has no inherent subset cutoff (`trending()` is just "top N by downloads" out of the
   * whole pool) — its "ดูทั้งหมด" button maps to `tab='all' + sort='popular'` (§Screens/Views
   * rail-2 row), i.e. *exactly* the same set as "ทั้งหมด", just resorted. So its true total must
   * equal `allDocumentsCount()` (backend `marketplaceResultsTotalCount`), not
   * `catalog.documents().length` — the latter is only the first page (24) of the loaded catalog
   * in browse mode and under-counts once the real pool exceeds the page size (integrator-qa
   * gate-3 finding, marketplace-redesign v1 §Screens/Views rail "ยอดนิยม").
   */
  readonly trendingTotalCount = computed(() => this.allDocumentsCount());

  /**
   * gate-2 deviation B fix (integrator-qa, marketplace-redesign v1 §Screens/Views rail 3 table):
   * "ถ้า `DocumentItem` มี field ที่บอกว่ามีตัวอย่างให้อ่านฟรี (preview pages) ให้รวมเอกสารเหล่านั้น
   * ด้วย โดยเรียงฟรีก่อน". Merges `catalog.freeResources()` (`isFree`) with the rest of
   * `catalog.documents()` that have `previewPages > 0` — the two are disjoint partitions of
   * `documents()` (an `isFree` doc is already in the first half), so no de-dup pass is needed.
   */
  readonly freeAndPreviewDocuments = computed<DocumentItem[]>(() => {
    const free = this.catalog.freeResources();
    const previewOnly = this.catalog
      .documents()
      .filter((d) => !d.isFree && d.previewPages > 0);
    return [...free, ...previewOnly];
  });

  readonly rails = computed<MarketplaceRailViewModel[]>(() => {
    const newArrivals = this.catalog.newArrivals();
    const trending = this.catalog.trending();
    const freeAndPreview = this.freeAndPreviewDocuments();
    return [
      {
        key: 'new',
        eyebrow: this.i18n.t('marketplace.railNewEyebrow'),
        title: this.i18n.t('marketplace.railNewTitle'),
        desc: this.i18n.t('marketplace.railNewDesc'),
        viewAllLabel: this.i18n.t('marketplace.railViewAll', { n: this.newArrivalsTotalCount() }),
        docs: newArrivals.slice(0, 5),
      },
      {
        key: 'popular',
        eyebrow: this.i18n.t('marketplace.railPopularEyebrow'),
        title: this.i18n.t('marketplace.railPopularTitle'),
        desc: this.i18n.t('marketplace.railPopularDesc'),
        viewAllLabel: this.i18n.t('marketplace.railViewAll', { n: this.trendingTotalCount() }),
        docs: trending.slice(0, 5),
      },
      {
        key: 'free',
        eyebrow: this.i18n.t('marketplace.railFreeEyebrow'),
        title: this.i18n.t('marketplace.railFreeTitle'),
        desc: this.i18n.t('marketplace.railFreeDesc'),
        viewAllLabel: this.i18n.t('marketplace.railViewAll', { n: freeAndPreview.length }),
        docs: freeAndPreview.slice(0, 5),
      },
    ];
  });

  readonly tabs = computed<MarketplaceUiTabViewModel[]>(() => [
    { value: 'all', label: this.i18n.t('marketplace.tabAll'), count: this.allDocumentsCount() },
    { value: 'new', label: this.i18n.t('marketplace.tabNew'), count: this.newArrivalsTotalCount() },
    { value: 'popular', label: this.i18n.t('marketplace.tabPopular'), count: this.trendingTotalCount() },
    { value: 'free', label: this.i18n.t('marketplace.tabFree'), count: this.freeAndPreviewDocuments().length },
  ]);

  readonly singleSelectedCategoryWithSubs = computed<Category | null>(() => {
    const ids = this.catalog.filters().categoryIds;
    if (ids.length !== 1) return null;
    const cat = this.catalog.getCategoryById(ids[0]);
    return cat && cat.subcategories && cat.subcategories.length > 0 ? cat : null;
  });

  /** Same 3-second skeleton cap as the CRM discovery block (§Interactions "Loading"), shared by all 3 rails since they all read off the same `_documents()` fetch. */
  private readonly railsTimedOut = signal(false);
  private railsTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  readonly showRailsSkeleton = computed(
    () =>
      this.catalog.catalogState().status === 'loading' &&
      this.catalog.documents().length === 0 &&
      !this.railsTimedOut(),
  );

  // ===== crm-driven-discovery v1 §3.2/§4.3 (ข้อ 14) =====

  /** `true` while the discovery fetch is loading *and* hasn't yet crossed the §4.3 3-second skeleton cap. */
  private readonly discoveryTimedOut = signal(false);
  private discoveryTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  readonly showDiscoverySkeleton = computed(
    () => this.discovery.discoveryState().status === 'loading' && !this.discoveryTimedOut(),
  );

  /** §4.3: "เมื่อ sections.length === 0 && popularTerms.length === 0 → ไม่ render บล็อกเลย". */
  readonly showDiscoveryBlock = computed(() => {
    const d = this.discovery.discovery();
    if (!d) return false;
    return d.sections.length > 0 || d.popularTerms.length > 0;
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

  constructor() {
    // Explicit init to avoid root service auto-fetching on unrelated pages.
    this.catalog.resetFilters();
    this.catalog.initForMarketplace();
    // real-data-stats v1 §4: no-op if another page already loaded this (cached in the service).
    this.platformStats.loadStats();
    // crm-driven-discovery v1 §3.2/§4.2/§4.3: "ยังไม่ได้ค้นหาอะไรเลย" block — cheap to call
    // unconditionally, cached 5 นาทีฝั่ง service (§4.2), only ever rendered when !anyActive().
    void this.discovery.loadDiscovery();

    // §4.3 3-second skeleton cap: starts a timer whenever the fetch is loading, clears it as soon
    // as it settles either way.
    effect(() => {
      const status = this.discovery.discoveryState().status;
      if (this.discoveryTimeoutHandle != null) {
        clearTimeout(this.discoveryTimeoutHandle);
        this.discoveryTimeoutHandle = null;
      }
      if (status === 'loading') {
        this.discoveryTimedOut.set(false);
        this.discoveryTimeoutHandle = setTimeout(() => this.discoveryTimedOut.set(true), DISCOVERY_SKELETON_TIMEOUT_MS);
      } else {
        this.discoveryTimedOut.set(false);
      }
    });

    // marketplace-redesign v1 §Interactions "Loading" — same 3-second skeleton cap, gated on the
    // fetch backing `rails()` (`newArrivals`/`trending`/`freeResources` all read `_documents()`).
    effect(() => {
      const status = this.catalog.catalogState().status;
      if (this.railsTimeoutHandle != null) {
        clearTimeout(this.railsTimeoutHandle);
        this.railsTimeoutHandle = null;
      }
      if (status === 'loading') {
        this.railsTimedOut.set(false);
        this.railsTimeoutHandle = setTimeout(() => this.railsTimedOut.set(true), DISCOVERY_SKELETON_TIMEOUT_MS);
      } else {
        this.railsTimedOut.set(false);
      }
    });

    this.destroyRef.onDestroy(() => {
      if (this.discoveryTimeoutHandle != null) clearTimeout(this.discoveryTimeoutHandle);
      if (this.railsTimeoutHandle != null) clearTimeout(this.railsTimeoutHandle);
    });

    // marketplace-redesign v1 §Interactions "Query params / deep link": `?view=list`,
    // `?tab=new|free|all`, `?q=`, `?category=`, `?subcategory=`. `tab=popular`/`view` combos the
    // segmented tabs enter through `selectTab()` never round-trip through the URL as `tab` (see
    // that method) — only `view=list` marks them as "already in list mode" here, so this branch
    // must never reset filters just because `tab` happens to be absent while `view=list` is set.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const q = (params.get('q') ?? '').trim();
        this.searchTerm.set(q);
        const cat = params.get('category');
        const sub = params.get('subcategory');
        const tabParam = params.get('tab');
        const viewParam = params.get('view');

        if (!cat && !sub && !tabParam && !viewParam) {
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
        if (tabParam === 'all' || tabParam === 'new' || tabParam === 'free') {
          this.catalog.setTab(tabParam);
          this.activeUiTab.set(tabParam);
        }

        const isListFromUrl = viewParam === 'list' || !!tabParam || !!cat || !!q;
        this.view.set(isListFromUrl ? 'list' : 'browse');
      });

    // seller-ads-promotion v1 §4.3 (AC-38): fire impressions once per rendered result set.
    // `marketplaceResults()` is a `computed()` that returns a fresh array only when one of its
    // dependencies (the fetched page / filters / tab) actually changes — an OnPush re-render that
    // doesn't touch any of those returns the same cached array reference, so `AdsService`'s
    // reference-keyed dedup (§4.3: "กันยิงซ้ำตอน re-render") holds without this page inventing its
    // own key. `isSponsored`/`sponsoredCampaignId` only exist on `/marketplace/search` results
    // (DEC-6) — every other list this signal can hold (browse/tab-filtered) simply has no
    // sponsored items, so `recordImpressions` no-ops there.
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
              this.loadMore();
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
  }

  /**
   * marketplace-paged-results v1 §4 (AC-12 fix, round 2): updates the `?q=`/category/subcategory
   * query params for bookmarking/sharing through a *real* `Router.navigate()` — a prior attempt
   * used `Location.go()` to dodge the app-wide `withInMemoryScrolling({ scrollPositionRestoration:
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
   * marketplace-redesign v1 §Interactions — rail "ดูทั้งหมด" buttons, the closing browse-mode CTA,
   * and the list-mode segmented tabs all funnel through here. `'popular'` has no `MarketplaceTab`
   * of its own on `CatalogService` — it's `tab='all'` + `sort='popular'` — so its query param
   * patch intentionally omits `tab` (see the queryParamMap subscription above for why that's safe).
   */
  selectTab(tab: MarketplaceUiTab): void {
    this.activeUiTab.set(tab);
    this.view.set('list');
    if (tab === 'popular') {
      this.catalog.setTab('all');
      this.catalog.setFilters({ sort: 'popular' });
      this.updateQueryParams({ tab: null, view: 'list' });
    } else {
      this.catalog.setTab(tab);
      this.updateQueryParams({ tab, view: 'list' });
    }
    this.scrollToTop();
  }

  /** "ล้างทั้งหมด" / "ล้างตัวกรอง" — never touches `view` (§Interactions). */
  reset(): void {
    this.searchTerm.set('');
    this.catalog.resetFilters();
    this.activeUiTab.set('all');
    this.updateQueryParams({ q: null, category: null, subcategory: null, tab: null });
  }

  /** Toolbar "← หน้ารวม" — clears everything *and* returns to browse mode. */
  goToBrowse(): void {
    this.searchTerm.set('');
    this.catalog.resetFilters();
    this.activeUiTab.set('all');
    this.view.set('browse');
    this.updateQueryParams({ q: null, category: null, subcategory: null, tab: null, view: null });
    this.scrollToTop();
  }
}
