import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services';
import type { AdminSellersSort } from '../../../core/api/types.gen';
import type { AdminSellerRow } from '../../../core/models';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/**
 * backend-wide-pagination-and-seller-directory v1 §4.1: table-result + filter, replacing the old
 * card grid + infinite-scroll (AC-11..AC-14). Structure mirrors `documents.page.ts` exactly
 * (filter card → `<table>` → prev/next bar) but fetches through `AdminService.searchSellers()`
 * rather than calling the SDK straight from the page (spec's explicit deviation from the
 * `documents.page.ts` precedent — see spec §4 point 2).
 */
@Component({
  selector: 'app-admin-sellers',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    IconComponent,
    PaginationComponent,
    CompactPipe,
    ThbPipe,
    DatePipe,
    ImgFallbackDirective,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sellers.page.html',
  styleUrl: './sellers.page.scss',
})
export class AdminSellersPage {
  private readonly admin = inject(AdminService);

  readonly page = signal(1);
  readonly pageSize = signal(20);

  readonly q = signal<string>('');
  readonly verifiedOnly = signal(false);
  readonly joinedFrom = signal<string>('');
  readonly joinedTo = signal<string>('');
  readonly sort = signal<string>('Newest');

  readonly items = signal<AdminSellerRow[]>([]);
  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly loading = signal(false);

  readonly sorts = [
    { value: 'Newest', key: 'admin.sellers.sortNewest' },
    { value: 'Oldest', key: 'admin.sellers.sortOldest' },
    { value: 'MostDocuments', key: 'admin.sellers.sortMostDocs' },
    { value: 'MostRevenue', key: 'admin.sellers.sortMostRevenue' },
    { value: 'NameAsc', key: 'admin.sellers.sortNameAsc' },
  ];

  private readonly sortKeyToApi: Record<string, AdminSellersSort> = {
    Newest: 0,
    Oldest: 1,
    MostDocuments: 2,
    MostRevenue: 3,
    NameAsc: 4,
  };

  readonly totalPagesSafe = computed(() => Math.max(1, this.totalPages() || 1));

  constructor() {
    void this.fetchList();
  }

  private async fetchList(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.admin.searchSellers({
        page: this.page(),
        pageSize: this.pageSize(),
        q: this.q().trim() || undefined,
        verifiedOnly: this.verifiedOnly() || undefined,
        joinedFrom: this.joinedFrom().trim() || undefined,
        joinedTo: this.joinedTo().trim() || undefined,
        sort: this.sortKeyToApi[this.sort()] ?? 0,
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
}
