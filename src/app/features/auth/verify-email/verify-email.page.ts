import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services';
import { AuthLayoutComponent } from '../../../layouts/auth/auth-layout/auth-layout.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-auth-verify-email',
  standalone: true,
  imports: [RouterLink, FormsModule, AuthLayoutComponent, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-email.page.html',
  styleUrl: './verify-email.page.scss',
})
export class AuthVerifyEmailPage {
  readonly auth = inject(AuthService);
  readonly translation = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly message = inject(NzMessageService);

  readonly loading = signal<boolean>(false);
  readonly error = signal<string>('');
  readonly cooldown = signal<number>(0);
  readonly returnUrl = signal<string>('/');
  readonly customEmail = signal<string>('');
  readonly otpDigits = signal<string[]>(['', '', '', '', '', '']);

  private emailLinkVerifyStarted = false;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.returnUrl.set(p.get('returnUrl') ?? '/');
      const emailToken = p.get('token')?.trim();
      const emailParam = p.get('email')?.trim();
      if (emailParam) {
        this.customEmail.set(emailParam);
      }
      if (emailToken && !this.emailLinkVerifyStarted) {
        this.emailLinkVerifyStarted = true;
        void this.verifyWithToken(emailToken, emailParam);
      }
    });
  }

  get targetEmail(): string {
    return this.customEmail().trim() || this.auth.pending()?.email || '';
  }

  onDigitInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, ''); // keep only digits

    if (value.length > 1) {
      // Pasted multiple digits
      const digits = value.slice(0, 6).split('');
      this.otpDigits.update((arr) => {
        const next = [...arr];
        digits.forEach((d, i) => {
          if (index + i < 6) next[index + i] = d;
        });
        return next;
      });
      const nextIndex = Math.min(index + digits.length, 5);
      this.focusInput(nextIndex);
      if (this.otpDigits().every((d) => d.length === 1)) {
        void this.submitOtp();
      }
      return;
    }

    this.otpDigits.update((arr) => {
      const next = [...arr];
      next[index] = value;
      return next;
    });

    if (value && index < 5) {
      this.focusInput(index + 1);
    }

    if (this.otpDigits().every((d) => d.length === 1)) {
      void this.submitOtp();
    }
  }

  onKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace') {
      if (!this.otpDigits()[index] && index > 0) {
        this.focusInput(index - 1);
      }
    }
  }

  private focusInput(index: number): void {
    setTimeout(() => {
      const el = document.getElementById(`otp-input-${index}`) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    }, 10);
  }

  async submitOtp(): Promise<void> {
    const code = this.otpDigits().join('').trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      this.error.set(this.translation.t('auth.otpRequired6Digits'));
      return;
    }

    const email = this.targetEmail;
    if (!email) {
      this.error.set(this.translation.t('auth.emailRequiredToVerify'));
      return;
    }

    this.error.set('');
    this.loading.set(true);
    const r = await this.auth.verifyOtp(code, email);
    this.loading.set(false);

    if (!r.ok) {
      this.error.set(r.error ?? this.translation.t('auth.otpInvalidOrExpired'));
      return;
    }

    this.message.success(this.translation.t('auth.verifySuccessWelcome'));
    await this.router.navigateByUrl(this.auth.resolvePostAuthRedirect(this.returnUrl()));
  }

  /** Email link: .../auth/verify-email?token=... — auto-triggered from query param */
  private async verifyWithToken(token: string, email?: string): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    const r = await this.auth.verifyEmail(token, email);
    this.loading.set(false);
    if (!r.ok) {
      this.error.set(r.error ?? this.translation.t('auth.verifyLinkInvalidOrExpired'));
      return;
    }
    this.message.success(this.translation.t('auth.verifySuccessWelcome'));
    await this.router.navigateByUrl(this.auth.resolvePostAuthRedirect(this.returnUrl()));
  }

  async resend(): Promise<void> {
    const email = this.targetEmail;
    if (!email) {
      this.message.error(this.translation.t('auth.specifyEmailForOtp'));
      return;
    }

    const r = await this.auth.sendOtp(email);
    if (r.ok) {
      this.message.success(r.message || this.translation.t('auth.otpResentSuccess'));
      this.error.set('');
      this.otpDigits.set(['', '', '', '', '', '']);
      this.cooldown.set(60);
      const t = setInterval(() => {
        this.cooldown.update((v) => v - 1);
        if (this.cooldown() <= 0) clearInterval(t);
      }, 1000);
      this.focusInput(0);
    } else {
      this.message.error(this.translation.t('auth.resendOtpFailed'));
    }
  }
}
