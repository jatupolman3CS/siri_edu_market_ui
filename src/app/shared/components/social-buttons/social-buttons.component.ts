import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { AuthProvider } from '../../../core/services';
import { GoogleOauthConfigService } from '../../../core/services/google-oauth-config.service';
import { OauthClientsService } from '../../../core/services/oauth-clients.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-social-buttons',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './social-buttons.component.html',
  styleUrl: './social-buttons.component.scss',
})
export class SocialButtonsComponent {
  private readonly googleConfig = inject(GoogleOauthConfigService);
  private readonly oauthClients = inject(OauthClientsService);

  readonly select = output<AuthProvider>();

  readonly googleAvailable = signal(false);
  readonly lineAvailable = signal(false);

  constructor() {
    void this.checkProviders();
  }

  private async checkProviders(): Promise<void> {
    try {
      await this.oauthClients.ensureLoaded();
    } catch {
      /* an unreachable API is itself a reason the buttons cannot work */
    }
    const googleId = this.googleConfig.getClientId();
    this.googleAvailable.set(!!googleId);
    const lineId = this.oauthClients.lineLoginChannelId();
    this.lineAvailable.set(!!lineId);
  }
}
