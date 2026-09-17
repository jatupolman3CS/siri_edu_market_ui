import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import type { AdminPayoutResponse } from '../../../core/api';
import { resolveDownloadUrl, resolvePublicUrl } from '../../../core/api-runtime';
import type { BatchPayoutSlipsResponse, PayoutSlip } from '../../../core/models';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';

type PayoutFilter = 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled' | 'all';

const MAX_SLIP_BYTES = 5_000_000;

/** payout-request-slip-verification v1 §4.5: every `mismatchReasons`/`providerErrorCode` value. */
const MISMATCH_REASON_LABELS: Record<string, string> = {
  amount_mismatch: 'ยอดเงินในสลิปไม่ตรงกับคำขอ',
  amount_unverified: 'อ่านยอดเงินจากสลิปไม่ได้',
  name_mismatch: 'ชื่อบัญชีปลายทางไม่ตรงกับที่ผู้ขายลงทะเบียน',
  name_unverified: 'สลิปไม่ระบุชื่อบัญชีปลายทาง',
  receiver_account_mismatch: 'เลขบัญชีปลายทางไม่ตรงกัน',
  receiver_account_unverified: 'สลิปไม่ระบุเลขบัญชีปลายทาง',
  stale_slip: 'วันที่โอนไม่อยู่ในช่วงของคำขอนี้',
  duplicate_slip: 'สลิปนี้ถูกใช้ยืนยันรายการอื่นแล้ว',
  reference_missing: 'สลิปไม่มีเลขอ้างอิงรายการ จึงตรวจซ้ำซ้อนไม่ได้',
  ledger_inconsistent: 'ยอดกันไว้ของรายการนี้ไม่ตรงกับระบบ กรุณาติดต่อผู้ดูแลระบบ',
};

/**
 * GAP-02: admin queue for paying sellers. PAYOUT had no API at all, so money could come
 * into the platform but never go out.
 *
 * payout-request-slip-verification v1 §3.7/§3.9/§3.12/§4.5 (round 2): adds e-Slip upload +
 * automatic verification, manual override, a "ยกเลิกแล้ว" filter tab, and the next-payout-round
 * banner. Every automatic slip verdict is surfaced through `mismatchReasons`/`providerErrorMessage`
 * translated to Thai (§4.5) — the backend never auto-completes on anything but a clean `matched`
 * (§3.7.2), so this page's job is to make every other outcome legible enough for an admin to act.
 */
