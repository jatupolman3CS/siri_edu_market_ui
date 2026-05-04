import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services';
import { AuthLayoutComponent } from '../../../layouts/auth/auth-layout/auth-layout.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-auth-forgot-password',
  standalone: true,
  imports: [RouterLink, FormsModule, AuthLayoutComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forgot-password.page.html',
  styleUrl: './forgot-password.page.scss',
})
export class AuthForgotPasswordPage {
  private readonly auth = inject(AuthService);

  readonly email = signal<string>('');
  readonly sent = signal<boolean>(false);
  readonly error = signal<string>('');

  onSubmit(): void {
    this.error.set('');
    const r = this.auth.requestPasswordReset(this.email());
    if (!r.ok) {
      this.error.set(r.error ?? 'ส่งไม่สำเร็จ');
      return;
    }
    this.sent.set(true);
  }
}
