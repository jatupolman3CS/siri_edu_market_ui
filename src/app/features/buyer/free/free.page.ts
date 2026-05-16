import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CatalogService } from '../../../core/services';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';

@Component({
  selector: 'app-buyer-free',
  standalone: true,
  imports: [
    PageHeroComponent,
    DocumentCardComponent,
    EmptyStateComponent,
    IconComponent,
    CompactPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './free.page.html',
  styleUrl: './free.page.scss',
})
export class BuyerFreePage {
  readonly catalog = inject(CatalogService);

  constructor() {
    this.catalog.loadFreeResources();
  }

  totalDownloads(): number {
    return this.catalog
      .freeResources()
      .reduce((sum, d) => sum + d.downloads, 0);
  }
}
