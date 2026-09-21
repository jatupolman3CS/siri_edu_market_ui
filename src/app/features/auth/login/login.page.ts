import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthProvider, AuthService } from '../../../core/services';
import { TranslationService, TranslatePipe } from '../../../core/i18n';
import { AuthLayoutComponent } from '../../../layouts/auth/auth-layout/auth-layout.component';
import { SocialButtonsComponent } from '../../../shared/components/social-buttons/social-buttons.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-auth-login',
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
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class AuthLoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly message = inject(NzMessageService);
  readonly translation = inject(TranslationService);

  readonly email = signal<string>('');
  readonly password = signal<string>('');
  readonly remember = signal<boolean>(true);
  readonly showPassword = signal<boolean>(false);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string>('');

  readonly returnUrl = signal<string>('/');
  readonly registerMode = signal<boolean>(false);
  readonly lineModalVisible = signal<boolean>(false);
  readonly lineEmail = signal<string>('');
  readonly lineEmailError = signal<string>('');

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.returnUrl.set(p.get('returnUrl') ?? '/');
    });
  }

  goToRegister(): void {
    this.registerMode.set(true);
    setTimeout(() => {
      void this.router.navigate(['/auth/register'], {
        queryParams: { returnUrl: this.returnUrl() },
      });
    }, 220);
  }

  async onSubmit(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    const result = await this.auth.signIn(this.email(), this.password());
    this.loading.set(false);
    if (!result.ok) {
      this.error.set(result.error ?? this.translation.t('auth.loginFailed'));
      return;
    }
    this.message.success(this.translation.t('auth.welcomeBackToast'));
    this.router.navigateByUrl(this.auth.resolvePostAuthRedirect(this.returnUrl()));
  }

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
      this.lineEmailError.set(this.translation.t('auth.pleaseEnterValidEmail'));
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
        this.error.set(r.error ?? this.translation.t('auth.lineLoginFailed'));
      }
    })();
  }

  private executeSocial(provider: Exclude<AuthProvider, 'email'>): void {
    this.loading.set(true);
    void (async () => {
      const r = await this.auth.signInWithProvider(provider, { returnUrl: this.returnUrl() });
      this.loading.set(false);
      if (!r.ok) {
        this.error.set(r.error ?? this.translation.t('auth.loginFailed'));
        return;
      }
      this.message.success(this.translation.t('auth.socialLoginSuccess', { provider: provider.toUpperCase() }));
      this.router.navigateByUrl(this.auth.resolvePostAuthRedirect(this.returnUrl()));
    })();
  }
}
