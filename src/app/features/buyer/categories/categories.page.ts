import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
}
