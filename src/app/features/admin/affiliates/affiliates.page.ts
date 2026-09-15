import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import type { AdminAffiliateSummary } from '../../../core/models';
import { AdminService } from '../../../core/services/admin.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';

/**
 * referral-program v2 §3.10 / §3.11 / §4.1:
 * Admin dashboard page for managing affiliate links and commission settings.
 */
@Component({
  selector: 'app-admin-affiliates',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzModalModule,
    PaginationComponent,
    EmptyStateComponent,
    IconComponent,
    ThbPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './affiliates.page.html',
  styleUrl: './affiliates.page.scss',
})
export class AdminAffiliatesPage {
  private readonly admin = inject(AdminService);
  private readonly message = inject(NzMessageService);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);
  readonly items = signal<AdminAffiliateSummary[]>([]);
  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);

  // Settings / rate override modal
  readonly editingAffiliate = signal<AdminAffiliateSummary | null>(null);
  readonly rateOverrideInput = signal<number | null>(null);
  readonly savingSettings = signal(false);

  constructor() {
    void this.loadPage(1);
  }

  async loadPage(p = 1): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.admin.getAffiliates(p, this.pageSize());
      this.items.set(res.items ?? []);
      this.page.set(res.page ?? p);
      this.pageSize.set(res.pageSize ?? this.pageSize());
      this.total.set(res.totalCount ?? 0);
    } catch {
      this.message.error('โหลดข้อมูลลิงก์พันธมิตรไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

  onPageChange(p: number): void {
    void this.loadPage(p);
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    void this.loadPage(1);
  }

  async toggleActive(item: AdminAffiliateSummary): Promise<void> {
    this.busyId.set(item.userId);
    const nextState = !item.isActive;
    try {
      const ok = await this.admin.updateAffiliateSettings(item.userId, { isActive: nextState });
      if (ok) {
        this.items.update((list) =>
          list.map((it) => (it.userId === item.userId ? { ...it, isActive: nextState } : it)),
        );
        this.message.success(nextState ? 'เปิดใช้งานสำเร็จ' : 'ปิดใช้งานสำเร็จ');
      }
    } catch {
      this.message.error('บันทึกสถานะไม่สำเร็จ');
    } finally {
      this.busyId.set(null);
    }
  }

  openSettingsModal(item: AdminAffiliateSummary): void {
    this.editingAffiliate.set(item);
    this.rateOverrideInput.set(item.commissionRatePercent || null);
  }

  closeSettingsModal(): void {
    this.editingAffiliate.set(null);
    this.rateOverrideInput.set(null);
  }

  async saveSettings(): Promise<void> {
    const item = this.editingAffiliate();
    if (!item) return;

    this.savingSettings.set(true);
    const rateVal = this.rateOverrideInput();
    const rate = rateVal !== null && !Number.isNaN(rateVal) ? Number(rateVal) : null;

    try {
      // §3.10: `isActive` is required on the wire — always resend the row's current value so a
      // rate-only edit here can never accidentally flip the enabled/disabled toggle.
      const ok = await this.admin.updateAffiliateSettings(item.userId, {
        isActive: item.isActive,
        commissionRatePercentOverride: rate,
      });
      if (ok) {
        this.items.update((list) =>
          list.map((it) =>
            it.userId === item.userId
              ? { ...it, commissionRatePercent: rate ?? it.commissionRatePercent }
              : it,
          ),
        );
        this.message.success('บันทึกการตั้งค่าสำเร็จ');
        this.closeSettingsModal();
      }
    } catch {
      this.message.error('บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      this.savingSettings.set(false);
    }
  }
}
