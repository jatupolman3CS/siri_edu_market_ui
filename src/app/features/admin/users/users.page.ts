import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services';
import type { AdminUserRow, AdminUsersSort, AdminUserAccountStatus } from '../../../core/models';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    IconComponent,
    PaginationComponent,
    ThbPipe,
    DatePipe,
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users.page.html',
  styleUrl: './users.page.scss',
})
export class AdminUsersPage {
  private readonly admin = inject(AdminService);

  readonly page = signal(1);
  readonly pageSize = signal(20);

  readonly q = signal<string>('');
  readonly role = signal<string>('');
  readonly status = signal<string>('');
  readonly joinedFrom = signal<string>('');
  readonly joinedTo = signal<string>('');
  readonly sort = signal<AdminUsersSort>('newest');

  readonly items = signal<AdminUserRow[]>([]);
  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly loading = signal(false);

  readonly roles = [
    { value: '', label: 'ทั้งหมด' },
    { value: 'buyer', label: 'ผู้ซื้อ' },
    { value: 'seller', label: 'ผู้ขาย' },
    { value: 'admin', label: 'ผู้ดูแลระบบ' },
  ];

  readonly statuses = [
    { value: '', label: 'ทั้งหมด' },
    { value: 'active', label: 'ปกติ' },
    { value: 'suspended', label: 'ระงับชั่วคราว' },
    { value: 'banned', label: 'แบนถาวร' },
  ];

  readonly sorts: Array<{ value: AdminUsersSort; label: string }> = [
    { value: 'newest', label: 'ใหม่สุด' },
    { value: 'oldest', label: 'เก่าสุด' },
    { value: 'most_spent', label: 'ซื้อมากสุด' },
    { value: 'most_earned', label: 'ขายมากสุด' },
    { value: 'name_asc', label: 'ชื่อ A-Z' },
  ];

  readonly totalPagesSafe = computed(() => Math.max(1, this.totalPages() || 1));

  constructor() {
    void this.fetchList();
  }

  async fetchList(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.admin.searchUsers({
        page: this.page(),
        pageSize: this.pageSize(),
        q: this.q().trim() || undefined,
        role: this.role() || undefined,
        status: this.status() || undefined,
        joinedFrom: this.joinedFrom().trim() || undefined,
        joinedTo: this.joinedTo().trim() || undefined,
        sort: this.sort(),
      });
      this.items.set(result.items ?? []);
      this.totalCount.set(result.totalCount ?? 0);
      this.totalPages.set(result.totalPages ?? 0);
    } finally {
      this.loading.set(false);
    }
  }

  applyFilters(): void {
    this.page.set(1);
    void this.fetchList();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    void this.fetchList();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
    void this.fetchList();
  }

  getRoleLabel(role: string): string {
    switch (role.toLowerCase()) {
      case 'buyer': return 'ผู้ซื้อ';
      case 'seller': return 'ผู้ขาย';
      case 'admin': return 'ผู้ดูแลระบบ';
      default: return role;
    }
  }

  getStatusClass(status: AdminUserAccountStatus): string {
    switch (status) {
      case 'active':
        return 'pill-green';
      case 'suspended':
        return 'pill-soft text-amber-600';
      case 'banned':
        return 'pill-soft text-red-600';
      default:
        return 'pill-soft';
    }
  }

  getStatusLabel(status: AdminUserAccountStatus): string {
    switch (status) {
      case 'active':
        return 'ปกติ';
      case 'suspended':
        return 'ระงับชั่วคราว';
      case 'banned':
        return 'แบนถาวร';
      default:
        return status;
    }
  }
}
