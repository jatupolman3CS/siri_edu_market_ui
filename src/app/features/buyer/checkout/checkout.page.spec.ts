import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BuyerCheckoutPage } from './checkout.page';
import {
  AuthService,
  CartService,
  OrderService,
  PaymentMethodService,
  ReferralService,
  WalletService,
} from '../../../core/services';
import { idleActionState, type ActionState } from '../../../core/services/action-state';
import type {
  CartItem,
  DocumentItem,
  ReferralCodeValidation,
  ReferralSummary,
  SavedPaymentMethod,
  Seller,
  WalletSummary,
} from '../../../core/models';
import { REFERRAL_HINT_STORAGE_KEY } from '../../../core/util/referral-capture';
import { AFFILIATE_STORAGE_KEY } from '../../../core/util/affiliate-capture';

if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

/**
 * saved-credit-cards v1 (docs/contracts/saved-credit-cards.md §4) — AC-16/AC-17.
 *
 * Drives `BuyerCheckoutPage` against stubbed `CartService`/`AuthService`/`OrderService`/
 * `PaymentMethodService` so the render/selection logic (whether the saved-card picker shows, the
 * default preselection, and the "บันทึกบัตรนี้ไว้..." checkbox visibility) is exercised without a
 * live SDK — `OrderService`/`PaymentMethodService` each have their own spec covering the real
 * network layer.
 */
function seller(): Seller {
  return {
    id: 'seller-1',
    studioName: 'ครูเอ',
    ownerName: 'เอ',
    avatar: '',
    bio: '',
    joinedAt: '2026-01-01T00:00:00Z',
    rating: 4.5,
    totalSales: 10,
    totalDocuments: 5,
    followerCount: 20,
    responseHours: 1,
    badges: [],
  };
}

function cartItem(): CartItem {
  const document: DocumentItem = {
    id: 'doc-1',
    slug: 'doc-1',
    title: 'สรุปคณิตศาสตร์ ม.6',
    shortDescription: '',
    description: '',
    cover: '',
    gallery: [],
    price: 150,
    format: 'pdf',
    pages: 20,
    fileSize: '',
    language: 'th',
    categoryIds: [],
    gradeLevels: [],
    resourceType: 'lesson-summary',
    tags: [],
    rating: 4.5,
    reviewCount: 10,
    downloads: 100,
    status: 'approved',
    watermarkEnabled: false,
    previewPages: 0,
    seller: seller(),
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    reviews: [],
  };
  return { document, addedAt: '2026-01-01T00:00:00Z' };
}

