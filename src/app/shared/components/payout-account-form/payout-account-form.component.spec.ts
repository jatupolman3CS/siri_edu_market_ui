import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { PayoutAccountFormComponent } from './payout-account-form.component';
import { PayoutAccountService } from '../../../core/services';
import { idleActionState, loadingActionState, errorActionState, type ActionState } from '../../../core/services/action-state';
import type { PayoutAccount } from '../../../core/models';

/**
 * seller-payout-account-self-service v1 (docs/contracts/seller-payout-account-self-service.md
 * §1 test list / §4) — AC-16/AC-17.
 *
 * Drives `PayoutAccountFormComponent` against a stubbed `PayoutAccountService` (a plain object
 * with the same signal/method shape, not the real `providedIn: 'root'` service) — same pattern as
 * `saved-cards.component.spec.ts` — so render/interaction logic is exercised independently of the
 * service's own `TODO(contract)` stub body (that gets its own coverage in
 * `payout-account.service.spec.ts`).
 */
function accountFixture(overrides: Partial<PayoutAccount> = {}): PayoutAccount {
  return {
    hasAccount: true,
    bankCode: 'KBANK',
    accountHolderName: 'สมชาย ใจดี',
    accountNumberMasked: '••••••••1234',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function fakePayoutAccount(
  initialAccount: PayoutAccount | null = null,
  initialState: ActionState = idleActionState(),
) {
  const account = signal<PayoutAccount | null>(initialAccount);
  const state = signal<ActionState>(initialState);
  const revealed = signal<string | null>(null);
  const sellerProfileRequired = signal(false);
  return {
    account: account.asReadonly(),
    state: state.asReadonly(),
    revealed: revealed.asReadonly(),
    sellerProfileRequired: sellerProfileRequired.asReadonly(),
    _account: account,
    _state: state,
    _revealed: revealed,
    _sellerProfileRequired: sellerProfileRequired,
    load: vi.fn(async () => {}),
    save: vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: false, error: 'ยังเชื่อมต่อไม่ได้' })),
    reveal: vi.fn(async () => {}),
    clearRevealed: vi.fn(() => revealed.set(null)),
  };
}

type Messages = { success: string[]; warning: string[]; error: string[] };

