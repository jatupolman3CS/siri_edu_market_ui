import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CatalogService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';

@Component({
  selector: 'app-admin-categories',
  standalone: true,
  imports: [IconComponent, CompactPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories-admin.page.html',
  styleUrl: './categories-admin.page.scss',
})
export class AdminCategoriesPage {
  readonly catalog = inject(CatalogService);
}
