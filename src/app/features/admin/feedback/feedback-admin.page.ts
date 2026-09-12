import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { resolveDownloadUrl } from '../../../core/api-runtime';
import type {
  AdminFeedbackDetailResponse,
  AdminFeedbackListItemResponse,
  FeedbackRole,
  FeedbackStatus,
  FeedbackType,
} from '../../../core/models';

@Component({
  selector: 'app-admin-feedback',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    NzModalModule,
    EmptyStateComponent,
    PaginationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback-admin.page.html',
  styleUrls: ['./feedback-admin.page.scss'],
})
export class AdminFeedbackPage {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);

  readonly feedbacks = signal<AdminFeedbackListItemResponse[]>([]);
  readonly loading = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly total = signal(0);

  // Filters
  readonly statusFilter = signal<string>('all');
  readonly typeFilter = signal<string>('all');
  readonly roleFilter = signal<string>('all');

  // Detail Modal
  readonly detailModalOpen = signal(false);
  readonly selectedDetail = signal<AdminFeedbackDetailResponse | null>(null);
  readonly loadingDetail = signal(false);
  readonly savingDetail = signal(false);
  readonly busyDeleteId = signal<string | null>(null);

  // Detail Form Fields
  formStatus: FeedbackStatus = 'new';
  formAdminNote = '';
  formReplyToUser = '';

  readonly statusOptions = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'new', label: 'เรื่องใหม่' },
    { value: 'in_progress', label: 'กำลังดำเนินการ' },
    { value: 'resolved', label: 'แก้ไขแล้ว' },
    { value: 'closed', label: 'ปิดเรื่อง' },
  ];

  readonly typeOptions = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'bug', label: 'แจ้งบั๊ก/ข้อผิดพลาด' },
    { value: 'suggestion', label: 'ข้อเสนอแนะ' },
    { value: 'usability', label: 'ปัญหาการใช้งาน' },
    { value: 'other', label: 'อื่น ๆ' },
  ];

  readonly roleOptions = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'buyer', label: 'ผู้ซื้อ' },
    { value: 'seller', label: 'ผู้ขาย' },
  ];

  readonly statusLabels: Record<string, string> = {
    new: 'เรื่องใหม่',
    in_progress: 'กำลังดำเนินการ',
    resolved: 'แก้ไขแล้ว',
    closed: 'ปิดเรื่อง',
  };

  readonly typeLabels: Record<string, string> = {
    bug: 'แจ้งบั๊ก/ข้อผิดพลาด',
    suggestion: 'ข้อเสนอแนะ',
    usability: 'ปัญหาการใช้งาน',
    other: 'อื่น ๆ',
  };

  readonly roleLabels: Record<string, string> = {
    buyer: 'ผู้ซื้อ',
    seller: 'ผู้ขาย',
  };

  constructor() {
    void this.reload();
  }

  statusLabel(s: string | undefined): string {
    if (!s) return 'ไม่ระบุ';
    return this.statusLabels[s] ?? s;
  }

  typeLabel(t: string | undefined): string {
    if (!t) return 'ไม่ระบุ';
    return this.typeLabels[t] ?? t;
  }

  roleLabel(r: string | undefined): string {
    if (!r) return 'ไม่ระบุ';
    return this.roleLabels[r] ?? r;
  }

  setStatusFilter(s: string): void {
    this.statusFilter.set(s);
    this.page.set(1);
    void this.reload();
  }

  setTypeFilter(t: string): void {
    this.typeFilter.set(t);
    this.page.set(1);
    void this.reload();
  }

  setRoleFilter(r: string): void {
    this.roleFilter.set(r);
    this.page.set(1);
    void this.reload();
  }

  onPageChange(p: number): void {
    this.page.set(p);
    void this.reload();
  }

  onPageSizeChange(s: number): void {
    this.pageSize.set(s);
    this.page.set(1);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const status = this.statusFilter() === 'all' ? undefined : (this.statusFilter() as FeedbackStatus);
      const type = this.typeFilter() === 'all' ? undefined : (this.typeFilter() as FeedbackType);
      const role = this.roleFilter() === 'all' ? undefined : (this.roleFilter() as FeedbackRole);

      const res = await this.admin.listFeedback(status, type, role, this.page(), this.pageSize());
      this.feedbacks.set(res.items ?? []);
      this.total.set(res.totalCount ?? 0);
    } catch (e) {
      this.apiFail.report('โหลดรายการแจ้งปัญหา', e);
      this.feedbacks.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  async openDetail(item: AdminFeedbackListItemResponse): Promise<void> {
    if (!item.id) return;
    this.detailModalOpen.set(true);
    this.loadingDetail.set(true);
    this.selectedDetail.set(null);

    try {
      const detail = await this.admin.getFeedback(item.id);
      this.selectedDetail.set(detail);
      this.formStatus = (detail.status as FeedbackStatus) || 'new';
      this.formAdminNote = detail.adminNote ?? '';
      this.formReplyToUser = detail.replyToUser ?? '';
    } catch (e) {
      this.apiFail.report('โหลดรายละเอียดแจ้งปัญหา', e);
      this.closeDetail();
    } finally {
      this.loadingDetail.set(false);
    }
  }

  closeDetail(): void {
    this.detailModalOpen.set(false);
    this.selectedDetail.set(null);
  }

  resolveImageUrl(url: string | null | undefined): string {
    return resolveDownloadUrl(url, this.auth.accessToken(), null, true);
  }

  async saveDetail(): Promise<void> {
    const detail = this.selectedDetail();
    if (!detail?.id) return;

    this.savingDetail.set(true);
    try {
      const updated = await this.admin.updateFeedbackStatus(detail.id, {
        status: this.formStatus,
        adminNote: this.formAdminNote,
        replyToUser: this.formReplyToUser,
      });
      this.selectedDetail.set(updated);
      this.message.success('บันทึกเรียบร้อย');
      await this.reload();
    } catch (e) {
      this.apiFail.report('บันทึกสถานะ', e);
    } finally {
      this.savingDetail.set(false);
    }
  }

  confirmDelete(id: string | undefined): void {
    if (!id) return;
    this.modal.confirm({
      nzTitle: 'ลบเรื่องนี้ถาวร?',
      nzContent:
        'ระบบจะลบข้อความ ไฟล์แนบ และบันทึกของทีมงานทั้งหมดอย่างถาวร กู้คืนไม่ได้ (ใช้เมื่อผู้ใช้ขอให้ลบข้อมูลตาม PDPA)',
      nzOkText: 'ลบถาวร',
      nzOkDanger: true,
      nzCancelText: 'ยกเลิก',
      nzOnOk: async () => {
        this.busyDeleteId.set(id);
        try {
          await this.admin.deleteFeedback(id);
          this.message.success('ลบเรื่องเรียบร้อย');
          this.closeDetail();
          await this.reload();
        } catch (e) {
          this.apiFail.report('ลบเรื่องแจ้งปัญหา', e);
        } finally {
          this.busyDeleteId.set(null);
        }
      },
    });
  }
}
