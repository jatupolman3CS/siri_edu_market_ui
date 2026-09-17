import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services';
import { AuthLayoutComponent } from '../../../layouts/auth/auth-layout/auth-layout.component';

/** §4.3 — every sentence the user can end up reading on this page. */
const CANCELLED_MESSAGE = 'คุณยกเลิกการเข้าสู่ระบบด้วย LINE';
const INVALID_REQUEST_MESSAGE = 'คำขอเข้าสู่ระบบไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่อีกครั้ง';
const GENERIC_FAILURE_MESSAGE = 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

/**
 * external-login-and-mail-config v1 §4.1 — `/auth/line/callback`, the URL registered in the LINE
 * console and the landing point of the full-page redirect.
 *
 * LINE comes back with either `code` + `state`, or `error` (+ `error_description`). The three
 * failure shapes get three different sentences on purpose: "you cancelled", "this request is not
 * valid any more" and "it failed" are different situations, and a single generic line would leave
 * a user who simply pressed cancel wondering what broke.
 */
@Component({
  selector: 'app-auth-line-callback',
  standalone: true,
  imports: [RouterLink, FormsModule, AuthLayoutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './line-callback.page.html',
  styleUrl: './line-callback.page.scss',
})
export class AuthLineCallbackPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal<boolean>(true);
  readonly error = signal<string>('');
  readonly retryEmail = signal<string>('');
  readonly retryEmailError = signal<string>('');

  /** The exchange is single-use; a second query-param emission must not replay it. */
  private handled = false;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (this.handled) return;
      this.handled = true;

      const failure = (params.get('error') ?? '').trim();
      if (failure) {
        this.fail(failure === 'access_denied' ? CANCELLED_MESSAGE : GENERIC_FAILURE_MESSAGE);
        return;
      }

      const code = (params.get('code') ?? '').trim();
      const state = (params.get('state') ?? '').trim();
      if (!code || !state) {
        // Somebody opened this route by hand, or the callback URL lost its query string.
        this.fail(INVALID_REQUEST_MESSAGE);
        return;
      }

      void this.complete(code, state);
    });
  }

  private async complete(code: string, state: string): Promise<void> {
    const result = await this.auth.completeLineSignIn({ code, state });
    if (!result.ok) {
      this.fail(result.error || GENERIC_FAILURE_MESSAGE);
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
      this.retryEmailError.set('กรุณาระบุอีเมลที่ถูกต้อง');
      return;
    }
    void this.auth.signInWithProvider('line', { email });
  }
}
