import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toNotificationAudience, type NotificationAudience } from '../../../core/services';
import { NotificationsListComponent } from '../../../shared/components/notifications-list/notifications-list.component';

/**
 * notification-master-config v1 §4.1 (AC-7).
 *
 * `/admin/notifications` — admin notification history inside the admin layout. The admin
 * sidebar used to link to `/notifications` (the buyer route), which is the same cross-layout
 * jump the user reported, only in the opposite direction (§0.4 root cause #4).
 */
@Component({
  selector: 'app-admin-notifications',
  standalone: true,
  imports: [NotificationsListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
})
export class AdminNotificationsPage {
  private readonly route = inject(ActivatedRoute);

  readonly audience = signal<NotificationAudience>(
    toNotificationAudience(this.route.snapshot.data['audience']) ?? 'admin',
  );
}
