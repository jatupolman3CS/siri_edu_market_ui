import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { PayoutAccountFormComponent } from './payout-account-form.component';
import { PayoutAccountService, SellerService, type RevealedPayoutAccount } from '../../../core/services';
import { idleActionState, loadingActionState, errorActionState, type ActionState } from '../../../core/services/action-state';
import type { PayoutAccount } from '../../../core/models';
import type { UploadResponse } from '../../../core/api/types.gen';

/**
 * seller-payout-account-self-service v1 (docs/contracts/seller-payout-account-self-service.md
 * §1 test list / §4) — AC-16/AC-17.
 * payout-request-slip-verification v1 (docs/contracts/payout-request-slip-verification.md §3.13,
 * §4.6) — AC-37: PromptPay (phone / national ID) as a second destination type.
 *
 * Drives `PayoutAccountFormComponent` against a stubbed `PayoutAccountService` (a plain object
 * with the same signal/method shape, not the real `providedIn: 'root'` service) — same pattern as
 * `saved-cards.component.spec.ts` — so render/interaction logic is exercised independently of the
 * service's own SDK-wiring (that gets its own coverage in `payout-account.service.spec.ts`).
 */
function accountFixture(overrides: Partial<PayoutAccount> = {}): PayoutAccount {
  return {
    hasAccount: true,
    accountType: 'bank',
    bankCode: 'KBANK',
    accountHolderName: 'สมชาย ใจดี',
    accountNumberMasked: '••••••••1234',
    promptPayType: null,
    promptPayMasked: '',
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
  const revealed = signal<RevealedPayoutAccount | null>(null);
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
    save: vi.fn(
      async (_input: unknown): Promise<{ ok: boolean; error?: string }> => ({
        ok: false,
        error: 'ยังเชื่อมต่อไม่ได้',
      }),
    ),
    reveal: vi.fn(async () => {}),
    clearRevealed: vi.fn(() => revealed.set(null)),
  };
}

type Messages = { success: string[]; warning: string[]; error: string[] };

/** payment-method-master-config v1 — `PayoutAccountFormComponent` reuses `SellerService.uploadFile` for the QR image. */
function fakeSeller(uploadFile = vi.fn(async (_file: File): Promise<UploadResponse> => uploadResponseFixture())) {
  return { uploadFile };
}

function uploadResponseFixture(overrides: Partial<UploadResponse> = {}): UploadResponse {
  return {
    key: 'uploads/qr/abc.png',
    publicUrl: 'https://cdn.example.com/qr/abc.png',
    eTag: 'etag',
    optimizedKey: null,
    optimizedUrl: null,
    ...overrides,
  };
}

/** jsdom won't let a real `<input type="file">` be assigned `.files` directly — fake the `Event` instead. */
function fileChangeEvent(file: File | null): Event {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: file ? [file] : [], writable: false });
  return { target: input } as unknown as Event;
}

function render(
  fake: ReturnType<typeof fakePayoutAccount>,
  messages: Messages = { success: [], warning: [], error: [] },
  seller: ReturnType<typeof fakeSeller> = fakeSeller(),
) {
  TestBed.configureTestingModule({
    imports: [PayoutAccountFormComponent],
    providers: [
      { provide: PayoutAccountService, useValue: fake },
      { provide: SellerService, useValue: seller },
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
  it('renders the bank/name/number fields with no click needed (bank is the default radio)', () => {
    const fixture = render(
      fakePayoutAccount(
        accountFixture({ hasAccount: false, accountType: null, bankCode: '', accountHolderName: '', accountNumberMasked: '' }),
      ),
    );
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

  it('"แก้ไข" switches to a completely blank form (no prefill), pre-selects the saved accountType, and shows "ยกเลิก"', () => {
    const fixture = render(fakePayoutAccount(accountFixture()));

    fixture.componentInstance.startEdit();
    fixture.detectChanges();

    expect(fixture.componentInstance.bankCode()).toBe('');
    expect(fixture.componentInstance.accountHolderName()).toBe('');
    expect(fixture.componentInstance.accountNumber()).toBe('');
    expect(fixture.componentInstance.accountTypeSelection()).toBe('bank');
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

describe('PayoutAccountFormComponent — bank validation before save() (AC-16 §4)', () => {
  it('blocks submit and shows all field errors when every field is empty', async () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null }));
    const fixture = render(fake);

    await fixture.componentInstance.submit();

    expect(fake.save).not.toHaveBeenCalled();
    expect(fixture.componentInstance.fieldErrors().bankCode).toBeTruthy();
    expect(fixture.componentInstance.fieldErrors().accountHolderName).toBeTruthy();
    expect(fixture.componentInstance.fieldErrors().accountNumber).toBeTruthy();
  });

  it('rejects an account number shorter than 10 digits or containing letters', async () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null }));
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
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null }));
    const fixture = render(fake);
    fixture.componentInstance.bankCode.set('KBANK');
    fixture.componentInstance.accountHolderName.set('  สมชาย ใจดี  ');
    fixture.componentInstance.accountNumber.set('123-456-7890');

    await fixture.componentInstance.submit();

    expect(fake.save).toHaveBeenCalledWith({
      accountType: 'bank',
      accountHolderName: 'สมชาย ใจดี',
      bankCode: 'KBANK',
      accountNumber: '1234567890',
    });
  });
});

