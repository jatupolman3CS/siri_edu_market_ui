import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BundleService } from '../../../core/services';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-buyer-bundles',
  standalone: true,
  imports: [PageHeroComponent, BundleCardComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bundles.page.html',
  styleUrl: './bundles.page.scss',
})
export class BuyerBundlesPage {
  readonly bundleService = inject(BundleService);
}
