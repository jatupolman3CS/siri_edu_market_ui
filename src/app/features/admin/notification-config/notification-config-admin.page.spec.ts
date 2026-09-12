import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NotificationConfigAdminPage } from './notification-config-admin.page';
import {
  NotificationConfigError,
  NotificationConfigService,
  type NotificationEventConfigItem,
} from '../../../core/services';

/**
 * notification-master-config v1 §1.3 / §3.7 / §4.2 / §4.4 — the admin master page.
 *
 * The page is driven against a stubbed `NotificationConfigService` (the service's own HTTP
 * behaviour is covered in `notification-config.service.spec.ts`), so these specs are about what
 * the page renders and which request it builds: 18 rows, unsupported channels disabled, a switch
 * saving the *whole* row on flip, numbers saving on blur only, and a NzModal confirm for reset.
 */
let messages: { success: string[]; error: string[] };

/** §3.1 — the catalog as the API reports it, trimmed to the fields the page reads. */
const CATALOG: ReadonlyArray<
  Pick<NotificationEventConfigItem, 'eventKey' | 'audience' | 'group'> & {
    supportsEmail: boolean;
    supportsLine: boolean;
  }
> = [
  { eventKey: 'new_document_from_followed_seller', audience: 'buyer', group: 'content', supportsEmail: true, supportsLine: false },
  { eventKey: 'cart_add_digest', audience: 'seller', group: 'engagement', supportsEmail: true, supportsLine: true },
  { eventKey: 'qna_answer', audience: 'buyer', group: 'engagement', supportsEmail: true, supportsLine: false },
  { eventKey: 'qna_question', audience: 'seller', group: 'engagement', supportsEmail: true, supportsLine: true },
  { eventKey: 'review', audience: 'seller', group: 'engagement', supportsEmail: true, supportsLine: true },
  { eventKey: 'review_reply', audience: 'buyer', group: 'engagement', supportsEmail: true, supportsLine: false },
  { eventKey: 'seller_follow', audience: 'seller', group: 'engagement', supportsEmail: true, supportsLine: true },
  { eventKey: 'store_visit_digest', audience: 'seller', group: 'engagement', supportsEmail: true, supportsLine: true },
  { eventKey: 'wishlist_add_digest', audience: 'seller', group: 'engagement', supportsEmail: true, supportsLine: true },
  { eventKey: 'admin_document_submitted', audience: 'admin', group: 'moderation', supportsEmail: true, supportsLine: true },
  { eventKey: 'document_approved', audience: 'seller', group: 'moderation', supportsEmail: true, supportsLine: true },
  { eventKey: 'document_rejected', audience: 'seller', group: 'moderation', supportsEmail: true, supportsLine: true },
  { eventKey: 'document_submitted', audience: 'seller', group: 'moderation', supportsEmail: true, supportsLine: true },
  { eventKey: 'admin_payout_requested', audience: 'admin', group: 'payout', supportsEmail: true, supportsLine: true },
  { eventKey: 'payout', audience: 'seller', group: 'payout', supportsEmail: true, supportsLine: true },
  { eventKey: 'sale', audience: 'seller', group: 'payout', supportsEmail: true, supportsLine: true },
  { eventKey: 'announcement', audience: 'buyer', group: 'system', supportsEmail: true, supportsLine: false },
  { eventKey: 'tips', audience: 'buyer', group: 'system', supportsEmail: true, supportsLine: false },
];

function configItem(overrides: Partial<NotificationEventConfigItem> = {}): NotificationEventConfigItem {
  return {
    eventKey: 'review',
    label: 'มีรีวิวใหม่',
    description: 'เมื่อมีผู้ซื้อรีวิวเอกสารของคุณ',
    audience: 'seller',
    group: 'engagement',
    isEnabled: true,
    emailEnabled: true,
    lineEnabled: true,
    inAppEnabled: true,
    userOverridable: true,
    throttleWindowMinutes: 0,
    dailyCapPerRecipient: 0,
    supportsEmail: true,
    supportsLine: true,
    supportsInApp: true,
    hasTrigger: true,
    isCustomized: false,
    updatedAt: null,
    ...overrides,
  };
}

