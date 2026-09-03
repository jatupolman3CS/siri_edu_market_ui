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
   * D-08 originally kept this `true` by default and rendered the button disabled with a
   * "(ยังไม่ได้ตั้งค่า)" caption when Google wasn't configured (the S-07 rule: don't hide gaps).
   * Bug #5 (QA audit): a disabled, clearly-non-functional auth button shown to every visitor is
   * worse than briefly absent — the template now hides the button entirely while this is false,
   * so it defaults to `false` (hidden) until `checkGoogle()` confirms a real client id, instead of
   * flashing a button that then has to disappear.
   */
  readonly googleAvailable = signal(false);

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
