import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toNotificationAudience, type NotificationAudience } from '../../../core/services';
import { NotificationsListComponent } from '../../../shared/components/notifications-list/notifications-list.component';

/**
 * follow-store-notifications v1 §4 · notification-master-config v1 §4.1.
 *
 * `/notifications` — the buyer layout's notification history. Since F-06 this is a thin
 * wrapper: the list body lives in `NotificationsListComponent` so seller and admin get the
 * same page inside their own layout instead of being bounced here (root cause #4).
 */
@Component({
  selector: 'app-buyer-notifications',
  standalone: true,
  imports: [NotificationsListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
})
export class NotificationsPage {
  private readonly route = inject(ActivatedRoute);

  /** Route `data.audience` (app.routes.ts) with the layout's own audience as the fallback. */
  readonly audience = signal<NotificationAudience>(
    toNotificationAudience(this.route.snapshot.data['audience']) ?? 'buyer',
  );
}
