import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { LineNotificationComponent } from './line-notification.component';
import { LineNotificationService } from '../../../core/services';
import { idleActionState, loadingActionState, errorActionState, type ActionState } from '../../../core/services/action-state';
import type { LineConnectionStatus } from '../../../core/models';
import type { NotificationSettingResponse } from '../../../core/api/types.gen';

/**
 * line-notification-channel v1 (docs/contracts/line-notification-channel.md §1 test list / §5).
 *
 * Drives `LineNotificationComponent` against a stubbed `LineNotificationService` (a plain object
 * with the same signal/method shape, not the real `providedIn: 'root'` service) — same pattern as
 * `saved-cards.component.spec.ts` / `payout-account-form.component.spec.ts` — so render/interaction
 * logic is exercised independently of the service's own `TODO(contract)` stub body (that gets its
 * own coverage in `line-notification.service.spec.ts`).
 */
function statusFixture(overrides: Partial<LineConnectionStatus> = {}): LineConnectionStatus {
  return {
    isAvailable: true,
    isConnected: true,
    status: 'Connected',
    lineDisplayName: 'สมชาย ใจดี',
    connectedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  };
}

function settingsFixture(): NotificationSettingResponse[] {
  return [
    { key: 'sale', label: 'ขายได้', isEnabled: true },
    { key: 'review', label: 'รีวิวใหม่', isEnabled: false },
  ];
}

function fakeLineNotification(
  initialStatus: LineConnectionStatus | null = null,
  initialState: ActionState = idleActionState(),
  initialSettings: NotificationSettingResponse[] = [],
) {
  const status = signal<LineConnectionStatus | null>(initialStatus);
  const state = signal<ActionState>(initialState);
  const settingsSig = signal<NotificationSettingResponse[]>(initialSettings);
  return {
    status: status.asReadonly(),
    state: state.asReadonly(),
    settings: settingsSig.asReadonly(),
    _status: status,
    _state: state,
    _settings: settingsSig,
    loadStatus: vi.fn(),
    loadSettings: vi.fn(),
    updateSettings: vi.fn(async (): Promise<boolean> => true),
    connect: vi.fn(
      async (): Promise<{ ok: true; authorizeUrl: string } | { ok: false; error?: string }> => ({ ok: false }),
    ),
    disconnect: vi.fn(async (): Promise<boolean> => true),
    redirectToLine: vi.fn(),
  };
}

type Messages = { success: string[]; info: string[]; warning: string[]; error: string[] };