function render(fake: ReturnType<typeof fakePayoutAccount>, messages: Messages = { success: [], warning: [], error: [] }) {
  TestBed.configureTestingModule({
    imports: [PayoutAccountFormComponent],
    providers: [
      { provide: PayoutAccountService, useValue: fake },
      {
        provide: NzMessageService,
        useValue: {
          success: (m: string) => messages.success.push(m),
          warning: (m: string) => messages.warning.push(m),
          error: (m: string) => messages.error.push(m),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(PayoutAccountFormComponent);
  fixture.detectChanges();
  return fixture;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => TestBed.resetTestingModule());

describe('PayoutAccountFormComponent — loading / error / hidden states (AC-16)', () => {
  it('calls payoutAccount.load() once on construction', () => {
    const fake = fakePayoutAccount();
    render(fake);

    expect(fake.load).toHaveBeenCalledTimes(1);
  });

  it('shows "กำลังโหลด…" while account() is still null', () => {
    const fixture = render(fakePayoutAccount(null));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('กำลังโหลด…');
    expect(text).not.toContain('บันทึกบัญชีรับเงิน');
  });

  it('shows "โหลดข้อมูลบัญชีรับเงินไม่สำเร็จ" when state is error, even before account() ever loads', () => {
    const fixture = render(fakePayoutAccount(null, errorActionState('โหลดข้อมูลบัญชีรับเงินไม่สำเร็จ')));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('โหลดข้อมูลบัญชีรับเงินไม่สำเร็จ');
  });

  it('renders nothing at all when sellerProfileRequired() is true', () => {
    const fake = fakePayoutAccount(accountFixture());
    fake._sellerProfileRequired.set(true);
    const fixture = render(fake);
    const text = (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';

    expect(text).toBe('');
  });
});

describe('PayoutAccountFormComponent — hasAccount:false shows the empty form immediately (AC-16)', () => {
  it('renders the bank/name/number fields with no click needed', () => {
    const fixture = render(fakePayoutAccount(accountFixture({ hasAccount: false, bankCode: '', accountHolderName: '', accountNumberMasked: '' })));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('select[name="bankCode"]')).toBeTruthy();
    expect(el.querySelector('input[name="accountHolderName"]')).toBeTruthy();
    expect(el.querySelector('input[name="accountNumber"]')).toBeTruthy();
    // No "ยกเลิก" button yet — there is nothing saved to cancel back to.
    expect(el.textContent).not.toContain('ยกเลิก');
  });
});

describe('PayoutAccountFormComponent — hasAccount:true masked view + แก้ไข/ยกเลิก (AC-16)', () => {
  it('renders bank name (resolved from THAI_BANKS), account holder, masked number, formatted updatedAt', () => {
    const fixture = render(fakePayoutAccount(accountFixture()));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('ธนาคารกสิกรไทย');
    expect(text).toContain('สมชาย ใจดี');
    expect(text).toContain('••••••••1234');
    expect(text).toContain('อัปเดตล่าสุด');
    expect(text).toContain('แก้ไข');
    expect(text).toContain('แสดงเลขบัญชีเต็ม');
  });

  it('"แก้ไข" switches to a completely blank form (no prefill) and shows "ยกเลิก"', () => {
    const fixture = render(fakePayoutAccount(accountFixture()));

    fixture.componentInstance.startEdit();
    fixture.detectChanges();

    expect(fixture.componentInstance.bankCode()).toBe('');
    expect(fixture.componentInstance.accountHolderName()).toBe('');
    expect(fixture.componentInstance.accountNumber()).toBe('');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยกเลิก');
  });

  it('"ยกเลิก" returns to the masked view without calling save()', () => {
    const fake = fakePayoutAccount(accountFixture());
    const fixture = render(fake);
    fixture.componentInstance.startEdit();
    fixture.detectChanges();

    fixture.componentInstance.cancelEdit();
    fixture.detectChanges();

    expect(fixture.componentInstance.showForm()).toBe(false);
    expect(fake.save).not.toHaveBeenCalled();
  });
});

describe('PayoutAccountFormComponent — client-side validation before save() (AC-16 §4)', () => {
  it('blocks submit and shows all three field errors when every field is empty', async () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false }));
    const fixture = render(fake);

    await fixture.componentInstance.submit();

    expect(fake.save).not.toHaveBeenCalled();
    expect(fixture.componentInstance.fieldErrors().bankCode).toBeTruthy();
    expect(fixture.componentInstance.fieldErrors().accountHolderName).toBeTruthy();
    expect(fixture.componentInstance.fieldErrors().accountNumber).toBeTruthy();
  });

  it('rejects an account number shorter than 10 digits or containing letters', async () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false }));
    const fixture = render(fake);
    fixture.componentInstance.bankCode.set('KBANK');
    fixture.componentInstance.accountHolderName.set('สมชาย ใจดี');
    fixture.componentInstance.accountNumber.set('12ab');

    await fixture.componentInstance.submit();

    expect(fake.save).not.toHaveBeenCalled();
    expect(fixture.componentInstance.fieldErrors().accountNumber).toBeTruthy();
    expect(fixture.componentInstance.fieldErrors().bankCode).toBeNull();
    expect(fixture.componentInstance.fieldErrors().accountHolderName).toBeNull();
  });

  it('strips spaces/dashes from the account number and trims the holder name before calling save()', async () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false }));
    const fixture = render(fake);
    fixture.componentInstance.bankCode.set('KBANK');
    fixture.componentInstance.accountHolderName.set('  สมชาย ใจดี  ');
    fixture.componentInstance.accountNumber.set('123-456-7890');

    await fixture.componentInstance.submit();

    expect(fake.save).toHaveBeenCalledWith({
      bankCode: 'KBANK',
      accountNumber: '1234567890',
      accountHolderName: 'สมชาย ใจดี',
    });
  });
});

