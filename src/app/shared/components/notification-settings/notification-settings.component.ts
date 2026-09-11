import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NotificationService } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';

/**
 * F-07: the notification switches, shared by /account and /seller/settings.
 *
 * Buyers could not reach these at all — the only page that called
 * `PUT /api/notifications/settings` was /seller/settings, behind the seller guard, so a buyer
 * had no way to turn off mail addressed to them.
 *
 * As of F-05 these switches are read: sale, review and payout are checked before anything is
 * sent. `tips` and `new_document_from_followed_seller` are still stored but never fire — see
 * CONFIGURATION.md.
 */
@Component({
  selector: 'app-notification-settings',
  standalone: true,
  imports: [FormsModule, NzSwitchModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-settings.component.html',
  styles: [':host { display: block; }'],
})
export class NotificationSettingsComponent {
  readonly notifications = inject(NotificationService);
  private readonly message = inject(NzMessageService);

  constructor() {
    this.notifications.loadSettings();
  }

  toggle(key: string | undefined, enabled: boolean): void {
    if (!key) return;

    // The endpoint replaces the whole set, so every key has to go up on every toggle —
    // sending only the changed one would silently reset the others to their defaults.
    const map: Record<string, boolean> = {};
    for (const setting of this.notifications.settings()) {
      const k = setting.key ?? '';
      if (!k) continue;
      map[k] = k === key ? enabled : !!setting.isEnabled;
    }

    this.notifications.updateSettings({ settings: map }).subscribe({
      next: () => this.message.success('อัปเดตการแจ้งเตือนแล้ว'),
      error: () => {
        /* reported by NotificationService through ApiFailureReporter */
      },
    });
  }
}
