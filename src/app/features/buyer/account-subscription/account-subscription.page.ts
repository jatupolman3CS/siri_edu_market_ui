import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { CatalogService, SubscriptionService } from '../../../core/services';
import type { SubscriptionStatus } from '../../../core/models';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TranslatePipe, TranslationService } from '../../../core/i18n';

/**
 * subscription-membership v3 §3.4/§4 (docs/contracts/subscription-membership.md): "/account/subscription"
 * — สถานะสมาชิกปัจจุบัน (หมวดที่ครอบคลุม, ราคา/เดือน, วันต่ออายุ/สิ้นสุด), ปุ่มยกเลิกพร้อม dialog ยืนยัน.
 * `GET /api/me/subscription` คืน **404** เมื่อไม่มีสมาชิก (v3 แก้จาก v2 ที่ระบุ 204 ผิด — ดู §3.4) →
 * `SubscriptionService.loadCurrent()` แปลง 404 นั้นเป็น `current()===null` เฉย ๆ (ดู class doc ของ
 * `SubscriptionService`) → แสดง empty state ชวนไปหน้า `/subscribe`.
 *
 * `Status=Incomplete` (รอชำระเงิน — ผู้ใช้เพิ่งสมัครแต่การยืนยัน PaymentIntent ที่หน้า `/subscribe`
 * ยังไม่เสร็จ เช่น ปิดหน้าต่าง 3-D Secure ไปกลางคัน หรือรีเฟรชหน้าไปเสียก่อน) แสดงคำอธิบายแยกแทน
 * `renewalLabel()` ปกติ — **ไม่มีปุ่ม "ลองชำระเงินอีกครั้ง" ที่หน้านี้โดยเจตนา**: §3.4 ระบุชัดว่า
 * `paymentHints.clientSecret` เป็น `null` เสมอจาก `GET` (ไม่ถูก serve ซ้ำ เหมือน
 * `OrderPaymentHintsResponse` เดิม) จึงไม่มี `clientSecret` ให้ resume การยืนยันจากหน้านี้ได้เลยตาม
 * contract ปัจจุบัน — สิ่งเดียวที่ทำได้จริงคือรีเฟรชสถานะซ้ำ (`refreshStatus()`) รอ webhook/Stripe
 * auto-void แล้วสมัครใหม่ทีหลัง ถ้าต้องการปุ่ม resume จริงต้องขยาย contract ก่อน (ดู PR/gate report).
 */
@Component({
  selector: 'app-buyer-account-subscription',
  standalone: true,
  imports: [RouterLink, NzModalModule, ThbPipe, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe],
  templateUrl: './account-subscription.page.html',
  styleUrl: './account-subscription.page.scss',
})
export class AccountSubscriptionPage {
  readonly subscription = inject(SubscriptionService);
  private readonly catalog = inject(CatalogService);
  private readonly datePipe = inject(DatePipe);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  private readonly i18n = inject(TranslationService);

  readonly loaded = computed(() => this.subscription.state().status !== 'loading');

  readonly categoryNames = computed(() => {
    const sub = this.subscription.current();
    if (!sub) return [];
    return sub.categoryIds.map((id) => this.catalog.getCategoryById(id)?.name ?? id);
  });

  readonly renewalLabel = computed(() => {
    const sub = this.subscription.current();
    if (!sub) return '';
    const formatted = this.formattedDate(sub.currentPeriodEnd);
    return sub.cancelAtPeriodEnd
      ? this.i18n.t('accountSubscription.endAt', { date: formatted })
      : this.i18n.t('accountSubscription.renewAt', { date: formatted });
  });

  readonly canCancel = computed(() => {
    const sub = this.subscription.current();
    if (!sub) return false;
    return !sub.cancelAtPeriodEnd && sub.status !== 'canceled';
  });

  /** An `Incomplete` row means the `/subscribe` confirmation step never finished — see class doc for why there is no in-page resume action. */
  readonly isIncomplete = computed(() => this.subscription.current()?.status === 'incomplete');

  constructor() {
    this.catalog.ensureCategories();
    void this.subscription.loadCurrent();
  }

  /** The only thing this page can honestly offer an `Incomplete` subscription: re-check whether Stripe/the webhook has moved it along yet. */
  refreshStatus(): void {
    void this.subscription.loadCurrent();
  }

  statusLabel(status: SubscriptionStatus): string {
    switch (status) {
      case 'incomplete':
        return this.i18n.t('accountSubscription.statusIncomplete');
      case 'active':
        return this.i18n.t('accountSubscription.statusActive');
      case 'past_due':
        return this.i18n.t('accountSubscription.statusPastDue');
      case 'canceled':
        return this.i18n.t('accountSubscription.statusCanceled');
      default:
        return status;
    }
  }

  formattedDate(iso: string): string {
    return this.datePipe.transform(iso, 'd MMM yyyy') ?? iso;
  }

  /** §4: dialog ยืนยัน — "คุณจะยังใช้งานได้ถึงวันที่ {currentPeriodEnd} หลังจากนั้นจะไม่ต่ออายุอัตโนมัติ" */
  confirmCancel(): void {
    const sub = this.subscription.current();
    if (!sub) return;
    this.modal.confirm({
      nzTitle: this.i18n.t('accountSubscription.confirmTitle'),
      nzContent: this.i18n.t('accountSubscription.confirmContent', {
        date: this.formattedDate(sub.currentPeriodEnd),
      }),
      nzOkText: this.i18n.t('accountSubscription.confirmOk'),
      nzOkDanger: true,
      nzCancelText: this.i18n.t('accountSubscription.confirmCancel'),
      nzOnOk: () => this.doCancel(),
    });
  }

  private async doCancel(): Promise<void> {
    try {
      await this.subscription.cancel();
      this.message.success(this.i18n.t('accountSubscription.cancelSuccessToast'));
    } catch {
      const state = this.subscription.cancelState();
      this.message.error(state.status === 'error' ? state.message : this.i18n.t('accountSubscription.cancelFailedToast'));
    }
  }
}
