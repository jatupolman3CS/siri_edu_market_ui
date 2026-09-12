import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import {
  NotificationService,
  type NotificationAudience,
  type NotificationSettingItem,
} from '../../../core/services';
import { IconComponent } from '../icon/icon.component';

export interface NotificationSettingGroup {
  audience: NotificationAudience;
  label: string;
  items: NotificationSettingItem[];
}

/** notification-master-config v1 §4.1: the card groups the keys by which side of the app they belong to. */
const AUDIENCE_ORDER: readonly NotificationAudience[] = ['buyer', 'seller', 'admin'];

const AUDIENCE_LABELS: Readonly<Record<NotificationAudience, string>> = {
  buyer: 'สำหรับผู้ซื้อ',
  seller: 'สำหรับผู้ขาย',
  admin: 'สำหรับผู้ดูแลระบบ',
};

/**
 * F-07: the notification switches, shared by /account and /seller/settings.
 *
 * Buyers could not reach these at all — the only page that called
 * `PUT /api/notifications/settings` was /seller/settings, behind the seller guard, so a buyer
 * had no way to turn off mail addressed to them.
 *
 * notification-master-config v1 §3.6/§4.1: the list is now the event catalog filtered to the
 * caller's roles, so it carries a description and an `isLocked` flag per key. A locked key is one
 * an admin switched off in the master config, or one the platform does not allow opting out of
 * (AC-20) — it renders disabled with its Thai reason, and it is left out of the PUT entirely,
 * which is exactly how the API treats it too.
 */
@Component({
  selector: 'app-notification-settings',
  standalone: true,
  imports: [FormsModule, NzSwitchModule, NzTooltipModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-settings.component.html',
  styles: [':host { display: block; }'],
})
export class NotificationSettingsComponent {
  readonly notifications = inject(NotificationService);
  private readonly message = inject(NzMessageService);

  readonly groups = computed<NotificationSettingGroup[]>(() => {
    const settings = this.notifications.settings();
    return AUDIENCE_ORDER.map((audience) => ({
      audience,
      label: AUDIENCE_LABELS[audience],
      items: settings.filter((setting) => setting.audience === audience),
    })).filter((group) => group.items.length > 0);
  });

  constructor() {
    this.notifications.loadSettings();
  }

  toggle(key: string | undefined, enabled: boolean): void {
    if (!key) return;

    const settings = this.notifications.settings();
    const target = settings.find((setting) => setting.key === key);
    // §3.6: a locked key is not the user's to change — the API drops it silently, so never send it.
    if (!target || target.isLocked) return;

    // The endpoint replaces the whole set, so every key has to go up on every toggle —
    // sending only the changed one would silently reset the others to their defaults.
    const map: Record<string, boolean> = {};
    for (const setting of settings) {
      const k = setting.key;
      if (!k || setting.isLocked) continue;
      map[k] = k === key ? enabled : setting.isEnabled;
    }

    this.notifications.updateSettings({ settings: map }).subscribe({
      next: () => this.message.success('อัปเดตการแจ้งเตือนแล้ว'),
      error: () => {
        /* reported by NotificationService through ApiFailureReporter */
      },
    });
  }
}
