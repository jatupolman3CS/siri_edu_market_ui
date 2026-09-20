import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { resolveDownloadUrl } from '../../../core/api-runtime';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
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
    TranslatePipe,
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
  private readonly translation = inject(TranslationService);

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

  get statusOptions(): { value: string; label: string }[] {
    const t = this.translation;
    return [
      { value: 'all', label: t.t('common.all') || t.t('admin.subscriptionsAdmin.statusAll') },
      { value: 'new', label: t.t('admin.feedback.statusNew') },
      { value: 'in_progress', label: t.t('admin.feedback.statusInProgress') },
      { value: 'resolved', label: t.t('admin.feedback.statusResolved') },
      { value: 'closed', label: t.t('admin.feedback.statusClosed') },
    ];
  }

  get typeOptions(): { value: string; label: string }[] {
    const t = this.translation;
    return [
      { value: 'all', label: t.t('admin.subscriptionsAdmin.statusAll') },
      { value: 'bug', label: t.t('admin.feedback.typeBug') },
      { value: 'suggestion', label: t.t('admin.feedback.typeSuggestion') },
      { value: 'usability', label: t.t('admin.feedback.typeUsability') },
      { value: 'other', label: t.t('admin.feedback.typeOther') },
    ];
  }

  get roleOptions(): { value: string; label: string }[] {
    const t = this.translation;
    return [
      { value: 'all', label: t.t('admin.subscriptionsAdmin.statusAll') },
      { value: 'buyer', label: t.t('admin.userDetailAdmin.roleBuyer') },
      { value: 'seller', label: t.t('admin.userDetailAdmin.roleSeller') },
    ];
  }

  constructor() {
    void this.reload();
  }

  statusLabel(s: string | undefined): string {
    if (!s) return this.translation.t('admin.feedback.unspecified');
    const keyMap: Record<string, string> = {
      new: 'admin.feedback.statusNew',
      in_progress: 'admin.feedback.statusInProgress',
      resolved: 'admin.feedback.statusResolved',
      closed: 'admin.feedback.statusClosed',
    };
    const tKey = keyMap[s];
    return tKey ? this.translation.t(tKey) : s;
  }

  typeLabel(type: string | undefined): string {
    if (!type) return this.translation.t('admin.feedback.unspecified');
    const keyMap: Record<string, string> = {
      bug: 'admin.feedback.typeBug',
      suggestion: 'admin.feedback.typeSuggestion',
      usability: 'admin.feedback.typeUsability',
      other: 'admin.feedback.typeOther',
    };
    const tKey = keyMap[type];
    return tKey ? this.translation.t(tKey) : type;
  }

  roleLabel(r: string | undefined): string {
    if (!r) return this.translation.t('admin.feedback.unspecified');
    const keyMap: Record<string, string> = {
      buyer: 'admin.userDetailAdmin.roleBuyer',
      seller: 'admin.userDetailAdmin.roleSeller',
    };
    const tKey = keyMap[r];
    return tKey ? this.translation.t(tKey) : r;
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
      this.apiFail.report('errors.context.loadFeedbackList', e);
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
      this.apiFail.report('errors.context.loadFeedbackDetail', e);
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
      this.message.success(this.translation.t('admin.feedback.saveSuccess'));
      await this.reload();
    } catch (e) {
      this.apiFail.report('errors.context.saveFeedbackStatus', e);
    } finally {
      this.savingDetail.set(false);
    }
  }

  confirmDelete(id: string | undefined): void {
    if (!id) return;
    this.modal.confirm({
      nzTitle: this.translation.t('admin.feedback.confirmDeleteTitle'),
      nzContent: this.translation.t('admin.feedback.confirmDeleteContent'),
      nzOkText: this.translation.t('admin.feedback.confirmDeleteOk'),
      nzOkDanger: true,
      nzCancelText: this.translation.t('common.cancel') || 'ยกเลิก',
      nzOnOk: async () => {
        this.busyDeleteId.set(id);
        try {
          await this.admin.deleteFeedback(id);
          this.message.success(this.translation.t('admin.feedback.deleteSuccess'));
          this.closeDetail();
          await this.reload();
        } catch (e) {
          this.apiFail.report('errors.context.deleteFeedback', e);
        } finally {
          this.busyDeleteId.set(null);
        }
      },
    });
  }
}
