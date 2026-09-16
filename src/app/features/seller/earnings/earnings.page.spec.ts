import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { PayoutAccountService, PlatformStatsService, SellerService } from '../../../core/services';
import { AuthService } from '../../../core/services/auth.service';
import { SellerEarningsPage } from './earnings.page';
import { DEFAULT_SELLER_INSIGHTS, DEFAULT_STORE_READINESS } from '../../../core/models';
import type { PayoutAccount, PlatformStats, SellerStats } from '../../../core/models';
import type { SellerPayoutRow } from '../../../core/services/seller.service';

/**
 * real-data-stats v1 §4.6 — Seller earnings page:
 *  - "ส่วนแบ่งของคุณ" reads `PlatformStatsService.stats()?.feeRatePercent`, fallback 90 while loading
 *  - "เดือนนี้" trend badge hidden entirely when `revenueTrendPercent` is null/undefined
 *  - "โอนรอบถัดไป" line hidden entirely when `nextPayoutDate()` is null
 *
 * payout-request-slip-verification v1 §4.2-§4.4 (AC-34/AC-35/AC-36):
 *  - the amount-based request form + its 3 static disable reasons
 *  - "ยกเลิกคำขอ" via `NzModalService.confirm` (never the browser's native `confirm()`)
 *  - the ledger ("ประวัติยอดเงิน") section with Thai kind labels + signed amounts
 */
function buildStats(over: Partial<SellerStats> = {}): SellerStats {
  return {
    totalRevenue: 100000,
    monthlyRevenue: 20000,
    totalDownloads: 500,
    monthlyDownloads: 40,
    averageRating: 4.7,
    totalReviews: 40,
    pendingPayout: 5000,
    activeListings: 12,
    pendingApproval: 1,
    followerCount: 80,
    newFollowersThisMonth: 3,
    revenueByMonth: [],
    topCategories: [],
    storeReadiness: DEFAULT_STORE_READINESS,
    insights: DEFAULT_SELLER_INSIGHTS,
    ...over,
  };
}

