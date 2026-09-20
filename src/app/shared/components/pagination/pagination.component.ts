import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
})
export class PaginationComponent {
  readonly page = input<number>(1);
  readonly pageSize = input<number>(10);
  readonly pageSizeOptions = input<number[]>([10, 20, 50, 100]);
  readonly showPageSize = input<boolean>(true);
  readonly total = input<number>(0);
  readonly totalPages = input<number | undefined>(undefined);
  readonly showTotal = input<boolean>(true);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly computedTotalPages = computed(() => {
    const override = this.totalPages();
    if (typeof override === 'number' && override > 0) return override;
    const totalItems = this.total();
    const size = Math.max(1, this.pageSize());
    return Math.max(1, Math.ceil(totalItems / size));
  });

  readonly pages = computed<(number | '...')[]>(() => {
    const totalP = this.computedTotalPages();
    const current = Math.min(Math.max(1, this.page()), totalP);

    if (totalP <= 7) {
      return Array.from({ length: totalP }, (_, i) => i + 1);
    }

    const pages: (number | '...')[] = [];

    // Always include first page
    pages.push(1);

    if (current > 3) {
      pages.push('...');
    }

    const start = Math.max(2, current - 1);
    const end = Math.min(totalP - 1, current + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (current < totalP - 2) {
      pages.push('...');
    }

    // Always include last page
    pages.push(totalP);

    return pages;
  });

  readonly startRecord = computed(() => {
    if (this.total() === 0) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  });

  readonly endRecord = computed(() => {
    return Math.min(this.total(), this.page() * this.pageSize());
  });

  goToPage(p: number | '...'): void {
    if (p === '...' || p === this.page()) return;
    const totalP = this.computedTotalPages();
    const target = Math.min(Math.max(1, p), totalP);
    if (target !== this.page()) {
      this.pageChange.emit(target);
    }
  }

  prev(): void {
    if (this.page() > 1) {
      this.pageChange.emit(this.page() - 1);
    }
  }

  next(): void {
    if (this.page() < this.computedTotalPages()) {
      this.pageChange.emit(this.page() + 1);
    }
  }

  onPageSizeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newSize = parseInt(target.value, 10);
    if (!isNaN(newSize) && newSize > 0 && newSize !== this.pageSize()) {
      this.pageSizeChange.emit(newSize);
    }
  }
}
