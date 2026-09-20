import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { THAI_BANKS, type PayoutAccountType, type PromptPayIdType } from '../../../core/models';
import { PayoutAccountService, SellerService } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';
import { downloadUrlForStorageKey, resolvePublicUrl } from '../../../core/api-runtime';

import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

type FieldErrors = {
  bankCode: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
  promptPayId: string | null;
  /** payment-method-master-config v1 — missing/failed QR image upload. */
  qrImage: string | null;
};

const NO_FIELD_ERRORS: FieldErrors = {
  bankCode: null,
  accountNumber: null,
  accountHolderName: null,
  promptPayId: null,
  qrImage: null,
};

@Component({
  selector: 'app-payout-account-form',
  standalone: true,
  imports: [DatePipe, FormsModule, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payout-account-form.component.html',
  styleUrl: './payout-account-form.component.scss',
})
export class PayoutAccountFormComponent {
  private readonly payoutAccount = inject(PayoutAccountService);
  private readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);
  readonly translation = inject(TranslationService);

  readonly banks = THAI_BANKS;
  readonly resolveQrUrl = resolvePublicUrl;

  readonly account = this.payoutAccount.account;
  readonly state = this.payoutAccount.state;
  readonly revealed = this.payoutAccount.revealed;
  readonly sellerProfileRequired = this.payoutAccount.sellerProfileRequired;

  readonly editing = signal(false);
  readonly accountTypeSelection = signal<PayoutAccountType>('bank');
  readonly promptPayTypeSelection = signal<PromptPayIdType>('phone');
  readonly bankCode = signal('');
  readonly accountHolderName = signal('');
  readonly accountNumber = signal('');
  readonly promptPayId = signal('');
  /** payment-method-master-config v1 — staged upload for the current edit, sent as `promptPayQrImageUrl`. */
  readonly promptPayQrImageUrl = signal<string | null>(null);
  readonly qrUploading = signal(false);
  readonly fieldErrors = signal<FieldErrors>(NO_FIELD_ERRORS);
  readonly saveError = signal<string | null>(null);

  /** payment-method-master-config v1 §1 — master on/off switch per channel, echoed onto the account. */
  readonly bankEnabled = computed(() => this.account()?.payoutMethodBankEnabled ?? true);
  readonly promptPayPhoneEnabled = computed(() => this.account()?.payoutMethodPromptPayPhoneEnabled ?? true);
  readonly promptPayNationalIdEnabled = computed(
    () => this.account()?.payoutMethodPromptPayNationalIdEnabled ?? true,
  );
  readonly promptPayQrEnabled = computed(() => this.account()?.payoutMethodPromptPayQrEnabled ?? true);
  readonly promptPayEnabled = computed(
    () => this.promptPayPhoneEnabled() || this.promptPayNationalIdEnabled() || this.promptPayQrEnabled(),
  );

  /** True for a saved account whose destination is the QR image (masked view swaps in an `<img>`). */
  readonly isQrCodeAccount = computed(
    () => this.account()?.accountType === 'promptpay' && this.account()?.promptPayType === 'qr_code',
  );

  readonly loadError = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : null;
  });

  /**
   * `_state` is shared between `load()` and `save()` (per the service's own contract) — this is
   * unambiguous because the component only ever calls `load()` once, in the constructor, so any
   * `loading` seen after `account()` is no longer `null` can only mean a `save()` is in flight.
   */
  readonly saving = computed(() => this.state().status === 'loading' && this.account() !== null);

  readonly showForm = computed(() => {
    const acc = this.account();
    if (!acc) return false;
    return !acc.hasAccount || this.editing();
  });

  readonly bankName = computed(() => {
    const code = this.account()?.bankCode ?? '';
    if (!code) return '';
    return this.translation.t(`banks.${code}`) || code;
  });

  readonly promptPayTypeLabel = computed(() => {
    switch (this.account()?.promptPayType) {
      case 'national_id':
        return this.translation.t('shared.payoutAccount.nationalIdType');
      case 'qr_code':
        return this.translation.t('shared.payoutAccount.qrType');
      default:
        return this.translation.t('shared.payoutAccount.phoneType');
    }
  });

  /** One of `accountNumber`/`promptPayId` per §3.13.2 — never both (and never for QR Code). */
  readonly revealedValue = computed(() => {
    const r = this.revealed();
    if (!r) return null;
    return r.accountNumber ?? r.promptPayId ?? null;
  });

  constructor() {
    void this.payoutAccount.load();

    // payment-method-master-config v1: a brand-new seller (`hasAccount === false`) sees the empty
    // form immediately, with no `startEdit()` click to run the same defaulting logic — so the
    // moment `account()` first answers, point the two radios at the first channel the admin has
    // actually left enabled instead of the hardcoded 'bank'/'phone' (which may itself be off).
    // Skipped once `editing()` (the user's own live choice) or `hasAccount` (masked view, nothing
    // to default) so this never fights a real interaction.
    effect(() => {
      const acc = this.account();
      if (!acc || acc.hasAccount || this.editing()) return;
      this.accountTypeSelection.set(this.firstEnabledAccountType());
      this.promptPayTypeSelection.set(this.firstEnabledPromptPayType());
    });
  }

  private firstEnabledAccountType(): PayoutAccountType {
    if (this.bankEnabled()) return 'bank';
    return 'promptpay';
  }

  private firstEnabledPromptPayType(): PromptPayIdType {
    if (this.promptPayPhoneEnabled()) return 'phone';
    if (this.promptPayNationalIdEnabled()) return 'national_id';
    return 'qr_code';
  }

  private isAccountTypeEnabled(type: PayoutAccountType): boolean {
    return type === 'bank' ? this.bankEnabled() : this.promptPayEnabled();
  }

  private isPromptPayTypeEnabled(type: PromptPayIdType): boolean {
    if (type === 'phone') return this.promptPayPhoneEnabled();
    if (type === 'national_id') return this.promptPayNationalIdEnabled();
    return this.promptPayQrEnabled();
  }

  selectAccountType(type: PayoutAccountType): void {
    if (this.accountTypeSelection() === type) return;
    this.accountTypeSelection.set(type);
    this.bankCode.set('');
    this.accountNumber.set('');
    this.promptPayId.set('');
    this.promptPayQrImageUrl.set(null);
    this.fieldErrors.set(NO_FIELD_ERRORS);
  }

  selectPromptPayType(type: PromptPayIdType): void {
    if (this.promptPayTypeSelection() === type) return;
    this.promptPayTypeSelection.set(type);
    this.promptPayId.set('');
    this.promptPayQrImageUrl.set(null);
    this.fieldErrors.update((e) => ({ ...e, promptPayId: null, qrImage: null }));
  }

  startEdit(): void {
    const savedAccountType = this.account()?.accountType ?? null;
    this.accountTypeSelection.set(
      savedAccountType && this.isAccountTypeEnabled(savedAccountType)
        ? savedAccountType
        : this.firstEnabledAccountType(),
    );
    const savedPromptPayType = this.account()?.promptPayType ?? null;
    this.promptPayTypeSelection.set(
      savedPromptPayType && this.isPromptPayTypeEnabled(savedPromptPayType)
        ? savedPromptPayType
        : this.firstEnabledPromptPayType(),
    );
    this.bankCode.set('');
    this.accountHolderName.set('');
    this.accountNumber.set('');
    this.promptPayId.set('');
    // Unlike the fields above, the QR image is never masked at rest (see class doc comment) — so
    // re-editing an existing QR account prefills the already-saved image instead of blanking it.
    this.promptPayQrImageUrl.set(
      this.promptPayTypeSelection() === 'qr_code' ? (this.account()?.promptPayQrImageUrl ?? null) : null,
    );
    this.fieldErrors.set(NO_FIELD_ERRORS);
    this.saveError.set(null);
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.saveError.set(null);
    this.fieldErrors.set(NO_FIELD_ERRORS);
  }

  private validate(): boolean {
    const errors: FieldErrors = { ...NO_FIELD_ERRORS };
    if (!this.accountHolderName().trim()) errors.accountHolderName = this.translation.t('shared.payoutAccount.accountHolderNameRequired');

    if (this.accountTypeSelection() === 'bank') {
      if (!this.bankCode()) errors.bankCode = this.translation.t('shared.payoutAccount.bankRequired');
      const digits = this.accountNumber().replace(/[\s-]/g, '');
      if (!/^\d{10,15}$/.test(digits)) {
        errors.accountNumber = this.translation.t('shared.payoutAccount.accountNumberInvalid');
      }
    } else if (this.promptPayTypeSelection() === 'qr_code') {
      if (!this.promptPayQrImageUrl()) {
        errors.qrImage = this.translation.t('shared.payoutAccount.qrImageRequired');
      }
    } else {
      const digits = this.promptPayId().replace(/\D/g, '');
      if (this.promptPayTypeSelection() === 'phone') {
        if (!/^0\d{9}$/.test(digits)) {
          errors.promptPayId = this.translation.t('shared.payoutAccount.phoneInvalid');
        }
      } else if (!/^\d{13}$/.test(digits)) {
        errors.promptPayId = this.translation.t('shared.payoutAccount.nationalIdInvalid');
      }
    }

    this.fieldErrors.set(errors);
    return (
      !errors.bankCode &&
      !errors.accountNumber &&
      !errors.accountHolderName &&
      !errors.promptPayId &&
      !errors.qrImage
    );
  }

  /** `POST /api/files/upload` via `SellerService.uploadFile` — the same endpoint every other upload in this app reuses. */
  async onQrFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.qrUploading.set(true);
    try {
      const data = await this.seller.uploadFile(file);
      const qrUrl = data.key
        ? new URL(downloadUrlForStorageKey(data.key)).pathname
        : data.publicUrl;
      this.promptPayQrImageUrl.set(qrUrl);
      this.fieldErrors.update((e) => ({ ...e, qrImage: null }));
    } catch {
      // SellerService already reported this via ApiFailureReporter.
    } finally {
      this.qrUploading.set(false);
    }
  }

  async submit(): Promise<void> {
    this.saveError.set(null);
    if (!this.validate()) return;

    const accountHolderName = this.accountHolderName().trim();
    const result =
      this.accountTypeSelection() === 'bank'
        ? await this.payoutAccount.save({
            accountType: 'bank',
            accountHolderName,
            bankCode: this.bankCode(),
            accountNumber: this.accountNumber().replace(/[\s-]/g, ''),
          })
        : this.promptPayTypeSelection() === 'qr_code'
          ? await this.payoutAccount.save({
              accountType: 'promptpay',
              accountHolderName,
              promptPayType: 'qr_code',
              promptPayQrImageUrl: this.promptPayQrImageUrl() ?? undefined,
            })
          : await this.payoutAccount.save({
              accountType: 'promptpay',
              accountHolderName,
              promptPayType: this.promptPayTypeSelection(),
              promptPayId: this.promptPayId().replace(/\D/g, ''),
            });

    if (result.ok) {
      this.message.success(this.translation.t('shared.payoutAccount.savedSuccess'));
      this.editing.set(false);
      return;
    }
    if (result.error) {
      // Validation the user can fix themselves — shown inline, never a duplicate toast.
      this.saveError.set(result.error);
      return;
    }
    this.message.error(this.translation.t('shared.payoutAccount.saveFailed'));
  }

  async onReveal(): Promise<void> {
    await this.payoutAccount.reveal();
    if (this.revealedValue() === null) {
      this.message.error(this.translation.t('shared.payoutAccount.revealFailed'));
    }
  }

  onHide(): void {
    this.payoutAccount.clearRevealed();
  }
}
