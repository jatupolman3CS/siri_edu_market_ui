import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminPayoutsPage } from './payouts.page';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { AdminPayoutResponse } from '../../../core/api';
import type { BatchPayoutSlipsResponse, PayoutSlip } from '../../../core/models';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';

/**
 * payout-request-slip-verification v1 (docs/contracts/payout-request-slip-verification.md
 * §3.7/§3.9/§3.12/§4.5) — AC-38/AC-39.
 *
 * Drives `AdminPayoutsPage` against stubbed `AdminService`/`AuthService` (plain objects with the
 * same signal/method shape, not the real `providedIn: 'root'` services) — same pattern as
 * `payout-account-form.component.spec.ts` — so render/interaction logic is exercised
 * independently of the service's own SDK wiring (covered in `admin.service.spec.ts`).
 */
function payoutFixture(overrides: Partial<AdminPayoutResponse> = {}): AdminPayoutResponse {
  return {
    id: 'payout-1',
    sellerId: 'seller-1',
    sellerName: 'สมชาย ใจดี',
    sellerEmail: 'somchai@example.com',
    sellerAvailableBalance: 3200,
    payoutAccountMasked: 'KBANK ••••1234',
    payoutAccountHolderName: 'สมชาย ใจดี',
    latestSlipId: null,
    latestSlipStatus: null,
    slipCount: 0,
    grossAmount: 500,
    fee: 0,
    netAmount: 500,
    status: 'pending',
    bankAccount: 'KBANK ••••1234',
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-09-01T00:00:00.000Z',
    paidAt: null,
    destinationType: 'bank',
    cancelledAt: null,
    requestedAt: '2026-09-10T00:00:00.000Z',
    slipStatus: null,
    ...overrides,
  };
}

function slipFixture(overrides: Partial<PayoutSlip> = {}): PayoutSlip {
  return {
    id: 'slip-1',
    payoutId: 'payout-1',
    provider: 'mock',
    verificationStatus: 'mismatched',
    providerReference: 'MOCK-REF-1',
    parsedAmount: 400,
    parsedTransferredAt: '2026-09-10T00:00:00.000Z',
    parsedReceiverNameMasked: 'สมชาย ใจดี',
    parsedReceiverAccountLast4: '1234',
    parsedSenderBankCode: 'KBANK',
    mismatchReasons: ['amount_mismatch'],
    providerErrorCode: null,
    providerErrorMessage: null,
    fileUrl: '/api/admin/payouts/payout-1/slips/slip-1/file',
    uploadedAt: '2026-09-10T00:05:00.000Z',
    uploadedByName: 'Admin One',
    ...overrides,
  };
}

type Messages = { success: string[]; warning: string[]; error: string[] };

function batchResultFixture(overrides: Partial<BatchPayoutSlipsResponse> = {}): BatchPayoutSlipsResponse {
  return {
    totalFiles: 2,
    matchedCount: 1,
    completedCount: 1,
    failedCount: 0,
    unmatchedCount: 1,
    items: [
      {
        fileName: 'slip-1.png',
        fileSizeBytes: 1000,
        slipId: 'slip-9',
        slipUrl: '/api/admin/payouts/payout-1/slips/slip-9/file',
        payoutId: 'payout-1',
        sellerName: 'สมชาย ใจดี',
        sellerEmail: 'somchai@example.com',
        requestedAmount: 500,
        parsedAmount: 500,
        parsedReceiverName: 'สมชาย ใจดี',
        parsedReceiverAccountLast4: '1234',
        providerReference: 'MOCK-REF-9',
        verificationStatus: 'matched',
        mismatchReasons: [],
        payoutStatus: 'paid',
        message: 'จับคู่สำเร็จ โอนเงินเรียบร้อย',
      },
      {
        fileName: 'slip-2.png',
        fileSizeBytes: 2000,
        slipId: null,
        slipUrl: null,
        payoutId: null,
        sellerName: null,
        sellerEmail: null,
        requestedAmount: null,
        parsedAmount: 300,
        parsedReceiverName: null,
        parsedReceiverAccountLast4: null,
        providerReference: null,
        verificationStatus: 'unmatched',
        mismatchReasons: ['no_matching_payout'],
        payoutStatus: null,
        message: 'ไม่พบคำขอถอนเงินที่ตรงกับยอดเงินในสลิป',
      },
    ],
    ...overrides,
  };
}

