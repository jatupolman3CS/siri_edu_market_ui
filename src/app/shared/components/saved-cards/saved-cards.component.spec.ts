import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { SavedCardsComponent } from './saved-cards.component';
import { PaymentMethodService, OrderService } from '../../../core/services';
import { idleActionState, loadingActionState, errorActionState, type ActionState } from '../../../core/services/action-state';
import type { SavedPaymentMethod } from '../../../core/models';

/**
 * saved-credit-cards v1 (docs/contracts/saved-credit-cards.md §1 test list / §4) — AC-16/17/18.
 *
 * Drives `SavedCardsComponent` against a stubbed `PaymentMethodService` (a plain object with the
 * same signal/method shape, not the real `providedIn: 'root'` service) so the render/interaction
 * logic is exercised independently of the SDK calls — `PaymentMethodService`'s own spec covers
 * the real wiring against the generated SDK.
 */
function buildCards(): SavedPaymentMethod[] {
  return [
    {
      id: 'spm-1',
      stripePaymentMethodId: 'pm_1',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2099,
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'spm-2',
      stripePaymentMethodId: 'pm_2',
      brand: 'mastercard',
      last4: '4444',
      expMonth: 1,
      expYear: 2020,
      isDefault: false,
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ];
}

function fakePaymentMethods(initial: SavedPaymentMethod[] = [], initialState: ActionState = idleActionState()) {
  const list = signal<SavedPaymentMethod[]>(initial);
  const state = signal<ActionState>(initialState);
  return {
    list: list.asReadonly(),
    state: state.asReadonly(),
    refreshList: vi.fn(async () => {}),
    confirmSaved: vi.fn(async (): Promise<SavedPaymentMethod | null> => null),
    setDefault: vi.fn(async (): Promise<SavedPaymentMethod | null> => null),
    remove: vi.fn(async (): Promise<boolean> => true),
    createSetupIntent: vi.fn(async (): Promise<string | null> => null),
  };
}

type Messages = { success: string[]; warning: string[]; error: string[] };

function render(
  mode: 'manage' | 'select',
  fake: ReturnType<typeof fakePaymentMethods>,
  messages: Messages = { success: [], warning: [], error: [] },
) {
  TestBed.configureTestingModule({
    imports: [SavedCardsComponent],
    providers: [
      { provide: PaymentMethodService, useValue: fake },
      { provide: OrderService, useValue: { getStripePublishableKey: vi.fn(async () => null) } },
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

  const fixture = TestBed.createComponent(SavedCardsComponent);
  fixture.componentRef.setInput('mode', mode);
  fixture.detectChanges();
  return fixture;
}

/** Mirrors `categories-admin.page.spec.ts` — resolves NzModalService from the component's own
 * element injector (the component imports `NzModalModule` itself) and runs `nzOnOk` synchronously. */
function autoConfirmModal(fixture: { debugElement: { injector: { get: typeof TestBed.inject } } }): void {
  const modal = fixture.debugElement.injector.get(NzModalService);
  vi.spyOn(modal, 'confirm').mockImplementation((...args: Parameters<typeof modal.confirm>) => {
    const options = args[0] as { nzOnOk?: () => unknown } | undefined;
    void options?.nzOnOk?.();
    return {} as ReturnType<typeof modal.confirm>;
  });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => TestBed.resetTestingModule());

describe('SavedCardsComponent — manage mode (AC-18)', () => {
  it('calls refreshList() once on construction', () => {
    const fake = fakePaymentMethods([]);
    render('manage', fake);

    expect(fake.refreshList).toHaveBeenCalledTimes(1);
  });

  it('renders every card from the service stub: brand, last4, expiry, default + expired badges', () => {
    const fixture = render('manage', fakePaymentMethods(buildCards()));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('visa');
    expect(text).toContain('4242');
    expect(text).toContain('หมดอายุ 12/2099');
    expect(text).toContain('บัตรหลัก');

    expect(text).toContain('mastercard');
    expect(text).toContain('4444');
    expect(text).toContain('บัตรหมดอายุ');
  });

  it('shows the loading message while state is loading', () => {
    const fixture = render('manage', fakePaymentMethods([], loadingActionState()));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('กำลังโหลด');
  });

  it('shows "โหลดรายการบัตรไม่สำเร็จ" when state is error', () => {
    const fixture = render('manage', fakePaymentMethods([], errorActionState('โหลดรายการบัตรไม่สำเร็จ')));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('โหลดรายการบัตรไม่สำเร็จ');
  });

  it('shows the exact empty-state copy when there are no saved cards', () => {
    const fixture = render('manage', fakePaymentMethods([]));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('ยังไม่มีบัตรที่บันทึกไว้ — เพิ่มได้จากปุ่มด้านล่าง');
    expect(text).toContain('เพิ่มบัตรใหม่');
  });

  it('"ตั้งเป็นบัตรหลัก" calls paymentMethods.setDefault(id) then refreshes the list', async () => {
    const fake = fakePaymentMethods(buildCards());
    const fixture = render('manage', fake);
    fake.refreshList.mockClear();

    await fixture.componentInstance.setDefault('spm-2');

    expect(fake.setDefault).toHaveBeenCalledWith('spm-2');
    expect(fake.refreshList).toHaveBeenCalledTimes(1);
  });

  it('confirmRemove() asks for confirmation, then "ลบ" calls paymentMethods.remove(id) and toasts success', async () => {
    const fake = fakePaymentMethods(buildCards());
    const messages: Messages = { success: [], warning: [], error: [] };
    const fixture = render('manage', fake, messages);
    autoConfirmModal(fixture);
    fake.refreshList.mockClear();

    fixture.componentInstance.confirmRemove(buildCards()[0]);
    await settle();

    expect(fake.remove).toHaveBeenCalledWith('spm-1');
    expect(messages.success).toContain('ลบบัตรแล้ว');
    expect(fake.refreshList).toHaveBeenCalledTimes(1);
  });

  it('toasts "ลบบัตรไม่สำเร็จ" and does not refresh when remove() fails', async () => {
    const fake = fakePaymentMethods(buildCards());
    fake.remove.mockResolvedValueOnce(false);
    const messages: Messages = { success: [], warning: [], error: [] };
    const fixture = render('manage', fake, messages);
    autoConfirmModal(fixture);
    fake.refreshList.mockClear();

    fixture.componentInstance.confirmRemove(buildCards()[1]);
    await settle();

    expect(messages.error).toContain('ลบบัตรไม่สำเร็จ');
    expect(fake.refreshList).not.toHaveBeenCalled();
  });

  it('"เพิ่มบัตรใหม่" toasts "บันทึกบัตรไม่สำเร็จ" when createSetupIntent() returns null', async () => {
    const fake = fakePaymentMethods([]);
    const messages: Messages = { success: [], warning: [], error: [] };
    const fixture = render('manage', fake, messages);

    await fixture.componentInstance.openAddCard();

    expect(fake.createSetupIntent).toHaveBeenCalledTimes(1);
    expect(messages.error).toContain('บันทึกบัตรไม่สำเร็จ');
    expect(fixture.componentInstance.addingCard()).toBe(false);
  });
});

describe('SavedCardsComponent — select mode (AC-16/AC-17)', () => {
  it('renders a radio for every saved card plus "ใช้บัตรใหม่" always', () => {
    const fixture = render('select', fakePaymentMethods(buildCards()));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('visa');
    expect(text).toContain('mastercard');
    expect(text).toContain('ใช้บัตรใหม่');
  });

  it('renders nothing when there are no saved cards (no picker needed)', () => {
    const fixture = render('select', fakePaymentMethods([]));
    const radios = (fixture.nativeElement as HTMLElement).querySelectorAll('input[type="radio"]');

    expect(radios.length).toBe(0);
  });

  it('selectCard() updates the two-way bound `selected` model', () => {
    const fixture = render('select', fakePaymentMethods(buildCards()));

    fixture.componentInstance.selectCard('spm-1');

    expect(fixture.componentInstance.selected()).toBe('spm-1');
  });

  it('disables the radio for an expired card', () => {
    const fixture = render('select', fakePaymentMethods(buildCards()));
    const radios = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    );

    // spm-2 (mastercard, expired 1/2020) is the second card row; the trailing radio is "ใช้บัตรใหม่".
    expect(radios[1].disabled).toBe(true);
  });
});
