import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { signal } from '@angular/core';
import { WalletPage } from './wallet.page';
import { AuthService, OrderService, WalletService } from '../../../core/services';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';
import {
  idleActionState,
  type ActionState,
} from '../../../core/services/action-state';
import type { WalletEntry, WalletSummary, WalletTopUp } from '../../../core/models';

describe('WalletPage', () => {
  let fixture: ComponentFixture<WalletPage>;
  let component: WalletPage;

  const mockSummary = signal<WalletSummary | null>(null);
  const mockState = signal<ActionState>(idleActionState());
  const mockLedger = signal<WalletEntry[]>([]);
  const mockLedgerHasMore = signal<boolean>(false);
  const mockLedgerState = signal<ActionState>(idleActionState());

  const mockWalletService = {
    summary: mockSummary.asReadonly(),
    state: mockState.asReadonly(),
    ledger: mockLedger.asReadonly(),
    ledgerHasMore: mockLedgerHasMore.asReadonly(),
    ledgerState: mockLedgerState.asReadonly(),
    refreshSummary: vi.fn(async () => {}),
    loadLedgerFirst: vi.fn(async () => {}),
    loadMoreLedger: vi.fn(async () => {}),
    createTopUp: vi.fn(async (_amount: number): Promise<WalletTopUp | null> => null),
    pollTopUp: vi.fn(async (_id: string): Promise<WalletTopUp | null> => null),
  };

  const mockOrderService = {
    getStripePublishableKey: vi.fn(async () => 'pk_test_123'),
  };

  const mockAuthService = {
    user: signal({ email: 'buyer@example.com' }),
    isAuthenticated: () => true,
    accessToken: () => 'token',
  };

  const mockMessage = {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  };

  beforeEach(async () => {
    mockSummary.set(null);
    mockState.set(idleActionState());
    mockLedger.set([]);
    mockLedgerHasMore.set(false);
    mockLedgerState.set(idleActionState());
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [WalletPage],
      providers: [
        provideRouter([]),
        { provide: WalletService, useValue: mockWalletService },
        { provide: OrderService, useValue: mockOrderService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: NzMessageService, useValue: mockMessage },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams: {} },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('AC-27: Balance card, presets, and ledger rendering', () => {
    it('renders "—" while summary is null', () => {
      const text = fixture.nativeElement.textContent;
      expect(text).toContain('ยอดคงเหลือ');
      expect(text).toContain('—');
    });

    it('renders balance in THB when summary is loaded', () => {
      mockSummary.set({ balance: 350, asOf: '2026-09-15T12:00:00.000Z' });
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('฿350');
    });

    it('renders 50, 100, 300, 500 preset buttons and clicking updates amount', () => {
      const buttons = fixture.nativeElement.querySelectorAll('button');
      const presetButtons = Array.from(buttons).filter((b: any) =>
        ['50', '100', '300', '500'].includes(b.textContent?.trim()),
      );
      expect(presetButtons.length).toBe(4);

      // Click 100
      (presetButtons[1] as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(component.amount()).toBe(100);

      // Click 500
      (presetButtons[3] as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(component.amount()).toBe(500);
    });

    it('renders ledger list with Thai labels and signed amount', () => {
      mockLedger.set([
        {
          id: '1',
          kind: 'topup',
          amount: 500,
          reason: 'wallet_topup',
          occurredAt: '2026-09-15T10:00:00.000Z',
        },
        {
          id: '2',
          kind: 'purchase',
          amount: -120,
          reason: 'order_paid_by_wallet',
          orderNumber: 'ORD-999',
          occurredAt: '2026-09-15T11:00:00.000Z',
        },
        {
          id: '3',
          kind: 'refund',
          amount: 120,
          reason: 'order_refunded_to_wallet',
          orderNumber: 'ORD-999',
          occurredAt: '2026-09-15T12:00:00.000Z',
        },
      ]);
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('ประวัติยอดเงิน');
      expect(text).toContain('เติมเงิน');
      expect(text).toContain('ซื้อเอกสาร');
      expect(text).toContain('คืนเงินเข้ากระเป๋า');
      expect(text).toContain('#ORD-999');
      expect(text).toContain('+฿500');
      expect(text).toContain('-฿120');
    });

    it('shows "โหลดเพิ่ม" button when ledgerHasMore is true and calls loadMoreLedger', () => {
      mockLedger.set([
        {
          id: '1',
          kind: 'topup',
          amount: 100,
          reason: 'wallet_topup',
          occurredAt: '2026-09-15T10:00:00.000Z',
        },
      ]);
      mockLedgerHasMore.set(true);
      fixture.detectChanges();

      const loadMoreBtn = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((b: any) => b.textContent?.includes('โหลดเพิ่ม')) as HTMLButtonElement;

      expect(loadMoreBtn).toBeTruthy();
      loadMoreBtn.click();
      expect(mockWalletService.loadMoreLedger).toHaveBeenCalled();
    });
  });

  describe('AC-28: Top-up initiation and payment element flow', () => {
    it('creates top-up when amount is selected and submitted', async () => {
      component.amount.set(300);
      mockWalletService.createTopUp.mockResolvedValueOnce({
        id: 'top-123',
        amount: 300,
        status: 'pending',
        stripePaymentIntentId: 'pi_test_123',
        clientSecret: 'pi_test_123_secret_abc',
        createdAt: '2026-09-15T12:00:00.000Z',
        succeededAt: null,
      });

      await component.startTopUp();

      expect(mockWalletService.createTopUp).toHaveBeenCalledWith(300);
      expect(component.currentTopUp()?.id).toBe('top-123');
    });

    it('warns user if amount is not specified or 0', async () => {
      component.amount.set(0);
      await component.startTopUp();
      expect(mockMessage.warning).toHaveBeenCalledWith('กรุณาระบุจำนวนเงินที่ต้องการเติม');
      expect(mockWalletService.createTopUp).not.toHaveBeenCalled();
    });
  });
  describe('responsive-ui F152 / F156: Payment Element mount failure and readiness', () => {
    const TOPUP: WalletTopUp = {
      id: 'top-f152',
      amount: 500,
      status: 'pending',
      stripePaymentIntentId: 'pi_test_f152',
      clientSecret: 'pi_test_f152_secret_abc',
      createdAt: '2026-09-30T00:00:00.000Z',
      succeededAt: null,
    };
    const stripeTag = () =>
      document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]');
    const confirmButton = () =>
      Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
        (b) => b.textContent?.trim() === 'ยืนยันชำระเงิน',
      );

    afterEach(() => {
      document.querySelectorAll('script[src="https://js.stripe.com/v3/"]').forEach((s) => s.remove());
      delete window.Stripe;
    });

    it('a Stripe.js load failure shows the translated message and returns to the amount form (amount kept)', async () => {
      component.amount.set(500);
      mockWalletService.createTopUp.mockResolvedValueOnce(TOPUP);

      await component.startTopUp();
      fixture.detectChanges();
      expect(component.mountingPayment()).toBe(true);
      expect(confirmButton()?.disabled).toBe(true);

      // jsdom never fetches the CDN script — fail it by hand once the 50ms mount timer added it.
      await vi.waitFor(() => expect(stripeTag()).toBeTruthy());
      stripeTag()!.dispatchEvent(new Event('error'));
      await vi.waitFor(() => expect(component.mountingPayment()).toBe(false));
      fixture.detectChanges();

      expect(mockMessage.error).toHaveBeenCalledWith('ไม่สามารถโหลดระบบชำระเงิน Stripe ได้');
      expect(mockMessage.error).not.toHaveBeenCalledWith('Failed to load Stripe.js');
      expect(component.currentTopUp()).toBeNull();
      expect(component.paymentReady()).toBe(false);
      expect(component.amount()).toBe(500);
      expect(fixture.nativeElement.querySelector('#topup-amount-input')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#wallet-stripe-payment-element')).toBeNull();
      expect(confirmButton()).toBeUndefined();
      // The failed tag is gone, so the next attempt really reloads Stripe.js.
      expect(stripeTag()).toBeNull();
    });

    it('keeps "ยืนยันชำระเงิน" disabled until the Payment Element is mounted', async () => {
      const mount = vi.fn();
      window.Stripe = vi.fn(() => ({
        elements: vi.fn(() => ({ create: vi.fn(() => ({ mount })) })),
        confirmPayment: vi.fn(),
      })) as unknown as Window['Stripe'];
      component.amount.set(500);
      mockWalletService.createTopUp.mockResolvedValueOnce(TOPUP);

      await component.startTopUp();
      fixture.detectChanges();
      expect(confirmButton()?.disabled).toBe(true);

      await vi.waitFor(() => expect(component.paymentReady()).toBe(true));
      fixture.detectChanges();
      expect(mount).toHaveBeenCalledWith('#wallet-stripe-payment-element');
      expect(confirmButton()?.disabled).toBe(false);
      expect(mockMessage.error).not.toHaveBeenCalled();
    });

    it('confirmPayment() with no mounted Payment Element tells the buyer instead of silently doing nothing', async () => {
      component.currentTopUp.set(TOPUP);

      await component.confirmPayment();

      expect(mockMessage.error).toHaveBeenCalledWith('โหลดระบบชำระเงินไม่สำเร็จ กรุณาลองใหม่');
      expect(component.busy()).toBe(false);
    });
  });

  describe('responsive-ui v1 U5-3: ledger table uses .rtable', () => {
    it('renders the ledger as an .rtable with one title, one corner amount and two labelled keys per row', () => {
      mockLedger.set([
        { id: 'e1', kind: 'purchase', amount: -120, reason: '', orderNumber: 'ORD-1', occurredAt: '2026-09-20T10:00:00.000Z' },
      ]);
      fixture.detectChanges();

      const table = fixture.nativeElement.querySelector('table') as HTMLTableElement;
      expect(table.classList.contains('rtable')).toBe(true);
      const row = table.querySelector('tbody tr') as HTMLTableRowElement;
      expect(row.querySelectorAll('td.rt-title').length).toBe(1);
      expect(row.querySelectorAll('td.rt-status').length).toBe(1);
      const keys = Array.from(row.querySelectorAll('td.rt-key'));
      expect(keys.length).toBe(2);
      keys.forEach((k) => expect(k.getAttribute('data-label')).toBeTruthy());
      expect(row.querySelector('td.rt-status')?.textContent).toContain('120');
    });
  });

  describe('responsive-ui v1.6 R-27 / U5-7: ledger table viewport', () => {
    const entries = (n: number): WalletEntry[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `e${i + 1}`,
        kind: 'topup' as const,
        amount: 100,
        reason: 'wallet_topup',
        occurredAt: '2026-09-15T10:00:00.000Z',
      }));

    it('sits in a table viewport named after its section, with "load more" after it', () => {
      mockLedger.set(entries(20));
      mockLedgerHasMore.set(true);
      fixture.detectChanges();

      const wrapper = (fixture.nativeElement.querySelector('table.rtable') as HTMLTableElement).parentElement as HTMLElement;
      expect(wrapper.classList.contains('rt-viewport')).toBe(true);
      expect(wrapper.classList.contains('table-scroll')).toBe(true);

      const viewport = fixture.debugElement.query(By.directive(TableViewportDirective)).injector.get(TableViewportDirective);
      expect(viewport.rtLabel()).toBe('ประวัติยอดเงิน');
      // U5-7: no reset key at all — appended rows must never scroll the table back up.
      expect(viewport.rtResetKey()).toBeUndefined();

      const loadMore = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((b) =>
        b.textContent?.includes('โหลดเพิ่ม'),
      ) as HTMLButtonElement;
      expect(loadMore).toBeTruthy();
      expect(wrapper.contains(loadMore)).toBe(false);
    });

    it('"load more" appends rows and keeps the scroll position', async () => {
      mockLedger.set(entries(20));
      mockLedgerHasMore.set(true);
      fixture.detectChanges();
      const wrapper = (fixture.nativeElement.querySelector('table.rtable') as HTMLTableElement).parentElement as HTMLElement;

      wrapper.scrollTop = 200;
      mockLedger.set(entries(40));
      fixture.detectChanges();
      await fixture.whenStable();

      const after = (fixture.nativeElement.querySelector('table.rtable') as HTMLTableElement).parentElement as HTMLElement;
      expect(after).toBe(wrapper);
      expect(after.querySelectorAll('tbody tr').length).toBe(40);
      expect(after.scrollTop).toBe(200);
    });
  });
});
