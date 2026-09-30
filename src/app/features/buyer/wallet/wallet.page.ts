import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, OrderService, WalletService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import type { WalletEntry, WalletTopUp } from '../../../core/models';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';
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
    TableViewportDirective,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wallet.page.html',
  styleUrls: ['./wallet.page.scss'],
})
export class WalletPage implements OnInit, OnDestroy {
  readonly wallet = inject(WalletService);
  private readonly orders = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  readonly translation = inject(TranslationService);

  readonly amount = signal<number | null>(null);
  readonly busy = signal<boolean>(false);
  readonly mountingPayment = signal<boolean>(false);
  /**
   * True only once the Stripe Payment Element is actually mounted for `currentTopUp()`. The confirm
   * button is bound to it, so a failed Stripe.js load can never leave an enabled button that does
   * nothing (responsive-ui F152).
   */
  readonly paymentReady = signal<boolean>(false);
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
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private mountTimer: ReturnType<typeof setTimeout> | null = null;
  private visibilityListener: (() => void) | null = null;

  async ngOnInit(): Promise<void> {
    void this.wallet.refreshSummary();
    void this.wallet.loadLedgerFirst();

    const query = this.route.snapshot.queryParams;
    if (query['topup'] === '1' && query['id']) {
      const topUpId = query['id'] as string;
      await this.handleRedirectReturn(topUpId);
    }

    if (typeof document !== 'undefined') {
      this.visibilityListener = () => {
        if (!document.hidden && this.currentTopUp()) {
          const topUpId = this.currentTopUp()!.id;
          void (async () => {
            const polled = await this.wallet.pollTopUp(topUpId);
            if (polled?.status === 'succeeded') {
              await this.handleTopUpSucceeded(topUpId);
            }
          })();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.clearMountTimer();
    if (typeof document !== 'undefined' && this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
  }

  private startPolling(topUpId: string): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      void (async () => {
        const topup = this.currentTopUp();
        if (!topup || topup.id !== topUpId) {
          this.stopPolling();
          return;
        }
        const polled = await this.wallet.pollTopUp(topUpId);
        if (polled?.status === 'succeeded') {
          this.stopPolling();
          await this.handleTopUpSucceeded(topUpId);
        }
      })();
    }, 2500);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
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
      this.message.warning(this.translation.t('wallet.warnAmountRequired'));
      return;
    }

    this.busy.set(true);
    try {
      const topup = await this.wallet.createTopUp(val);
      if (!topup) {
        this.message.error(this.translation.t('wallet.topUpCreateFailed'));
        return;
      }

      this.currentTopUp.set(topup);
      this.paymentReady.set(false);
      this.startPolling(topup.id);

      if (topup.clientSecret) {
        this.mountingPayment.set(true);
        this.cdr.markForCheck();
        // Allow container to render before mounting element
        this.clearMountTimer();
        this.mountTimer = setTimeout(async () => {
          this.mountTimer = null;
          try {
            await this.mountPaymentElement(topup.clientSecret!);
            if (this.currentTopUp()?.id === topup.id) {
              this.paymentReady.set(true);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : this.translation.t('wallet.paymentSystemLoadFailed');
            this.message.error(msg);
            // F152: without a mounted Payment Element this panel is a dead end, so return the buyer
            // to the amount form (amount kept) to retry. The server row just stays `pending`, which
            // buyer-wallet §2.5/§3.6 allows — a new top-up can always be opened.
            if (this.currentTopUp()?.id === topup.id) {
              this.cancelTopUp();
            }
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
    if (this.busy() || !this.currentTopUp()) {
      return;
    }
    if (!this.stripe || !this.elements || !this.paymentReady()) {
      // F152: never a silent no-op — the button is disabled in this state, but say why if reached.
      this.message.error(this.translation.t('wallet.paymentSystemLoadFailed'));
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
        this.message.error(result.error.message ?? this.translation.t('wallet.paymentConfirmFailed'));
        return;
      }

      // If confirmPayment did not redirect:
      await this.handleTopUpSucceeded(topUp.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : this.translation.t('wallet.paymentConfirmFailed');
      this.message.error(msg);
    } finally {
      this.busy.set(false);
      this.cdr.markForCheck();
    }
  }

  cancelTopUp(): void {
    this.stopPolling();
    this.clearMountTimer();
    this.mountingPayment.set(false);
    this.currentTopUp.set(null);
    this.paymentReady.set(false);
    this.stripe = null;
    this.elements = null;
  }

  private clearMountTimer(): void {
    if (this.mountTimer) {
      clearTimeout(this.mountTimer);
      this.mountTimer = null;
    }
  }

  private async mountPaymentElement(clientSecret: string): Promise<void> {
    await loadStripeScript();

    const stripeFactory = window.Stripe;
    if (!stripeFactory) {
      throw new Error(this.translation.t('wallet.stripeScriptFailed'));
    }

    const publishableKey = await this.orders.getStripePublishableKey();
    if (!publishableKey) {
      throw new Error(this.translation.t('wallet.stripeKeyNotConfigured'));
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
    this.stopPolling();
    this.busy.set(true);
    let succeeded = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const polled = await this.wallet.pollTopUp(topUpId);
      if (polled?.status === 'succeeded') {
        succeeded = true;
        break;
      }
      if (attempt < 11) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    if (succeeded) {
      this.message.success(this.translation.t('wallet.topUpSuccess'));
    } else {
      this.message.info(this.translation.t('wallet.topUpProcessing'));
    }
    this.currentTopUp.set(null);
    this.paymentReady.set(false);
    this.amount.set(null);
    await this.wallet.refreshSummary();
    await this.wallet.loadLedgerFirst();
    this.busy.set(false);
    this.cdr.markForCheck();
  }

  getKindLabel(kind: WalletEntry['kind']): string {
    switch (kind) {
      case 'topup':
        return this.translation.t('wallet.kindTopup');
      case 'purchase':
        return this.translation.t('wallet.kindPurchase');
      case 'refund':
        return this.translation.t('wallet.kindRefund');
      default:
        return kind;
    }
  }

  getTopUpStatusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return this.translation.t('wallet.statusPending');
      case 'succeeded':
        return this.translation.t('wallet.statusSucceeded');
      case 'failed':
        return this.translation.t('wallet.statusFailed');
      case 'cancelled':
        return this.translation.t('wallet.statusCancelled');
      default:
        return status;
    }
  }
}