function buildPayoutAccount(over: Partial<PayoutAccount> = {}): PayoutAccount {
  return {
    hasAccount: true,
    accountType: 'bank',
    bankCode: 'KBANK',
    accountHolderName: 'สมชาย ใจดี',
    accountNumberMasked: '••••••••1234',
    promptPayType: null,
    promptPayMasked: '',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

function render(opts: {
  stats?: Partial<SellerStats>;
  nextPayoutDate?: string | null;
  platformStats?: PlatformStats;
  sellerProfileRequired?: boolean;
  earnings?: Record<string, unknown>;
  payouts?: SellerPayoutRow[];
  payoutAccount?: PayoutAccount | null;
  requestPayout?: ReturnType<typeof vi.fn>;
  cancelPayout?: ReturnType<typeof vi.fn>;
}) {
  const earnings = {
    totalEarnings: 5000,
    pendingBalance: 1200,
    availableBalance: 1200,
    onHoldAmount: 0,
    minPayoutAmount: 100,
    maxPayoutAmount: 0,
    hasPayoutAccount: true,
    payouts: [],
    ...opts.earnings,
  };

  const fakeSeller = {
    stats: () => buildStats(opts.stats),
    earnings: () => earnings,
    nextPayoutDate: () => opts.nextPayoutDate ?? null,
    sellerProfileRequired: () => opts.sellerProfileRequired ?? false,
    loadEarnings: vi.fn(async () => {}),
    refreshDashboard: vi.fn(async () => {}),
    requestPayout: opts.requestPayout ?? vi.fn(async () => ({ ok: true })),
    cancelPayout: opts.cancelPayout ?? vi.fn(async () => ({ ok: true })),
    loadPayoutsPaged: vi.fn(async () => ({
      items: opts.payouts ?? [],
      totalCount: (opts.payouts ?? []).length,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })),
    loadBalanceEntriesPaged: vi.fn(async () => ({
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })),
  };
  const fakePlatformStats = { stats: () => opts.platformStats, loadStats: vi.fn() };
  const fakePayoutAccount = {
    account: () => (opts.payoutAccount === undefined ? buildPayoutAccount() : opts.payoutAccount),
    load: vi.fn(async () => {}),
  };
  const modalCalls: Record<string, unknown>[] = [];
  const fakeModal = { confirm: vi.fn((cfg: Record<string, unknown>) => modalCalls.push(cfg)) };
  const messages = { success: [] as string[], warning: [] as string[], error: [] as string[] };
  const fakeMessage = {
    success: (m: string) => messages.success.push(m),
    warning: (m: string) => messages.warning.push(m),
    error: (m: string) => messages.error.push(m),
  };

  TestBed.configureTestingModule({
    imports: [SellerEarningsPage],
    providers: [
      provideRouter([]),
      { provide: SellerService, useValue: fakeSeller },
      { provide: PlatformStatsService, useValue: fakePlatformStats },
      { provide: PayoutAccountService, useValue: fakePayoutAccount },
      { provide: NzModalService, useValue: fakeModal },
      { provide: NzMessageService, useValue: fakeMessage },
      { provide: AuthService, useValue: { accessToken: () => 'test-token' } },
    ],
  });

  const fixture = TestBed.createComponent(SellerEarningsPage);
  fixture.detectChanges();
  return { fixture, fakeSeller, modalCalls, messages };
}

afterEach(() => TestBed.resetTestingModule());

describe('SellerEarningsPage — fee % (real-data-stats v1 §4.6)', () => {
  it('falls back to 90% while platform stats have not loaded', () => {
    const { fixture } = render({ platformStats: undefined });

    expect(fixture.componentInstance.sellerSharePercent()).toBe(90);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('90%');
  });

  it('uses the real feeRatePercent once platform stats load', () => {
    const { fixture } = render({
      platformStats: {
        totalApprovedDocuments: 1,
        totalSellers: 1,
        totalDownloads: 1,
        reviewCount: 1,
        feeRatePercent: 20,
      },
    });

    expect(fixture.componentInstance.sellerSharePercent()).toBe(80);
  });
});

describe('SellerEarningsPage — trend badge (real-data-stats v1 §3.4/§4.6)', () => {
  it('hides the "เดือนนี้" trend badge when revenueTrendPercent is undefined', () => {
    const { fixture } = render({ stats: { revenueTrendPercent: undefined } });

    expect(fixture.componentInstance.revenueTrendDisplay()).toBeNull();
  });

  it('shows the formatted trend once the backend sends a real value', () => {
    const { fixture } = render({ stats: { revenueTrendPercent: 18.4 } });

    expect(fixture.componentInstance.revenueTrendDisplay()).toBe('+18.4%');
  });
});

describe('SellerEarningsPage — รอบโอนถัดไป (real-data-stats v1 §3.5/§4.6)', () => {
  it('hides the line entirely when nextPayoutDate is null', () => {
    const { fixture } = render({ nextPayoutDate: null });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('รอบโอนถัดไป');
  });

  it('shows the formatted date when nextPayoutDate has a value', () => {
    const { fixture } = render({ nextPayoutDate: '2026-05-15' });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('รอบโอนถัดไป');
    expect(text).toContain('2026');
  });
});

describe('SellerEarningsPage — seller_profile_required (QA fix: friendly 403 state)', () => {
  it('shows a friendly "no store yet" state instead of the earnings content', () => {
    const { fixture } = render({ sellerProfileRequired: true });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ร้านนี้ยังไม่มีร้านค้า');
    expect(text).not.toContain('รายได้ & Payout');

    const becomeSellerLink = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href="/become-seller"]',
    );
    expect(becomeSellerLink).toBeTruthy();
  });

  it('shows the normal earnings page when the account has a seller profile', () => {
    const { fixture } = render({ sellerProfileRequired: false });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('รายได้ & Payout');
    expect(text).not.toContain('ร้านนี้ยังไม่มีร้านค้า');
  });
});

