import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SellerService } from '../../../core/services';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';

@Component({
  selector: 'app-seller-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    StatCardComponent,
    IconComponent,
    ThbPipe,
    CompactPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class SellerDashboardPage {
  readonly seller = inject(SellerService);

  readonly maxMonth = computed(() =>
    Math.max(...this.seller.stats().revenueByMonth.map((m) => m.amount), 1),
  );

  readonly topCategoryMax = computed(() =>
    Math.max(...this.seller.stats().topCategories.map((c) => c.sales), 1),
  );

  // Earnings calculator
  readonly pricePerItem = signal<number>(199);
  readonly salesPerMonth = signal<number>(80);
  readonly activeDocs = signal<number>(20);

  readonly grossRevenue = computed(() => this.pricePerItem() * this.salesPerMonth());
  readonly platformFee = computed(() => Math.round(this.grossRevenue() * 0.1));
  readonly monthlyEarnings = computed(() => this.grossRevenue() - this.platformFee());
  readonly yearlyEarnings = computed(() => this.monthlyEarnings() * 12);
}
