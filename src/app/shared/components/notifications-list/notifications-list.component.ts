import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  NotificationFeedService,
  getNotificationStyle,
  notificationHeadingFor,
  resolveSafeLinkUrl,
  type NotificationAudience,
  type NotificationFeedItemResponse,
  type NotificationStyleInfo,
} from '../../../core/services';
import { PageHeroComponent } from '../page-hero/page-hero.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { IconComponent } from '../icon/icon.component';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';

/** Spec §4.2 — sub-heading per audience. */
const DESCRIPTIONS: Readonly<Record<NotificationAudience, string>> = {
  buyer: 'ข่าวสารเอกสารใหม่จากร้านที่คุณติดตาม และการตอบกลับที่เกี่ยวกับคุณ',
  seller: 'ยอดขาย รีวิว คำถามจากผู้ซื้อ และสถานะเอกสารของร้านคุณ',
  admin: 'เอกสารรอตรวจสอบ คำขอถอนเงิน และงานที่ต้องดำเนินการ',
};

const EMPTY_DESCRIPTIONS: Readonly<Record<NotificationAudience, string>> = {
  buyer: 'ลองติดตามร้านที่ชอบเพื่อรับข่าวเอกสารใหม่ก่อนใคร',
  seller: 'เมื่อมีความเคลื่อนไหวของร้าน เช่น ยอดขายหรือรีวิวใหม่ จะแสดงที่นี่',
  admin: 'เมื่อมีงานที่ต้องดำเนินการ เช่น เอกสารรอตรวจสอบ จะแสดงที่นี่',
};

/**
 * notification-master-config v1 §4.1.
 *
 * The notification-history body, shared by all three routes (`/notifications`,
 * `/seller/notifications`, `/admin/notifications`). Root cause #4 of the reported bug was
 * that only the buyer route existed, so a seller clicking "ดูทั้งหมด" was thrown into the
 * buyer layout; each layout now owns a thin page that renders this component with its own
 * `audience`.
 */
@Component({
  selector: 'app-notifications-list',
  standalone: true,
  imports: [RouterLink, PageHeroComponent, EmptyStateComponent, IconComponent, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications-list.component.html',
  styleUrl: './notifications-list.component.scss',
})
export class NotificationsListComponent {
  readonly feed = inject(NotificationFeedService);
  private readonly router = inject(Router);

  readonly audience = input<NotificationAudience>('buyer');

  private readonly currentPage = signal(1);

  readonly hasMore = computed(() => this.feed.items().length < this.feed.totalCount());
  readonly heading = computed(() => notificationHeadingFor(this.audience()));
  readonly description = computed(() => DESCRIPTIONS[this.audience()]);
  readonly emptyDescription = computed(() => EMPTY_DESCRIPTIONS[this.audience()]);
  readonly unreadCount = computed(() => this.feed.unreadByAudience()[this.audience()]);

  constructor() {
    effect(() => {
      const audience = this.audience();
      this.currentPage.set(1);
      this.feed.loadFeed(1, audience);
    });
  }

  getStyle(key: string, title = ''): NotificationStyleInfo {
    return getNotificationStyle(key, title);
  }

  loadMore(): void {
    const next = this.currentPage() + 1;
    this.currentPage.set(next);
    this.feed.loadFeed(next, this.audience());
  }

  onItemClick(item: NotificationFeedItemResponse): void {
    // Fire-and-forget — navigate immediately, don't wait for the mark-read response.
    this.feed.markRead(item.id).subscribe({ error: () => { /* reported via ApiFailureReporter */ } });
    // AC-8 `navigateByUrl` (query strings survive) + AC-6 (destination stays in this layout).
    void this.router.navigateByUrl(resolveSafeLinkUrl(item.linkUrl, this.audience()));
  }

  onMarkAllRead(): void {
    // AC-4: only this page's audience is cleared.
    this.feed.markAllRead(this.audience()).subscribe({ error: () => { /* reported via ApiFailureReporter */ } });
  }
}