describe('SellerEarningsPage — ปุ่ม "ขอถอนเงิน" disable reasons (payout-request-slip-verification v1 §4.2, AC-34)', () => {
  it('disables with "กรุณาตั้งค่าบัญชีรับเงินก่อน" when hasPayoutAccount is false', () => {
    const { fixture } = render({ earnings: { hasPayoutAccount: false } });

    expect(fixture.componentInstance.disableReason()).toBe('กรุณาตั้งค่าบัญชีรับเงินก่อน');
    expect(fixture.componentInstance.canOpenRequest()).toBe(false);
  });

  it('disables with the minimum-balance message when availableBalance is below minPayoutAmount', () => {
    const { fixture } = render({ earnings: { availableBalance: 50, minPayoutAmount: 100 } });

    expect(fixture.componentInstance.disableReason()).toContain('ยอดคงเหลือยังไม่ถึงขั้นต่ำ');
    expect(fixture.componentInstance.disableReason()).toContain('100');
  });

  it('disables with "คุณมีคำขอถอนเงินที่ยังดำเนินการอยู่" when a request is already open', () => {
    const { fixture } = render({
      earnings: { availableBalance: 5000, minPayoutAmount: 100, payouts: [{ status: 'pending' }] },
    });

    expect(fixture.componentInstance.disableReason()).toBe('คุณมีคำขอถอนเงินที่ยังดำเนินการอยู่');
  });

  it('is enabled (no disable reason) once every gate passes', () => {
    const { fixture } = render({ earnings: { availableBalance: 5000, minPayoutAmount: 100 } });

    expect(fixture.componentInstance.disableReason()).toBeNull();
    expect(fixture.componentInstance.canOpenRequest()).toBe(true);
  });

  it('shows the masked saved destination when the request form is open', () => {
    const { fixture } = render({});
    fixture.componentInstance.openRequest();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ธนาคารกสิกรไทย');
    expect(text).toContain('••••••••1234');
  });
});

describe('SellerEarningsPage — validation ของช่องจำนวนเงิน (§4.2/§4.3, AC-34)', () => {
  it('"ยอดคงเหลือไม่พอ" when amount exceeds availableBalance', () => {
    const { fixture } = render({ earnings: { availableBalance: 500, minPayoutAmount: 100 } });
    fixture.componentInstance.amount.set(600);

    expect(fixture.componentInstance.amountError()).toBe('ยอดคงเหลือไม่พอ');
  });

  it('"จำนวนเงินต้องไม่น้อยกว่า {min} บาท" when amount is below the minimum', () => {
    const { fixture } = render({ earnings: { availableBalance: 5000, minPayoutAmount: 100 } });
    fixture.componentInstance.amount.set(50);

    expect(fixture.componentInstance.amountError()).toContain('จำนวนเงินต้องไม่น้อยกว่า');
  });

  it('"จำนวนเงินต้องไม่เกิน {max} บาท" when a positive max is set and amount exceeds it', () => {
    const { fixture } = render({ earnings: { availableBalance: 5000, minPayoutAmount: 100, maxPayoutAmount: 1000 } });
    fixture.componentInstance.amount.set(1500);

    expect(fixture.componentInstance.amountError()).toContain('จำนวนเงินต้องไม่เกิน');
  });

  it('maxPayoutAmount=0 means unlimited — no upper-bound error', () => {
    const { fixture } = render({ earnings: { availableBalance: 999999, minPayoutAmount: 100, maxPayoutAmount: 0 } });
    fixture.componentInstance.amount.set(50000);

    expect(fixture.componentInstance.amountError()).toBeNull();
  });

  it('"กรุณาระบุจำนวนเงินให้ถูกต้อง" for zero, negative, or more than 2 decimal places', () => {
    const { fixture } = render({ earnings: { availableBalance: 5000, minPayoutAmount: 100 } });

    fixture.componentInstance.amount.set(0);
    expect(fixture.componentInstance.amountError()).toBe('กรุณาระบุจำนวนเงินให้ถูกต้อง');

    fixture.componentInstance.amount.set(-10);
    expect(fixture.componentInstance.amountError()).toBe('กรุณาระบุจำนวนเงินให้ถูกต้อง');

    fixture.componentInstance.amount.set(100.005);
    expect(fixture.componentInstance.amountError()).toBe('กรุณาระบุจำนวนเงินให้ถูกต้อง');
  });

  it('"ถอนทั้งหมด" fills the amount field with availableBalance', () => {
    const { fixture } = render({ earnings: { availableBalance: 2500, minPayoutAmount: 100 } });

    fixture.componentInstance.fillMaxAmount();

    expect(fixture.componentInstance.amount()).toBe(2500);
    expect(fixture.componentInstance.amountError()).toBeNull();
  });

  it('submitRequest() calls seller.requestPayout(amount, note) and reloads on success', async () => {
    const requestPayout = vi.fn(async () => ({ ok: true }));
    const { fixture } = render({ earnings: { availableBalance: 5000, minPayoutAmount: 100 }, requestPayout });
    fixture.componentInstance.amount.set(500);
    fixture.componentInstance.note.set('โอนด่วน');

    await fixture.componentInstance.submitRequest();

    expect(requestPayout).toHaveBeenCalledWith(500, 'โอนด่วน');
    expect(fixture.componentInstance.requestOpen()).toBe(false);
  });

  it('submitRequest() does not call the service when the amount is invalid', async () => {
    const requestPayout = vi.fn(async () => ({ ok: true }));
    const { fixture, messages } = render({ earnings: { availableBalance: 5000, minPayoutAmount: 100 }, requestPayout });
    fixture.componentInstance.amount.set(null);

    await fixture.componentInstance.submitRequest();

    expect(requestPayout).not.toHaveBeenCalled();
    expect(messages.warning.length).toBe(1);
  });
});

