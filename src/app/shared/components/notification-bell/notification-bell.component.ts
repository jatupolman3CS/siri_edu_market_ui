import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NotificationFeedService, type NotificationFeedItemResponse } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';

/** Spec §4: badge/list refresh cadence while the app is open — no WebSocket/SSE in v1. */
const POLL_INTERVAL_MS = 60_000;
/** Spec §4: dropdown shows a small slice ("page แรก, pageSize เล็ก เช่น 10") of the shared `items` list. */
const DROPDOWN_PREVIEW_SIZE = 10;

/**
 * follow-store-notifications v1 (docs/contracts/follow-store-notifications.md §4).
 *
 * Bell icon + unread badge for the header — only rendered by `AppHeaderComponent` when
 * `auth.isAuthenticated()`, so this component's constructor can assume it is already
 * signed in (bootstrap load happens on mount) without injecting `AuthService` itself.
 */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [RouterLink, NzDropDownModule, IconComponent, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent {
  readonly feed = inject(NotificationFeedService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Latest preview items only — full history lives at /notifications without being wiped by the bell. */
  readonly previewItems = computed(() => {
    const preview = this.feed.previewItems?.() ?? [];
    if (preview.length > 0) {
      return preview.slice(0, DROPDOWN_PREVIEW_SIZE);
    }
    return this.feed.items().slice(0, DROPDOWN_PREVIEW_SIZE);
  });

  constructor() {
    this.feed.refreshUnreadCount();
    this.feed.loadPreview?.();

    interval(POLL_INTERVAL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.feed.refreshUnreadCount());
  }

  /** Refresh the preview list whenever the dropdown is opened, so it doesn't go stale. */
  onVisibleChange(open: boolean): void {
    if (open) {
      this.feed.loadPreview?.();
    }
  }

  onItemClick(item: NotificationFeedItemResponse): void {
    // Fire-and-forget — navigate immediately, don't wait for the mark-read response.
    this.feed.markRead(item.id).subscribe({ error: () => { /* reported via ApiFailureReporter */ } });
    void this.router.navigate([item.linkUrl]);
  }

  onMarkAllRead(): void {
    this.feed.markAllRead().subscribe({ error: () => { /* reported via ApiFailureReporter */ } });
  }
}
