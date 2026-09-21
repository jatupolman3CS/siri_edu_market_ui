import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, MeService, WalletService } from '../../../core/services';
import { resolveAvatarUrl } from '../../../core/brand-assets';
import { ChangePasswordComponent } from '../../../shared/components/change-password/change-password.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { NotificationSettingsComponent } from '../../../shared/components/notification-settings/notification-settings.component';
import { ProfileEditorComponent } from '../../../shared/components/profile-editor/profile-editor.component';
import { SavedCardsComponent } from '../../../shared/components/saved-cards/saved-cards.component';
import { ReferralCardComponent } from '../../../shared/components/referral-card/referral-card.component';
import { ExamCountdownFormComponent } from '../../../shared/components/exam-countdown-form/exam-countdown-form.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TranslatePipe, TranslationService } from '../../../core/i18n';

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
    ExamCountdownFormComponent,
    ThbPipe,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account.page.html',
})
export class AccountPage {
  readonly auth = inject(AuthService);
  private readonly me = inject(MeService);
  readonly wallet = inject(WalletService);
  private readonly i18n = inject(TranslationService);

  constructor() {
    void this.wallet.refreshSummary();
  }

  /** Reads the same `MeService.profile()` signal `app-profile-editor` already populates — no extra request. */
  readonly avatarSrc = computed(() =>
    resolveAvatarUrl(this.me.profile()?.avatarUrl ?? this.auth.user()?.avatar),
  );

  get sectionNav() {
    return [
      { fragment: 'profile', label: this.i18n.t('account.navProfile'), icon: 'user' as const },
      { fragment: 'password', label: this.i18n.t('account.navPassword'), icon: 'lock' as const },
      { fragment: 'notifications', label: this.i18n.t('account.navNotifications'), icon: 'bell' as const },
      { fragment: 'cards', label: this.i18n.t('account.navCards'), icon: 'wallet' as const },
      { fragment: 'wallet', label: this.i18n.t('account.navWallet'), icon: 'wallet' as const },
      { fragment: 'referral', label: this.i18n.t('account.navReferral'), icon: 'tag' as const },
      { fragment: 'exam-countdown', label: this.i18n.t('account.navExamCountdown'), icon: 'flag' as const },
      { fragment: 'shortcuts', label: this.i18n.t('account.navShortcuts'), icon: 'dashboard' as const },
    ];
  }

  get shortcuts() {
    return [
      { href: '/library', emoji: '📚', label: this.i18n.t('account.shortcutLibrary'), description: this.i18n.t('account.shortcutLibraryDesc') },
      { href: '/orders', emoji: '🧾', label: this.i18n.t('account.shortcutOrders'), description: this.i18n.t('account.shortcutOrdersDesc') },
      { href: '/wishlist', emoji: '💖', label: this.i18n.t('account.shortcutWishlist'), description: this.i18n.t('account.shortcutWishlistDesc') },
      { href: '/wallet', emoji: '💰', label: this.i18n.t('account.shortcutWallet'), description: this.i18n.t('account.shortcutWalletDesc') },
      { href: '/account/subscription', emoji: '📦', label: this.i18n.t('account.shortcutSubscription'), description: this.i18n.t('account.shortcutSubscriptionDesc') },
      { href: '/account/feedback', emoji: '🛠️', label: this.i18n.t('account.shortcutFeedback'), description: this.i18n.t('account.shortcutFeedbackDesc') },
      { href: '/account/privacy', emoji: '🔒', label: this.i18n.t('account.shortcutPrivacy'), description: this.i18n.t('account.shortcutPrivacyDesc') },
    ];
  }
}
