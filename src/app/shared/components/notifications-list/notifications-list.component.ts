import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  NotificationFeedService,
  getNotificationStyle,
  resolveSafeLinkUrl,
  type NotificationAudience,
  type NotificationFeedItemResponse,
  type NotificationStyleInfo,
} from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { PageHeroComponent } from '../page-hero/page-hero.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { IconComponent } from '../icon/icon.component';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';

@Component({
  selector: 'app-notifications-list',
  standalone: true,
  imports: [RouterLink, PageHeroComponent, EmptyStateComponent, IconComponent, TimeAgoPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications-list.component.html',
  styleUrl: './notifications-list.component.scss',
})
export class NotificationsListComponent {
  readonly feed = inject(NotificationFeedService);
  private readonly router = inject(Router);
  readonly translation = inject(TranslationService);

  readonly audience = input<NotificationAudience>('buyer');

  private readonly currentPage = signal(1);

  readonly hasMore = computed(() => this.feed.items().length < this.feed.totalCount());
  readonly heading = computed(() => this.translation.t(`shared.notifications.headings.${this.audience()}`));
  readonly description = computed(() => this.translation.t(`shared.notifications.descriptions.${this.audience()}`));
  readonly emptyDescription = computed(() => this.translation.t(`shared.notifications.emptyDescriptions.${this.audience()}`));
  readonly unreadCount = computed(() => this.feed.unreadByAudience()[this.audience()]);

  constructor() {
    effect(() => {
      const audience = this.audience();
      this.currentPage.set(1);
      this.feed.loadFeed(1, audience);
    });
    this.feed.refreshUnreadCount();
  }

  getStyle(key: string, title = ''): NotificationStyleInfo {
    return getNotificationStyle(key, title);
  }

  loadMore(): void {
    if (this.feed.loading() || !this.hasMore()) return;
    const next = this.currentPage() + 1;
    this.currentPage.set(next);
    this.feed.loadFeed(next, this.audience());
  }

  onItemClick(item: NotificationFeedItemResponse): void {
    if (!item.isRead) {
      this.feed.markRead(item.id).subscribe({ error: () => { /* reported via ApiFailureReporter */ } });
    }
    void this.router.navigateByUrl(resolveSafeLinkUrl(item.linkUrl, this.audience()));
  }

  onMarkAllRead(): void {
    this.feed.markAllRead(this.audience()).subscribe({ error: () => { /* reported via ApiFailureReporter */ } });
  }
}
