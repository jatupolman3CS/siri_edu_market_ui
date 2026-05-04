import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import {
  BundleService,
  CatalogService,
  RecentlyViewedService,
} from '../../../core/services';
import {
  GRADE_LEVEL_LABELS,
  GradeLevel,
  RESOURCE_TYPE_ICONS,
  RESOURCE_TYPE_LABELS,
  ResourceType,
} from '../../../core/models';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './marketplace.page.html',
  styleUrl: './marketplace.page.scss',
})
export class BuyerMarketplacePage {
  readonly catalog = inject(CatalogService);
  readonly bundles = inject(BundleService);
  readonly recent = inject(RecentlyViewedService);
  private readonly route = inject(ActivatedRoute);

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
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const q = params.get('q') ?? '';
        const cat = params.get('category');
        const sub = params.get('subcategory');
        const tab = params.get('tab');
        if (q !== this.catalog.filters().search) {
          this.catalog.setFilters({ search: q });
        }
        if (cat) {
          const c = this.catalog.getCategoryBySlug(cat);
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
          this.catalog.setTab(tab as any);
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
