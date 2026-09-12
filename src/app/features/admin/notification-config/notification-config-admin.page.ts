import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import {
  DAILY_CAP_MAX,
  DAILY_CAP_MIN,
  NotificationConfigService,
  THROTTLE_WINDOW_MAX_MINUTES,
  THROTTLE_WINDOW_MIN_MINUTES,
  type NotificationAudience,
  type NotificationEventConfigItem,
  type UpdateNotificationEventConfigRequest,
} from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';

/** The five switches of one row — every one of them is a field of the §3.7 PUT body. */
export type NotificationConfigSwitch =
  | 'isEnabled'
  | 'emailEnabled'
  | 'lineEnabled'
  | 'inAppEnabled'
  | 'userOverridable';

/** Pending edits of the two numeric fields, kept per row until blur/confirm (§4.4). */
interface NumberDraft {
  throttleWindowMinutes: number;
  dailyCapPerRecipient: number;
}

export interface NotificationConfigGroup {
  key: string;
  label: string;
  items: NotificationEventConfigItem[];
}

/**
 * §3.7 group values. Unknown values (an event registered by a later wave per §3.9 before this
 * map is updated) fall back to the raw key rather than disappearing from the page.
 */
const GROUP_LABELS: Readonly<Record<string, string>> = {
  payout: 'การเงินและการถอนเงิน',
  moderation: 'การตรวจสอบเอกสาร',
  engagement: 'การมีส่วนร่วมกับร้านค้า',
  content: 'เนื้อหาใหม่',
  commerce: 'การซื้อขาย',
  system: 'ระบบ',
};

/** §4.2 — audience pill copy. */
const AUDIENCE_LABELS: Readonly<Record<NotificationAudience, string>> = {
  buyer: 'ผู้ซื้อ',
  seller: 'ผู้ขาย',
  admin: 'ผู้ดูแลระบบ',
};

const SAVE_OK_MESSAGE = 'บันทึกการตั้งค่าแล้ว';
const SAVE_FAILED_MESSAGE = 'บันทึกไม่สำเร็จ กรุณาลองใหม่';
const THROTTLE_RANGE_MESSAGE = 'ระยะเวลาหน่วงต้องอยู่ระหว่าง 0 ถึง 10080 นาที';
const DAILY_CAP_RANGE_MESSAGE = 'จำนวนสูงสุดต่อวันต้องอยู่ระหว่าง 0 ถึง 1000';

function toInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return fallback;
}

/**
 * notification-master-config v1 §3.7/§4.2/§4.4 — `/admin/notification-config`, the master
 * switchboard the user asked for ("อยากให้สามารถ Config ได้ด้วยว่าแต่ละการแจ้งเตือนจะส่งไปที่
 * email / line / ภายในระบบอย่างเดียว").
 *
 * Save semantics follow the job-toggle card on `/admin/settings`: a switch writes on flip, while
 * the two numeric fields write on blur or on the row's confirm button — never per keystroke.
 * Every write is a full-row PUT (§4.4), so each one sends the other six fields unchanged.
 */
@Component({
  selector: 'app-admin-notification-config',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    NzSwitchModule,
    NzModalModule,
    NzTooltipModule,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-config-admin.page.html',
  styleUrl: './notification-config-admin.page.scss',
})
export class NotificationConfigAdminPage {
  private readonly config = inject(NotificationConfigService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);

  readonly items = this.config.items;
  readonly loading = this.config.loading;
  readonly loaded = this.config.loaded;

  /** eventKey currently mid-request — disables that row and guards against double submits. */
  readonly savingKey = signal<string | null>(null);

  /** §4.4: numeric edits live here until they are committed, so typing never fires a PUT. */
  private readonly drafts = signal<Readonly<Record<string, NumberDraft>>>({});

  readonly throttleMin = THROTTLE_WINDOW_MIN_MINUTES;
  readonly throttleMax = THROTTLE_WINDOW_MAX_MINUTES;
  readonly dailyCapMin = DAILY_CAP_MIN;
  readonly dailyCapMax = DAILY_CAP_MAX;

  /**
   * Groups in the order the API sent them (§3.7 orders by group then eventKey), so the page does
   * not impose a second, competing ordering of its own.
   */
  readonly groups = computed<NotificationConfigGroup[]>(() => {
    const groups: NotificationConfigGroup[] = [];
    const byKey = new Map<string, NotificationConfigGroup>();

    for (const item of this.items()) {
      let group = byKey.get(item.group);
      if (!group) {
        group = { key: item.group, label: GROUP_LABELS[item.group] ?? item.group, items: [] };
        byKey.set(item.group, group);
        groups.push(group);
      }
      group.items.push(item);
    }

    return groups;
  });

  constructor() {
    void this.config.load();
  }

  audienceLabel(audience: NotificationAudience): string {
    return AUDIENCE_LABELS[audience];
  }

  isRowBusy(item: NotificationEventConfigItem): boolean {
    return this.savingKey() === item.eventKey;
  }

  /** §4.2: the only reason a channel switch is greyed out is that the event cannot use it at all. */
  supportsChannel(item: NotificationEventConfigItem, field: NotificationConfigSwitch): boolean {
    if (field === 'emailEnabled') return item.supportsEmail;
    if (field === 'lineEnabled') return item.supportsLine;
    if (field === 'inAppEnabled') return item.supportsInApp;
    return true;
  }

  switchDisabled(item: NotificationEventConfigItem, field: NotificationConfigSwitch): boolean {
    return this.isRowBusy(item) || !this.supportsChannel(item, field);
  }

  throttleDraft(item: NotificationEventConfigItem): number {
    return this.drafts()[item.eventKey]?.throttleWindowMinutes ?? item.throttleWindowMinutes;
  }