describe('PayoutAccountFormComponent — PromptPay mode (payout-request-slip-verification v1 §3.13/§4.6, AC-37)', () => {
  it('selectAccountType("promptpay") switches the radio and clears bank-only field values', () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null }));
    const fixture = render(fake);
    fixture.componentInstance.bankCode.set('KBANK');
    fixture.componentInstance.accountNumber.set('1234567890');

    fixture.componentInstance.selectAccountType('promptpay');
    fixture.detectChanges();

    expect(fixture.componentInstance.accountTypeSelection()).toBe('promptpay');
    expect(fixture.componentInstance.bankCode()).toBe('');
    expect(fixture.componentInstance.accountNumber()).toBe('');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('select[name="bankCode"]')).toBeFalsy();
    expect(el.querySelector('input[name="promptPayId"]')).toBeTruthy();
  });

  it('defaults the PromptPay sub-type to "เบอร์โทรศัพท์" and rejects a phone number that is not 10 digits starting with 0', async () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null }));
    const fixture = render(fake);
    fixture.componentInstance.selectAccountType('promptpay');
    fixture.componentInstance.accountHolderName.set('สมชาย ใจดี');
    fixture.componentInstance.promptPayId.set('12345');

    await fixture.componentInstance.submit();

    expect(fake.save).not.toHaveBeenCalled();
    expect(fixture.componentInstance.fieldErrors().promptPayId).toContain('10 หลัก');
  });

  it('accepts a valid 10-digit phone number and sends promptPayType/promptPayId (no checksum done client-side)', async () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null }));
    const fixture = render(fake);
    fixture.componentInstance.selectAccountType('promptpay');
    fixture.componentInstance.accountHolderName.set('สมชาย ใจดี');
    fixture.componentInstance.promptPayId.set('081-234-5678');

    await fixture.componentInstance.submit();

    expect(fake.save).toHaveBeenCalledWith({
      accountType: 'promptpay',
      accountHolderName: 'สมชาย ใจดี',
      promptPayType: 'phone',
      promptPayId: '0812345678',
    });
  });

  it('switching to "เลขบัตรประชาชน" requires 13 digits and shows the encryption hint text', async () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null }));
    const fixture = render(fake);
    fixture.componentInstance.selectAccountType('promptpay');
    fixture.componentInstance.selectPromptPayType('national_id');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ข้อมูลนี้ถูกเข้ารหัสก่อนจัดเก็บ');

    fixture.componentInstance.accountHolderName.set('สมชาย ใจดี');
    fixture.componentInstance.promptPayId.set('123456789');
    await fixture.componentInstance.submit();

    expect(fake.save).not.toHaveBeenCalled();
    expect(fixture.componentInstance.fieldErrors().promptPayId).toContain('13 หลัก');
  });

  it('a leftover promptPayId is not sent when the user switches back to bank before submitting', async () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null }));
    const fixture = render(fake);
    fixture.componentInstance.selectAccountType('promptpay');
    fixture.componentInstance.promptPayId.set('0812345678');
    fixture.componentInstance.selectAccountType('bank');
    fixture.componentInstance.accountHolderName.set('สมชาย ใจดี');
    fixture.componentInstance.bankCode.set('KBANK');
    fixture.componentInstance.accountNumber.set('1234567890');

    await fixture.componentInstance.submit();

    const payload = fake.save.mock.calls[0][0] as Record<string, unknown>;
    expect(payload['accountType']).toBe('bank');
    expect(payload['promptPayId']).toBeUndefined();
    expect(payload['promptPayType']).toBeUndefined();
  });

  it('masked view shows "พร้อมเพย์" + the sub-type label + promptPayMasked for a saved PromptPay account', () => {
    const fixture = render(
      fakePayoutAccount(
        accountFixture({
          accountType: 'promptpay',
          promptPayType: 'phone',
          promptPayMasked: '••••••••5678',
          bankCode: '',
          accountNumberMasked: '',
        }),
      ),
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('พร้อมเพย์');
    expect(text).toContain('เบอร์โทรศัพท์');
    expect(text).toContain('••••••••5678');
  });
});

