import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BundleService } from '../../../core/services';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TranslatePipe } from '../../../core/i18n';

@Component({
  selector: 'app-buyer-bundles',
  standalone: true,
  imports: [BundleCardComponent, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bundles.page.html',
  styleUrl: './bundles.page.scss',
})
export class BuyerBundlesPage {
  readonly bundleService = inject(BundleService);
}
