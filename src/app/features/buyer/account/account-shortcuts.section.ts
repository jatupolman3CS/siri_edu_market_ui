import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslationService } from '../../../core/i18n';

/**
 * The /account/shortcuts page — links to the buyer pages that live outside /account. Moved out
 * of account.page.html when each sidebar entry became its own child route.
 */
@Component({
  selector: 'app-account-shortcuts-section',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-shortcuts.section.html',
})
export class AccountShortcutsSection {
  private readonly i18n = inject(TranslationService);

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
