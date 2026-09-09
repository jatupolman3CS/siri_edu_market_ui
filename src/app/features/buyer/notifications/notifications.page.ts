import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NotificationFeedService, type NotificationFeedItemResponse } from '../../../core/services';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

/**
 * follow-store-notifications v1 (docs/contracts/follow-store-notifications.md §4).
 *
 * Full notification history at `/notifications` — paginated via "โหลดเพิ่มเติม" (not
 * infinite scroll), sharing `NotificationFeedService.items` with the header bell dropdown.
 */
@Component({
  selector: 'app-buyer-notifications',
  standalone: true,
  imports: [RouterLink, PageHeroComponent, EmptyStateComponent, IconComponent, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
})
export class NotificationsPage {
  readonly feed = inject(NotificationFeedService);
  private readonly router = inject(Router);

  private readonly currentPage = signal(1);

  readonly hasMore = computed(() => this.feed.items().length < this.feed.totalCount());

  constructor() {
    this.currentPage.set(1);
    this.feed.loadFeed(1);
  }

  loadMore(): void {
    const next = this.currentPage() + 1;
    this.currentPage.set(next);
    this.feed.loadFeed(next);
  }

  onItemClick(item: NotificationFeedItemResponse): void {
    // Fire-and-forget — navigate immediately, don't wait for the mark-read response.
    this.feed.markRead(item.id).subscribe({ error: () => { /* reported via ApiFailureReporter */ } });
    void this.router.navigate([item.linkUrl]);
  }
}