function render(opts: {
  items?: AdminPayoutResponse[];
  nextPayoutDate?: string | null;
  slips?: PayoutSlip[];
  uploadPayoutSlip?: ReturnType<typeof vi.fn>;
  completePayoutManually?: ReturnType<typeof vi.fn>;
  reverifyPayoutSlip?: ReturnType<typeof vi.fn>;
  setPayoutStatus?: ReturnType<typeof vi.fn>;
  uploadBatchPayoutSlips?: ReturnType<typeof vi.fn>;
} = {}) {
  const items = opts.items ?? [payoutFixture()];
  const messages: Messages = { success: [], warning: [], error: [] };
  const fakeAdmin = {
    listPayoutsPaged: vi.fn(async () => ({
      items,
      totalCount: items.length,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })),
    loadSettings: vi.fn(async () => ({
      feeRatePercent: 10,
      vatPercent: 7,
      payoutMinTHB: 100,
      payoutSchedule: 'monthly-15',
      payoutMaxTHB: 0,
      nextPayoutDate: opts.nextPayoutDate ?? null,
      watermarkPolicy: 'required_when_supported' as const,
      watermarkDefaultEnabled: true,
      watermarkForensicEnabled: true,
      watermarkCopyRetentionDays: 90,
      watermarkDefaultSubtitle: null,
    })),
    setPayoutStatus: opts.setPayoutStatus ?? vi.fn(async () => {}),
    listPayoutSlips: vi.fn(async () => opts.slips ?? []),
    uploadPayoutSlip: opts.uploadPayoutSlip ?? vi.fn(async () => slipFixture()),
    reverifyPayoutSlip: opts.reverifyPayoutSlip ?? vi.fn(async () => slipFixture({ verificationStatus: 'matched' })),
    completePayoutManually: opts.completePayoutManually ?? vi.fn(async () => payoutFixture({ status: 'paid' })),
    uploadBatchPayoutSlips: opts.uploadBatchPayoutSlips ?? vi.fn(async () => batchResultFixture()),
  };
  const fakeAuth = { accessToken: () => 'test-token' };
  const fakeApiFail = { report: vi.fn() };
  const fakeMessage = {
    success: (m: string) => messages.success.push(m),
    warning: (m: string) => messages.warning.push(m),
    error: (m: string) => messages.error.push(m),
  };

  TestBed.configureTestingModule({
    imports: [AdminPayoutsPage],
    providers: [
      provideRouter([]),
      { provide: AdminService, useValue: fakeAdmin },
      { provide: AuthService, useValue: fakeAuth },
      { provide: ApiFailureReporter, useValue: fakeApiFail },
      { provide: NzMessageService, useValue: fakeMessage },
    ],
  });

  const fixture = TestBed.createComponent(AdminPayoutsPage);
  fixture.detectChanges();
  return { fixture, fakeAdmin, messages };
}

async function settle(fixture: ReturnType<typeof render>['fixture']): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

afterEach(() => TestBed.resetTestingModule());

describe('AdminPayoutsPage — filter tabs (AC-38: "ยกเลิกแล้ว")', () => {
  it('includes a "ยกเลิกแล้ว" tab alongside the existing 5', () => {
    const { fixture } = render();

    expect(fixture.componentInstance.filters.map((f) => f.value)).toEqual([
      'pending',
      'processing',
      'paid',
      'failed',
      'cancelled',
      'all',
    ]);
  });

  it('setFilter("cancelled") resets to page 1 and reloads with that status', async () => {
    const { fixture, fakeAdmin } = render();

    fixture.componentInstance.setFilter('cancelled');
    await settle(fixture);

    expect(fakeAdmin.listPayoutsPaged).toHaveBeenLastCalledWith('cancelled', 1, 10);
  });
});

