import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { signal } from '@angular/core';
import { WalletPage } from './wallet.page';
import { AuthService, OrderService, WalletService } from '../../../core/services';
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
});
