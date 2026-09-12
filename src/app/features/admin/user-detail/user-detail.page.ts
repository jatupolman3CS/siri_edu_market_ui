import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { AdminService, AuthService, ApiFailureReporter } from '../../../core/services';
import type { AdminUserDetail, AdminUserAccountStatus } from '../../../core/models';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

@Component({
  selector: 'app-admin-user-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    RouterLink,
    NzModalModule,
    IconComponent,
    ThbPipe,
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-detail.page.html',
  styleUrl: './user-detail.page.scss',
})
export class AdminUserDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);

  readonly user = signal<AdminUserDetail | null>(null);
  readonly loading = signal(true);
  readonly submitting = signal(false);

  // Modals state
  readonly suspendModalVisible = signal(false);
  readonly banModalVisible = signal(false);
  readonly reinstateModalVisible = signal(false);

  // Form fields
  readonly suspendReason = signal('');
  readonly suspendUntil = signal('');
  readonly suspendMessage = signal('');

  readonly banReason = signal('');
  readonly banMessage = signal('');

  readonly reinstateReason = signal('');

  readonly currentUserId = computed(() => this.auth.user()?.id);

  readonly isTargetAdmin = computed(() =>
    this.user()?.roles.some((r) => r.toLowerCase() === 'admin') ?? false,
  );

  readonly isTargetSelf = computed(() =>
    Boolean(this.user()?.id && this.currentUserId() && this.user()!.id === this.currentUserId()),
  );

  readonly canRestrict = computed(() =>
    !this.isTargetAdmin() &&
    !this.isTargetSelf() &&
    this.user()?.accountStatus !== 'banned',
  );

  readonly canReinstate = computed(() =>
    !this.isTargetAdmin() &&
    !this.isTargetSelf() &&
    this.user()?.accountStatus !== 'active',
  );

  constructor() {
    const userId = this.route.snapshot.paramMap.get('userId');
    if (!userId) {
      void this.router.navigate(['/admin/users']);
      return;
    }
    void this.loadUser(userId);
  }

  async loadUser(userId: string): Promise<void> {
    this.loading.set(true);
    try {
      const detail = await this.admin.getUser(userId);
      this.user.set(detail);
    } catch (e) {
      this.apiFail.report('โหลดข้อมูลผู้ใช้', e);
      this.message.error(this.apiFail.formatDetail(e));
    } finally {
      this.loading.set(false);
    }
  }

  // ===== Suspend =====
  openSuspendModal(): void {
    const defaultUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16);
    this.suspendReason.set('');
    this.suspendUntil.set(defaultUntil);
    this.suspendMessage.set('');
    this.suspendModalVisible.set(true);
  }

  closeSuspendModal(): void {
    this.suspendModalVisible.set(false);
  }

  async submitSuspend(): Promise<void> {
    const u = this.user();
    if (!u) return;
    const reason = this.suspendReason().trim();
    const untilStr = this.suspendUntil();
    if (!reason || !untilStr) {
      this.message.warning('กรุณากรอกเหตุผลและวันหมดอายุการระงับ');
      return;
    }

    this.submitting.set(true);
    try {
      const updated = await this.admin.suspendUser(u.id, {
        reason,
        until: new Date(untilStr).toISOString(),
        messageToUser: this.suspendMessage().trim() || null,
      });
      this.user.set(updated);
      this.message.success('ระงับบัญชีเรียบร้อยแล้ว');
      this.closeSuspendModal();
    } catch (e) {
      this.message.error(this.apiFail.formatDetail(e));
    } finally {
      this.submitting.set(false);
    }
  }

  // ===== Ban =====
  openBanModal(): void {
    this.banReason.set('');
    this.banMessage.set('');
    this.banModalVisible.set(true);
  }

  closeBanModal(): void {
    this.banModalVisible.set(false);
  }

  async submitBan(): Promise<void> {
    const u = this.user();
    if (!u) return;
    const reason = this.banReason().trim();
    if (!reason) {
      this.message.warning('กรุณากรอกเหตุผล');
      return;
    }

    this.submitting.set(true);
    try {
      const updated = await this.admin.banUser(u.id, {
        reason,
        messageToUser: this.banMessage().trim() || null,
      });
      this.user.set(updated);
      this.message.success('แบนบัญชีเรียบร้อยแล้ว');
      this.closeBanModal();
    } catch (e) {
      this.message.error(this.apiFail.formatDetail(e));
    } finally {
      this.submitting.set(false);
    }
  }

  // ===== Reinstate =====
  openReinstateModal(): void {
    this.reinstateReason.set('');
    this.reinstateModalVisible.set(true);
  }

  closeReinstateModal(): void {
    this.reinstateModalVisible.set(false);
  }

  async submitReinstate(): Promise<void> {
    const u = this.user();
    if (!u) return;
    const reason = this.reinstateReason().trim();
    if (!reason) {
      this.message.warning('กรุณากรอกเหตุผล');
      return;
    }

    this.submitting.set(true);
    try {
      const updated = await this.admin.reinstateUser(u.id, {
        reason,
      });
      this.user.set(updated);
      this.message.success('ปลดระงับบัญชีเรียบร้อยแล้ว');
      this.closeReinstateModal();
    } catch (e) {
      this.message.error(this.apiFail.formatDetail(e));
    } finally {
      this.submitting.set(false);
    }
  }

  getRoleLabel(role: string): string {
    switch (role.toLowerCase()) {
      case 'buyer': return 'ผู้ซื้อ';
      case 'seller': return 'ผู้ขาย';
      case 'admin': return 'ผู้ดูแลระบบ';
      default: return role;
    }
  }

  getActionLabel(action: string): string {
    switch (action.toLowerCase()) {
      case 'suspend': return 'ระงับชั่วคราว';
      case 'ban': return 'แบนถาวร';
      case 'reinstate': return 'ปลดระงับ';
      default: return action;
    }
  }

  getStatusClass(status: AdminUserAccountStatus): string {
    switch (status) {
      case 'active':
        return 'pill-green';
      case 'suspended':
        return 'pill-soft text-amber-600';
      case 'banned':
        return 'pill-soft text-red-600';
      default:
        return 'pill-soft';
    }
  }

  getStatusLabel(status: AdminUserAccountStatus): string {
    switch (status) {
      case 'active':
        return 'ปกติ';
      case 'suspended':
        return 'ระงับชั่วคราว';
      case 'banned':
        return 'แบนถาวร';
      default:
        return status;
    }
  }
}
