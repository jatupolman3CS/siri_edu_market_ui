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

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

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
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users.page.html',
  styleUrl: './users.page.scss',
})
export class AdminUsersPage {
  private readonly admin = inject(AdminService);
  readonly translation = inject(TranslationService);

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

  readonly roles = computed(() => [
    { value: '', label: this.translation.t('common.roles.all') },
    { value: 'buyer', label: this.translation.t('common.roles.buyer') },
    { value: 'seller', label: this.translation.t('common.roles.seller') },
    { value: 'admin', label: this.translation.t('common.roles.admin') },
  ]);

  readonly statuses = computed(() => [
    { value: '', label: this.translation.t('common.userStatuses.all') },
    { value: 'active', label: this.translation.t('common.userStatuses.active') },
    { value: 'suspended', label: this.translation.t('common.userStatuses.suspended') },
    { value: 'banned', label: this.translation.t('common.userStatuses.banned') },
  ]);

  readonly sorts = computed<Array<{ value: AdminUsersSort; label: string }>>(() => [
    { value: 'newest', label: this.translation.t('common.userSorts.newest') },
    { value: 'oldest', label: this.translation.t('common.userSorts.oldest') },
    { value: 'most_spent', label: this.translation.t('common.userSorts.mostSpent') },
    { value: 'most_earned', label: this.translation.t('common.userSorts.mostEarned') },
    { value: 'name_asc', label: this.translation.t('common.userSorts.nameAsc') },
  ]);

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
      case 'buyer': return this.translation.t('common.roles.buyer');
      case 'seller': return this.translation.t('common.roles.seller');
      case 'admin': return this.translation.t('common.roles.admin');
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
        return this.translation.t('common.userStatuses.active');
      case 'suspended':
        return this.translation.t('common.userStatuses.suspended');
      case 'banned':
        return this.translation.t('common.userStatuses.banned');
      default:
        return status;
    }
  }
}
