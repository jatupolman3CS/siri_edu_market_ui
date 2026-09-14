import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { CrmService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { CrmSignalCounts } from '../../../core/models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

/** `/account/privacy` §4.3 signal-count row labels — not locked copy, spec only fixes section headings. */
const SIGNAL_COUNT_LABELS: Record<keyof CrmSignalCounts, string> = {
  documentViews: 'เปิดดูเอกสาร',
  searches: 'ค้นหา',
  purchases: 'ซื้อแล้ว',
  subscriptionAccesses: 'เข้าถึงผ่านสมาชิกรายเดือน',
  wishlistItems: 'รายการโปรด',
  cartItems: 'อยู่ในตะกร้า',
  sellerFollows: 'ติดตามร้าน',
  reviews: 'รีวิว',
  declaredInterests: 'ความสนใจที่เลือกเอง',
};

/**
 * crm-core v1 §3.1–§3.3, §4.1, §4.3 (`docs/contracts/crm-core.md`) — "ความเป็นส่วนตัวของฉัน":
 * ดู/ปิด-เปิดการเก็บพฤติกรรม/ลบข้อมูล CRM ของตัวเอง (สิทธิ PDPA §8.5).
 *
 * Service-as-store: this page never keeps its own copy of the profile — it reads
 * `CrmService.myProfile()` directly, so once `setTracking`/`deleteMyData` update that signal
 * (round 2), the interest/segment lists disappear immediately without a manual refresh (AC-21).
 * Round 1: both throw `TODO(contract)` (see `CrmService` class doc), so the signal never
 * actually changes yet — this page only exercises the always-`NzModalService.confirm`-first
 * delete flow (AC-22) and the "call the service once" toggle flow (AC-21) against a stubbed
 * `CrmService` in `account-privacy.page.spec.ts`.
 */
@Component({
  selector: 'app-account-privacy',
  standalone: true,
  imports: [
    FormsModule,
    DecimalPipe,
    NzModalModule,
    NzSwitchModule,
    NzTooltipModule,
    IconComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-privacy.page.html',
})
export class AccountPrivacyPage {
  readonly crm = inject(CrmService);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  private readonly apiFail = inject(ApiFailureReporter);

  readonly togglingTracking = signal(false);
  readonly deleting = signal(false);

  readonly signalCountRows: { key: keyof CrmSignalCounts; label: string }[] = (
    Object.keys(SIGNAL_COUNT_LABELS) as (keyof CrmSignalCounts)[]
  ).map((key) => ({ key, label: SIGNAL_COUNT_LABELS[key] }));

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      await this.crm.loadMine();
    } catch (e) {
      this.apiFail.report('โหลดข้อมูลความเป็นส่วนตัวของฉัน', e);
    }
  }

  /** §4.3 toggle "ให้ระบบเรียนรู้ความสนใจของฉัน" — calls the service exactly once per switch (AC-21). */
  async onToggleTracking(enabled: boolean): Promise<void> {
    this.togglingTracking.set(true);
    try {
      await this.crm.setTracking(enabled);
    } catch (e) {
      this.apiFail.report('เปลี่ยนการตั้งค่าการติดตาม', e);
    } finally {
      this.togglingTracking.set(false);
    }
  }

  /** §4.3 ปุ่ม "ลบข้อมูลพฤติกรรมของฉัน" — always confirms first (AC-22), never a native `confirm()`. */
  confirmDelete(): void {
    this.modal.confirm({
      nzTitle: 'ยืนยันการลบข้อมูล',
      nzContent:
        'ระบบจะลบประวัติการเปิดดูและการค้นหาที่ใช้วิเคราะห์ความสนใจทั้งหมด การแนะนำเอกสารจะกลับไปเป็นแบบทั่วไปจนกว่าจะมีข้อมูลใหม่',
      nzOkText: 'ลบข้อมูล',
      nzOkDanger: true,
      nzCancelText: 'ยกเลิก',
      nzOnOk: () => this.doDelete(),
    });
  }

  private async doDelete(): Promise<void> {
    this.deleting.set(true);
    try {
      await this.crm.deleteMyData();
      this.message.success('ลบข้อมูลเรียบร้อยแล้ว');
    } catch (e) {
      this.apiFail.report('ลบข้อมูลพฤติกรรมของฉัน', e);
    } finally {
      this.deleting.set(false);
    }
  }
}
