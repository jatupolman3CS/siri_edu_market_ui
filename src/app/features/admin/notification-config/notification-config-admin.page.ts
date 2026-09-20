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
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
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

/** Fallback group label keys for groups not yet in i18n. */
const GROUP_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  payout: 'admin.notifConfig.groupPayout',
  moderation: 'admin.notifConfig.groupModeration',
  engagement: 'admin.notifConfig.groupEngagement',
  content: 'admin.notifConfig.groupContent',
  commerce: 'admin.notifConfig.groupCommerce',
  system: 'admin.notifConfig.groupSystem',
};

/** §4.2 — audience pill translation keys. */
const AUDIENCE_TRANSLATION_KEYS: Readonly<Record<NotificationAudience, string>> = {
  buyer: 'admin.notifConfig.audienceBuyer',
  seller: 'admin.notifConfig.audienceSeller',
  admin: 'admin.notifConfig.audienceAdmin',
};

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
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-config-admin.page.html',
  styleUrl: './notification-config-admin.page.scss',
})
export class NotificationConfigAdminPage {
  private readonly config = inject(NotificationConfigService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly translation = inject(TranslationService);

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
        const gKey = GROUP_TRANSLATION_KEYS[item.group];
        const gLabel = gKey ? this.translation.t(gKey) : item.group;
        group = { key: item.group, label: gLabel, items: [] };
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
    const key = AUDIENCE_TRANSLATION_KEYS[audience];
    return key ? this.translation.t(key) : audience;
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
      this.message.error(this.translation.t('admin.notifConfig.throttleRangeError'));
      return;
    }
    if (dailyCapPerRecipient < this.dailyCapMin || dailyCapPerRecipient > this.dailyCapMax) {
      this.message.error(this.translation.t('admin.notifConfig.dailyCapRangeError'));
      return;
    }

    void this.save(item, { ...this.requestOf(item), throttleWindowMinutes, dailyCapPerRecipient });
  }

  /** §6 fe-2 step 5: confirm through NzModal — never a native `confirm()`. */
  confirmReset(item: NotificationEventConfigItem): void {
    this.modal.confirm({
      nzTitle: this.translation.t('admin.notifConfig.confirmResetTitle'),
      nzContent: this.translation.t('admin.confirmResetConfig', { label: item.label }),
      nzOkText: this.translation.t('admin.notifConfig.confirmResetOk'),
      nzCancelText: this.translation.t('common.cancel'),
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
      this.message.success(this.translation.t('admin.notifConfig.saveSuccess'));
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
      this.message.success(this.translation.t('admin.notifConfig.saveSuccess'));
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
    const saveFailed = this.translation.t('admin.notifConfig.saveFailed');
    const detail = error instanceof Error ? error.message.trim() : '';
    return detail && detail !== saveFailed
      ? `${saveFailed} — ${detail}`
      : saveFailed;
  }
}