function fullCatalog(): NotificationEventConfigItem[] {
  return CATALOG.map((event) =>
    configItem({
      ...event,
      label: `การแจ้งเตือน ${event.eventKey}`,
      lineEnabled: false,
    }),
  );
}

function renderPage(items: NotificationEventConfigItem[]) {
  messages = { success: [], error: [] };

  TestBed.configureTestingModule({
    imports: [NotificationConfigAdminPage],
    providers: [
      {
        provide: NzMessageService,
        useValue: {
          success: (m: string) => messages.success.push(m),
          error: (m: string) => messages.error.push(m),
        },
      },
    ],
  });

  const config = TestBed.inject(NotificationConfigService);
  vi.spyOn(config, 'load').mockImplementation(async () => {
    config.setItemsForTest(items);
    return items;
  });
  const updateSpy = vi
    .spyOn(config, 'update')
    .mockImplementation(async (eventKey, request) => configItem({ eventKey, ...request }));
  const resetSpy = vi
    .spyOn(config, 'reset')
    .mockImplementation(async (eventKey) => configItem({ eventKey }));

  const fixture = TestBed.createComponent(NotificationConfigAdminPage);
  fixture.detectChanges();

  return { fixture, page: fixture.componentInstance, config, updateSpy, resetSpy };
}

