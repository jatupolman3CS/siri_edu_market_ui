import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

@Component({
  selector: 'app-admin-sellers',
  standalone: true,
  imports: [IconComponent, CompactPipe, DatePipe, RouterLink, ImgFallbackDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sellers.page.html',
  styleUrl: './sellers.page.scss',
})
export class AdminSellersPage {
  readonly admin = inject(AdminService);

  readonly sellers = computed(() => this.admin.adminSellers());

  constructor() {
    void this.admin.refreshSellers();
  }
}
