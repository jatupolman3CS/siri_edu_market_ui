import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services';
import { AuthLayoutComponent } from '../../../layouts/auth/auth-layout/auth-layout.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

/**
 * GAP-03: redeems the token from the emailed reset link. Password recovery previously
 * had no backend at all, so this screen did not exist.
 */
@Component({
  selector: 'app-auth-reset-password',
  standalone: true,
  imports: [RouterLink, FormsModule, AuthLayoutComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reset-password.page.html',
  styleUrl: './reset-password.page.scss',
})
export class AuthResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly token = signal<string>('');
  readonly password = signal<string>('');
  readonly confirmPassword = signal<string>('');
  readonly error = signal<string>('');
  readonly submitting = signal<boolean>(false);
  readonly done = signal<boolean>(false);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.token.set(params.get('token') ?? '');
    });
  }

  async onSubmit(): Promise<void> {
    if (this.submitting()) return;
    this.error.set('');

    if (!this.token()) {
      this.error.set('ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง');
      return;
    }

    this.submitting.set(true);
    try {
      const result = await this.auth.resetPassword(
        this.token(),
        this.password(),
        this.confirmPassword(),
      );
      if (!result.ok) {
        this.error.set(result.error ?? 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ');
        return;
      }
      this.done.set(true);
    } finally {
      this.submitting.set(false);
    }
  }

  goToLogin(): void {
    void this.router.navigate(['/auth/login']);
  }
}
