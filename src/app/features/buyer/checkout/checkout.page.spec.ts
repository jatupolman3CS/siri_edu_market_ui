import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BuyerCheckoutPage } from './checkout.page';
import { AuthService, CartService, OrderService, PaymentMethodService } from '../../../core/services';
import { idleActionState, type ActionState } from '../../../core/services/action-state';
import type { CartItem, DocumentItem, SavedPaymentMethod, Seller } from '../../../core/models';

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

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function render(paymentMethods: ReturnType<typeof fakePaymentMethods>) {
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
      { provide: NzMessageService, useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } },
    ],
  });

  const fixture = TestBed.createComponent(BuyerCheckoutPage);
  fixture.detectChanges();
  return { fixture, cart, orders };
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