@Component({
  selector: 'app-admin-payouts',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    RouterLink,
    ThbPipe,
    EmptyStateComponent,
    IconComponent,
    PaginationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payouts.page.html',
})
export class AdminPayoutsPage {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);

  readonly items = signal<AdminPayoutResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly filter = signal<PayoutFilter>('pending');
  readonly busyId = signal<string | null>(null);
  readonly qrModalPayout = signal<AdminPayoutResponse | null>(null);

  qrImageUrl(payout: AdminPayoutResponse): string {
    return resolvePublicUrl(payout.payoutAccountQrImageUrl);
  }

  /** §4.5: "รอบโอนถัดไป" banner, from `GET /api/admin/settings`. */
  readonly nextPayoutDate = signal<string | null>(null);

  readonly filters: { value: PayoutFilter; label: string }[] = [
    { value: 'pending', label: 'รอดำเนินการ' },
    { value: 'processing', label: 'กำลังโอน' },
    { value: 'paid', label: 'โอนแล้ว' },
    { value: 'failed', label: 'ไม่สำเร็จ' },
    { value: 'cancelled', label: 'ยกเลิกแล้ว' },
    { value: 'all', label: 'ทั้งหมด' },
  ];

  // ===== §3.7/§4.5: slip upload + verification modal =====
  readonly slipModalPayout = signal<AdminPayoutResponse | null>(null);
  readonly slips = signal<PayoutSlip[]>([]);
  readonly loadingSlips = signal(false);
  readonly selectedFile = signal<File | null>(null);
  readonly filePreviewUrl = signal<string | null>(null);
  readonly fileError = signal<string | null>(null);
  readonly verifying = signal(false);
  readonly latestResult = signal<PayoutSlip | null>(null);
  readonly dragOver = signal(false);

  // ===== §3.7.6: "ยืนยันด้วยตนเอง" sub-modal =====
  readonly manualModalOpen = signal(false);
  readonly manualNote = signal('');
  readonly manualSubmitting = signal(false);

  // ===== §3.12: "ไม่สำเร็จ" now requires a reason =====
  readonly failModalPayoutId = signal<string | null>(null);
  readonly failReason = signal('');

  // ===== withdrawal-management (round 2): "อัปโหลดสลิป (หลายไฟล์)" batch modal =====
  readonly batchModalOpen = signal(false);
  readonly batchFiles = signal<File[]>([]);
  readonly batchUploading = signal(false);
  readonly batchResult = signal<BatchPayoutSlipsResponse | null>(null);
  readonly batchError = signal<string | null>(null);

  constructor() {
    void this.reload();
    void this.loadNextPayoutDate();
  }

  async loadNextPayoutDate(): Promise<void> {
    const settings = await this.admin.loadSettings();
    this.nextPayoutDate.set(settings?.nextPayoutDate ?? null);
  }

  setFilter(next: PayoutFilter): void {
    this.filter.set(next);
    this.page.set(1);
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
      const status = this.filter();
      const res = await this.admin.listPayoutsPaged(
        status === 'all' ? undefined : status,
        this.page(),
        this.pageSize(),
      );
      this.items.set(res.items ?? []);
      this.total.set(res.totalCount ?? 0);
    } catch (e) {
      this.apiFail.report('โหลดรายการถอนเงิน', e);
      this.items.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  async setStatus(payoutId: string, status: 'processing' | 'paid'): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(payoutId);
    try {
      await this.admin.setPayoutStatus(payoutId, status);
      this.message.success('อัปเดตสถานะเรียบร้อย');
      await this.reload();
    } catch (e) {
      this.apiFail.report('อัปเดตสถานะการถอนเงิน', e);
    } finally {
      this.busyId.set(null);
    }
  }

  // ===== §3.12: "ไม่สำเร็จ" reason modal =====

  openFailModal(payoutId: string): void {
    this.failModalPayoutId.set(payoutId);
    this.failReason.set('');
  }

  closeFailModal(): void {
    this.failModalPayoutId.set(null);
    this.failReason.set('');
  }

  async confirmFail(): Promise<void> {
    const payoutId = this.failModalPayoutId();
    const reason = this.failReason().trim();
    if (!payoutId) return;
    if (!reason) {
      this.message.warning('กรุณาระบุเหตุผลที่โอนไม่สำเร็จ');
      return;
    }
    this.busyId.set(payoutId);
    try {
      await this.admin.setPayoutStatus(payoutId, 'failed', reason);
      this.message.success('อัปเดตสถานะเรียบร้อย');
      this.closeFailModal();
      await this.reload();
    } catch (e) {
      this.apiFail.report('อัปเดตสถานะการถอนเงิน', e);
    } finally {
      this.busyId.set(null);
    }
  }

  // ===== §3.7: slip upload + verification modal =====

  async openSlipModal(p: AdminPayoutResponse): Promise<void> {
    this.slipModalPayout.set(p);
    this.slips.set([]);
    this.latestResult.set(null);
    this.clearSelectedFile();
    this.loadingSlips.set(true);
    try {
      const list = await this.admin.listPayoutSlips(p.id ?? '');
      this.slips.set(list);
      this.latestResult.set(list[0] ?? null);
    } catch (e) {
      this.apiFail.report('โหลดประวัติสลิป', e);
    } finally {
      this.loadingSlips.set(false);
    }
  }

  closeSlipModal(): void {
    this.slipModalPayout.set(null);
    this.slips.set([]);
    this.latestResult.set(null);
    this.clearSelectedFile();
  }

  private clearSelectedFile(): void {
    const prev = this.filePreviewUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.filePreviewUrl.set(null);
    this.selectedFile.set(null);
    this.fileError.set(null);
  }

  onFileSelected(file: File | null): void {
    this.clearSelectedFile();
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      this.fileError.set('รองรับเฉพาะไฟล์รูปภาพหรือ PDF');
      return;
    }
    if (file.size > MAX_SLIP_BYTES) {
      this.fileError.set('ไฟล์ต้องไม่เกิน 5MB');
      return;
    }
    this.selectedFile.set(file);
    if (isImage) this.filePreviewUrl.set(URL.createObjectURL(file));
  }

  onFileInputChange(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    this.onFileSelected(input.files?.[0] ?? null);
    input.value = '';
  }

  onDrop(evt: DragEvent): void {
    evt.preventDefault();
    this.dragOver.set(false);
    this.onFileSelected(evt.dataTransfer?.files?.[0] ?? null);
  }

  onDragOver(evt: DragEvent): void {
    evt.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(): void {
    this.dragOver.set(false);
  }

  async uploadSlip(): Promise<void> {
    const payout = this.slipModalPayout();
    const file = this.selectedFile();
    if (!payout || !file || this.verifying()) return;
    this.verifying.set(true);
    try {
      const slip = await this.admin.uploadPayoutSlip(payout.id ?? '', file);
      this.latestResult.set(slip);
      this.slips.update((list) => [slip, ...list]);
      this.clearSelectedFile();
      if (slip.verificationStatus === 'matched') {
        this.message.success('ยืนยันการโอนสำเร็จ รายการถูกปิดแล้ว');
      }
      await this.reload();
    } catch (e) {
      this.apiFail.report('อัปโหลดสลิป', e);
    } finally {
      this.verifying.set(false);
    }
  }

  async reverify(slip: PayoutSlip): Promise<void> {
    const payout = this.slipModalPayout();
    if (!payout || this.verifying()) return;
    this.verifying.set(true);
    try {
      const updated = await this.admin.reverifyPayoutSlip(payout.id ?? '', slip.id);
      this.latestResult.set(updated);
      this.slips.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
      if (updated.verificationStatus === 'matched') {
        this.message.success('ยืนยันการโอนสำเร็จ รายการถูกปิดแล้ว');
      }
      await this.reload();
    } catch (e) {
      this.apiFail.report('ตรวจสอบสลิปอีกครั้ง', e);
    } finally {
      this.verifying.set(false);
    }
  }

  // ===== §3.7.6: "ยืนยันด้วยตนเอง" =====

  openManualModal(): void {
    this.manualModalOpen.set(true);
    this.manualNote.set('');
  }

  closeManualModal(): void {
    this.manualModalOpen.set(false);
    this.manualNote.set('');
  }

  async submitManual(): Promise<void> {
    const payout = this.slipModalPayout();
    if (!payout || this.manualSubmitting()) return;
    const note = this.manualNote().trim();
    if (note.length < 10) {
      this.message.warning('ระบุเหตุผลที่ยืนยันโดยไม่ผ่านการตรวจสลิป');
      return;
    }
    this.manualSubmitting.set(true);
    try {
      await this.admin.completePayoutManually(payout.id ?? '', note);
      this.message.success('ยืนยันการโอนสำเร็จ รายการถูกปิดแล้ว');
      this.closeManualModal();
      this.closeSlipModal();
      await this.reload();
    } catch (e) {
      this.apiFail.report('ยืนยันด้วยตนเอง', e);
    } finally {
      this.manualSubmitting.set(false);
    }
  }

  // ===== withdrawal-management (round 2): batch slip upload + auto-matching =====

  openBatchModal(): void {
    this.batchModalOpen.set(true);
    this.batchFiles.set([]);
    this.batchResult.set(null);
    this.batchError.set(null);
  }

  closeBatchModal(): void {
    if (this.batchUploading()) return;
    this.batchModalOpen.set(false);
    this.batchFiles.set([]);
    this.batchResult.set(null);
    this.batchError.set(null);
  }

  private addBatchFiles(files: File[]): void {
    if (files.length === 0) return;
    const accepted: File[] = [];
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      if (isImage || isPdf) accepted.push(file);
    }
    if (accepted.length < files.length) {
      this.batchError.set('บางไฟล์ถูกข้าม — รองรับเฉพาะไฟล์รูปภาพหรือ PDF');
    }
    this.batchFiles.update((list) => [...list, ...accepted]);
  }

  onBatchFilesInputChange(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    this.addBatchFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  removeBatchFile(index: number): void {
    this.batchFiles.update((list) => list.filter((_, i) => i !== index));
  }

  async submitBatchUpload(): Promise<void> {
    const files = this.batchFiles();
    if (files.length === 0 || this.batchUploading()) return;
    this.batchUploading.set(true);
    this.batchError.set(null);
    try {
      const result = await this.admin.uploadBatchPayoutSlips(files);
      this.batchResult.set(result);
      this.batchFiles.set([]);
      if (result.completedCount > 0) {
        this.message.success(`โอนเงินสำเร็จอัตโนมัติ ${result.completedCount} รายการ`);
      }
      await this.reload();
    } catch (e) {
      this.apiFail.report('อัปโหลดสลิปหลายไฟล์', e);
    } finally {
      this.batchUploading.set(false);
    }
  }

  batchItemFileUrl(url: string | null): string {
    if (!url) return '';
    return resolveDownloadUrl(url, this.auth.accessToken(), null, true);
  }

  batchStatusLabel(status: string): string {
    switch (status) {
      case 'matched':
        return 'จับคู่สำเร็จ โอนเงินเรียบร้อย';
      case 'mismatched':
        return 'จับคู่ได้ แต่ข้อมูลไม่ตรงทั้งหมด';
      case 'duplicate':
        return 'สลิปซ้ำ';
      case 'provider_error':
        return 'ตรวจสอบไฟล์ไม่สำเร็จ';
      case 'unreadable':
        return 'อ่านไฟล์ไม่ได้';
      case 'unmatched':
        return 'ไม่พบรายการถอนเงินที่ตรงกัน';
      default:
        return status;
    }
  }

  batchStatusClass(status: string): string {
    switch (status) {
      case 'matched':
        return 'bg-emerald-50 text-emerald-700';
      case 'mismatched':
      case 'unmatched':
        return 'bg-amber-50 text-amber-700';
      default:
        return 'bg-rose-50 text-rose-700';
    }
  }

  // ===== Display helpers =====

  mismatchLabel(reason: string): string {
    return MISMATCH_REASON_LABELS[reason] ?? reason;
  }

  slipFileUrl(slip: PayoutSlip): string {
    return resolveDownloadUrl(slip.fileUrl, this.auth.accessToken(), null, true);
  }

  destinationBadge(p: AdminPayoutResponse): string {
    return p.destinationType === 'promptpay' ? 'พร้อมเพย์' : 'ธนาคาร';
  }

  /** §4.5: warn when the seller edited their payout account after this request was filed. */
  destinationChanged(p: AdminPayoutResponse): boolean {
    return !!p.payoutAccountMasked && !!p.bankAccount && p.payoutAccountMasked !== p.bankAccount;
  }

  slipStatusLabel(status: string | null | undefined): string {
    switch (status) {
      case 'matched':
        return 'ตรงกัน';
      case 'mismatched':
        return 'ไม่ตรงกัน';
      case 'provider_error':
        return 'ตรวจสอบไม่สำเร็จ';
      case 'duplicate':
        return 'สลิปซ้ำ';
      case 'manually_accepted':
        return 'ยืนยันด้วยตนเอง';
      case 'pending':
        return 'กำลังตรวจสอบ';
      default:
        return 'ยังไม่มีสลิป';
    }
  }

  statusLabel(status: string | undefined): string {
    switch (status) {
      case 'paid':
        return 'โอนแล้ว';
      case 'processing':
        return 'กำลังโอน';
      case 'failed':
        return 'ไม่สำเร็จ';
      case 'cancelled':
        return 'ยกเลิกแล้ว';
      default:
        return 'รอดำเนินการ';
    }
  }

  statusClass(status: string | undefined): string {
    switch (status) {
      case 'paid':
        return 'bg-emerald-50 text-emerald-700';
      case 'processing':
        return 'bg-sky-50 text-sky-700';
      case 'failed':
        return 'bg-rose-50 text-rose-700';
      case 'cancelled':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-amber-50 text-amber-700';
    }
  }
}
