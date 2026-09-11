import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AdminAuditLogResponse } from '../../../core/api';
import { AdminService } from '../../../core/services/admin.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';

/**
 * F-10: the admin audit log.
 *
 * ADMIN_AUDIT_LOG gains a row on every approve, reject, edit and payout move, but the only way
 * to read one was RecentAudit inside a single document's detail — so "who did what yesterday"
 * meant opening documents one at a time and hoping.
 *
 * Paged from the first day: this table only ever grows.
 */
@Component({
  selector: 'app-admin-audit',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, RouterLink, EmptyStateComponent, PaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit.page.html',
})
export class AdminAuditPage {
  private readonly admin = inject(AdminService);
  private readonly apiFail = inject(ApiFailureReporter);

  readonly entries = signal<AdminAuditLogResponse[]>([]);
  readonly loading = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly totalPages = signal(1);
  readonly total = signal(0);
  readonly expandedId = signal<string | null>(null);

  action = '';
  from = '';
  to = '';

  constructor() {
    void this.reload();
  }

  /** Route for the entity a row is about, so a log line is a way in rather than a dead end. */
  entityLink(entry: AdminAuditLogResponse): string[] | null {
    if (!entry.entityId) return null;
    switch (entry.entityType) {
      case 'Document':
        return ['/admin/documents', entry.entityId];
      case 'Payout':
        return ['/admin/payouts'];
      default:
        return null;
    }
  }

  toggleDetails(id: string | undefined): void {
    if (!id) return;
    this.expandedId.update((current) => (current === id ? null : id));
  }

  /** Action mapping to human-readable Thai */
  actionLabel(action: string | undefined): string {
    if (!action) return 'การกระทำ';
    const map: Record<string, string> = {
      'document.approve': 'อนุมัติเอกสาร',
      'document.reject': 'ปฏิเสธเอกสาร',
      'document.patch': 'แก้ไขข้อมูลเอกสาร',
      'document.bulk': 'จัดการเอกสารเป็นกลุ่ม',
      'document.report.create': 'รายงานปัญหาเอกสาร',
      'document.report.resolve': 'จัดการรายงานปัญหา',
      'document.report.resolve_all': 'จัดการรายงานปัญหาทั้งหมด',
      'payout.approve': 'อนุมัติการถอนเงิน',
      'payout.reject': 'ปฏิเสธการถอนเงิน',
      'order.refund': 'คืนเงินคำสั่งซื้อ',
    };
    return map[action] ?? action;
  }

  /** Action color style */
  actionBadgeClass(action: string | undefined): string {
    if (!action) return 'bg-pink-50 text-pink-700 border-pink-200';
    if (action.includes('approve')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (action.includes('reject')) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (action.includes('patch')) return 'bg-sky-50 text-sky-700 border-sky-200';
    if (action.includes('refund')) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-pink-50 text-pink-700 border-pink-200';
  }

  /** Entity type label in Thai */
  entityTypeLabel(type: string | undefined): string {
    if (!type) return 'รายการ';
    const map: Record<string, string> = {
      Document: 'เอกสาร',
      Payout: 'การถอนเงิน',
      Order: 'คำสั่งซื้อ',
    };
    return map[type] ?? type;
  }

  /**
   * Formats detailsJson into clean key-value entries with Thai labels,
   * filtering out empty/null fields so only meaningful data is shown.
   */
  parseDetails(detailsJson: string | null | undefined): { label: string; value: string }[] {
    if (!detailsJson) return [];
    try {
      const obj = JSON.parse(detailsJson);
      if (!obj || typeof obj !== 'object') return [{ label: 'ข้อมูล', value: String(obj) }];

      const fieldLabels: Record<string, string> = {
        title: 'ชื่อเอกสาร',
        Title: 'ชื่อเอกสาร',
        shortDescription: 'คำอธิบายสั้น',
        ShortDescription: 'คำอธิบายสั้น',
        description: 'รายละเอียด',
        Description: 'รายละเอียด',
        price: 'ราคา',
        Price: 'ราคา',
        status: 'สถานะ',
        Status: 'สถานะ',
        reason: 'เหตุผล',
        Reason: 'เหตุผล',
        action: 'การกระทำ',
        Action: 'การกระทำ',
        amount: 'ยอดเงิน',
        Amount: 'ยอดเงิน',
        netAmount: 'ยอดสุทธิ',
        NetAmount: 'ยอดสุทธิ',
        orderNumber: 'เลขคำสั่งซื้อ',
        OrderNumber: 'เลขคำสั่งซื้อ',
        note: 'บันทึก',
        Note: 'บันทึก',
        count: 'จำนวน',
        Count: 'จำนวน',
        watermarkEnabled: 'เปิดใช้ลายน้ำ',
        WatermarkEnabled: 'เปิดใช้ลายน้ำ',
        isFeatured: 'แนะนำพิเศษ',
        IsFeatured: 'แนะนำพิเศษ',
        isFree: 'ฟรี',
        IsFree: 'ฟรี',
        format: 'รูปแบบ',
        Format: 'รูปแบบ',
        categoryIds: 'หมวดหมู่',
        CategoryIds: 'หมวดหมู่',
        tags: 'แท็ก',
        Tags: 'แท็ก',
      };

      const result: { label: string; value: string }[] = [];
      for (const [key, val] of Object.entries(obj)) {
        if (val === null || val === undefined || val === '') continue;
        if (Array.isArray(val) && val.length === 0) continue;

        const label = fieldLabels[key] || key;
        let valueStr = '';
        if (Array.isArray(val)) {
          valueStr = val.join(', ');
        } else if (typeof val === 'boolean') {
          valueStr = val ? 'ใช่' : 'ไม่ใช่';
        } else if (typeof val === 'number' && (key.toLowerCase().includes('price') || key.toLowerCase().includes('amount'))) {
          valueStr = `${val.toLocaleString()} บาท`;
        } else if (typeof val === 'object') {
          valueStr = JSON.stringify(val);
        } else {
          valueStr = String(val);
        }
        result.push({ label, value: valueStr });
      }
      return result;
    } catch {
      return [{ label: 'ข้อมูล', value: detailsJson }];
    }
  }

  /** Pretty-prints DetailsJson, falling back to the raw string if it is not JSON. */
  formatDetails(detailsJson: string | null | undefined): string {
    if (!detailsJson) return '';
    try {
      return JSON.stringify(JSON.parse(detailsJson), null, 2);
    } catch {
      return detailsJson;
    }
  }

  applyFilters(): void {
    this.page.set(1);
    void this.reload();
  }

  clearFilters(): void {
    this.action = '';
    this.from = '';
    this.to = '';
    this.page.set(1);
    void this.reload();
  }

  goToPage(next: number): void {
    if (next < 1 || next > this.totalPages()) return;
    this.page.set(next);
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
      const result = await this.admin.listAuditLog({
        action: this.action.trim() || undefined,
        from: this.from || undefined,
        to: this.to || undefined,
        page: this.page(),
        pageSize: this.pageSize(),
      });
      this.entries.set(result.items ?? []);
      this.total.set(result.totalCount ?? 0);
      this.totalPages.set(Math.max(1, result.totalPages ?? 1));
    } catch (e) {
      this.apiFail.report('โหลดประวัติการทำงานของแอดมิน', e);
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
