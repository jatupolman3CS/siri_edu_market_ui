import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { AuthProvider } from '../../../core/services';
import { GoogleOauthConfigService } from '../../../core/services/google-oauth-config.service';
import { OauthClientsService } from '../../../core/services/oauth-clients.service';

@Component({
  selector: 'app-social-buttons',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './social-buttons.component.html',
  styleUrl: './social-buttons.component.scss',
})
export class SocialButtonsComponent {
  private readonly googleConfig = inject(GoogleOauthConfigService);
  /**
   * external-login-and-mail-config v1 §4.1 — same source as Google (one shared request), but read
   * directly because LINE has no environment fallback: without a server-side channel secret the
   * callback cannot complete, and only the server knows whether that secret exists.
   */
  private readonly oauthClients = inject(OauthClientsService);

  readonly select = output<AuthProvider>();

  /**
   * D-08 originally kept this `true` by default and rendered the button disabled with a
   * "(ยังไม่ได้ตั้งค่า)" caption when Google wasn't configured (the S-07 rule: don't hide gaps).
   * Bug #5 (QA audit): a disabled, clearly-non-functional auth button shown to every visitor is
   * worse than briefly absent — the template now hides the button entirely while this is false,
   * so it defaults to `false` (hidden) until `checkProviders()` confirms a real client id, instead
   * of flashing a button that then has to disappear.
   */
  readonly googleAvailable = signal(false);
  /** AC-7: same rule for LINE — hidden until the server reports a usable login channel id. */
  readonly lineAvailable = signal(false);

  constructor() {
    void this.checkProviders();
  }

  private async checkProviders(): Promise<void> {
    try {
      // One `GET /api/auth/oauth-clients` answers for both providers — `GoogleOauthConfigService`
      // reads the very same service (§4.1), so awaiting it once is what settles both reads below.
      await this.oauthClients.ensureLoaded();
    } catch {
      /* an unreachable API is itself a reason the buttons cannot work */
    }
    // Google keeps going through its own service: the environment fallback for an unreachable API
    // (D-08b) lives there and applies to Google only.
    this.googleAvailable.set(!!this.googleConfig.getClientId());
    this.lineAvailable.set(!!this.oauthClients.lineLoginChannelId());
  }
}
