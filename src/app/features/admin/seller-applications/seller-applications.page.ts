import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SellerApplicationService } from '../../../core/services/seller-application.service';
import type { AdminSellerApplicationResponse } from '../../../core/api';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/** GAP-01: admin queue for reviewing buyer requests to become sellers. */
@Component({
  selector: 'app-admin-seller-applications',
  standalone: true,
  imports: [DatePipe, FormsModule, EmptyStateComponent, PaginationComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seller-applications.page.html',
})
export class AdminSellerApplicationsPage {
  private readonly applications = inject(SellerApplicationService);
  private readonly message = inject(NzMessageService);
  private readonly translation = inject(TranslationService);

  readonly items = signal<AdminSellerApplicationResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);

  /** userId currently being approved/rejected, so only that row's buttons disable. */
  readonly busyUserId = signal<string | null>(null);

  /** userId whose rejection form is open, and the reason being typed. */
  readonly rejectingUserId = signal<string | null>(null);
  readonly rejectReason = signal<string>('');

  constructor() {
    void this.reload();
  }

  onPageChange(p: number): void {
    this.page.set(p);
    void this.reload();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize);
    this.page.set(1);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.applications.listPendingPaged(this.page(), this.pageSize());
      this.items.set(res.items);
      this.total.set(res.totalCount);
    } finally {
      this.loading.set(false);
    }
  }

  async approve(userId: string): Promise<void> {
    if (this.busyUserId()) return;
    this.busyUserId.set(userId);
    try {
      if (await this.applications.approve(userId)) {
        this.message.success(this.translation.t('admin.sellerApplications.approveSuccess'));
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
      this.message.warning(this.translation.t('admin.sellerApplications.reasonRequired'));
      return;
    }
    if (this.busyUserId()) return;

    this.busyUserId.set(userId);
    try {
      if (await this.applications.reject(userId, reason)) {
        this.message.success(this.translation.t('admin.sellerApplications.rejectSuccess'));
        this.cancelReject();
        await this.reload();
      }
    } finally {
      this.busyUserId.set(null);
    }
  }
}
