import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SellerService } from '../../../core/services';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';

@Component({
  selector: 'app-seller-earnings',
  standalone: true,
  imports: [StatCardComponent, IconComponent, ThbPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './earnings.page.html',
  styleUrl: './earnings.page.scss',
})
export class SellerEarningsPage {
  readonly seller = inject(SellerService);

  readonly payouts = [
    { id: 1, date: '15 เม.ย. 2026', amount: 32400, fee: 0, status: 'paid', account: 'KBANK ****1234' },
    { id: 2, date: '15 มี.ค. 2026', amount: 28100, fee: 0, status: 'paid', account: 'KBANK ****1234' },
    { id: 3, date: '15 ก.พ. 2026', amount: 26800, fee: 0, status: 'paid', account: 'KBANK ****1234' },
    { id: 4, date: '15 ม.ค. 2026', amount: 22400, fee: 0, status: 'paid', account: 'KBANK ****1234' },
  ];
}
