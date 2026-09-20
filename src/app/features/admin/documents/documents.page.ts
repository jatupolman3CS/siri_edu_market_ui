import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  getApiAdminDocumentsList,
  postApiAdminDocumentsBulk,
  type AdminDocumentListItem,
} from '../../../core/api/admin-documents.api';
import type { AdminDocumentsSort } from '../../../core/api/types.gen';

/** Row shape for admin list UI — required fields normalized from API. */
type AdminDocumentRow = AdminDocumentListItem & {
  id: string;
  status: string;
  openReportCount: number;
  rating: number;
  reviewCount: number;
  downloadCount: number;
};
import { unwrapSdkResult } from '../../../core/services/api-result';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { DecimalPipe } from '@angular/common';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-admin-documents',
  standalone: true,
  imports: [
    TranslatePipe,
    FormsModule,
    RouterLink,
    DecimalPipe,
    NzCheckboxModule,
    IconComponent,
    PaginationComponent,
    ThbPipe,
    TimeAgoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documents.page.html',
  styleUrl: './documents.page.scss',
})
export class AdminDocumentsPage {
  readonly translation = inject(TranslationService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);

  readonly page = signal(1);
  readonly pageSize = signal(20);

  readonly status = signal<string>('all');
  readonly format = signal<string>('');
  readonly categoryId = signal<string>('');
  readonly sellerName = signal<string>('');
  readonly q = signal<string>('');
  readonly featuredOnly = signal(false);
  readonly hasOpenReportsOnly = signal(false);
  readonly postedFrom = signal<string>('');
  readonly postedTo = signal<string>('');
  readonly sort = signal<string>('Newest');

  readonly items = signal<AdminDocumentRow[]>([]);
  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly loading = signal(false);

  readonly selectedIds = signal<Set<string>>(new Set());

  readonly statuses = [
    { value: 'all', label: this.translation.t('admin.allStatuses') },
    { value: 'draft', label: this.translation.t('admin.statusDraft') },
    { value: 'pending', label: this.translation.t('admin.statusPending') },
    { value: 'approved', label: this.translation.t('admin.statusApproved') },
    { value: 'rejected', label: this.translation.t('admin.statusRejected') },
  ];

  readonly formats = [
    { value: '', label: this.translation.t('admin.allFormats') },
    { value: 'pdf', label: 'PDF' },
    { value: 'docx', label: 'Word' },
    { value: 'pptx', label: 'PowerPoint' },
    { value: 'xlsx', label: 'Excel' },
    { value: 'zip', label: 'ZIP' },
  ];

  readonly sorts = [
    { value: 'Newest', label: this.translation.t('admin.sortNewest') },
    { value: 'Oldest', label: this.translation.t('admin.sortOldest') },
    { value: 'PriceAsc', label: this.translation.t('admin.sortPriceAsc') },
    { value: 'PriceDesc', label: this.translation.t('admin.sortPriceDesc') },
  ];

  private readonly sortKeyToApi: Record<string, AdminDocumentsSort> = {
    Newest: 0,
    Oldest: 1,
    PriceAsc: 2,
    PriceDesc: 3,
  };

  readonly totalPagesSafe = computed(() => Math.max(1, this.totalPages() || 1));

  readonly bulkReason = signal('');

  constructor() {
    void this.fetchList();
  }

  private async fetchList(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await getApiAdminDocumentsList({
        query: {
          Page: this.page(),
          PageSize: this.pageSize(),
          Status: this.status() === 'all' ? undefined : this.status(),
          Format: this.format() || undefined,
          CategoryId: this.categoryId().trim() || undefined,
          SellerName: this.sellerName().trim() || undefined,
          Q: this.q().trim() || undefined,
          FeaturedOnly: this.featuredOnly() ? true : undefined,
          HasOpenReportsOnly: this.hasOpenReportsOnly() ? true : undefined,
          PostedFrom: this.postedFrom().trim() || undefined,
          PostedTo: this.postedTo().trim() || undefined,
          Sort: this.sortKeyToApi[this.sort()] ?? 0,
        },
      });
      const data = unwrapSdkResult(result);
      this.items.set(
        (data.items ?? []).map(
          (i): AdminDocumentRow => ({
            ...i,
            id: i.id ?? '',
            status: i.status ?? '',
            openReportCount: i.openReportCount ?? 0,
            rating: i.rating ?? 0,
            reviewCount: i.reviewCount ?? 0,
            downloadCount: i.downloadCount ?? 0,
          }),
        ),
      );
      this.totalCount.set(data.totalCount ?? 0);
      this.totalPages.set(data.totalPages ?? 0);
    } catch (e) {
      this.apiFail.report('Load admin documents', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  applyFilters(): void {
    this.page.set(1);
    void this.fetchList();
  }

  onPageChange(nextPage: number): void {
    this.page.set(nextPage);
    void this.fetchList();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize);
    this.page.set(1);
    void this.fetchList();
  }

  prevPage(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    void this.fetchList();
  }

  nextPage(): void {
    if (this.page() >= this.totalPagesSafe()) return;
    this.page.update((p) => p + 1);
    void this.fetchList();
  }

  toggleSelect(id: string, checked: boolean): void {
    const next = new Set(this.selectedIds());
    if (checked) next.add(id);
    else next.delete(id);
    this.selectedIds.set(next);
  }

  toggleSelectAll(checked: boolean): void {
    if (!checked) {
      this.selectedIds.set(new Set());
      return;
    }
    this.selectedIds.set(new Set(this.items().map((i) => i.id)));
  }

  async runBulk(action: string): Promise<void> {
    const ids = [...this.selectedIds()];
    if (!ids.length) {
      this.message.warning(this.translation.t('admin.selectAtLeastOneDoc'));
      return;
    }
    if (action === 'reject' && !this.bulkReason().trim()) {
      this.message.warning(this.translation.t('admin.specifyBulkRejectReason'));
      return;
    }
    try {
      const result = await postApiAdminDocumentsBulk({
        body: {
          documentIds: ids,
          action,
          reason: action === 'reject' ? this.bulkReason().trim() : undefined,
        },
      });
      const data = unwrapSdkResult(result);
      this.message.success(this.translation.t('admin.bulkProcessedSuccess', { count: data.processedCount ?? 0 }));
      if (data.failedIds?.length) {
        this.message.warning(this.translation.t('admin.bulkFailedPartial', { count: data.failedIds.length }));
      }
      this.selectedIds.set(new Set());
      await this.fetchList();
    } catch (e) {
      this.apiFail.report('Run bulk action', e);
    }
  }

  statusLabel(s: string): string {
    return (
      {
        draft: this.translation.t('admin.statusDraft'),
        pending: this.translation.t('admin.statusPending'),
        approved: this.translation.t('admin.statusApproved'),
        rejected: this.translation.t('admin.statusRejected'),
      }[s] ?? s
    );
  }

  statusClass(s: string): string {
    return (
      {
        draft: 'bg-slate-100 text-slate-700',
        pending: 'bg-amber-100 text-amber-800',
        approved: 'bg-emerald-100 text-emerald-800',
        rejected: 'bg-rose-100 text-rose-800',
      }[s] ?? 'bg-gray-100 text-gray-700'
    );
  }
}
