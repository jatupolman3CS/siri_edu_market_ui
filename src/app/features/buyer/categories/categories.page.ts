import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../../../core/services';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';

@Component({
  selector: 'app-buyer-categories',
  standalone: true,
  imports: [RouterLink, PageHeroComponent, IconComponent, EmptyStateComponent, CompactPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories.page.html',
  styleUrl: './categories.page.scss',
})
export class BuyerCategoriesPage {
  readonly catalog = inject(CatalogService);

  /**
   * real-data-stats v1 §4.4: "กว่า N หมวดหมู่หลัก แตกย่อยเป็น M หมวดย่อย …" — same computation as
   * the Home page (§4.2). The sub-category clause only appears once at least one category
   * actually reports `subcategoryCount` (§3.1); until then it's just dropped, never shown as a
   * fabricated "0 หมวดย่อย".
   */
  readonly mainCount = computed(() => this.catalog.categories().length);
  readonly subCount = computed(() =>
    this.catalog.categories().reduce((sum, c) => sum + (c.subcategoryCount ?? 0), 0),
  );
  readonly subCountKnown = computed(() =>
    this.catalog.categories().some((c) => c.subcategoryCount !== undefined),
  );
  readonly heroDescription = computed(() => {
    const mainCount = this.mainCount();
    const tail = 'ครอบคลุมการศึกษา ธุรกิจ ไอที ดีไซน์ และอีกมากมาย';
    if (mainCount === 0) return `สำรวจเอกสารในทุกหมวดหมู่ ${tail}`;
    const sub = this.subCountKnown() ? ` แตกย่อยเป็น ${this.subCount()} หมวดย่อย` : '';
    return `กว่า ${mainCount} หมวดหมู่หลัก${sub} ${tail}`;
  });

  constructor() {
    // Explicit init — the root CatalogService never auto-fetches, so without this
    // the page renders an empty list on a deep link or F5. ensureCategories()
    // skips the call when a previous load already succeeded.
    this.catalog.ensureCategories();
  }
}
