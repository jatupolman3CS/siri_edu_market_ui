import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CatalogService, SeoMetaService } from '../../../core/services';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../core/i18n';

@Component({
  selector: 'app-buyer-category-detail',
  standalone: true,
  imports: [
    RouterLink,
    DocumentCardComponent,
    IconComponent,
    EmptyStateComponent,
    CompactPipe,
    DecimalPipe,
    FormsModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './category-detail.page.html',
  styleUrl: './category-detail.page.scss',
})
export class BuyerCategoryDetailPage {
  readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoMetaService);

  readonly slug = signal<string>('');
  readonly selectedSubId = signal<string>('');
  readonly subSearch = signal<string>('');
  readonly sort = signal<'popular' | 'newest' | 'rating' | 'price-asc'>('popular');

  readonly filteredSubcategories = computed(() => {
    const cat = this.category();
    const subs = cat?.subcategories ?? [];
    const term = this.subSearch().trim().toLowerCase();
    if (!term) return subs;
    return subs.filter((s) => {
      const name = (s.name ?? '').toLowerCase();
      const slug = (s.slug ?? '').toLowerCase();
      return name.includes(term) || slug.includes(term);
    });
  });

  readonly sorts = [
    { value: 'popular' as const, labelKey: 'categories.sortPopular' },
    { value: 'newest' as const, labelKey: 'categories.sortNewest' },
    { value: 'rating' as const, labelKey: 'categories.sortRating' },
    { value: 'price-asc' as const, labelKey: 'categories.sortPriceAsc' },
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
      .categoryDocuments()
      .filter((d) => d.categoryIds.includes(cat.id));
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
      const slug = params.get('slug') ?? '';
      if (slug) {
        // The document list is scoped to this category server-side; filtering the
        // shared marketplace cache leaves it empty on a deep link / F5.
        void this.catalog.loadCategoryDetailBySlug(slug).then((cat) => {
          if (this.slug() !== slug) return;
          this.catalog.loadCategoryDocuments(cat?.id ?? '');
        });
      }
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((qp) => {
      const sub = qp.get('sub');
      if (sub) {
        const s = this.catalog.getSubcategoryBySlug(sub);
        if (s) this.selectedSubId.set(s.id);
      }
    });
    // seo-ssr v1 §4.1/DEC-2/DEC-8: dynamic title/meta/canonical/JSON-LD (CollectionPage only, no
    // ItemList) — re-runs whenever the loaded category changes (AC-17 for `/category/:slug`).
    effect(() => {
      const cat = this.category();
      if (!cat) return;
      this.seo.setCategorySeo({
        name: cat.name,
        description: cat.description,
        canonicalUrl: this.seo.canonicalUrl(`/category/${cat.slug}`),
      });
    });
  }
}