function buildCards(): SavedPaymentMethod[] {
  return [
    {
      id: 'spm-1',
      stripePaymentMethodId: 'pm_1',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2099,
      isDefault: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'spm-2',
      stripePaymentMethodId: 'pm_2',
      brand: 'mastercard',
      last4: '4444',
      expMonth: 6,
      expYear: 2099,
      isDefault: true,
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ];
}

function fakeCart() {
  const items = signal<CartItem[]>([cartItem()]);
  return {
    items: items.asReadonly(),
    count: () => items().length,
    subtotal: () => 150,
    savings: () => 0,
    vatIncluded: () => 10,
    total: () => 150,
    clear: vi.fn(),
    remove: vi.fn(),
  };
}

function fakePaymentMethods(initial: SavedPaymentMethod[] = []) {
  const list = signal<SavedPaymentMethod[]>(initial);
  const state = signal<ActionState>(idleActionState());
  return {
    list: list.asReadonly(),
    state: state.asReadonly(),
    refreshList: vi.fn(async () => {}),
    confirmSaved: vi.fn(async (): Promise<SavedPaymentMethod | null> => null),
    setDefault: vi.fn(async (): Promise<SavedPaymentMethod | null> => null),
    remove: vi.fn(async (): Promise<boolean> => false),
    createSetupIntent: vi.fn(async (): Promise<string | null> => null),
  };
}

/** buyer-wallet v1 §4.4/§4.2 — mirrors `WalletService`'s public surface used by checkout. */
function fakeWalletService(initialSummary: WalletSummary | null = null) {
  const summary = signal<WalletSummary | null>(initialSummary);
  return {
    summary: summary.asReadonly(),
    refreshSummary: vi.fn(async () => {}),
    setSummary: (s: WalletSummary | null) => summary.set(s),
  };
}

function fakeReferralService(initialSummary: ReferralSummary | null = null) {
  const summary = signal<ReferralSummary | null>(initialSummary);
  const state = signal<ActionState>(idleActionState());
  return {
    summary: summary.asReadonly(),
    state: state.asReadonly(),
    refreshSummary: vi.fn(async () => {}),
    validateCode: vi.fn(async (code: string): Promise<ReferralCodeValidation> => {
      if (code === 'FRIEND20') {
        return { valid: true, discountAmount: 20 };
      }
      return { valid: false, reasonText: 'ไม่พบโค้ดแนะนำเพื่อนนี้' };
    }),
    setSummary: (s: ReferralSummary | null) => summary.set(s),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function render(
  paymentMethods: ReturnType<typeof fakePaymentMethods> = fakePaymentMethods([]),
  referral: ReturnType<typeof fakeReferralService> = fakeReferralService(),
  wallet: ReturnType<typeof fakeWalletService> = fakeWalletService(),
) {
  const cart = fakeCart();
  const orders = {
    checkoutState: signal(idleActionState()).asReadonly(),
    getStripePublishableKey: vi.fn(async () => 'pk_test_123'),
    create: vi.fn(),
    resetCheckout: vi.fn(),
  };

  TestBed.configureTestingModule({
    imports: [BuyerCheckoutPage],
    providers: [
      provideRouter([]),
      { provide: CartService, useValue: cart },
      { provide: AuthService, useValue: { isAuthenticated: () => true } },
      { provide: OrderService, useValue: orders },
      { provide: PaymentMethodService, useValue: paymentMethods },
      { provide: ReferralService, useValue: referral },
      { provide: WalletService, useValue: wallet },
      { provide: NzMessageService, useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } },
    ],
  });

  const fixture = TestBed.createComponent(BuyerCheckoutPage);
  fixture.detectChanges();
  return { fixture, cart, orders, referral, wallet };
}

afterEach(() => TestBed.resetTestingModule());

describe('BuyerCheckoutPage — saved cards at checkout (AC-16)', () => {
  it('shows the saved-card picker and preselects the default card when the buyer has ≥1 saved card', async () => {
    const { fixture } = render(fakePaymentMethods(buildCards()));
    await settle();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedSavedCardId()).toBe('spm-2');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('visa');
    expect(text).toContain('mastercard');
    expect(text).toContain('ใช้บัตรใหม่');
  });

  it('defaults to "new" (no picker shown) when the buyer has no saved cards', async () => {
    const { fixture } = render(fakePaymentMethods([]));
    await settle();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedSavedCardId()).toBe('new');
    const radios = (fixture.nativeElement as HTMLElement).querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(0);
  });
});

describe('BuyerCheckoutPage — new-card save checkbox (AC-17)', () => {
  it('shows the "บันทึกบัตรนี้ไว้สำหรับชำระเงินครั้งถัดไป" checkbox only on the "ใช้บัตรใหม่" path', async () => {
    const { fixture } = render(fakePaymentMethods(buildCards()));
    await settle();
    fixture.detectChanges();

    // Default path preselects the saved card — no checkbox.
    expect(fixture.componentInstance.selectedSavedCardId()).toBe('spm-2');
    let text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('บันทึกบัตรนี้ไว้สำหรับชำระเงินครั้งถัดไป');

    fixture.componentInstance.selectedSavedCardId.set('new');
    fixture.detectChanges();

    text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('บันทึกบัตรนี้ไว้สำหรับชำระเงินครั้งถัดไป');

    fixture.componentInstance.selectedSavedCardId.set('spm-1');
    fixture.detectChanges();

    text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('บันทึกบัตรนี้ไว้สำหรับชำระเงินครั้งถัดไป');
  });
});

describe('BuyerCheckoutPage — startPayment() saved-card path', () => {
  it('creates the order with savedPaymentMethodId when a saved card is selected', async () => {
    const { fixture, orders } = render(fakePaymentMethods(buildCards()));
    await settle();
    fixture.detectChanges();

    orders.create.mockResolvedValueOnce({
      ok: false,
      status: 404,
      message: 'บัตรที่เลือกไม่พบ หรือไม่ใช่ของคุณ',
    });

    await fixture.componentInstance.startPayment();

    expect(orders.create).toHaveBeenCalledWith({ savedPaymentMethodId: 'spm-2' });
  });

  it('creates the order with saveNewCard when paying with a new card', async () => {
    const { fixture, orders } = render(fakePaymentMethods([]));
    await settle();
    fixture.detectChanges();

    fixture.componentInstance.saveNewCard.set(true);
    orders.create.mockResolvedValueOnce({ ok: false, status: 500 });

    await fixture.componentInstance.startPayment();

    expect(orders.create).toHaveBeenCalledWith({ saveNewCard: true });
  });
});

