import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { MeService } from '../../../core/services';
import { LineNotificationComponent } from '../../../shared/components/line-notification/line-notification.component';
import { NotificationSettingsComponent } from '../../../shared/components/notification-settings/notification-settings.component';
import { PayoutAccountFormComponent } from '../../../shared/components/payout-account-form/payout-account-form.component';
import { ProfileEditorComponent } from '../../../shared/components/profile-editor/profile-editor.component';

/**
 * F-07: the profile block and the notification block moved to shared components so /account
 * could have them too. This page keeps only what is genuinely seller-specific — the studio
 * name shown beside the display name.
 *
 * seller-payout-account-self-service v1: the "บัญชีรับเงิน" section used to be a static
 * placeholder here (§0) — it is now `<app-payout-account-form />`, a real self-contained
 * component (own service, own state) rather than page-owned markup.
 *
 * line-notification-channel v1 (docs/contracts/line-notification-channel.md §5): "เชื่อมต่อ LINE"
 * is `<app-line-notification />`, a seller-only self-contained component — not shared with
 * `/account` (`<app-notification-settings />` above stays email-only, untouched).
 */
@Component({
  selector: 'app-seller-settings',
  standalone: true,
  imports: [
    TranslatePipe,
    ProfileEditorComponent,
    PayoutAccountFormComponent,
    NotificationSettingsComponent,
    LineNotificationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SellerSettingsPage {
  private readonly me = inject(MeService);

  readonly studioLabel = signal('');

  constructor() {
    this.me.loadProfile().subscribe({
      next: (p) => this.studioLabel.set(p.sellerProfile?.studioName ?? ''),
      error: () => {
        /* reported by MeService through ApiFailureReporter */
      },
    });
  }
}
