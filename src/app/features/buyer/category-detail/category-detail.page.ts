import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CatalogService } from '../../../core/services';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';

@Component({
  selector: 'app-buyer-category-detail',
  standalone: true,
  imports: [
    RouterLink,
    DocumentCardComponent,
    IconComponent,
    EmptyStateComponent,
    CompactPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './category-detail.page.html',
  styleUrl: './category-detail.page.scss',
})
export class BuyerCategoryDetailPage {
  readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);

  readonly slug = signal<string>('');
  readonly selectedSubId = signal<string>('');
  readonly sort = signal<'popular' | 'newest' | 'rating' | 'price-asc'>('popular');

  readonly sorts = [
    { value: 'popular' as const, label: 'ความนิยม' },
    { value: 'newest' as const, label: 'มาใหม่' },
    { value: 'rating' as const, label: 'คะแนนรีวิว' },
    { value: 'price-asc' as const, label: 'ราคา ต่ำ-สูง' },
  ];

  readonly category = computed(() =>
    this.catalog.getCategoryBySlug(this.slug()),
  );

  readonly selectedSub = computed(() => {
    const id = this.selectedSubId();
    return id ? this.catalog.getSubcategoryById(id) : undefined;
  });

  readonly docs = computed(() => {
    const cat = this.category();
    const subId = this.selectedSubId();
    if (!cat) return [];
    let list = this.catalog
      .documents()
      .filter((d) => d.categoryId === cat.id);
    if (subId) {
      list = list.filter((d) => d.subcategoryId === subId);
    }
    switch (this.sort()) {
      case 'newest':
        return [...list].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
        );
      case 'rating':
        return [...list].sort((a, b) => b.rating - a.rating);
      case 'price-asc':
        return [...list].sort((a, b) => a.price - b.price);
      case 'popular':
      default:
        return [...list].sort((a, b) => b.downloads - a.downloads);
    }
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.slug.set(params.get('slug') ?? '');
      this.selectedSubId.set('');
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((qp) => {
      const sub = qp.get('sub');
      if (sub) {
        const s = this.catalog.getSubcategoryBySlug(sub);
        if (s) this.selectedSubId.set(s.id);
      }
    });
  }
}