describe('SellerEarningsPage — ยกเลิกคำขอ (payout-request-slip-verification v1 §4.3, AC-35)', () => {
  const pendingPayout: SellerPayoutRow = {
    id: 'payout-1',
    grossAmount: 500,
    fee: 0,
    netAmount: 500,
    status: 'pending',
    bankAccount: 'KBANK ••••1234',
    destinationType: 'bank',
    requestedAt: '2026-09-10T00:00:00.000Z',
    paidAt: null,
    cancelledAt: null,
    slipStatus: null,
  };

  it('shows a "ยกเลิกคำขอ" button only on pending rows', async () => {
    const { fixture } = render({ payouts: [pendingPayout, { ...pendingPayout, id: 'payout-2', status: 'paid' }] });
    await fixture.whenStable();
    fixture.detectChanges();

    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).filter(
      (b) => b.textContent?.includes('ยกเลิกคำขอ'),
    );
    expect(buttons.length).toBe(1);
  });

  it('confirmCancel() opens an NzModalService.confirm dialog with the amount + refund sentence, never window.confirm', () => {
    const { fixture, modalCalls } = render({ payouts: [pendingPayout] });

    fixture.componentInstance.confirmCancel(pendingPayout);

    expect(modalCalls.length).toBe(1);
    const content = String(modalCalls[0]['nzContent']);
    expect(content).toContain('500');
    expect(content).toContain('ยอดเงินจะกลับเข้ายอดคงเหลือทันที');
  });

  it('nzOnOk calls seller.cancelPayout(id) and reloads on success', async () => {
    const cancelPayout = vi.fn(async () => ({ ok: true }));
    const { fixture, modalCalls } = render({ payouts: [pendingPayout], cancelPayout });

    fixture.componentInstance.confirmCancel(pendingPayout);
    const onOk = modalCalls[0]['nzOnOk'] as () => Promise<void>;
    await onOk();

    expect(cancelPayout).toHaveBeenCalledWith('payout-1');
  });
});