function render(
  fake: ReturnType<typeof fakeLineNotification>,
  messages: Messages = { success: [], info: [], warning: [], error: [] },
  query: Record<string, string> = {},
) {
  const navigate = vi.fn();
  TestBed.configureTestingModule({
    imports: [LineNotificationComponent],
    providers: [
      { provide: LineNotificationService, useValue: fake },
      { provide: Router, useValue: { navigate } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)) } },
      {
        provide: NzMessageService,
        useValue: {
          success: (m: string) => messages.success.push(m),
          info: (m: string) => messages.info.push(m),
          warning: (m: string) => messages.warning.push(m),
          error: (m: string) => messages.error.push(m),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(LineNotificationComponent);
  fixture.detectChanges();
  return { fixture, navigate };
}

/** Mirrors `saved-cards.component.spec.ts` — resolves NzModalService from the component's own
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

describe('LineNotificationComponent — render states (§5)', () => {
  it('calls loadStatus() and loadSettings() once on construction', () => {
    const fake = fakeLineNotification();
    render(fake);

    expect(fake.loadStatus).toHaveBeenCalledTimes(1);
    expect(fake.loadSettings).toHaveBeenCalledTimes(1);
  });

  it('shows "กำลังโหลด…" while status() is still null', () => {
    const { fixture } = render(fakeLineNotification(null));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('กำลังโหลด…');
    expect(el.querySelector('button')).toBeNull();
  });

  it('shows the inline error banner when state() is error, even before status() ever loads', () => {
    const { fixture } = render(fakeLineNotification(null, errorActionState('โหลดสถานะการเชื่อมต่อ LINE ไม่สำเร็จ')));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('โหลดสถานะการเชื่อมต่อ LINE ไม่สำเร็จ');
  });

  it('isAvailable=false shows "ฟีเจอร์นี้ยังไม่เปิดใช้งาน" and no connect button', () => {
    const { fixture } = render(fakeLineNotification(statusFixture({ isAvailable: false, status: 'NotConnected', isConnected: false, lineDisplayName: null, connectedAt: null })));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('ฟีเจอร์นี้ยังไม่เปิดใช้งาน');
    expect(el.querySelector('button')).toBeNull();
  });

  it('NotConnected shows only the "เชื่อมต่อ LINE" button, no toggles', () => {
    const { fixture } = render(fakeLineNotification(statusFixture({ status: 'NotConnected', isConnected: false, lineDisplayName: null, connectedAt: null })));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('เชื่อมต่อ LINE');
    expect(el.querySelectorAll('nz-switch').length).toBe(0);
  });

  it('Connected shows lineDisplayName, "ยกเลิกการเชื่อมต่อ" button, and every toggle', () => {
    const { fixture } = render(fakeLineNotification(statusFixture(), idleActionState(), settingsFixture()));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('สมชาย ใจดี');
    expect(text).toContain('ยกเลิกการเชื่อมต่อ');
    expect(text).toContain('ขายได้');
    expect(text).toContain('รีวิวใหม่');
  });

  it('Disconnected shows the warning banner and "เชื่อมต่อใหม่" button, no toggles', () => {
    const { fixture } = render(fakeLineNotification(statusFixture({ status: 'Disconnected', isConnected: false }), idleActionState(), settingsFixture()));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('การเชื่อมต่อ LINE ของคุณหยุดทำงาน');
    expect(el.textContent).toContain('เชื่อมต่อใหม่');
    expect(el.querySelectorAll('nz-switch').length).toBe(0);
  });
});

describe('LineNotificationComponent — connect() (§5)', () => {
  it('NotConnected: "เชื่อมต่อ LINE" calls connect() then redirectToLine(url) with the returned authorizeUrl', async () => {
    const fake = fakeLineNotification(statusFixture({ status: 'NotConnected', isConnected: false, lineDisplayName: null, connectedAt: null }));
    fake.connect.mockResolvedValueOnce({ ok: true, authorizeUrl: 'https://access.line.me/oauth2/v2.1/authorize?state=abc' });
    const { fixture } = render(fake);

    await fixture.componentInstance.connect();

    expect(fake.connect).toHaveBeenCalledTimes(1);
    expect(fake.redirectToLine).toHaveBeenCalledWith('https://access.line.me/oauth2/v2.1/authorize?state=abc');
  });

  it('Disconnected: "เชื่อมต่อใหม่" also calls connect() (no separate endpoint, §5)', async () => {
    const fake = fakeLineNotification(statusFixture({ status: 'Disconnected', isConnected: false }));
    fake.connect.mockResolvedValueOnce({ ok: true, authorizeUrl: 'https://access.line.me/oauth2/v2.1/authorize?state=xyz' });
    const { fixture } = render(fake);

    await fixture.componentInstance.connect();

    expect(fake.connect).toHaveBeenCalledTimes(1);
    expect(fake.redirectToLine).toHaveBeenCalledWith('https://access.line.me/oauth2/v2.1/authorize?state=xyz');
  });

  it('toasts "เชื่อมต่อ LINE ไม่สำเร็จ" and does not redirect when connect() resolves { ok: false } (no backend message)', async () => {
    const fake = fakeLineNotification(statusFixture({ status: 'NotConnected', isConnected: false, lineDisplayName: null, connectedAt: null }));
    const messages: Messages = { success: [], info: [], warning: [], error: [] };
    const { fixture } = render(fake, messages);

    await fixture.componentInstance.connect();

    expect(messages.error).toContain('เชื่อมต่อ LINE ไม่สำเร็จ');
    expect(fake.redirectToLine).not.toHaveBeenCalled();
  });

  it('§3.1: toasts the backend-provided message verbatim when connect() resolves { ok: false, error } (503 — LINE not configured)', async () => {
    const fake = fakeLineNotification(statusFixture({ status: 'NotConnected', isConnected: false, lineDisplayName: null, connectedAt: null }));
    fake.connect.mockResolvedValueOnce({ ok: false, error: 'บริการเชื่อมต่อ LINE ยังไม่เปิดใช้งานบนระบบนี้' });
    const messages: Messages = { success: [], info: [], warning: [], error: [] };
    const { fixture } = render(fake, messages);

    await fixture.componentInstance.connect();

    expect(messages.error).toContain('บริการเชื่อมต่อ LINE ยังไม่เปิดใช้งานบนระบบนี้');
    expect(messages.error).not.toContain('เชื่อมต่อ LINE ไม่สำเร็จ');
    expect(fake.redirectToLine).not.toHaveBeenCalled();
  });
});

describe('LineNotificationComponent — disconnect() (§5)', () => {
  it('confirmDisconnect() asks for confirmation, then confirming calls disconnect(), toasts success, and reloads status', async () => {
    const fake = fakeLineNotification(statusFixture());
    const messages: Messages = { success: [], info: [], warning: [], error: [] };
    const { fixture } = render(fake, messages);
    autoConfirmModal(fixture);
    fake.loadStatus.mockClear();

    fixture.componentInstance.confirmDisconnect();
    await settle();

    expect(fake.disconnect).toHaveBeenCalledTimes(1);
    expect(messages.success).toContain('ยกเลิกการเชื่อมต่อ LINE แล้ว');
    expect(fake.loadStatus).toHaveBeenCalledTimes(1);
  });

  it('toasts "ยกเลิกการเชื่อมต่อ LINE ไม่สำเร็จ" and does not reload status when disconnect() fails', async () => {
    const fake = fakeLineNotification(statusFixture());
    fake.disconnect.mockResolvedValueOnce(false);
    const messages: Messages = { success: [], info: [], warning: [], error: [] };
    const { fixture } = render(fake, messages);
    autoConfirmModal(fixture);
    fake.loadStatus.mockClear();

    fixture.componentInstance.confirmDisconnect();
    await settle();

    expect(messages.error).toContain('ยกเลิกการเชื่อมต่อ LINE ไม่สำเร็จ');
    expect(fake.loadStatus).not.toHaveBeenCalled();
  });
});

describe('LineNotificationComponent — toggle() (§5)', () => {
  it('sends the full key→boolean map (not just the changed key) and toasts success', async () => {
    const fake = fakeLineNotification(statusFixture(), idleActionState(), settingsFixture());
    const messages: Messages = { success: [], info: [], warning: [], error: [] };
    const { fixture } = render(fake, messages);

    fixture.componentInstance.toggle('review', true);
    await settle();

    expect(fake.updateSettings).toHaveBeenCalledWith({ settings: { sale: true, review: true } });
    expect(messages.success).toContain('อัปเดตการแจ้งเตือน LINE แล้ว');
  });

  it('does nothing when key is undefined', () => {
    const fake = fakeLineNotification(statusFixture(), idleActionState(), settingsFixture());
    const { fixture } = render(fake);

    fixture.componentInstance.toggle(undefined, true);

    expect(fake.updateSettings).not.toHaveBeenCalled();
  });
});

describe('LineNotificationComponent — query param handling (§5)', () => {
  it('line=connected: toasts success, reloads status, and clears the query param via replaceUrl', async () => {
    const fake = fakeLineNotification(statusFixture());
    const messages: Messages = { success: [], info: [], warning: [], error: [] };
    fake.loadStatus.mockClear();
    const { navigate } = render(fake, messages, { line: 'connected' });

    expect(messages.success).toContain('เชื่อมต่อ LINE สำเร็จ');
    expect(fake.loadStatus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: {}, replaceUrl: true }));
  });

  it('line=cancelled: shows a neutral info toast and clears the query param', () => {
    const fake = fakeLineNotification(statusFixture());
    const messages: Messages = { success: [], info: [], warning: [], error: [] };
    const { navigate } = render(fake, messages, { line: 'cancelled' });

    expect(messages.info).toContain('ยกเลิกการเชื่อมต่อ LINE');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: {}, replaceUrl: true }));
  });

  it('line=error(+reason): shows a generic Thai error toast and clears the query param', () => {
    const fake = fakeLineNotification(statusFixture());
    const messages: Messages = { success: [], info: [], warning: [], error: [] };
    const { navigate } = render(fake, messages, { line: 'error', reason: 'invalid_state' });

    expect(messages.error).toContain('เชื่อมต่อ LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: {}, replaceUrl: true }));
  });

  it('no line param: no toast, no navigate call', () => {
    const fake = fakeLineNotification(statusFixture());
    const messages: Messages = { success: [], info: [], warning: [], error: [] };
    const { navigate } = render(fake, messages, {});

    expect(messages.success).toEqual([]);
    expect(messages.info).toEqual([]);
    expect(messages.error).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });
});
