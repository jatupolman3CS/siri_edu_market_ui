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
import { NzSliderModule } from 'ng-zorro-antd/slider';
import {
  AdsService,
  BundleService,
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
  RESOURCE_TYPE_ICONS,
  RESOURCE_TYPE_LABELS,
  ResourceType,
  Subcategory,
} from '../../../core/models';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { PopularSearchChipsComponent } from '../../../shared/components/popular-search-chips/popular-search-chips.component';
import { DiscoveryRailComponent } from '../../../shared/components/discovery-rail/discovery-rail.component';
import { TranslationService, TranslatePipe } from '../../../core/i18n';

/** crm-driven-discovery v1 §4.3: "ระหว่างโหลด...นานสุด 3 วินาที จากนั้นถ้ายังไม่มีข้อมูลให้ซ่อนบล็อก". */
const DISCOVERY_SKELETON_TIMEOUT_MS = 3000;

@Component({
  selector: 'app-buyer-marketplace',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    NzSelectModule,
    NzSliderModule,
    DocumentCardComponent,
    BundleCardComponent,
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
  readonly bundles = inject(BundleService);
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

  readonly tabs = computed(() => {
    const isEn = this.i18n.currentLang() === 'en';
    return [
      { value: 'all' as const, label: isEn ? 'All' : 'ทั้งหมด', icon: '🌸', count: this.catalog.documents().length },
      { value: 'free' as const, label: isEn ? 'Free' : 'ฟรี', icon: '🎁', count: this.catalog.freeResources().length },
      { value: 'top-rated' as const, label: isEn ? 'Top Rated' : 'คะแนนสูง', icon: '⭐', count: this.catalog.documents().filter(d => d.rating >= 4.7).length },
      { value: 'new' as const, label: isEn ? 'New Arrivals' : 'มาใหม่', icon: '✨', count: this.catalog.newArrivals().length },
      { value: 'bundles' as const, label: isEn ? 'Bundles' : 'แพ็กเกจ', icon: '📦', count: this.bundles.bundles().length },
    ];
  });

  readonly priceRange = computed<[number, number]>(() => [
    this.catalog.filters().minPrice,
    this.catalog.filters().maxPrice,
  ]);

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
  resourceIcon(t: ResourceType): string {
    return RESOURCE_TYPE_ICONS[t];
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
    this.destroyRef.onDestroy(() => {
      if (this.discoveryTimeoutHandle != null) clearTimeout(this.discoveryTimeoutHandle);
    });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const q = (params.get('q') ?? '').trim();
        this.searchTerm.set(q);
        const cat = params.get('category');
        const sub = params.get('subcategory');
        const tab = params.get('tab');
        if (!cat && !sub && !tab) {
          this.catalog.resetFilters();
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
        if (tab && ['all', 'free', 'top-rated', 'new', 'bundles'].includes(tab)) {
          this.catalog.setTab(tab as 'all' | 'free' | 'top-rated' | 'new' | 'bundles');
        }
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

  applySearch(): void {
    const q = this.searchTerm().trim();
    this.catalog.setFilters({ search: q });
    this.updateQueryParams({ q: q || null });
  }

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

  toggleSubcategory(id: string): void {
    const ids = this.catalog.filters().subcategoryIds;
    this.catalog.setFilters({
      subcategoryIds: ids.includes(id)
        ? ids.filter((x) => x !== id)
        : [...ids, id],
    });
  }

  /** Per-category subcategory search term. */
  readonly subSearchByCat = signal<Record<string, string>>({});

  getSubSearch(catId: string): string {
    return this.subSearchByCat()[catId] ?? '';
  }

  setSubSearch(catId: string, value: string): void {
    this.subSearchByCat.update((cur) => ({ ...cur, [catId]: value }));
  }

  filteredSubcategories(cat: Category): Subcategory[] {
    const term = this.getSubSearch(cat.id).trim().toLowerCase();
    const subs = cat.subcategories ?? [];
    if (!term) return subs;
    return subs.filter((s) =>
      (s.name ?? '').toLowerCase().includes(term) ||
      (s.slug ?? '').toLowerCase().includes(term),
    );
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

  setPriceRange(range: [number, number]): void {
    this.catalog.setFilters({ minPrice: range[0], maxPrice: range[1] });
  }

  reset(): void {
    this.searchTerm.set('');
    this.catalog.resetFilters();
    this.updateQueryParams({ q: null, category: null, subcategory: null });
  }
}
