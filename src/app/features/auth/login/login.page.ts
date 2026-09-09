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
  readonly i18n = inject(TranslationService);

  readonly email = signal<string>('');
  readonly password = signal<string>('');
  readonly remember = signal<boolean>(true);
  readonly showPassword = signal<boolean>(false);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string>('');

  readonly returnUrl = signal<string>('/');

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.returnUrl.set(p.get('returnUrl') ?? '/');
    });
  }

  async onSubmit(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    const result = await this.auth.signIn(this.email(), this.password());
    this.loading.set(false);
    if (!result.ok) {
      this.error.set(result.error ?? 'เข้าสู่ระบบไม่สำเร็จ');
      return;
    }
    this.message.success('ยินดีต้อนรับกลับมา 🌸');
    this.router.navigateByUrl(this.returnUrl());
  }

  onSocial(provider: AuthProvider): void {
    if (provider === 'email') return;
    this.loading.set(true);
    void (async () => {
      const r = await this.auth.signInWithProvider(provider);
      this.loading.set(false);
      if (!r.ok) {
        this.error.set(r.error ?? 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }
      this.message.success(`เข้าสู่ระบบด้วย ${provider.toUpperCase()} สำเร็จ`);
      this.router.navigateByUrl(this.returnUrl());
    })();
  }
}
