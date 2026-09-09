import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { THAI_BANKS } from '../../../core/models';
import { PayoutAccountService } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';

type FieldErrors = {
  bankCode: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
};

const NO_FIELD_ERRORS: FieldErrors = { bankCode: null, accountNumber: null, accountHolderName: null };

/**
 * seller-payout-account-self-service v1 (docs/contracts/seller-payout-account-self-service.md
 * §4) — replaces the old "ฟีเจอร์นี้อยู่ระหว่างพัฒนา…" placeholder on `/seller` (Studio Mode
 * settings, §0) with a real form backed by `PayoutAccountService`.
 *
 * States (AC-16/AC-17):
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
 *    prefill, by design — every edit re-types all three fields).
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
  readonly bankCode = signal('');
  readonly accountHolderName = signal('');
  readonly accountNumber = signal('');
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

  constructor() {
    void this.payoutAccount.load();
  }

  startEdit(): void {
    this.bankCode.set('');
    this.accountHolderName.set('');
    this.accountNumber.set('');
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
    if (!this.bankCode()) errors.bankCode = 'กรุณาเลือกธนาคาร';
    if (!this.accountHolderName().trim()) errors.accountHolderName = 'กรุณาระบุชื่อบัญชี';
    const digits = this.accountNumber().replace(/[\s-]/g, '');
    if (!/^\d{10,15}$/.test(digits)) {
      errors.accountNumber = 'เลขบัญชีไม่ถูกต้อง กรุณาระบุเป็นตัวเลข 10-15 หลัก';
    }
    this.fieldErrors.set(errors);
    return !errors.bankCode && !errors.accountNumber && !errors.accountHolderName;
  }

  async submit(): Promise<void> {
    this.saveError.set(null);
    if (!this.validate()) return;

    const result = await this.payoutAccount.save({
      bankCode: this.bankCode(),
      accountNumber: this.accountNumber().replace(/[\s-]/g, ''),
      accountHolderName: this.accountHolderName().trim(),
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
    if (this.payoutAccount.revealed() === null) {
      this.message.error('แสดงเลขบัญชีไม่สำเร็จ');
    }
  }

  onHide(): void {
    this.payoutAccount.clearRevealed();
  }
}
