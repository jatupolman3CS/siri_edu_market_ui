import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthProvider, AuthService } from '../../../core/services';
import { TranslationService, TranslatePipe } from '../../../core/i18n';
import { AuthLayoutComponent } from '../../../layouts/auth/auth-layout/auth-layout.component';
import { SocialButtonsComponent } from '../../../shared/components/social-buttons/social-buttons.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-auth-register',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    AuthLayoutComponent,
    SocialButtonsComponent,
    IconComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
})
export class AuthRegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly i18n = inject(TranslationService);

  readonly name = signal<string>('');
  readonly email = signal<string>('');
  readonly password = signal<string>('');
  readonly confirmPassword = signal<string>('');
  readonly acceptTerms = signal<boolean>(false);
  readonly showPassword = signal<boolean>(false);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string>('');

  readonly returnUrl = signal<string>('/');

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.returnUrl.set(p.get('returnUrl') ?? '/');
    });
  }

  strengthLevel(): number {
    const p = this.password();
    let score = 0;
    if (p.length >= 6) score++;
    if (p.length >= 10) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/\d/.test(p) || /[!@#$%^&*]/.test(p)) score++;
    return score;
  }

  strengthLabel(): string {
    const s = this.strengthLevel();
    const labelsTh = ['อ่อนมาก', 'อ่อน', 'พอใช้', 'ดี', 'แข็งแรง'];
    const labelsEn = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    const list = this.i18n.currentLang() === 'en' ? labelsEn : labelsTh;
    return list[s] ?? '';
  }

  strengthColor(): string {
    const s = this.strengthLevel();
    return [
      'text-rose-500',
      'text-rose-500',
      'text-amber-500',
      'text-emerald-500',
      'text-emerald-600',
    ][s] ?? '';
  }

  async onSubmit(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    const r = await this.auth.register({
      name: this.name(),
      email: this.email(),
      password: this.password(),
      confirmPassword: this.confirmPassword(),
      acceptTerms: this.acceptTerms(),
    });
    this.loading.set(false);
    if (!r.ok) {
      this.error.set(r.error ?? 'สมัครไม่สำเร็จ');
      return;
    }
    this.router.navigate(['/auth/verify-email'], {
      queryParams: { returnUrl: this.returnUrl() },
    });
  }

  readonly lineModalVisible = signal<boolean>(false);
  readonly lineEmail = signal<string>('');
  readonly lineEmailError = signal<string>('');

  onSocial(provider: AuthProvider): void {
    if (provider === 'email') return;
    if (provider === 'line') {
      this.lineEmail.set(this.email().trim());
      this.lineEmailError.set('');
      this.lineModalVisible.set(true);
      return;
    }
    this.executeSocial(provider);
  }

  confirmLineEmail(): void {
    const mail = this.lineEmail().trim();
    if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      this.lineEmailError.set('กรุณาระบุอีเมลที่ถูกต้อง');
      return;
    }
    this.lineModalVisible.set(false);
    this.loading.set(true);
    void (async () => {
      const r = await this.auth.signInWithProvider('line', {
        returnUrl: this.returnUrl(),
        email: mail,
      });
      this.loading.set(false);
      if (!r.ok) {
        this.error.set(r.error ?? 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ');
      }
    })();
  }

  private executeSocial(provider: Exclude<AuthProvider, 'email'>): void {
    this.loading.set(true);
    void (async () => {
      const r = await this.auth.signInWithProvider(provider, { returnUrl: this.returnUrl() });
      this.loading.set(false);
      if (!r.ok) {
        this.error.set(r.error ?? 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }
      this.router.navigateByUrl(this.auth.resolvePostAuthRedirect(this.returnUrl()));
    })();
  }
}