describe('AdminPayoutsPage — รอบโอนถัดไป banner (AC-39)', () => {
  it('shows the formatted date when settings has one', async () => {
    const { fixture } = render({ nextPayoutDate: '2026-09-30' });
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('รอบโอนถัดไป');
    expect(text).toContain('2026');
  });

  it('shows "ยังไม่ได้ตั้งรอบโอน" with a settings link when null', async () => {
    const { fixture } = render({ nextPayoutDate: null });
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่ได้ตั้งรอบโอน');
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[href="/admin/settings"]');
    expect(link).toBeTruthy();
  });
});

describe('AdminPayoutsPage — คอลัมน์ปลายทาง / ยอดคงเหลือผู้ขาย / สถานะสลิป (AC-39)', () => {
  it('shows the destination badge, masked account, holder name, seller balance, and slip status', async () => {
    const { fixture } = render({
      items: [payoutFixture({ destinationType: 'promptpay', payoutAccountMasked: 'พร้อมเพย์ ••••5678', latestSlipStatus: 'mismatched' })],
    });
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('พร้อมเพย์');
    expect(text).toContain('••••5678');
    expect(text).toContain('3,200');
    expect(fixture.componentInstance.slipStatusLabel('mismatched')).toBe('ไม่ตรงกัน');
  });

  it('shows the orange warning banner when payoutAccountMasked differs from the snapshot bankAccount', async () => {
    const { fixture } = render({
      items: [payoutFixture({ payoutAccountMasked: 'KBANK ••••9999', bankAccount: 'KBANK ••••1234' })],
    });
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('บัญชีปลายทางของผู้ขายถูกแก้ไขหลังจากยื่นคำขอ');
  });

  it('does not show the warning banner when the destination is unchanged', async () => {
    const { fixture } = render({
      items: [payoutFixture({ payoutAccountMasked: 'KBANK ••••1234', bankAccount: 'KBANK ••••1234' })],
    });
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('บัญชีปลายทางของผู้ขายถูกแก้ไขหลังจากยื่นคำขอ');
  });
});

