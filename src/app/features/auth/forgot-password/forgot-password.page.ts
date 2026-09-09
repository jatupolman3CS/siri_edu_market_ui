import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services';
import { TranslationService, TranslatePipe } from '../../../core/i18n';
import { AuthLayoutComponent } from '../../../layouts/auth/auth-layout/auth-layout.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-auth-forgot-password',
  standalone: true,
  imports: [RouterLink, FormsModule, AuthLayoutComponent, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forgot-password.page.html',
  styleUrl: './forgot-password.page.scss',
})
export class AuthForgotPasswordPage {
  private readonly auth = inject(AuthService);
  readonly i18n = inject(TranslationService);

  readonly email = signal<string>('');
  readonly sent = signal<boolean>(false);
  readonly error = signal<string>('');

  readonly submitting = signal<boolean>(false);

  async onSubmit(): Promise<void> {
    if (this.submitting()) return;
    this.error.set('');
    this.submitting.set(true);
    try {
      const r = await this.auth.requestPasswordReset(this.email());
      if (!r.ok) {
        this.error.set(r.error ?? 'ส่งไม่สำเร็จ');
        return;
      }
      this.sent.set(true);
    } finally {
      this.submitting.set(false);
    }
  }
}