describe('PayoutAccountFormComponent — payment-method-master-config v1 (data-driven channel visibility)', () => {
  it('hides "โอนเข้าบัญชีธนาคาร" and both non-QR PromptPay sub-type buttons when the admin has disabled everything but QR (today\'s real default)', () => {
    const fixture = render(
      fakePayoutAccount(
        accountFixture({
          hasAccount: false,
          accountType: null,
          payoutMethodBankEnabled: false,
          payoutMethodPromptPayPhoneEnabled: false,
          payoutMethodPromptPayNationalIdEnabled: false,
          payoutMethodPromptPayQrEnabled: true,
        }),
      ),
    );
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';

    expect(text).not.toContain('โอนเข้าบัญชีธนาคาร');
    expect(text).toContain('พร้อมเพย์');
    expect(text).not.toContain('เบอร์โทรศัพท์');
    expect(text).not.toContain('เลขบัตรประชาชน');
    // The component defaults straight to the only enabled channel/sub-type — no click needed.
    expect(fixture.componentInstance.accountTypeSelection()).toBe('promptpay');
    expect(fixture.componentInstance.promptPayTypeSelection()).toBe('qr_code');
    expect(el.querySelector('input[type="file"]')).toBeTruthy();
  });

  it('shows every channel/sub-type when the admin has left all 4 enabled', () => {
    const fixture = render(
      fakePayoutAccount(
        accountFixture({
          hasAccount: false,
          accountType: null,
          payoutMethodBankEnabled: true,
          payoutMethodPromptPayPhoneEnabled: true,
          payoutMethodPromptPayNationalIdEnabled: true,
          payoutMethodPromptPayQrEnabled: true,
        }),
      ),
    );
    fixture.componentInstance.selectAccountType('promptpay');
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('โอนเข้าบัญชีธนาคาร');
    expect(text).toContain('เบอร์โทรศัพท์');
    expect(text).toContain('เลขบัตรประชาชน');
    expect(text).toContain('QR Code');
  });

  it('startEdit() falls back to the first enabled channel when the saved accountType/promptPayType has since been disabled', () => {
    const fixture = render(
      fakePayoutAccount(
        accountFixture({
          accountType: 'bank',
          payoutMethodBankEnabled: false,
          payoutMethodPromptPayPhoneEnabled: false,
          payoutMethodPromptPayNationalIdEnabled: false,
          payoutMethodPromptPayQrEnabled: true,
        }),
      ),
    );

    fixture.componentInstance.startEdit();
    fixture.detectChanges();

    expect(fixture.componentInstance.accountTypeSelection()).toBe('promptpay');
    expect(fixture.componentInstance.promptPayTypeSelection()).toBe('qr_code');
  });
});

