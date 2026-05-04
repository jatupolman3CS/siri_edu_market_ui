import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../../core/services';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

type PayMethod = 'promptpay' | 'credit_card' | 'truemoney';

@Component({
  selector: 'app-buyer-checkout',
  standalone: true,
  imports: [RouterLink, FormsModule, ThbPipe, IconComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout.page.html',
  styleUrl: './checkout.page.scss',
})
export class BuyerCheckoutPage {
  readonly cart = inject(CartService);
  private readonly router = inject(Router);

  readonly payMethod = signal<PayMethod>('promptpay');

  readonly methods: { value: PayMethod; label: string; icon: string; note: string }[] =
    [
      { value: 'promptpay', label: 'PromptPay QR', icon: '📲', note: 'สแกนจ่ายทันที' },
      { value: 'credit_card', label: 'บัตรเครดิต', icon: '💳', note: 'Visa / Master / JCB' },
      { value: 'truemoney', label: 'TrueMoney', icon: '👛', note: 'หักจาก e-Wallet' },
    ];

  confirmPayment(): void {
    // Mock success
    this.cart.clear();
    this.router.navigate(['/orders'], {
      queryParams: { success: 1 },
    });
  }
}
