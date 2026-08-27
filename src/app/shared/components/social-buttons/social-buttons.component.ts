import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { AuthProvider } from '../../../core/services';
import { GoogleOauthConfigService } from '../../../core/services/google-oauth-config.service';

@Component({
  selector: 'app-social-buttons',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './social-buttons.component.html',
  styleUrl: './social-buttons.component.scss',
})
export class SocialButtonsComponent {
  private readonly googleConfig = inject(GoogleOauthConfigService);

  readonly select = output<AuthProvider>();

  /**
   * D-08: WAVE D connects a database and nothing else, so there is no Google OAuth client id.
   * The button used to look ready and only admit otherwise after being pressed. It now says so
   * before the press — disabled with the reason on it, not removed: hiding the button would hide
   * the gap as well (the S-07 rule), and the button has to come back on its own once a client id
   * is configured.
   */
  readonly googleAvailable = signal(true);

  constructor() {
    void this.checkGoogle();
  }

  private async checkGoogle(): Promise<void> {
    try {
      await this.googleConfig.ensureLoaded();
    } catch {
      /* an unreachable API is itself a reason the button cannot work */
    }
    this.googleAvailable.set(!!this.googleConfig.getClientId());
  }
}
