import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, MeService } from '../../../core/services';
import { resolveAvatarUrl } from '../../../core/brand-assets';
import { ChangePasswordComponent } from '../../../shared/components/change-password/change-password.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { NotificationSettingsComponent } from '../../../shared/components/notification-settings/notification-settings.component';
import { ProfileEditorComponent } from '../../../shared/components/profile-editor/profile-editor.component';
import { SavedCardsComponent } from '../../../shared/components/saved-cards/saved-cards.component';
import { ReferralCardComponent } from '../../../shared/components/referral-card/referral-card.component';
import { AffiliateLinkCardComponent } from '../../../shared/components/affiliate-link-card/affiliate-link-card.component';
import { ExamCountdownFormComponent } from '../../../shared/components/exam-countdown-form/exam-countdown-form.component';

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
    IconComponent,
    ImgFallbackDirective,
    ProfileEditorComponent,
    ChangePasswordComponent,
    NotificationSettingsComponent,
    SavedCardsComponent,
    ReferralCardComponent,
    AffiliateLinkCardComponent,
    ExamCountdownFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account.page.html',
})
export class AccountPage {
  readonly auth = inject(AuthService);
  private readonly me = inject(MeService);

  /** Reads the same `MeService.profile()` signal `app-profile-editor` already populates — no extra request. */
  readonly avatarSrc = computed(() =>
    resolveAvatarUrl(this.me.profile()?.avatarUrl ?? this.auth.user()?.avatar),
  );

  readonly sectionNav = [
    { fragment: 'profile', label: 'โปรไฟล์', icon: 'user' as const },
    { fragment: 'password', label: 'เปลี่ยนรหัสผ่าน', icon: 'lock' as const },
    { fragment: 'notifications', label: 'การแจ้งเตือน', icon: 'bell' as const },
    { fragment: 'cards', label: 'บัตรที่บันทึกไว้', icon: 'wallet' as const },
    { fragment: 'referral', label: 'ชวนเพื่อน', icon: 'tag' as const },
    { fragment: 'affiliate', label: 'พันธมิตร', icon: 'wallet' as const },
    { fragment: 'exam-countdown', label: 'โหมดใกล้สอบ', icon: 'flag' as const },
    { fragment: 'shortcuts', label: 'ทางลัด', icon: 'dashboard' as const },
  ];

  readonly shortcuts = [
    { href: '/library', emoji: '📚', label: 'คลังของฉัน', description: 'เอกสารที่ซื้อไว้แล้ว' },
    { href: '/orders', emoji: '🧾', label: 'คำสั่งซื้อ', description: 'ประวัติการสั่งซื้อทั้งหมด' },
    { href: '/wishlist', emoji: '💖', label: 'รายการที่อยากได้', description: 'เก็บไว้ซื้อทีหลัง' },
    // subscription-membership v2 §4: shortcut to the new subscription status page.
    { href: '/account/subscription', emoji: '📦', label: 'สมาชิกรายเดือน', description: 'ดูสถานะและจัดการสมาชิก' },
    { href: '/account/feedback', emoji: '🛠️', label: 'แจ้งปัญหา / ข้อเสนอแนะ', description: 'ส่งเรื่องถึงทีมงานและติดตามสถานะ' },
    // crm-core v1 §4.1: entry point to "ความเป็นส่วนตัวของฉัน" — view/opt-out/delete CRM data.
    { href: '/account/privacy', emoji: '🔒', label: 'ความเป็นส่วนตัวของฉัน', description: 'ดูและจัดการข้อมูลที่ระบบใช้แนะนำเอกสาร' },
  ];
}
