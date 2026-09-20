import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';

/**
 * F-08 (N-04): change your password while signed in.
 *
 * Before this the only route to a new password was "forgot password" and waiting for an email,
 * even for someone already holding a valid session. The server requires the current password
 * and revokes every refresh token on success, so this form ends by sending the user to the
 * sign-in page rather than pretending the session survived.
 */
@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [FormsModule, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-password.component.html',
  styles: [':host { display: block; }'],
})
export class ChangePasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  readonly translation = inject(TranslationService);

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  readonly saving = signal(false);

  /** Mirrors the server's rules. The server checks every one of them regardless. */
  validationError(): string | null {
    if (!this.currentPassword) return this.translation.t('shared.changePassword.currentPasswordRequired');
    if (this.newPassword.length < 8) return this.translation.t('shared.changePassword.minLength');
    if (this.newPassword === this.currentPassword) return this.translation.t('shared.changePassword.notSameAsCurrent');
    if (this.newPassword !== this.confirmPassword) return this.translation.t('shared.changePassword.confirmMismatch');
    return null;
  }

  async submit(): Promise<void> {
    const problem = this.validationError();
    if (problem) {
      this.message.warning(problem);
      return;
    }
    if (this.saving()) return;

    this.saving.set(true);
    try {
      await this.auth.changePassword({
        currentPassword: this.currentPassword,
        newPassword: this.newPassword,
        confirmPassword: this.confirmPassword,
      });

      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.message.success(this.translation.t('shared.changePassword.successRelogin'));
      void this.router.navigate(['/auth/login']);
    } catch {
      /* reported by AuthService through ApiFailureReporter */
    } finally {
      this.saving.set(false);
    }
  }
}
