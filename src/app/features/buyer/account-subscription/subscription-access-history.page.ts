import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SubscriptionService } from '../../../core/services';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

/**
 * subscription-membership v2 §1 AC-24 / §4: "/account/subscription/access-history" — paginated
 * list of documents accessed via subscription, badge "ยังเข้าถึงได้"/"หมดสิทธิ์แล้ว" per
 * `stillAccessible`. Round 1: `SubscriptionService.accessHistory()` always resolves to an empty
 * page (stub) — see `SubscriptionService`'s class doc.
 */
@Component({
  selector: 'app-buyer-subscription-access-history',
  standalone: true,
  imports: [RouterLink, DatePipe, EmptyStateComponent, PaginationComponent, ImgFallbackDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './subscription-access-history.page.html',
  styleUrl: './subscription-access-history.page.scss',
})
export class SubscriptionAccessHistoryPage {
  readonly subscription = inject(SubscriptionService);

  constructor() {
    void this.subscription.loadAccessHistory();
  }

  onPageChange(page: number): void {
    void this.subscription.onAccessHistoryPageChange(page);
  }

  onPageSizeChange(size: number): void {
    void this.subscription.onAccessHistoryPageSizeChange(size);
  }
}
