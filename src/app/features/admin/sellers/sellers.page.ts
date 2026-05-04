import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CatalogService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';

@Component({
  selector: 'app-admin-sellers',
  standalone: true,
  imports: [IconComponent, CompactPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sellers.page.html',
  styleUrl: './sellers.page.scss',
})
export class AdminSellersPage {
  readonly catalog = inject(CatalogService);

  readonly sellers = computed(() =>
    this.catalog
      .documents()
      .map((d) => d.seller)
      .filter((s, idx, arr) => arr.findIndex((x) => x.id === s.id) === idx),
  );
}