describe('AdminPayoutsPage — PromptPay QR', () => {
  it('opens the saved QR with seller and amount confirmation, then closes the dialog', async () => {
    const url = '/api/files/download/seller/qr.png';
    const payout = payoutFixture({ destinationType: 'promptpay', payoutAccountQrImageUrl: url, netAmount: 9621 });
    const { fixture } = render({
      items: [payout],
    });
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    const button = Array.from(root.querySelectorAll('button')).find((item) => item.textContent?.includes('แสดง QR พร้อมเพย์'));
    expect(button).toBeTruthy();
    button!.click();
    fixture.detectChanges();

    const dialog = root.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(payout.sellerName);
    expect(dialog?.textContent).toContain('9,621');
    expect(dialog?.querySelector('img')?.getAttribute('src')).toContain(url);
    (dialog?.querySelector('button[aria-label="ปิด"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('AdminPayoutsPage — modal อัปโหลดสลิป (AC-38)', () => {
  it('rejects a file that is not image/* or application/pdf', () => {
    const { fixture } = render();
    fixture.componentInstance.openSlipModal(payoutFixture());

    fixture.componentInstance.onFileSelected(new File(['x'], 'note.txt', { type: 'text/plain' }));

    expect(fixture.componentInstance.fileError()).toBe('รองรับเฉพาะไฟล์รูปภาพหรือ PDF');
    expect(fixture.componentInstance.selectedFile()).toBeNull();
  });

  it('rejects a file larger than 5MB', () => {
    const { fixture } = render();
    fixture.componentInstance.openSlipModal(payoutFixture());
    const big = new File([new Uint8Array(5_000_001)], 'slip.png', { type: 'image/png' });

    fixture.componentInstance.onFileSelected(big);

    expect(fixture.componentInstance.fileError()).toBe('ไฟล์ต้องไม่เกิน 5MB');
  });

  it('accepts a valid image under 5MB and builds a preview URL', () => {
    const { fixture } = render();
    fixture.componentInstance.openSlipModal(payoutFixture());
    const file = new File([new Uint8Array(100)], 'slip.png', { type: 'image/png' });

    fixture.componentInstance.onFileSelected(file);

    expect(fixture.componentInstance.fileError()).toBeNull();
    expect(fixture.componentInstance.selectedFile()).toBe(file);
    expect(fixture.componentInstance.filePreviewUrl()).toMatch(/^blob:/);
  });

  it('uploadSlip() calls admin.uploadPayoutSlip and shows the matched result', async () => {
    const uploadPayoutSlip = vi.fn(async () => slipFixture({ verificationStatus: 'matched', mismatchReasons: [] }));
    const { fixture, messages } = render({ uploadPayoutSlip });
    fixture.componentInstance.openSlipModal(payoutFixture());
    await settle(fixture);
    fixture.componentInstance.onFileSelected(new File([new Uint8Array(10)], 'slip.png', { type: 'image/png' }));

    await fixture.componentInstance.uploadSlip();
    await settle(fixture);

    expect(uploadPayoutSlip).toHaveBeenCalledWith('payout-1', expect.any(File));
    expect(messages.success).toContain('ยืนยันการโอนสำเร็จ รายการถูกปิดแล้ว');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยืนยันการโอนสำเร็จ');
  });

  it('translates every documented mismatch reason to Thai (§4.5, 10 reasons)', () => {
    const { fixture } = render();
    const c = fixture.componentInstance;

    expect(c.mismatchLabel('amount_mismatch')).toBe('ยอดเงินในสลิปไม่ตรงกับคำขอ');
    expect(c.mismatchLabel('amount_unverified')).toBe('อ่านยอดเงินจากสลิปไม่ได้');
    expect(c.mismatchLabel('name_mismatch')).toBe('ชื่อบัญชีปลายทางไม่ตรงกับที่ผู้ขายลงทะเบียน');
    expect(c.mismatchLabel('name_unverified')).toBe('สลิปไม่ระบุชื่อบัญชีปลายทาง');
    expect(c.mismatchLabel('receiver_account_mismatch')).toBe('เลขบัญชีปลายทางไม่ตรงกัน');
    expect(c.mismatchLabel('receiver_account_unverified')).toBe('สลิปไม่ระบุเลขบัญชีปลายทาง');
    expect(c.mismatchLabel('stale_slip')).toBe('วันที่โอนไม่อยู่ในช่วงของคำขอนี้');
    expect(c.mismatchLabel('duplicate_slip')).toBe('สลิปนี้ถูกใช้ยืนยันรายการอื่นแล้ว');
    expect(c.mismatchLabel('reference_missing')).toBe('สลิปไม่มีเลขอ้างอิงรายการ จึงตรวจซ้ำซ้อนไม่ได้');
    expect(c.mismatchLabel('ledger_inconsistent')).toBe('ยอดกันไว้ของรายการนี้ไม่ตรงกับระบบ กรุณาติดต่อผู้ดูแลระบบ');
  });

  it('shows a "ตรวจสอบอีกครั้ง" button for a mismatched slip on an open payout, and reverify() calls the service', async () => {
    const reverifyPayoutSlip = vi.fn(async () => slipFixture({ verificationStatus: 'matched', mismatchReasons: [] }));
    const { fixture } = render({ slips: [slipFixture()], reverifyPayoutSlip });
    fixture.componentInstance.openSlipModal(payoutFixture());
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ตรวจสอบอีกครั้ง');

    await fixture.componentInstance.reverify(slipFixture());

    expect(reverifyPayoutSlip).toHaveBeenCalledWith('payout-1', 'slip-1');
  });
});

describe('AdminPayoutsPage — "ยืนยันด้วยตนเอง" (AC-38)', () => {
  it('requires at least 10 characters before submitManual() calls the service', async () => {
    const completePayoutManually = vi.fn(async () => payoutFixture({ status: 'paid' }));
    const { fixture, messages } = render({ completePayoutManually });
    fixture.componentInstance.openSlipModal(payoutFixture());
    fixture.componentInstance.openManualModal();
    fixture.componentInstance.manualNote.set('สั้นไป');

    await fixture.componentInstance.submitManual();

    expect(completePayoutManually).not.toHaveBeenCalled();
    expect(messages.warning.length).toBe(1);
  });

  it('submits the note once it is 10+ characters and toasts success', async () => {
    const completePayoutManually = vi.fn(async () => payoutFixture({ status: 'paid' }));
    const { fixture, messages } = render({ completePayoutManually });
    fixture.componentInstance.openSlipModal(payoutFixture());
    fixture.componentInstance.openManualModal();
    fixture.componentInstance.manualNote.set('ตรวจสอบกับธนาคารแล้วโอนสำเร็จจริง');

    await fixture.componentInstance.submitManual();

    expect(completePayoutManually).toHaveBeenCalledWith('payout-1', 'ตรวจสอบกับธนาคารแล้วโอนสำเร็จจริง');
    expect(messages.success).toContain('ยืนยันการโอนสำเร็จ รายการถูกปิดแล้ว');
  });
});

describe('AdminPayoutsPage — "ไม่สำเร็จ" requires a reason (payout-request-slip-verification v1 §3.12)', () => {
  it('warns and does not call the service when the reason is empty', async () => {
    const setPayoutStatus = vi.fn(async () => {});
    const { fixture, messages } = render({ setPayoutStatus });
    fixture.componentInstance.openFailModal('payout-1');

    await fixture.componentInstance.confirmFail();

    expect(setPayoutStatus).not.toHaveBeenCalled();
    expect(messages.warning).toContain('กรุณาระบุเหตุผลที่โอนไม่สำเร็จ');
  });

  it('calls setPayoutStatus(id, "failed", reason) once a reason is given', async () => {
    const setPayoutStatus = vi.fn(async () => {});
    const { fixture, messages } = render({ setPayoutStatus });
    fixture.componentInstance.openFailModal('payout-1');
    fixture.componentInstance.failReason.set('เลขบัญชีปลายทางไม่ถูกต้อง');

    await fixture.componentInstance.confirmFail();

    expect(setPayoutStatus).toHaveBeenCalledWith('payout-1', 'failed', 'เลขบัญชีปลายทางไม่ถูกต้อง');
    expect(messages.success).toContain('อัปเดตสถานะเรียบร้อย');
  });
});

describe('AdminPayoutsPage — "อัปโหลดสลิป (หลายไฟล์)" batch modal (withdrawal-management round 2)', () => {
  it('opens the batch modal via openBatchModal() with an empty file queue', () => {
    const { fixture } = render();

    fixture.componentInstance.openBatchModal();

    expect(fixture.componentInstance.batchModalOpen()).toBe(true);
    expect(fixture.componentInstance.batchFiles()).toEqual([]);
    expect(fixture.componentInstance.batchResult()).toBeNull();
  });

  it('rejects a non-image/pdf file added to the batch queue', () => {
    const { fixture } = render();
    fixture.componentInstance.openBatchModal();

    fixture.componentInstance.onBatchFilesInputChange({
      target: { files: [new File(['x'], 'note.txt', { type: 'text/plain' })], value: '' },
    } as unknown as Event);

    expect(fixture.componentInstance.batchFiles().length).toBe(0);
    expect(fixture.componentInstance.batchError()).toContain('รองรับเฉพาะไฟล์รูปภาพหรือ PDF');
  });

  it('accepts multiple valid files and removeBatchFile() drops one by index', () => {
    const { fixture } = render();
    fixture.componentInstance.openBatchModal();
    const a = new File([new Uint8Array(10)], 'slip-a.png', { type: 'image/png' });
    const b = new File([new Uint8Array(10)], 'slip-b.pdf', { type: 'application/pdf' });

    fixture.componentInstance.onBatchFilesInputChange({ target: { files: [a, b], value: '' } } as unknown as Event);
    expect(fixture.componentInstance.batchFiles()).toEqual([a, b]);

    fixture.componentInstance.removeBatchFile(0);
    expect(fixture.componentInstance.batchFiles()).toEqual([b]);
  });

  it('submitBatchUpload() calls admin.uploadBatchPayoutSlips(files) and shows the per-file result table', async () => {
    const uploadBatchPayoutSlips = vi.fn(async () => batchResultFixture());
    const { fixture, messages } = render({ uploadBatchPayoutSlips });
    fixture.componentInstance.openBatchModal();
    const file = new File([new Uint8Array(10)], 'slip-1.png', { type: 'image/png' });
    fixture.componentInstance.onBatchFilesInputChange({ target: { files: [file], value: '' } } as unknown as Event);

    await fixture.componentInstance.submitBatchUpload();
    await settle(fixture);

    expect(uploadBatchPayoutSlips).toHaveBeenCalledWith([file]);
    expect(messages.success).toContain('โอนเงินสำเร็จอัตโนมัติ 1 รายการ');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('สมชาย ใจดี');
    expect(text).toContain('ไม่พบรายการถอนเงินที่ตรงกัน');
  });

  it('shows a "ดูสลิป" preview link only for a batch item that has a slipUrl', async () => {
    const { fixture } = render({ uploadBatchPayoutSlips: vi.fn(async () => batchResultFixture()) });
    fixture.componentInstance.openBatchModal();
    fixture.componentInstance.onBatchFilesInputChange({
      target: { files: [new File([new Uint8Array(10)], 'slip-1.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);

    await fixture.componentInstance.submitBatchUpload();
    await settle(fixture);

    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).filter((a) =>
      a.textContent?.includes('ดูสลิป'),
    );
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toContain('/api/admin/payouts/payout-1/slips/slip-9/file');
  });

  it('closeBatchModal() resets the queue and result', () => {
    const { fixture } = render();
    fixture.componentInstance.openBatchModal();
    fixture.componentInstance.batchResult.set(batchResultFixture());

    fixture.componentInstance.closeBatchModal();

    expect(fixture.componentInstance.batchModalOpen()).toBe(false);
    expect(fixture.componentInstance.batchResult()).toBeNull();
  });
});

describe('AdminPayoutsPage — custom overlay contract (responsive-ui v1.4 §4.7, F52 / F102 / F160)', () => {
  function openDialogs(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll('[role="dialog"]')) as HTMLElement[];
  }

  it('every overlay is a named modal dialog in a scrolling, safe-area padded 100dvh layer, with the card at m-auto', async () => {
    const { fixture } = render();
    await settle(fixture);
    const page = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    const openers: Array<[string, () => void, () => void]> = [
      ['batch', () => page.openBatchModal(), () => page.closeBatchModal()],
      ['manual', () => page.manualModalOpen.set(true), () => page.closeManualModal()],
      ['fail', () => page.failModalPayoutId.set('payout-1'), () => page.closeFailModal()],
      ['qr', () => page.qrModalPayout.set(payoutFixture()), () => page.qrModalPayout.set(null)],
    ];
    for (const [name, open, close] of openers) {
      open();
      fixture.detectChanges();
      const [dialog] = openDialogs(root);
      expect(dialog, name).toBeTruthy();
      expect(dialog.getAttribute('aria-modal'), name).toBe('true');
      const titleId = dialog.getAttribute('aria-labelledby');
      expect(titleId, name).toBeTruthy();
      expect(root.querySelector('#' + titleId)?.textContent?.trim(), name).toBeTruthy();
      expect(dialog.className, name).toContain('m-auto');
      const layer = dialog.parentElement as HTMLElement;
      for (const cls of ['overflow-y-auto', 'overscroll-contain', 'h-dvh', 'pl-[max(16px,var(--safe-left))]', 'pr-[max(16px,var(--safe-right))]']) {
        expect(layer.className, name + ' ' + cls).toContain(cls);
      }
      expect(layer.className, name).not.toContain('items-center');
      close();
      fixture.detectChanges();
    }
  });

  it('locks page scroll while any overlay is open and releases it after the last one closes (R-10)', async () => {
    const { fixture } = render();
    await settle(fixture);
    const page = fixture.componentInstance;
    expect(document.documentElement.style.overflow).toBe('');

    page.openBatchModal();
    fixture.detectChanges();
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('visible');

    page.manualModalOpen.set(true); // stacked
    fixture.detectChanges();
    page.closeBatchModal();
    fixture.detectChanges();
    expect(document.documentElement.style.overflow).toBe('hidden');

    page.closeManualModal();
    fixture.detectChanges();
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
  });

  it('Escape closes only the topmost overlay, and ignores an Escape an inner layer already handled', async () => {
    const { fixture } = render();
    await settle(fixture);
    const page = fixture.componentInstance;
    page.slipModalPayout.set(payoutFixture());
    page.manualModalOpen.set(true);
    fixture.detectChanges();

    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    handled.preventDefault();
    document.dispatchEvent(handled);
    fixture.detectChanges();
    expect(page.manualModalOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(page.manualModalOpen()).toBe(false);
    expect(page.slipModalPayout()).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(page.slipModalPayout()).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('batch file remove buttons are 44px touch targets (F160)', async () => {
    const { fixture } = render();
    await settle(fixture);
    const page = fixture.componentInstance;
    page.openBatchModal();
    page.batchFiles.set([new File(['x'], 'a.png', { type: 'image/png' })]);
    fixture.detectChanges();
    const remove = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"] ul li button') as HTMLElement;
    expect(remove.className).toContain('[@media(pointer:coarse)]:min-w-11');
    expect(remove.className).toContain('[@media(pointer:coarse)]:min-h-11');
  });
});

describe('AdminPayoutsPage — table viewports (responsive-ui v1.6 R-27)', () => {
  async function ticks(fixture: ReturnType<typeof render>['fixture']): Promise<void> {
    fixture.detectChanges();
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
  const viewports = (fixture: ReturnType<typeof render>['fixture']) =>
    fixture.debugElement.queryAll(By.directive(TableViewportDirective)).map((d) => d.injector.get(TableViewportDirective));

  it('the payout list sits in a named viewport keyed on page, page size and filter, with the pagination outside', async () => {
    const items = Array.from({ length: 12 }, (_, i) => payoutFixture({ id: `payout-${i + 1}` }));
    const { fixture } = render({ items });
    await ticks(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const wrapperOf = () => (root.querySelector('table.rtable') as HTMLTableElement).parentElement as HTMLElement;

    const pagination = root.querySelector('app-pagination') as HTMLElement;
    expect(wrapperOf().classList).toContain('rt-viewport');
    expect(wrapperOf().contains(pagination)).toBe(false);
    expect(wrapperOf().compareDocumentPosition(pagination) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(viewports(fixture).map((v) => [v.rtLabel(), v.rtResetKey()])).toEqual([['การถอนเงินผู้ขาย', '1|10|pending']]);

    wrapperOf().scrollTop = 300;
    fixture.componentInstance.setFilter('paid');
    await ticks(fixture);
    expect(viewports(fixture)[0].rtResetKey()).toBe('1|10|paid');
    expect(wrapperOf().scrollTop).toBe(0);

    wrapperOf().scrollTop = 300;
    fixture.componentInstance.onPageChange(2);
    await ticks(fixture);
    expect(viewports(fixture)[0].rtResetKey()).toBe('2|10|paid');
    expect(wrapperOf().scrollTop).toBe(0);
  });

  it('the batch-result table sits in its own viewport, named by the dialog heading, with no reset key', async () => {
    const { fixture } = render({ uploadBatchPayoutSlips: vi.fn(async () => batchResultFixture()) });
    await ticks(fixture);
    fixture.componentInstance.openBatchModal();
    fixture.componentInstance.onBatchFilesInputChange({
      target: { files: [new File([new Uint8Array(10)], 'slip-1.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);
    await fixture.componentInstance.submitBatchUpload();
    await ticks(fixture);

    const root = fixture.nativeElement as HTMLElement;
    const batchTable = root.querySelector('[role="dialog"] table.rtable') as HTMLTableElement;
    expect(batchTable.parentElement?.classList).toContain('rt-viewport');
    const [list, batch] = viewports(fixture);
    expect(list.rtLabel()).toBe('การถอนเงินผู้ขาย');
    expect(batch.rtLabelledBy()).toBe('payout-batch-title');
    expect(batch.rtResetKey()).toBeUndefined();
    expect(root.querySelector('#payout-batch-title')?.textContent?.trim()).toBe('อัปโหลดสลิปหลายไฟล์ — จับคู่อัตโนมัติ');
  });
});
