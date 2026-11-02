import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService, MeService } from '../../../core/services';
import { resolveAvatarUrl } from '../../../core/brand-assets';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslatePipe, TranslationService } from '../../../core/i18n';
import { DisplayEmailPipe } from '../../../shared/pipes/display-email.pipe';

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
 *
 * This page is the shell: header + sidebar + `<router-outlet>`. Each sidebar entry opens its own
 * child page (account.routes.ts) rather than scrolling one long page to a fragment.
 */
@Component({
  selector: 'app-account',
  standalone: true,
  imports: [DisplayEmailPipe, RouterLink, RouterLinkActive, RouterOutlet, IconComponent, ImgFallbackDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account.page.html',
})
export class AccountPage {
  readonly auth = inject(AuthService);
  private readonly me = inject(MeService);
  private readonly i18n = inject(TranslationService);

  /** Reads the same `MeService.profile()` signal `app-profile-editor` already populates — no extra request. */
  readonly avatarSrc = computed(() =>
    resolveAvatarUrl(this.me.profile()?.avatarUrl ?? this.auth.user()?.avatar),
  );

  get sectionNav() {
    return [
      { path: 'profile', label: this.i18n.t('account.navProfile'), icon: 'user' as const },
      { path: 'password', label: this.i18n.t('account.navPassword'), icon: 'lock' as const },
      { path: 'notifications', label: this.i18n.t('account.navNotifications'), icon: 'bell' as const },
      { path: 'cards', label: this.i18n.t('account.navCards'), icon: 'wallet' as const },
      { path: 'wallet', label: this.i18n.t('account.navWallet'), icon: 'wallet' as const },
      { path: 'referral', label: this.i18n.t('account.navReferral'), icon: 'tag' as const },
      { path: 'exam-countdown', label: this.i18n.t('account.navExamCountdown'), icon: 'flag' as const },
    ];
  }

  /**
   * Account pages routed outside this shell (app.routes.ts). They replaced the old "shortcuts"
   * page, which only linked to these plus pages the header menu already carries.
   */
  get linkedNav() {
    return [
      { href: '/account/subscription', label: this.i18n.t('account.navSubscription'), icon: 'star' as const },
      { href: '/account/privacy', label: this.i18n.t('account.navPrivacy'), icon: 'shield' as const },
      { href: '/account/feedback', label: this.i18n.t('account.navFeedback'), icon: 'flag' as const },
    ];
  }
}
