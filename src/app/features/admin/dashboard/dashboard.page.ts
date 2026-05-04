import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService, CatalogService } from '../../../core/services';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    StatCardComponent,
    ThbPipe,
    TimeAgoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class AdminDashboardPage {
  readonly admin = inject(AdminService);
  readonly catalog = inject(CatalogService);

  readonly services: { name: string; note: string; status: 'ok' | 'warn' | 'down' }[] = [
    { name: 'API Gateway', note: 'ทุก endpoint ตอบกลับ < 200ms', status: 'ok' },
    { name: 'Cloudflare R2', note: 'ใช้พื้นที่ 4.2GB / 100GB', status: 'ok' },
    { name: 'Payment Gateway', note: 'Omise — เชื่อมต่อปกติ', status: 'ok' },
    { name: 'Watermark Service', note: 'คิวงานเฉลี่ย 12 วินาที', status: 'warn' },
    { name: 'Email (SES)', note: 'ส่งสำเร็จ 99.7%', status: 'ok' },
  ];

  badgeClass(s: string): string {
    return {
      fulfilled: 'bg-emerald-100 text-emerald-700',
      paid: 'bg-blue-100 text-blue-700',
      awaiting_payment: 'bg-amber-100 text-amber-700',
      refunded: 'bg-rose-100 text-rose-700',
      cancelled: 'bg-gray-100 text-gray-600',
    }[s] ?? 'bg-pink-100 text-pink-700';
  }

  statusLabel(s: string): string {
    return {
      fulfilled: 'สำเร็จ',
      paid: 'ชำระแล้ว',
      awaiting_payment: 'รอชำระ',
      refunded: 'คืนเงิน',
      cancelled: 'ยกเลิก',
    }[s] ?? s;
  }
}
