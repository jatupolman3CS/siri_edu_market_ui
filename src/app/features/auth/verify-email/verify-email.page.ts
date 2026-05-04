import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services';
import { AuthLayoutComponent } from '../../../layouts/auth/auth-layout/auth-layout.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-auth-verify-email',
  standalone: true,
  imports: [RouterLink, FormsModule, AuthLayoutComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-email.page.html',
  styleUrl: './verify-email.page.scss',
})
export class AuthVerifyEmailPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly message = inject(NzMessageService);

  private readonly inputs = viewChildren<ElementRef<HTMLInputElement>>('digit');

  readonly digits = signal<string[]>(['', '', '', '', '', '']);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string>('');
  readonly cooldown = signal<number>(0);
  readonly returnUrl = signal<string>('/');

  readonly fullCode = computed(() => this.digits().join(''));

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.returnUrl.set(p.get('returnUrl') ?? '/');
    });
  }

  onDigitInput(index: number, event: Event): void {
    const el = event.target as HTMLInputElement;
    const v = el.value.replace(/\D/g, '').slice(-1);
    el.value = v;
    const next = [...this.digits()];
    next[index] = v;
    this.digits.set(next);
    if (v && index < 5) {
      this.inputs()[index + 1]?.nativeElement.focus();
    }
    if (next.every((d) => d) && next.join('').length === 6) {
      this.onSubmit();
    }
  }

  onKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      this.inputs()[index - 1]?.nativeElement.focus();
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text') ?? '';
    const digits = text.replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length === 0) return;
    const next = ['', '', '', '', '', ''];
    digits.forEach((d, i) => (next[i] = d));
    this.digits.set(next);
    this.inputs().forEach((ref, i) => (ref.nativeElement.value = next[i] ?? ''));
    const lastIdx = Math.min(digits.length, 5);
    this.inputs()[lastIdx]?.nativeElement.focus();
    if (next.every((d) => d)) {
      this.onSubmit();
    }
  }

  autofill(): void {
    const code = this.auth.peekCode();
    if (!code) return;
    const next = code.split('');
    this.digits.set(next);
    this.inputs().forEach((ref, i) => (ref.nativeElement.value = next[i] ?? ''));
  }

  onSubmit(): void {
    this.error.set('');
    if (this.fullCode().length !== 6) {
      this.error.set('กรุณากรอกรหัสให้ครบ 6 หลัก');
      return;
    }
    this.loading.set(true);
    setTimeout(() => {
      const r = this.auth.verifyEmail(this.fullCode());
      this.loading.set(false);
      if (!r.ok) {
        this.error.set(r.error ?? 'รหัสไม่ถูกต้อง');
        return;
      }
      this.message.success('ยินดีต้อนรับสู่ SIRIEDUMARKET 🌸');
      this.router.navigateByUrl(this.returnUrl());
    }, 600);
  }

  resend(): void {
    const r = this.auth.resendCode();
    if (r.ok) {
      this.message.success('ส่งรหัสใหม่แล้ว — เช็คอีเมลของคุณ');
      this.cooldown.set(30);
      const t = setInterval(() => {
        this.cooldown.update((v) => v - 1);
        if (this.cooldown() <= 0) clearInterval(t);
      }, 1000);
    }
  }
}
