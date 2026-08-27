import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MeService } from '../../../core/services';
import { NotificationSettingsComponent } from '../../../shared/components/notification-settings/notification-settings.component';
import { ProfileEditorComponent } from '../../../shared/components/profile-editor/profile-editor.component';

/**
 * F-07: the profile block and the notification block moved to shared components so /account
 * could have them too. This page keeps only what is genuinely seller-specific — the studio
 * name shown beside the display name, and the note about bank details.
 */
@Component({
  selector: 'app-seller-settings',
  standalone: true,
  imports: [ProfileEditorComponent, NotificationSettingsComponent],
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
