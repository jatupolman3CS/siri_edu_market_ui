import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { THAI_BANKS, type PayoutAccountType, type PromptPayIdType } from '../../../core/models';
import { PayoutAccountService } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';

type FieldErrors = {
  bankCode: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
  promptPayId: string | null;
};

const NO_FIELD_ERRORS: FieldErrors = {
  bankCode: null,
  accountNumber: null,
  accountHolderName: null,
  promptPayId: null,
};

/**
 * seller-payout-account-self-service v1 (docs/contracts/seller-payout-account-self-service.md
 * §4) — replaces the old "ฟีเจอร์นี้อยู่ระหว่างพัฒนา…" placeholder on `/seller` (Studio Mode
 * settings, §0) with a real form backed by `PayoutAccountService`.
 *
 * payout-request-slip-verification v1 §3.13/§4.6 (round 2): adds PromptPay (phone / national ID)
 * as a second destination type alongside the bank account form. `accountTypeSelection` is the
 * *form's* current choice of radio — independent from `account()!.accountType` (the last saved
 * value) — so switching radios while editing never mixes the two field groups together, and
 * `submit()` only ever builds a payload for the group actually selected (§4.6 "ค่าที่กรอกค้างของ
 * อีกโหมดต้องไม่ถูกส่งไปด้วย").
 *
 * States (AC-16/AC-17/AC-37):
 *  - `sellerProfileRequired()` (Admin viewing `/seller` without their own store) → renders
 *    nothing at all, silently, same convention as other seller-scoped sections.
 *  - `account() === null` → "กำลังโหลด…" (covers the real initial-fetch gap *and* round 1's
 *    permanently-unwired `PayoutAccountService.load()` stub — both look identical to a user:
 *    honestly "not ready yet", never fake data).
 *  - `account()!.hasAccount === false` → the (empty) form renders immediately, no edit toggle
 *    needed — there is nothing to mask yet.
 *  - `account()!.hasAccount === true` and not `editing()` → masked read-only view + "แก้ไข" /
 *    "แสดงเลขบัญชีเต็ม" buttons.
 *  - `editing()` → the same form, always blank (§4: the backend never returns the full number to
 *    prefill, by design — every edit re-types all fields), pre-selects the radio that matches the
 *    saved `accountType` so re-saving the same destination type is a single click away.
 *
 * Validation (§4.6): the phone/national-ID checksum is the backend's job (§3.13.1) — this
 * component only checks length/digits-only client-side and lets a `400` surface the server's own
 * Thai message (e.g. "เลขบัตรประชาชนไม่ถูกต้อง") the same way `saveError()` already does for bank.
 */
@Component({
  selector: 'app-payout-account-form',
  standalone: true,
  imports: [DatePipe, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payout-account-form.component.html',
  styleUrl: './payout-account-form.component.scss',
})
export class PayoutAccountFormComponent {
  private readonly payoutAccount = inject(PayoutAccountService);
  private readonly message = inject(NzMessageService);

  readonly banks = THAI_BANKS;

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
  readonly fieldErrors = signal<FieldErrors>(NO_FIELD_ERRORS);
  readonly saveError = signal<string | null>(null);

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
    return this.banks.find((b) => b.code === code)?.name ?? code;
  });

  readonly promptPayTypeLabel = computed(() =>
    this.account()?.promptPayType === 'national_id' ? 'เลขบัตรประชาชน' : 'เบอร์โทรศัพท์',
  );

  /** One of `accountNumber`/`promptPayId` per §3.13.2 — never both. */
  readonly revealedValue = computed(() => {
    const r = this.revealed();
    if (!r) return null;
    return r.accountNumber ?? r.promptPayId ?? null;
  });

  constructor() {
    void this.payoutAccount.load();
  }

  selectAccountType(type: PayoutAccountType): void {
    if (this.accountTypeSelection() === type) return;
    this.accountTypeSelection.set(type);
    this.bankCode.set('');
    this.accountNumber.set('');
    this.promptPayId.set('');
    this.fieldErrors.set(NO_FIELD_ERRORS);
  }

  selectPromptPayType(type: PromptPayIdType): void {
    if (this.promptPayTypeSelection() === type) return;
    this.promptPayTypeSelection.set(type);
    this.promptPayId.set('');
    this.fieldErrors.update((e) => ({ ...e, promptPayId: null }));
  }

  startEdit(): void {
    this.accountTypeSelection.set(this.account()?.accountType ?? 'bank');
    this.promptPayTypeSelection.set(this.account()?.promptPayType ?? 'phone');
    this.bankCode.set('');
    this.accountHolderName.set('');
    this.accountNumber.set('');
    this.promptPayId.set('');
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
    if (!this.accountHolderName().trim()) errors.accountHolderName = 'กรุณาระบุชื่อบัญชี';

    if (this.accountTypeSelection() === 'bank') {
      if (!this.bankCode()) errors.bankCode = 'กรุณาเลือกธนาคาร';
      const digits = this.accountNumber().replace(/[\s-]/g, '');
      if (!/^\d{10,15}$/.test(digits)) {
        errors.accountNumber = 'เลขบัญชีไม่ถูกต้อง กรุณาระบุเป็นตัวเลข 10-15 หลัก';
      }
    } else {
      const digits = this.promptPayId().replace(/\D/g, '');
      if (this.promptPayTypeSelection() === 'phone') {
        if (!/^0\d{9}$/.test(digits)) {
          errors.promptPayId = 'เบอร์โทรไม่ถูกต้อง กรุณาระบุ 10 หลัก';
        }
      } else if (!/^\d{13}$/.test(digits)) {
        errors.promptPayId = 'เลขบัตรประชาชนไม่ถูกต้อง กรุณาระบุ 13 หลัก';
      }
    }

    this.fieldErrors.set(errors);
    return !errors.bankCode && !errors.accountNumber && !errors.accountHolderName && !errors.promptPayId;
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
        : await this.payoutAccount.save({
            accountType: 'promptpay',
            accountHolderName,
            promptPayType: this.promptPayTypeSelection(),
            promptPayId: this.promptPayId().replace(/\D/g, ''),
          });

    if (result.ok) {
      this.message.success('บันทึกบัญชีรับเงินแล้ว');
      this.editing.set(false);
      return;
    }
    if (result.error) {
      // Validation the user can fix themselves — shown inline, never a duplicate toast.
      this.saveError.set(result.error);
      return;
    }
    this.message.error('บันทึกบัญชีรับเงินไม่สำเร็จ');
  }

  async onReveal(): Promise<void> {
    await this.payoutAccount.reveal();
    if (this.revealedValue() === null) {
      this.message.error('แสดงเลขบัญชีไม่สำเร็จ');
    }
  }

  onHide(): void {
    this.payoutAccount.clearRevealed();
  }
}
