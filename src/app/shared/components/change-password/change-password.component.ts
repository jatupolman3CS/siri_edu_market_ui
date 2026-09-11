import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';

/**
 * F-08 (N-04): change your password while signed in.
 *
 * Before this the only route to a new password was "forgot password" and waiting for an email,
 * even for someone already holding a valid session. The server requires the current password
 * and revokes every refresh token on success, so this form ends by sending the user to the
 * sign-in page rather than pretending the session survived.
 */
@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-password.component.html',
  styles: [':host { display: block; }'],
})
export class ChangePasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  readonly saving = signal(false);

  /** Mirrors the server's rules. The server checks every one of them regardless. */
  validationError(): string | null {
    if (!this.currentPassword) return 'กรุณากรอกรหัสผ่านปัจจุบัน';
    if (this.newPassword.length < 8) return 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร';
    if (this.newPassword === this.currentPassword) return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม';
    if (this.newPassword !== this.confirmPassword) return 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน';
    return null;
  }

  async submit(): Promise<void> {
    const problem = this.validationError();
    if (problem) {
      this.message.warning(problem);
      return;
    }
    if (this.saving()) return;

    this.saving.set(true);
    try {
      await this.auth.changePassword({
        currentPassword: this.currentPassword,
        newPassword: this.newPassword,
        confirmPassword: this.confirmPassword,
      });

      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.message.success('เปลี่ยนรหัสผ่านเรียบร้อย กรุณาเข้าสู่ระบบใหม่');
      void this.router.navigate(['/auth/login']);
    } catch {
      /* reported by AuthService through ApiFailureReporter */
    } finally {
      this.saving.set(false);
    }
  }
}
