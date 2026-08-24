import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerApplicationService } from '../../../core/services/seller-application.service';
import type { AdminSellerApplicationResponse } from '../../../core/api';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/** GAP-01: admin queue for reviewing buyer requests to become sellers. */
@Component({
  selector: 'app-admin-seller-applications',
  standalone: true,
  imports: [DatePipe, FormsModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seller-applications.page.html',
})
export class AdminSellerApplicationsPage {
  private readonly applications = inject(SellerApplicationService);
  private readonly message = inject(NzMessageService);

  readonly items = signal<AdminSellerApplicationResponse[]>([]);
  readonly loading = signal<boolean>(false);
  /** userId currently being approved/rejected, so only that row's buttons disable. */
  readonly busyUserId = signal<string | null>(null);

  /** userId whose rejection form is open, and the reason being typed. */
  readonly rejectingUserId = signal<string | null>(null);
  readonly rejectReason = signal<string>('');

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.items.set(await this.applications.listPending());
    } finally {
      this.loading.set(false);
    }
  }

  async approve(userId: string): Promise<void> {
    if (this.busyUserId()) return;
    this.busyUserId.set(userId);
    try {
      if (await this.applications.approve(userId)) {
        this.message.success('อนุมัติผู้ขายเรียบร้อย');
        await this.reload();
      }
    } finally {
      this.busyUserId.set(null);
    }
  }

  startReject(userId: string): void {
    this.rejectingUserId.set(userId);
    this.rejectReason.set('');
  }

  cancelReject(): void {
    this.rejectingUserId.set(null);
    this.rejectReason.set('');
  }

  async confirmReject(userId: string): Promise<void> {
    const reason = this.rejectReason().trim();
    if (!reason) {
      this.message.warning('กรุณาระบุเหตุผล เพื่อให้ผู้สมัครแก้ไขได้ถูกจุด');
      return;
    }
    if (this.busyUserId()) return;

    this.busyUserId.set(userId);
    try {
      if (await this.applications.reject(userId, reason)) {
        this.message.success('บันทึกการปฏิเสธเรียบร้อย');
        this.cancelReject();
        await this.reload();
      }
    } finally {
      this.busyUserId.set(null);
    }
  }
}
