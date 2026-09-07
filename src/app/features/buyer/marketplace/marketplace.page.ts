import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import {
  BundleService,
  CatalogService,
  PlatformStatsService,
  RecentlyViewedService,
} from '../../../core/services';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import {
  Category,
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
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

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
    PageHeroComponent,
    ImgFallbackDirective,
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
  private readonly route = inject(ActivatedRoute);
  private readonly compactPipe = new CompactPipe();

  /**
   * real-data-stats v1 §4 (project-owner instruction — see round 2 dispatch notes): the hero's
   * "กว่า 12,000 เอกสารจากครีเอเตอร์ตัวจริงทั่วประเทศ" was a hardcoded number, same figure the
   * home page already binds to `platformStats.stats()?.totalApprovedDocuments` (§4.2). Drops the
   * "กว่า N เอกสาร" clause entirely while stats haven't loaded yet, rather than showing a stale
   * hardcoded count.
   */
  readonly heroDescription = computed(() => {
    const totalDocs = this.platformStats.stats()?.totalApprovedDocuments;
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

  readonly tabs = computed(() => [
    { value: 'all' as const, label: 'ทั้งหมด', icon: '🌸', count: this.catalog.documents().length },
    { value: 'free' as const, label: 'ฟรี', icon: '🎁', count: this.catalog.freeResources().length },
    { value: 'top-rated' as const, label: 'คะแนนสูง', icon: '⭐', count: this.catalog.documents().filter(d => d.rating >= 4.7).length },
    { value: 'new' as const, label: 'มาใหม่', icon: '✨', count: this.catalog.newArrivals().length },
    { value: 'bundles' as const, label: 'แพ็กเกจ', icon: '📦', count: this.bundles.bundles().length },
  ]);

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

  gradeLabel(g: GradeLevel): string {
    return GRADE_LEVEL_LABELS[g];
  }
  resourceLabel(t: ResourceType): string {
    return RESOURCE_TYPE_LABELS[t];
  }
  resourceIcon(t: ResourceType): string {
    return RESOURCE_TYPE_ICONS[t];
  }

  constructor() {
    // Explicit init to avoid root service auto-fetching on unrelated pages.
    this.catalog.resetFilters();
    this.catalog.initForMarketplace();
    // real-data-stats v1 §4: no-op if another page already loaded this (cached in the service).
    this.platformStats.loadStats();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const q = (params.get('q') ?? '').trim();
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
    this.catalog.resetFilters();
  }
}