describe('BuyerCheckoutPage — referral program (referral-program.md §4 & §6)', () => {
  beforeEach(() => {
    localStorage.removeItem(REFERRAL_HINT_STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(REFERRAL_HINT_STORAGE_KEY);
  });

  it('toggles referral input when "มีโค้ดแนะนำเพื่อน?" is clicked', async () => {
    const { fixture } = render();
    await settle();
    fixture.detectChanges();

    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    const toggleBtn = buttons.find((b) => b.textContent?.includes('มีโค้ดแนะนำเพื่อน?'));
    expect(toggleBtn).toBeDefined();

    toggleBtn?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector('input[placeholder="กรอกโค้ดแนะนำเพื่อน"]');
    expect(input).not.toBeNull();
  });

  it('prefills and validates code immediately when referral hint exists in localStorage', async () => {
    localStorage.setItem(REFERRAL_HINT_STORAGE_KEY, 'FRIEND20');
    const referral = fakeReferralService();
    const { fixture } = render(fakePaymentMethods([]), referral);
    await settle();
    fixture.detectChanges();

    expect(fixture.componentInstance.showReferralInput()).toBe(true);
    expect(fixture.componentInstance.referralCode()).toBe('FRIEND20');
    expect(referral.validateCode).toHaveBeenCalledWith('FRIEND20');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('✓ ใช้โค้ดนี้ได้ ลด 20 บาท');
  });

  it('shows valid discount text when code validates successfully', async () => {
    const referral = fakeReferralService();
    const { fixture } = render(fakePaymentMethods([]), referral);
    await settle();
    fixture.componentInstance.showReferralInput.set(true);
    fixture.detectChanges();

    await fixture.componentInstance.validateReferralCode('FRIEND20');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('✓ ใช้โค้ดนี้ได้ ลด 20 บาท');
    expect(fixture.componentInstance.referralValidation()?.valid).toBe(true);
  });

  it('shows error reason text when code validation fails', async () => {
    const referral = fakeReferralService();
    const { fixture } = render(fakePaymentMethods([]), referral);
    await settle();
    fixture.componentInstance.showReferralInput.set(true);
    fixture.detectChanges();

    await fixture.componentInstance.validateReferralCode('INVALID99');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ไม่พบโค้ดแนะนำเพื่อนนี้');
    expect(fixture.componentInstance.referralValidation()?.valid).toBe(false);
  });

  it('shows credit checkbox only when unusedCreditCount > 0', async () => {
    const referralService = fakeReferralService({
      code: 'MYCODE1',
      shareUrl: 'http://localhost:4200/marketplace?ref=MYCODE1',
      totalReferred: 0,
      unusedCreditCount: 0,
      unusedCreditTotal: 0,
    });
    const { fixture } = render(fakePaymentMethods([]), referralService);
    await settle();
    fixture.detectChanges();

    let text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ใช้เครดิตแนะนำเพื่อน');

    referralService.setSummary({
      code: 'MYCODE2',
      shareUrl: 'http://localhost:4200/marketplace?ref=MYCODE2',
      totalReferred: 2,
      unusedCreditCount: 1,
      unusedCreditTotal: 20,
    });
    fixture.detectChanges();

    text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ใช้เครดิตแนะนำเพื่อน (20 บาท)');
  });

  it('includes referralCode in orders.create only when code is valid', async () => {
    const referral = fakeReferralService();
    const { fixture, orders } = render(fakePaymentMethods([]), referral);
    await settle();

    // Invalid code -> should NOT be sent
    fixture.componentInstance.showReferralInput.set(true);
    await fixture.componentInstance.validateReferralCode('INVALID99');
    fixture.detectChanges();

    orders.create.mockResolvedValueOnce({ ok: false, status: 500 });
    await fixture.componentInstance.startPayment();

    expect(orders.create).toHaveBeenCalledWith({
      saveNewCard: false,
    });

    // Valid code -> SHOULD be sent
    orders.create.mockClear();
    await fixture.componentInstance.validateReferralCode('FRIEND20');
    fixture.detectChanges();

    orders.create.mockResolvedValueOnce({ ok: false, status: 500 });
    await fixture.componentInstance.startPayment();

    expect(orders.create).toHaveBeenCalledWith({
      saveNewCard: false,
      referralCode: 'FRIEND20',
    });
  });

  it('includes useReferralCredit in orders.create when credit checkbox is checked', async () => {
    const referral = fakeReferralService({
      code: 'MYCODE',
      shareUrl: 'http://localhost:4200/marketplace?ref=MYCODE',
      totalReferred: 1,
      unusedCreditCount: 1,
      unusedCreditTotal: 20,
    });
    const { fixture, orders } = render(fakePaymentMethods([]), referral);
    await settle();

    fixture.componentInstance.useReferralCredit.set(true);
    fixture.detectChanges();

    orders.create.mockResolvedValueOnce({ ok: false, status: 500 });
    await fixture.componentInstance.startPayment();

    expect(orders.create).toHaveBeenCalledWith({
      saveNewCard: false,
      useReferralCredit: true,
    });
  });

  it('includes affiliateClickToken in orders.create when token is present in storage', async () => {
    localStorage.setItem(
      AFFILIATE_STORAGE_KEY,
      JSON.stringify({
        code: 'PARTNER99',
        clickToken: 'click-token-12345',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    );

    const referral = fakeReferralService();
    const { fixture, orders } = render(fakePaymentMethods([]), referral);
    await settle();

    orders.create.mockResolvedValueOnce({ ok: false, status: 500 });
    await fixture.componentInstance.startPayment();

    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        saveNewCard: false,
        affiliateClickToken: 'click-token-12345',
      }),
    );

    localStorage.removeItem(AFFILIATE_STORAGE_KEY);
  });
});