describe('SellerEarningsPage — ดูสลิปการโอนเงิน (withdrawal-management round 2)', () => {
  const paidPayoutWithSlip: SellerPayoutRow = {
    id: 'payout-2',
    grossAmount: 500,
    fee: 0,
    netAmount: 500,
    status: 'paid',
    bankAccount: 'KBANK ••••1234',
    destinationType: 'bank',
    requestedAt: '2026-09-10T00:00:00.000Z',
    paidAt: '2026-09-11T00:00:00.000Z',
    cancelledAt: null,
    slipStatus: 'matched',
    latestSlipId: 'slip-9',
    slipUrl: '/api/seller/payouts/payout-2/slips/slip-9/file',
  };

  it('shows a "ดูสลิปการโอนเงิน" link on a paid row that has a slipUrl', async () => {
    const { fixture } = render({ payouts: [paidPayoutWithSlip] });
    await fixture.whenStable();
    fixture.detectChanges();

    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).filter((a) =>
      a.textContent?.includes('ดูสลิปการโอนเงิน'),
    );
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toContain('/api/seller/payouts/payout-2/slips/slip-9/file');
    expect(links[0].getAttribute('href')).toContain('token=test-token');
  });

  it('hides the link on a paid row with no slipUrl yet', async () => {
    const { fixture } = render({
      payouts: [{ ...paidPayoutWithSlip, latestSlipId: null, slipUrl: null }],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ดูสลิปการโอนเงิน');
  });

  it('hides the link on a non-paid row even if a slipUrl is present', async () => {
    const { fixture } = render({
      payouts: [{ ...paidPayoutWithSlip, status: 'processing' }],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ดูสลิปการโอนเงิน');
  });
});

describe('SellerEarningsPage — ประวัติยอดเงิน / ledger (payout-request-slip-verification v1 §4.4, AC-36)', () => {
  it('ledgerLabel() maps every documented kind to its Thai label', () => {
    const { fixture } = render({});
    const c = fixture.componentInstance;

    expect(c.ledgerLabel('opening_balance')).toBe('ยอดยกมา');
    expect(c.ledgerLabel('order_earning')).toBe('รายได้จากการขาย');
    expect(c.ledgerLabel('subscription_share')).toBe('ส่วนแบ่งสมาชิกรายเดือน');
    expect(c.ledgerLabel('payout_hold')).toBe('กันยอดเพื่อถอนเงิน');
    expect(c.ledgerLabel('payout_reversal')).toBe('คืนยอดจากคำขอถอนเงิน');
    expect(c.ledgerLabel('order_refund')).toBe('คืนเงินให้ผู้ซื้อ');
    expect(c.ledgerLabel('adjustment')).toBe('ปรับยอดโดยผู้ดูแลระบบ');
  });

  it('seller-ads-promotion v1 §4.4: ledgerLabel() maps the 2 new ads kinds (ads_spend and ads_refund)', () => {
    const { fixture } = render({});
    const c = fixture.componentInstance;

    expect(c.ledgerLabel('ads_spend')).toBe('ค่าโฆษณา');
    expect(c.ledgerLabel('ads_refund')).toBe('คืนค่าโฆษณา');
  });

  it('renders the ledger rows with a +/- sign', async () => {
    const { fixture, fakeSeller } = render({});
    (fakeSeller.loadBalanceEntriesPaged as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [
        { id: 'e1', kind: 'order_earning', amount: 450, reason: 'order_paid', sourceType: 'order', sourceId: 'o1', note: null, occurredAt: '2026-09-01T00:00:00.000Z' },
        { id: 'e2', kind: 'payout_hold', amount: -300, reason: 'payout_requested', sourceType: 'payout', sourceId: 'p1', note: null, occurredAt: '2026-09-02T00:00:00.000Z' },
      ],
      totalCount: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    await fixture.componentInstance.loadLedger();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('รายได้จากการขาย');
    expect(text).toContain('กันยอดเพื่อถอนเงิน');
    expect(text).toContain('+฿450');
  });
});
