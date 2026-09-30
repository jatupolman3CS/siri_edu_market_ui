import { TestBed } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NotificationSettingsComponent } from './notification-settings.component';
import { NotificationService, type NotificationSettingItem } from '../../../core/services';

/**
 * notification-master-config v1 §1.3 / §3.6 / AC-20 — the per-user settings card on
 * `/account` and `/seller/settings`.
 *
 * A locked key is one an admin switched off in the master config, or one nobody may opt out of
 * (`payout`, `admin_payout_requested`). It has to render disabled with its Thai reason, and it
 * must not travel in the PUT — the API drops it silently, so sending it would only make the
 * request lie about what the user asked for.
 */
function setting(overrides: Partial<NotificationSettingItem> = {}): NotificationSettingItem {
  return {
    key: 'review',
    label: 'มีรีวิวใหม่',
    description: 'เมื่อมีผู้ซื้อรีวิวเอกสารของคุณ',
    isEnabled: true,
    audience: 'seller',
    isLocked: false,
    lockReason: null,
    ...overrides,
  };
}

function renderCard(settings: NotificationSettingItem[]) {
  TestBed.configureTestingModule({
    imports: [NotificationSettingsComponent],
    providers: [
      {
        provide: NzMessageService,
        useValue: { success: () => undefined, error: () => undefined },
      },
    ],
  });

  const notifications = TestBed.inject(NotificationService);
  vi.spyOn(notifications, 'loadSettings').mockImplementation(() => {
    notifications.setSettingsForTest(settings);
  });
  const updateSpy = vi.spyOn(notifications, 'updateSettings').mockReturnValue(of(settings));

  const fixture = TestBed.createComponent(NotificationSettingsComponent);
  fixture.detectChanges();

  return { fixture, component: fixture.componentInstance, updateSpy };
}

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('NotificationSettingsComponent (notification-master-config v1 §3.6)', () => {
  it('AC-20: a locked toggle renders disabled and shows its Thai reason', () => {
    const { fixture } = renderCard([
      setting({
        key: 'payout',
        label: 'อัปเดตสถานะการถอนเงิน',
        isLocked: true,
        lockReason: 'การแจ้งเตือนนี้จำเป็นต่อระบบ จึงปิดไม่ได้',
      }),
    ]);

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'nz-switch[name="notif-switch-payout"] button',
    );
    expect(button?.disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'การแจ้งเตือนนี้จำเป็นต่อระบบ จึงปิดไม่ได้',
    );
  });

  it('§3.6: renders the description of each key', () => {
    const { fixture } = renderCard([setting({ description: 'เมื่อมีผู้ซื้อรีวิวเอกสารของคุณ' })]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'เมื่อมีผู้ซื้อรีวิวเอกสารของคุณ',
    );
  });

  it('§4.1: groups the keys by audience', () => {
    const { fixture, component } = renderCard([
      setting({ key: 'review', audience: 'seller' }),
      setting({ key: 'review_reply', audience: 'buyer' }),
      setting({ key: 'admin_payout_requested', audience: 'admin' }),
    ]);

    expect(component.groups().map((g) => g.audience)).toEqual(['buyer', 'seller', 'admin']);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('สำหรับผู้ซื้อ');
    expect(text).toContain('สำหรับผู้ขาย');
    expect(text).toContain('สำหรับผู้ดูแลระบบ');
  });

  it('§3.6: a toggle sends every unlocked key and leaves the locked ones out', () => {
    const { component, updateSpy } = renderCard([
      setting({ key: 'review', isEnabled: true }),
      setting({ key: 'sale', isEnabled: false }),
      setting({ key: 'payout', isLocked: true, lockReason: 'ปิดโดยผู้ดูแลระบบ', isEnabled: true }),
    ]);

    component.toggle('review', false);

    expect(updateSpy).toHaveBeenCalledWith({ settings: { review: false, sale: false } });
  });

  it('§3.6: toggling a locked key is a no-op — nothing is sent', () => {
    const { component, updateSpy } = renderCard([
      setting({ key: 'payout', isLocked: true, lockReason: 'ปิดโดยผู้ดูแลระบบ' }),
    ]);

    component.toggle('payout', false);

    expect(updateSpy).not.toHaveBeenCalled();
  });
});

/**
 * responsive-ui v1.4 gate fix (G2-6) F148: the switches are `nzControl`led, so they show only the
 * server-confirmed `isEnabled` — a failed PUT (reported by NotificationService) leaves the switch
 * where it was, a successful one shows what the server answered with.
 */
describe('NotificationSettingsComponent — save-on-change (responsive v1.4 F148)', () => {
  function switchButton(fixture: { nativeElement: HTMLElement }, key: string): HTMLButtonElement {
    const button = fixture.nativeElement.querySelector<HTMLButtonElement>(`nz-switch[name="notif-switch-${key}"] button`);
    if (!button) throw new Error(`switch not rendered: ${key}`);
    return button;
  }

  /** `[ngModel]` writes into the switch on a microtask, so settle → render twice. */
  async function flush(fixture: { detectChanges: () => void }): Promise<void> {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 4; j++) await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }
  }

  it('a failed save keeps the switch on its saved value and toasts no success', async () => {
    const { fixture, component, updateSpy } = renderCard([setting({ key: 'review', isEnabled: true })]);
    const success = vi.spyOn(TestBed.inject(NzMessageService), 'success');
    updateSpy.mockReturnValue(throwError(() => new Error('500')));
    await flush(fixture);
    const button = switchButton(fixture, 'review');
    expect(button.classList.contains('ant-switch-checked')).toBe(true);

    button.click();
    await flush(fixture);

    expect(updateSpy).toHaveBeenCalledWith({ settings: { review: false } });
    expect(success).not.toHaveBeenCalled();
    expect(button.classList.contains('ant-switch-checked')).toBe(true);
    expect(component.savingKey()).toBeNull();
  });

  it('a successful save shows the value the server answered with', async () => {
    const { fixture, updateSpy } = renderCard([setting({ key: 'review', isEnabled: true })]);
    const notifications = TestBed.inject(NotificationService);
    const success = vi.spyOn(TestBed.inject(NzMessageService), 'success');
    updateSpy.mockImplementation((request) => {
      // mirrors NotificationService.updateSettings: settings() is replaced from the PUT response
      const saved = [setting({ key: 'review', isEnabled: request.settings?.['review'] ?? true })];
      notifications.setSettingsForTest(saved);
      return of(saved);
    });
    await flush(fixture);

    switchButton(fixture, 'review').click();
    await flush(fixture);

    expect(switchButton(fixture, 'review').classList.contains('ant-switch-checked')).toBe(false);
    expect(success).toHaveBeenCalledWith('อัปเดตการแจ้งเตือนแล้ว');
  });

  it('the flipped switch spins, stays put, and a second flip mid-save sends nothing', async () => {
    const { fixture, component, updateSpy } = renderCard([
      setting({ key: 'review', isEnabled: true }),
      setting({ key: 'sale', isEnabled: false }),
    ]);
    updateSpy.mockReturnValue(NEVER);
    await flush(fixture);

    switchButton(fixture, 'review').click();
    await flush(fixture);

    expect(switchButton(fixture, 'review').classList.contains('ant-switch-loading')).toBe(true);
    expect(switchButton(fixture, 'review').classList.contains('ant-switch-checked')).toBe(true);
    expect(switchButton(fixture, 'sale').classList.contains('ant-switch-loading')).toBe(false);

    component.toggle('sale', true);

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});
