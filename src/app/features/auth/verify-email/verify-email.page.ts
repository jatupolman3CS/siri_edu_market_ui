import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services';
import { AuthLayoutComponent } from '../../../layouts/auth/auth-layout/auth-layout.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-auth-verify-email',
  standalone: true,
  imports: [RouterLink, AuthLayoutComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-email.page.html',
  styleUrl: './verify-email.page.scss',
})
export class AuthVerifyEmailPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly message = inject(NzMessageService);

  readonly loading = signal<boolean>(false);
  readonly error = signal<string>('');
  readonly cooldown = signal<number>(0);
  readonly returnUrl = signal<string>('/');

  private emailLinkVerifyStarted = false;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.returnUrl.set(p.get('returnUrl') ?? '/');
      const emailToken = p.get('token')?.trim();
      if (emailToken && !this.emailLinkVerifyStarted) {
        this.emailLinkVerifyStarted = true;
        void this.verifyWithToken(emailToken);
      }
    });
  }

  /** Email link: .../auth/verify-email?token=... — auto-triggered from query param */
  private async verifyWithToken(token: string): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    const r = await this.auth.verifyEmail(token);
    this.loading.set(false);
    if (!r.ok) {
      this.error.set(r.error ?? 'ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ');
      return;
    }
    this.message.success('ยินดีต้อนรับสู่ SIRIEDUMARKET 🎉');
    await this.router.navigateByUrl(this.auth.resolvePostAuthRedirect(this.returnUrl()));
  }

  async resend(): Promise<void> {
    const r = await this.auth.resendCode();
    if (r.ok) {
      // D-06: the request succeeding does not mean an email left the building. The server says
      // which of the two happened; repeating it beats a hard-coded "sent!".
      this.message.success(r.message || 'ส่งอีเมลยืนยันใหม่แล้ว — กรุณาตรวจสอบกล่องจดหมาย');
      this.cooldown.set(60);
      const t = setInterval(() => {
        this.cooldown.update((v) => v - 1);
        if (this.cooldown() <= 0) clearInterval(t);
      }, 1000);
    } else {
      this.message.error('ส่งอีเมลอีกครั้งไม่สำเร็จ');
    }
  }
}