describe('PayoutAccountFormComponent — submit() outcomes (AC-16)', () => {
  it('on success: toasts "บันทึกบัญชีรับเงินแล้ว" and leaves editing mode', async () => {
    const fake = fakePayoutAccount(accountFixture());
    fake.save.mockResolvedValueOnce({ ok: true });
    const messages: Messages = { success: [], warning: [], error: [] };
    const fixture = render(fake, messages);
    fixture.componentInstance.startEdit();
    fixture.componentInstance.bankCode.set('KBANK');
    fixture.componentInstance.accountHolderName.set('สมชาย ใจดี');
    fixture.componentInstance.accountNumber.set('1234567890');

    await fixture.componentInstance.submit();

    expect(messages.success).toContain('บันทึกบัญชีรับเงินแล้ว');
    expect(fixture.componentInstance.editing()).toBe(false);
  });

  it('§4 stub (400-equivalent): shows result.error under the form, no toast', async () => {
    const fake = fakePayoutAccount(accountFixture());
    const messages: Messages = { success: [], warning: [], error: [] };
    const fixture = render(fake, messages);
    fixture.componentInstance.startEdit();
    fixture.componentInstance.bankCode.set('KBANK');
    fixture.componentInstance.accountHolderName.set('สมชาย ใจดี');
    fixture.componentInstance.accountNumber.set('1234567890');

    await fixture.componentInstance.submit();

    expect(fixture.componentInstance.saveError()).toBe('ยังเชื่อมต่อไม่ได้');
    expect(messages.error).toEqual([]);
  });

  it('on a failure with no error message: toasts "บันทึกบัญชีรับเงินไม่สำเร็จ"', async () => {
    const fake = fakePayoutAccount(accountFixture());
    fake.save.mockResolvedValueOnce({ ok: false });
    const messages: Messages = { success: [], warning: [], error: [] };
    const fixture = render(fake, messages);
    fixture.componentInstance.startEdit();
    fixture.componentInstance.bankCode.set('KBANK');
    fixture.componentInstance.accountHolderName.set('สมชาย ใจดี');
    fixture.componentInstance.accountNumber.set('1234567890');

    await fixture.componentInstance.submit();

    expect(messages.error).toContain('บันทึกบัญชีรับเงินไม่สำเร็จ');
    expect(fixture.componentInstance.saveError()).toBeNull();
  });

  it('disables the save button and shows "กำลังบันทึก…" while state is loading and account() is already set', () => {
    const fake = fakePayoutAccount(accountFixture());
    const fixture = render(fake);
    fixture.componentInstance.startEdit();
    fake._state.set(loadingActionState());
    fixture.detectChanges();

    expect(fixture.componentInstance.saving()).toBe(true);
    const button = (fixture.nativeElement as HTMLElement).querySelector('button.btn-pink') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('กำลังบันทึก…');
  });
});

describe('PayoutAccountFormComponent — reveal/hide (AC-17)', () => {
  it('"แสดงเลขบัญชีเต็ม" calls reveal(), shows the number and "ซ่อน" once revealed() is set', async () => {
    const fake = fakePayoutAccount(accountFixture());
    fake.reveal.mockImplementationOnce(async () => {
      fake._revealed.set('1112223334');
    });
    const fixture = render(fake);

    await fixture.componentInstance.onReveal();
    fixture.detectChanges();
    await settle();

    expect(fake.reveal).toHaveBeenCalledTimes(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('1112223334');
    expect(text).toContain('ซ่อน');
  });

  it('toasts "แสดงเลขบัญชีไม่สำเร็จ" when reveal() leaves revealed() as null', async () => {
    const fake = fakePayoutAccount(accountFixture());
    const messages: Messages = { success: [], warning: [], error: [] };
    const fixture = render(fake, messages);

    await fixture.componentInstance.onReveal();

    expect(messages.error).toContain('แสดงเลขบัญชีไม่สำเร็จ');
  });

  it('"ซ่อน" calls clearRevealed()', () => {
    const fake = fakePayoutAccount(accountFixture());
    fake._revealed.set('1112223334');
    const fixture = render(fake);

    fixture.componentInstance.onHide();

    expect(fake.clearRevealed).toHaveBeenCalledTimes(1);
  });
});
