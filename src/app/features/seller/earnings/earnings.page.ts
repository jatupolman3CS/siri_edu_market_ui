import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { SellerService } from '../../../core/services';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CommonModule } from '@angular/common';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-seller-earnings',
  standalone: true,
  imports: [StatCardComponent, IconComponent, ThbPipe, CommonModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './earnings.page.html',
  styleUrl: './earnings.page.scss',
})
export class SellerEarningsPage {
  readonly seller = inject(SellerService);

  constructor() {
    // Load earnings data on init
    effect(() => {
      void this.seller.loadEarnings();
    });
  }
}