describe('PayoutAccountFormComponent — PromptPay QR Code upload (payment-method-master-config v1)', () => {
  it('shows the upload hint text exactly as specified, and blocks submit with the backend\'s own message until an image is uploaded', async () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null }));
    const fixture = render(fake);
    fixture.componentInstance.selectAccountType('promptpay');
    fixture.componentInstance.selectPromptPayType('qr_code');
    fixture.componentInstance.accountHolderName.set('สมชาย ใจดี');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'แนะนำให้อัปโหลดเป็นรูปภาพ QR Code เพื่อความสะดวกและแม่นยำ',
    );

    await fixture.componentInstance.submit();

    expect(fake.save).not.toHaveBeenCalled();
    expect(fixture.componentInstance.fieldErrors().qrImage).toBe('กรุณาอัปโหลดรูปภาพ QR Code พร้อมเพย์');
  });

  it('uploading a file calls SellerService.uploadFile, stores publicUrl, shows the preview, and clears the field error', async () => {
    const uploadFile = vi.fn(async () => uploadResponseFixture({ publicUrl: 'https://cdn.example.com/qr/new.png' }));
    const fixture = render(
      fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null })),
      undefined,
      fakeSeller(uploadFile),
    );
    fixture.componentInstance.selectAccountType('promptpay');
    fixture.componentInstance.selectPromptPayType('qr_code');
    fixture.componentInstance.fieldErrors.update((e) => ({ ...e, qrImage: 'กรุณาอัปโหลดรูปภาพ QR Code พร้อมเพย์' }));

    const file = new File(['x'], 'qr.png', { type: 'image/png' });
    await fixture.componentInstance.onQrFileChange(fileChangeEvent(file));
    fixture.detectChanges();

    expect(uploadFile).toHaveBeenCalledWith(file);
    expect(fixture.componentInstance.promptPayQrImageUrl()).toBe('/api/files/download/uploads/qr/abc.png');
    expect(fixture.componentInstance.fieldErrors().qrImage).toBeNull();
    const img = (fixture.nativeElement as HTMLElement).querySelector('img[alt*="QR Code"]') as HTMLImageElement | null;
    expect(img?.src).toContain('/api/files/download/uploads/qr/abc.png');
  });

  it('does nothing when the file picker is dismissed with no file chosen', async () => {
    const uploadFile = vi.fn(async () => uploadResponseFixture());
    const fixture = render(
      fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null })),
      undefined,
      fakeSeller(uploadFile),
    );
    fixture.componentInstance.selectAccountType('promptpay');
    fixture.componentInstance.selectPromptPayType('qr_code');

    await fixture.componentInstance.onQrFileChange(fileChangeEvent(null));

    expect(uploadFile).not.toHaveBeenCalled();
    expect(fixture.componentInstance.promptPayQrImageUrl()).toBeNull();
  });

  it('submit() sends promptPayType "qr_code" + promptPayQrImageUrl, never promptPayId', async () => {
    const fake = fakePayoutAccount(accountFixture({ hasAccount: false, accountType: null }));
    fake.save.mockResolvedValueOnce({ ok: true });
    const uploadFile = vi.fn(async () => uploadResponseFixture());
    const fixture = render(fake, undefined, fakeSeller(uploadFile));
    fixture.componentInstance.selectAccountType('promptpay');
    fixture.componentInstance.selectPromptPayType('qr_code');
    fixture.componentInstance.accountHolderName.set('สมชาย ใจดี');
    await fixture.componentInstance.onQrFileChange(fileChangeEvent(new File(['x'], 'qr.png', { type: 'image/png' })));

    await fixture.componentInstance.submit();

    expect(fake.save).toHaveBeenCalledWith({
      accountType: 'promptpay',
      accountHolderName: 'สมชาย ใจดี',
      promptPayType: 'qr_code',
      promptPayQrImageUrl: '/api/files/download/uploads/qr/abc.png',
    });
  });

  it('masked view shows the saved QR image instead of masked text, and hides the reveal/hide buttons', () => {
    const fixture = render(
      fakePayoutAccount(
        accountFixture({
          accountType: 'promptpay',
          promptPayType: 'qr_code',
          promptPayMasked: '',
          bankCode: '',
          accountNumberMasked: '',
          promptPayQrImageUrl: 'https://cdn.example.com/qr/saved.png',
        }),
      ),
    );
    const el = fixture.nativeElement as HTMLElement;

    const img = el.querySelector('img[alt="QR Code พร้อมเพย์"]') as HTMLImageElement | null;
    expect(img?.src).toBe('https://cdn.example.com/qr/saved.png');
    expect(el.textContent).not.toContain('แสดงเลขบัญชีเต็ม');
    expect(el.textContent).toContain('แก้ไข');
  });

  it('startEdit() prefills the staged upload with the already-saved QR image (unlike the masked bank/digit fields, no re-upload forced)', () => {
    const fixture = render(
      fakePayoutAccount(
        accountFixture({
          accountType: 'promptpay',
          promptPayType: 'qr_code',
          promptPayQrImageUrl: 'https://cdn.example.com/qr/saved.png',
        }),
      ),
    );

    fixture.componentInstance.startEdit();
    fixture.detectChanges();

    expect(fixture.componentInstance.promptPayQrImageUrl()).toBe('https://cdn.example.com/qr/saved.png');
    expect(fixture.componentInstance.promptPayTypeSelection()).toBe('qr_code');
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

  it('shows result.error under the form on a validation failure from the backend, no toast', async () => {
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
      fake._revealed.set({ accountNumber: '1112223334', promptPayId: null });
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

  it('reveals promptPayId (not accountNumber) for a PromptPay account', async () => {
    const fake = fakePayoutAccount(accountFixture({ accountType: 'promptpay', promptPayType: 'phone', promptPayMasked: '••••••••5678' }));
    fake.reveal.mockImplementationOnce(async () => {
      fake._revealed.set({ accountNumber: null, promptPayId: '0812345678' });
    });
    const fixture = render(fake);

    await fixture.componentInstance.onReveal();
    fixture.detectChanges();
    await settle();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('0812345678');
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
    fake._revealed.set({ accountNumber: '1112223334', promptPayId: null });
    const fixture = render(fake);

    fixture.componentInstance.onHide();

    expect(fake.clearRevealed).toHaveBeenCalledTimes(1);
  });
});