  dailyCapDraft(item: NotificationEventConfigItem): number {
    return this.drafts()[item.eventKey]?.dailyCapPerRecipient ?? item.dailyCapPerRecipient;
  }

  /** True while the row's numbers differ from the server's — drives the row's confirm button. */
  isNumbersDirty(item: NotificationEventConfigItem): boolean {
    return (
      this.throttleDraft(item) !== item.throttleWindowMinutes ||
      this.dailyCapDraft(item) !== item.dailyCapPerRecipient
    );
  }

  /** §4.2 warning: cap/throttle are counted from feed rows, so they do nothing without in-app. */
  showsCapWarning(item: NotificationEventConfigItem): boolean {
    return !item.inAppEnabled && item.dailyCapPerRecipient > 0;
  }

  setThrottle(item: NotificationEventConfigItem, value: unknown): void {
    this.patchDraft(item, {
      throttleWindowMinutes: toInteger(value, item.throttleWindowMinutes),
      dailyCapPerRecipient: this.dailyCapDraft(item),
    });
  }

  setDailyCap(item: NotificationEventConfigItem, value: unknown): void {
    this.patchDraft(item, {
      throttleWindowMinutes: this.throttleDraft(item),
      dailyCapPerRecipient: toInteger(value, item.dailyCapPerRecipient),
    });
  }

  /** Switches save on flip (same pattern as the job toggles on `/admin/settings`). */
  toggle(item: NotificationEventConfigItem, field: NotificationConfigSwitch, value: boolean): void {
    if (this.switchDisabled(item, field)) return;
    void this.save(item, { ...this.requestOf(item), [field]: value });
  }

  /** §4.4: called on blur and by the row's confirm button — never while typing. */
  commitNumbers(item: NotificationEventConfigItem): void {
    if (this.isRowBusy(item) || !this.isNumbersDirty(item)) return;

    const throttleWindowMinutes = this.throttleDraft(item);
    const dailyCapPerRecipient = this.dailyCapDraft(item);

    if (throttleWindowMinutes < this.throttleMin || throttleWindowMinutes > this.throttleMax) {
      this.message.error(THROTTLE_RANGE_MESSAGE);
      return;
    }
    if (dailyCapPerRecipient < this.dailyCapMin || dailyCapPerRecipient > this.dailyCapMax) {
      this.message.error(DAILY_CAP_RANGE_MESSAGE);
      return;
    }

    void this.save(item, { ...this.requestOf(item), throttleWindowMinutes, dailyCapPerRecipient });
  }

  /** §6 fe-2 step 5: confirm through NzModal — never a native `confirm()`. */
  confirmReset(item: NotificationEventConfigItem): void {
    this.modal.confirm({
      nzTitle: 'คืนค่าเริ่มต้น',
      nzContent: `คืนค่าการตั้งค่าของ "${item.label}" กลับเป็นค่าเริ่มต้นของระบบหรือไม่?`,
      nzOkText: 'คืนค่าเริ่มต้น',
      nzCancelText: 'ยกเลิก',
      nzOnOk: () => this.reset(item),
    });
  }

  private patchDraft(item: NotificationEventConfigItem, draft: NumberDraft): void {
    this.drafts.update((drafts) => ({ ...drafts, [item.eventKey]: draft }));
  }

  private clearDraft(eventKey: string): void {
    this.drafts.update((drafts) => {
      if (!(eventKey in drafts)) return drafts;
      const next = { ...drafts };
      delete next[eventKey];
      return next;
    });
  }

  /** §4.4: a PUT replaces the row, so the current value of every field has to travel with it. */
  private requestOf(item: NotificationEventConfigItem): UpdateNotificationEventConfigRequest {
    return {
      isEnabled: item.isEnabled,
      emailEnabled: item.emailEnabled,
      lineEnabled: item.lineEnabled,
      inAppEnabled: item.inAppEnabled,
      userOverridable: item.userOverridable,
      throttleWindowMinutes: item.throttleWindowMinutes,
      dailyCapPerRecipient: item.dailyCapPerRecipient,
    };
  }

  private async save(
    item: NotificationEventConfigItem,
    request: UpdateNotificationEventConfigRequest,
  ): Promise<void> {
    if (this.savingKey()) return;
    this.savingKey.set(item.eventKey);
    try {
      await this.config.update(item.eventKey, request);
      this.clearDraft(item.eventKey);
      this.message.success(SAVE_OK_MESSAGE);
    } catch (e) {
      this.message.error(this.failureText(e));
    } finally {
      this.savingKey.set(null);
    }
  }

  private async reset(item: NotificationEventConfigItem): Promise<void> {
    if (this.savingKey()) return;
    this.savingKey.set(item.eventKey);
    try {
      await this.config.reset(item.eventKey);
      this.clearDraft(item.eventKey);
      this.message.success(SAVE_OK_MESSAGE);
    } catch (e) {
      this.message.error(this.failureText(e));
    } finally {
      this.savingKey.set(null);
    }
  }

  /**
   * §4.2 fixes the failure toast, while the API answers a rejected write with the one sentence
   * that explains it (e.g. "การแจ้งเตือนนี้ไม่รองรับช่องทาง LINE"). Dropping that sentence would
   * leave an admin staring at a switch that silently refuses to move, so it is appended.
   */
  private failureText(error: unknown): string {
    const detail = error instanceof Error ? error.message.trim() : '';
    return detail && detail !== SAVE_FAILED_MESSAGE
      ? `${SAVE_FAILED_MESSAGE} — ${detail}`
      : SAVE_FAILED_MESSAGE;
  }
}