function switchButton(fixture: { nativeElement: HTMLElement }, name: string): HTMLButtonElement {
  const element = fixture.nativeElement.querySelector<HTMLButtonElement>(
    `nz-switch[name="${name}"] button`,
  );
  if (!element) throw new Error(`switch not rendered: ${name}`);
  return element;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('NotificationConfigAdminPage (notification-master-config v1 §3.7)', () => {
  it('AC-15: renders all 18 catalog events, grouped', () => {
    const { fixture, page } = renderPage(fullCatalog());

    const rows = fixture.nativeElement.querySelectorAll('li');
    expect(rows.length).toBe(18);
    // §3.7 group mapping: content(1) + engagement(8) + moderation(4) + payout(3) + system(2).
    expect(page.groups().map((g) => g.key)).toEqual([
      'content',
      'engagement',
      'moderation',
      'payout',
      'system',
    ]);
    expect(page.groups().map((g) => g.items.length)).toEqual([1, 8, 4, 3, 2]);
  });

  it('§4.2: shows the mandated heading, description and column headers', () => {
    const { fixture } = renderPage(fullCatalog());
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('ตั้งค่าการแจ้งเตือนของระบบ');
    expect(text).toContain(
      'กำหนดว่าการแจ้งเตือนแต่ละประเภทจะส่งผ่านช่องทางใดบ้าง — ปิดที่นี่แล้วผู้ใช้จะเปิดเองไม่ได้',
    );
    for (const header of [
      'ประเภทการแจ้งเตือน',
      'ผู้รับ',
      'เปิดใช้งาน',
      'อีเมล',
      'LINE',
      'ในระบบ',
      'ผู้ใช้ปิดเองได้',
      'หน่วงเวลา (นาที)',
      'จำกัดต่อวัน',
    ]) {
      expect(text).toContain(header);
    }
  });

  it('§4.2: renders the Thai audience pill for each side of the app', () => {
    const { fixture } = renderPage([
      configItem({ eventKey: 'review', audience: 'seller' }),
      configItem({ eventKey: 'review_reply', audience: 'buyer', supportsLine: false }),
      configItem({ eventKey: 'admin_payout_requested', audience: 'admin' }),
    ]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('ผู้ขาย');
    expect(text).toContain('ผู้ซื้อ');
    expect(text).toContain('ผู้ดูแลระบบ');
  });

  it('AC-22: a channel the event does not support renders disabled', () => {
    const { fixture, page } = renderPage([
      configItem({ eventKey: 'review_reply', audience: 'buyer', supportsLine: false, lineEnabled: false }),
    ]);

    expect(switchButton(fixture, 'notif-config-line-review_reply').disabled).toBe(true);
    expect(switchButton(fixture, 'notif-config-email-review_reply').disabled).toBe(false);
    expect(page.switchDisabled(page.items()[0], 'lineEnabled')).toBe(true);
  });

  it('AC-22: an unsupported channel cannot be switched on even programmatically', () => {
    const { page, updateSpy } = renderPage([
      configItem({ eventKey: 'review_reply', supportsLine: false, lineEnabled: false }),
    ]);

    page.toggle(page.items()[0], 'lineEnabled', true);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('§4.4: flipping a switch PUTs the whole row, not just the changed field', async () => {
    const { fixture, page, updateSpy } = renderPage([
      configItem({ eventKey: 'review', throttleWindowMinutes: 30, dailyCapPerRecipient: 20 }),
    ]);

    // `[ngModel]` writes the initial value into the switch asynchronously, so let that land
    // before clicking — otherwise the click flips a switch that is still showing its default.
    await settle();
    fixture.detectChanges();

    switchButton(fixture, 'notif-config-email-review').click();
    await settle();

    expect(updateSpy).toHaveBeenCalledWith('review', {
      isEnabled: true,
      emailEnabled: false,
      lineEnabled: true,
      inAppEnabled: true,
      userOverridable: true,
      throttleWindowMinutes: 30,
      dailyCapPerRecipient: 20,
    });
    expect(messages.success).toContain('บันทึกการตั้งค่าแล้ว');
    expect(page.savingKey()).toBeNull();
  });

  it('§4.4: typing in a number field does not PUT — committing does', async () => {
    const { page, updateSpy } = renderPage([configItem({ eventKey: 'qna_question', dailyCapPerRecipient: 20 })]);
    const item = page.items()[0];

    page.setDailyCap(item, 5);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(page.isNumbersDirty(item)).toBe(true);

    page.commitNumbers(item);
    await settle();

    expect(updateSpy).toHaveBeenCalledWith('qna_question', expect.objectContaining({ dailyCapPerRecipient: 5 }));
  });

  it('§3.7: an out-of-range number is refused client-side with the contract sentence', () => {
    const { page, updateSpy } = renderPage([configItem({ eventKey: 'qna_question' })]);
    const item = page.items()[0];

    page.setThrottle(item, 20000);
    page.commitNumbers(item);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(messages.error).toContain('ระยะเวลาหน่วงต้องอยู่ระหว่าง 0 ถึง 10080 นาที');

    page.setThrottle(item, 0);
    page.setDailyCap(item, 5000);
    page.commitNumbers(item);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(messages.error).toContain('จำนวนสูงสุดต่อวันต้องอยู่ระหว่าง 0 ถึง 1000');
  });

  it('§6 fe-2 step 5: reset asks for confirmation through NzModal, never a native confirm()', async () => {
    const { fixture, page, resetSpy } = renderPage([configItem({ eventKey: 'review', isCustomized: true })]);
    const modal = fixture.debugElement.injector.get(NzModalService);
    const confirmSpy = vi
      .spyOn(modal, 'confirm')
      .mockImplementation((...args: Parameters<typeof modal.confirm>) => {
        const options = args[0] as { nzOnOk?: () => unknown } | undefined;
        void options?.nzOnOk?.();
        return {} as ReturnType<typeof modal.confirm>;
      });

    page.confirmReset(page.items()[0]);
    await settle();

    expect(confirmSpy).toHaveBeenCalled();
    expect(resetSpy).toHaveBeenCalledWith('review');
    expect(messages.success).toContain('บันทึกการตั้งค่าแล้ว');
  });

  it('§4.2: warns when a daily cap is set while the in-app channel is off', () => {
    const { fixture } = renderPage([
      configItem({ eventKey: 'qna_question', inAppEnabled: false, dailyCapPerRecipient: 20 }),
    ]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'การจำกัดจำนวนต่อวันทำงานเมื่อเปิดช่องทาง "ในระบบ" เท่านั้น',
    );
  });

  it('§4.2: a rejected save keeps the failure copy and adds the reason from the API', async () => {
    const { page, config } = renderPage([configItem({ eventKey: 'review' })]);
    vi.mocked(config.update).mockRejectedValue(
      new NotificationConfigError('การแจ้งเตือนนี้ไม่รองรับช่องทาง LINE', 400),
    );

    page.toggle(page.items()[0], 'emailEnabled', false);
    await settle();

    expect(messages.error[0]).toContain('บันทึกไม่สำเร็จ กรุณาลองใหม่');
    expect(messages.error[0]).toContain('การแจ้งเตือนนี้ไม่รองรับช่องทาง LINE');
    expect(page.savingKey()).toBeNull();
  });
});