describe('BuyerCheckoutPage — pay with wallet (buyer-wallet v1 §4.4, AC-26)', () => {
  it('shows the wallet balance and enables selection when the balance covers the total', async () => {
    const wallet = fakeWalletService({ balance: 200, asOf: '2026-09-15T00:00:00Z' });
    const { fixture } = render(fakePaymentMethods([]), fakeReferralService(), wallet);
    await settle();
    fixture.detectChanges();

    expect(fixture.componentInstance.isWalletInsufficient()).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('จ่ายด้วยกระเป๋าเงิน');

    fixture.componentInstance.selectWallet();
    fixture.detectChanges();

    expect(fixture.componentInstance.payWithWallet()).toBe(true);
  });

  it('disables selection and shows the insufficient-balance message + top-up link when balance < total', async () => {
    const wallet = fakeWalletService({ balance: 50, asOf: '2026-09-15T00:00:00Z' });
    const { fixture } = render(fakePaymentMethods([]), fakeReferralService(), wallet);
    await settle();
    fixture.detectChanges();

    expect(fixture.componentInstance.isWalletInsufficient()).toBe(true);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยอดเงินไม่พอ');
    expect(text).toContain('เติมเงิน');

    fixture.componentInstance.selectWallet();
    fixture.detectChanges();

    // Guarded client-side too — selection must not flip when insufficient.
    expect(fixture.componentInstance.payWithWallet()).toBe(false);
  });

  it('startPayment() sends payWithWallet:true and nothing else when wallet is selected', async () => {
    const wallet = fakeWalletService({ balance: 200, asOf: '2026-09-15T00:00:00Z' });
    const { fixture, orders } = render(fakePaymentMethods([]), fakeReferralService(), wallet);
    await settle();
    fixture.detectChanges();

    fixture.componentInstance.selectWallet();
    orders.create.mockResolvedValueOnce({
      ok: true,
      order: { id: 'order-1', status: 'paid' },
    });

    await fixture.componentInstance.startPayment();

    expect(orders.create).toHaveBeenCalledWith({ payWithWallet: true });
  });

  it('resets back to the "new card" path when a wallet payment attempt fails', async () => {
    const wallet = fakeWalletService({ balance: 200, asOf: '2026-09-15T00:00:00Z' });
    const { fixture, orders } = render(fakePaymentMethods([]), fakeReferralService(), wallet);
    await settle();
    fixture.detectChanges();

    fixture.componentInstance.selectWallet();
    orders.create.mockResolvedValueOnce({ ok: false, status: 400, message: 'ยอดเงินไม่พอ' });

    await fixture.componentInstance.startPayment();

    expect(fixture.componentInstance.payWithWallet()).toBe(false);
    expect(fixture.componentInstance.selectedSavedCardId()).toBe('new');
  });
});


