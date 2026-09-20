import { ChangeDetectionStrategy, Component, inject, input, model, signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { AuthService, OrderService, PaymentMethodService } from '../../../core/services';
import type { SavedPaymentMethod } from '../../../core/models';
import { isSavedCardEntryExpired } from '../../../core/util/saved-card.util';
import { loadStripeScript } from '../../../core/util/load-stripe-script';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-saved-cards',
  standalone: true,
  imports: [NzModalModule, EmptyStateComponent, IconComponent, TranslatePipe],
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
  readonly translation = inject(TranslationService);

  readonly mode = input<'manage' | 'select'>('manage');
  readonly selected = model<string>('new');
  readonly busy = signal(false);
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

  async openAddCard(): Promise<void> {
    if (this.busy() || this.addingCard()) return;
    this.busy.set(true);
    try {
      const clientSecret = await this.paymentMethods.createSetupIntent();
      if (!clientSecret) {
        this.message.error(this.translation.t('shared.savedCards.saveFailed'));
        return;
      }
      await this.mountSetupElement(clientSecret);
      this.addingCard.set(true);
    } catch {
      this.message.error(this.translation.t('shared.savedCards.saveFailed'));
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
        confirmParams: {
          return_url: window.location.href,
          payment_method_data: { billing_details: { email: this.auth.user()?.email ?? '' } },
        },
        redirect: 'if_required',
      });

      if (result.error) {
        this.message.error(this.translation.t('shared.savedCards.saveFailed'));
        return;
      }

      const pmId = result.setupIntent?.payment_method;
      if (!pmId) {
        this.message.error(this.translation.t('shared.savedCards.saveFailed'));
        return;
      }

      const saved = await this.paymentMethods.confirmSaved(pmId);
      if (!saved) {
        this.message.error(this.translation.t('shared.savedCards.saveFailed'));
        return;
      }

      this.message.success(this.translation.t('shared.savedCards.savedSuccess'));
      this.closeAddCard();
      await this.paymentMethods.refreshList();
    } catch {
      this.message.error(this.translation.t('shared.savedCards.saveFailed'));
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
      nzTitle: this.translation.t('shared.savedCards.confirmRemoveTitle'),
      nzContent: this.translation.t('shared.savedCards.confirmRemoveContent'),
      nzOkText: this.translation.t('shared.savedCards.remove'),
      nzOkDanger: true,
      nzCancelText: this.translation.t('common.cancel'),
      nzOnOk: () => this.remove(card.id),
    });
  }

  private async remove(id: string): Promise<void> {
    this.busy.set(true);
    try {
      const ok = await this.paymentMethods.remove(id);
      if (ok) {
        this.message.success(this.translation.t('shared.savedCards.removedSuccess'));
        await this.paymentMethods.refreshList();
      } else {
        this.message.error(this.translation.t('shared.savedCards.removeFailed'));
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async mountSetupElement(clientSecret: string): Promise<void> {
    await loadStripeScript();

    const stripeFactory = window.Stripe;
    if (!stripeFactory) {
      throw new Error('Failed to load Stripe.js');
    }

    const publishableKey = await this.orders.getStripePublishableKey();
    if (!publishableKey) {
      throw new Error('Stripe publishable key not configured');
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
