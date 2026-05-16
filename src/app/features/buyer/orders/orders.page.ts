import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService, LibraryService } from '../../../core/services';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-buyer-orders',
  standalone: true,
  imports: [
    RouterLink,
    PageHeroComponent,
    IconComponent,
    EmptyStateComponent,
    ThbPipe,
    TimeAgoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders.page.html',
  styleUrl: './orders.page.scss',
})
export class BuyerOrdersPage {
  readonly library = inject(LibraryService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly showSuccess = signal<boolean>(false);

  constructor() {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/orders' } });
      return;
    }
    void this.library.refreshOrders();
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.showSuccess.set(params.get('success') === '1');
      });
  }

  dismissSuccess(): void {
    this.showSuccess.set(false);
  }

  statusLabel(s: string): string {
    return {
      awaiting_payment: 'รอชำระเงิน',
      paid: 'ชำระแล้ว',
      fulfilled: 'สำเร็จ',
      refunded: 'คืนเงินแล้ว',
      cancelled: 'ยกเลิก',
    }[s] ?? s;
  }

  statusClass(s: string): string {
    return {
      awaiting_payment: 'bg-amber-100 text-amber-700',
      paid: 'bg-blue-100 text-blue-700',
      fulfilled: 'bg-emerald-100 text-emerald-700',
      refunded: 'bg-rose-100 text-rose-700',
      cancelled: 'bg-gray-100 text-gray-600',
    }[s] ?? 'bg-pink-100 text-pink-700';
  }

  paymentLabel(p: string): string {
    return {
      promptpay: 'PromptPay',
      credit_card: 'บัตรเครดิต',
      truemoney: 'TrueMoney',
    }[p] ?? p;
  }
}
