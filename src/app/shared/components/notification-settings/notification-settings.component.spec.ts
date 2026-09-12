import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
