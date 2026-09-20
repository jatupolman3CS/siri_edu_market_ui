import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services';
import { AuthLayoutComponent } from '../../../layouts/auth/auth-layout/auth-layout.component';

import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/**
 * external-login-and-mail-config v1 §4.1 — `/auth/line/callback`, the URL registered in the LINE
 * console and the landing point of the full-page redirect.
 */
@Component({
  selector: 'app-auth-line-callback',
  standalone: true,
  imports: [RouterLink, FormsModule, AuthLayoutComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './line-callback.page.html',
  styleUrl: './line-callback.page.scss',
})
export class AuthLineCallbackPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly translation = inject(TranslationService);

  readonly loading = signal<boolean>(true);
  readonly error = signal<string>('');
  readonly retryEmail = signal<string>('');
  readonly retryEmailError = signal<string>('');
  readonly needsEmailRetry = computed(
    () => this.error().includes('อีเมล') || this.error().toLowerCase().includes('email'),
  );

  /** The exchange is single-use; a second query-param emission must not replay it. */
  private handled = false;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (this.handled) return;
      this.handled = true;

      const failure = (params.get('error') ?? '').trim();
      if (failure) {
        this.fail(
          failure === 'access_denied'
            ? this.translation.t('auth.lineCancelled')
            : this.translation.t('auth.lineLoginFailed'),
        );
        return;
      }

      const code = (params.get('code') ?? '').trim();
      const state = (params.get('state') ?? '').trim();
      if (!code || !state) {
        // Somebody opened this route by hand, or the callback URL lost its query string.
        this.fail(this.translation.t('auth.lineInvalidRequest'));
        return;
      }

      void this.complete(code, state);
    });
  }

  private async complete(code: string, state: string): Promise<void> {
    const result = await this.auth.completeLineSignIn({ code, state });
    if (!result.ok) {
      this.fail(result.error || this.translation.t('auth.lineLoginFailed'));
      return;
    }
    this.loading.set(false);
    void this.router.navigateByUrl(this.auth.resolvePostAuthRedirect(result.returnUrl ?? '/'));
  }

  private fail(message: string): void {
    this.loading.set(false);
    this.error.set(message);
  }

  retryWithEmail(): void {
    const email = this.retryEmail().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.retryEmailError.set(this.translation.t('auth.pleaseEnterValidEmail'));
      return;
    }
    void this.auth.signInWithProvider('line', { email });
  }
}
