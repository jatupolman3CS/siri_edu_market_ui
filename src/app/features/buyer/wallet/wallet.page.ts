import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, OrderService, WalletService } from '../../../core/services';
import type { WalletEntry, WalletTopUp } from '../../../core/models';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { loadStripeScript } from '../../../core/util/load-stripe-script';

/**
 * buyer-wallet v1 (docs/contracts/buyer-wallet.md §4.3) — "กระเป๋าเงินของฉัน" page.
 *
 * Balance card (displays `—` during loading), top-up form with 50/100/300/500 presets,
 * mounts Stripe Payment Element reusing checkout pattern, and displays ledger history with "โหลดเพิ่ม".
 */
@Component({
  selector: 'app-buyer-wallet',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ThbPipe,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wallet.page.html',
  styleUrls: ['./wallet.page.scss'],
})
export class WalletPage implements OnInit {
  readonly wallet = inject(WalletService);
  private readonly orders = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  readonly amount = signal<number | null>(null);
  readonly busy = signal<boolean>(false);
  readonly mountingPayment = signal<boolean>(false);
  readonly currentTopUp = signal<WalletTopUp | null>(null);

  readonly stateErrorMessage = computed(() => {
    const s = this.wallet.state();
    return s.status === 'error' ? s.message : '';
  });

  readonly ledgerErrorMessage = computed(() => {
    const s = this.wallet.ledgerState();
    return s.status === 'error' ? s.message : '';
  });

  /** Presets fixed on the frontend per §4.3 */
  readonly presets = [50, 100, 300, 500] as const;

  private stripe: ReturnType<NonNullable<Window['Stripe']>> | null = null;
  private elements: ReturnType<NonNullable<typeof this.stripe>['elements']> | null = null;

  async ngOnInit(): Promise<void> {
    void this.wallet.refreshSummary();
    void this.wallet.loadLedgerFirst();

    const query = this.route.snapshot.queryParams;
    if (query['topup'] === '1' && query['id']) {
      const topUpId = query['id'] as string;
      await this.handleRedirectReturn(topUpId);
    }
  }

  selectPreset(val: number): void {
    this.amount.set(val);
  }

  setAmountFromInput(val: string): void {
    const num = parseFloat(val);
    this.amount.set(isNaN(num) ? null : num);
  }

  async startTopUp(): Promise<void> {
    const val = this.amount();
    if (!val || val <= 0) {
      this.message.warning('กรุณาระบุจำนวนเงินที่ต้องการเติม');
      return;
    }

    this.busy.set(true);
    try {
      const topup = await this.wallet.createTopUp(val);
      if (!topup) {
        this.message.error('สร้างรายการเติมเงินไม่สำเร็จ');
        return;
      }

      this.currentTopUp.set(topup);

      if (topup.clientSecret) {
        this.mountingPayment.set(true);
        this.cdr.markForCheck();
        // Allow container to render before mounting element
        setTimeout(async () => {
          try {
            await this.mountPaymentElement(topup.clientSecret!);
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'โหลดระบบชำระเงินไม่สำเร็จ';
            this.message.error(msg);
          } finally {
            this.mountingPayment.set(false);
            this.cdr.markForCheck();
          }
        }, 50);
      }
    } finally {
      this.busy.set(false);
      this.cdr.markForCheck();
    }
  }

  async confirmPayment(): Promise<void> {
    if (this.busy() || !this.stripe || !this.elements || !this.currentTopUp()) {
      return;
    }

    const topUp = this.currentTopUp()!;
    this.busy.set(true);
    try {
      const returnUrl = new URL(
        `/wallet?topup=1&id=${encodeURIComponent(topUp.id)}`,
        window.location.origin,
      ).toString();

      const result = await this.stripe.confirmPayment({
        elements: this.elements,
        confirmParams: {
          return_url: returnUrl,
          payment_method_data: { billing_details: { email: this.auth.user()?.email ?? '' } },
        },
      });

      if (result.error) {
        this.message.error(result.error.message ?? 'ยืนยันการชำระเงินไม่สำเร็จ');
        return;
      }

      // If confirmPayment did not redirect:
      await this.handleTopUpSucceeded(topUp.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ยืนยันการชำระเงินไม่สำเร็จ';
      this.message.error(msg);
    } finally {
      this.busy.set(false);
      this.cdr.markForCheck();
    }
  }

  cancelTopUp(): void {
    this.currentTopUp.set(null);
    this.stripe = null;
    this.elements = null;
  }

  private async mountPaymentElement(clientSecret: string): Promise<void> {
    await loadStripeScript();

    const stripeFactory = window.Stripe;
    if (!stripeFactory) {
      throw new Error('โหลด Stripe.js ไม่สำเร็จ');
    }

    const publishableKey = await this.orders.getStripePublishableKey();
    if (!publishableKey) {
      throw new Error('ยังไม่ตั้งค่า Stripe publishable key ที่เซิร์ฟเวอร์');
    }

    this.stripe = stripeFactory(publishableKey);
    this.elements = this.stripe.elements({ clientSecret });
    this.elements
      .create('payment', {
        fields: { billingDetails: { email: 'never' } },
        defaultValues: { billingDetails: { email: this.auth.user()?.email ?? '' } },
      })
      .mount('#wallet-stripe-payment-element');
  }

  private async handleRedirectReturn(topUpId: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.handleTopUpSucceeded(topUpId);
    } finally {
      this.busy.set(false);
      void this.ngZone.run(() =>
        this.router.navigate(['/wallet'], { replaceUrl: true, queryParams: {} }),
      );
    }
  }

  private async handleTopUpSucceeded(topUpId: string): Promise<void> {
    const polled = await this.wallet.pollTopUp(topUpId);
    if (polled?.status === 'succeeded') {
      this.message.success('เติมเงินสำเร็จ');
    } else {
      this.message.info('ระบบกำลังดำเนินการเติมเงิน กรุณารอสักครู่');
    }
    this.currentTopUp.set(null);
    this.amount.set(null);
    await this.wallet.refreshSummary();
    await this.wallet.loadLedgerFirst();
    this.cdr.markForCheck();
  }

  getKindLabel(kind: WalletEntry['kind']): string {
    switch (kind) {
      case 'topup':
        return 'เติมเงิน';
      case 'purchase':
        return 'ซื้อเอกสาร';
      case 'refund':
        return 'คืนเงินเข้ากระเป๋า';
      default:
        return kind;
    }
  }

  getTopUpStatusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'กำลังดำเนินการ';
      case 'succeeded':
        return 'สำเร็จ';
      case 'failed':
        return 'ไม่สำเร็จ';
      case 'cancelled':
        return 'ยกเลิกแล้ว';
      default:
        return status;
    }
  }
}
