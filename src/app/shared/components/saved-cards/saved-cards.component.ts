import { ChangeDetectionStrategy, Component, inject, input, model, signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { AuthService, OrderService, PaymentMethodService } from '../../../core/services';
import type { SavedPaymentMethod } from '../../../core/models';
import { isSavedCardEntryExpired } from '../../../core/util/saved-card.util';
import { loadStripeScript } from '../../../core/util/load-stripe-script';

/**
 * saved-credit-cards v1 (docs/contracts/saved-credit-cards.md §4) — one component, two modes:
 *
 * - `mode="manage"` (embedded on `/account`): full list / add / delete / set-default, reading and
 *   mutating `PaymentMethodService` directly. AC-18.
 * - `mode="select"` (embedded on `/checkout`): a read-only radio list of saved cards + "ใช้บัตรใหม่",
 *   two-way bound to the parent's `selected` signal so `checkout.page.ts` decides what to do with
 *   the pick. AC-16/AC-17.
 *
 * Both modes read the same `PaymentMethodService.list()` signal (service-as-store) — whichever
 * page loads first triggers the fetch, and both stay in sync without an extra round trip.
 */
@Component({
  selector: 'app-saved-cards',
  standalone: true,
  imports: [NzModalModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './saved-cards.component.html',
  styleUrl: './saved-cards.component.scss',
})
export class SavedCardsComponent {
  readonly paymentMethods = inject(PaymentMethodService);
  private readonly orders = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);

  readonly mode = input<'manage' | 'select'>('manage');

  /** select mode only — two-way bound from `checkout.page.ts` (`[(selected)]="..."`). */
  readonly selected = model<string>('new');

  /** True while add/delete/set-default is in flight — guards every button against double-clicks. */
  readonly busy = signal(false);

  /** True while the "เพิ่มบัตรใหม่" Payment Element (SetupIntent) is mounted (manage mode only). */
  readonly addingCard = signal(false);

  private stripe: ReturnType<NonNullable<Window['Stripe']>> | null = null;
  private elements: ReturnType<NonNullable<typeof this.stripe>['elements']> | null = null;

  constructor() {
    void this.paymentMethods.refreshList();
  }

  isExpired(card: SavedPaymentMethod): boolean {
    return isSavedCardEntryExpired(card);
  }

  selectCard(id: string): void {
    this.selected.set(id);
  }

  // ---- manage mode ----

  async openAddCard(): Promise<void> {
    if (this.busy() || this.addingCard()) return;
    this.busy.set(true);
    try {
      const clientSecret = await this.paymentMethods.createSetupIntent();
      if (!clientSecret) {
        this.message.error('บันทึกบัตรไม่สำเร็จ');
        return;
      }
      await this.mountSetupElement(clientSecret);
      this.addingCard.set(true);
    } catch {
      this.message.error('บันทึกบัตรไม่สำเร็จ');
    } finally {
      this.busy.set(false);
    }
  }

  closeAddCard(): void {
    this.stripe = null;
    this.elements = null;
    this.addingCard.set(false);
  }

  async confirmAddCard(): Promise<void> {
    if (this.busy() || !this.stripe || !this.elements) return;
    this.busy.set(true);
    try {
      const result = await this.stripe.confirmSetup({
        elements: this.elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });

      if (result.error) {
        this.message.error('บันทึกบัตรไม่สำเร็จ');
        return;
      }

      const pmId = result.setupIntent?.payment_method;
      if (!pmId) {
        this.message.error('บันทึกบัตรไม่สำเร็จ');
        return;
      }

      const saved = await this.paymentMethods.confirmSaved(pmId);
      if (!saved) {
        this.message.error('บันทึกบัตรไม่สำเร็จ');
        return;
      }

      this.message.success('บันทึกบัตรสำเร็จ');
      this.closeAddCard();
      await this.paymentMethods.refreshList();
    } catch {
      this.message.error('บันทึกบัตรไม่สำเร็จ');
    } finally {
      this.busy.set(false);
    }
  }

  async setDefault(id: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.paymentMethods.setDefault(id);
    } finally {
      this.busy.set(false);
    }
    await this.paymentMethods.refreshList();
  }

  confirmRemove(card: SavedPaymentMethod): void {
    this.modal.confirm({
      nzTitle: 'ยืนยันลบบัตร',
      nzContent: 'ลบบัตรนี้ออกจากรายการที่บันทึกไว้?',
      nzOkText: 'ลบ',
      nzOkDanger: true,
      nzCancelText: 'ยกเลิก',
      nzOnOk: () => this.remove(card.id),
    });
  }

  private async remove(id: string): Promise<void> {
    this.busy.set(true);
    try {
      const ok = await this.paymentMethods.remove(id);
      if (ok) {
        this.message.success('ลบบัตรแล้ว');
        await this.paymentMethods.refreshList();
      } else {
        this.message.error('ลบบัตรไม่สำเร็จ');
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async mountSetupElement(clientSecret: string): Promise<void> {
    await loadStripeScript();

    const stripeFactory = window.Stripe;
    if (!stripeFactory) {
      throw new Error('โหลด Stripe.js ไม่สำเร็จ');
    }

    // F-01/S-04: `OrderService.getStripePublishableKey()` already owns this lookup for the
    // checkout flow — reused as-is rather than duplicating a second copy here, since a SetupIntent
    // mounts with the same publishable key as a PaymentIntent.
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
      .mount('#saved-cards-setup-element');
  }
}
