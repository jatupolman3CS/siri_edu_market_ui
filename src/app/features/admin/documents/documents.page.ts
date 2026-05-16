import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
};
import { unwrapSdkResult } from '../../../core/services/api-result';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-admin-documents',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, ThbPipe, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documents.page.html',
  styleUrl: './documents.page.scss',
})
export class AdminDocumentsPage {
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
    { value: 'all', label: 'ทุกสถานะ' },
    { value: 'draft', label: 'ฉบับร่าง' },
    { value: 'pending', label: 'รออนุมัติ' },
    { value: 'approved', label: 'อนุมัติแล้ว' },
    { value: 'rejected', label: 'ปฏิเสธ' },
  ];

  readonly formats = [
    { value: '', label: 'ทุกรูปแบบ' },
    { value: 'pdf', label: 'PDF' },
    { value: 'docx', label: 'Word' },
    { value: 'pptx', label: 'PowerPoint' },
    { value: 'xlsx', label: 'Excel' },
    { value: 'zip', label: 'ZIP' },
  ];

  readonly sorts = [
    { value: 'Newest', label: 'ใหม่สุด' },
    { value: 'Oldest', label: 'เก่าสุด' },
    { value: 'PriceAsc', label: 'ราคาต่ำ → สูง' },
    { value: 'PriceDesc', label: 'ราคาสูง → ต่ำ' },
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
          }),
        ),
      );
      this.totalCount.set(data.totalCount ?? 0);
      this.totalPages.set(data.totalPages ?? 0);
    } catch (e) {
      this.apiFail.report('โหลดรายการเอกสาร (แอดมิน)', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  applyFilters(): void {
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
      this.message.warning('เลือกเอกสารอย่างน้อย 1 รายการ');
      return;
    }
    if (action === 'reject' && !this.bulkReason().trim()) {
      this.message.warning('กรุณาระบุเหตุผลการปฏิเสธ');
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
      this.message.success(`ดำเนินการแล้ว ${data.processedCount} รายการ`);
      if (data.failedIds?.length) {
        this.message.warning(`ไม่สำเร็จ ${data.failedIds.length} รายการ`);
      }
      this.selectedIds.set(new Set());
      await this.fetchList();
    } catch (e) {
      this.apiFail.report('ดำเนินการกลุ่ม', e);
    }
  }

  statusLabel(s: string): string {
    return (
      {
        draft: 'ร่าง',
        pending: 'รออนุมัติ',
        approved: 'อนุมัติ',
        rejected: 'ปฏิเสธ',
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
