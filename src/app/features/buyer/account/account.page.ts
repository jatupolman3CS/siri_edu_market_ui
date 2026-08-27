import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services';
import { ChangePasswordComponent } from '../../../shared/components/change-password/change-password.component';
import { NotificationSettingsComponent } from '../../../shared/components/notification-settings/notification-settings.component';
import { ProfileEditorComponent } from '../../../shared/components/profile-editor/profile-editor.component';

/**
 * F-07 (N-03): the buyer's own account page.
 *
 * `PUT /api/me/profile` and `PUT /api/notifications/settings` both worked already, but the only
 * page that called either was /seller/settings — behind the seller guard. So anyone who signed
 * up to buy could not change their display name, their profile picture, or turn off email
 * addressed to them. There was no /account route at all.
 *
 * Almost all of this task was UI. The two sections are the shared components /seller/settings
 * now also uses, so neither page carries its own copy.
 */
@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    RouterLink,
    ProfileEditorComponent,
    ChangePasswordComponent,
    NotificationSettingsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account.page.html',
})
export class AccountPage {
  readonly auth = inject(AuthService);

  readonly shortcuts = [
    { href: '/library', emoji: '📚', label: 'คลังของฉัน', description: 'เอกสารที่ซื้อไว้แล้ว' },
    { href: '/orders', emoji: '🧾', label: 'คำสั่งซื้อ', description: 'ประวัติการสั่งซื้อทั้งหมด' },
    { href: '/wishlist', emoji: '💖', label: 'รายการที่อยากได้', description: 'เก็บไว้ซื้อทีหลัง' },
  ];
}
