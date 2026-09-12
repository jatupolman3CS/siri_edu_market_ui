import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toNotificationAudience, type NotificationAudience } from '../../../core/services';
import { NotificationsListComponent } from '../../../shared/components/notifications-list/notifications-list.component';

/**
 * notification-master-config v1 §4.1 (AC-7).
 *
 * `/seller/notifications` — seller notification history *inside the seller layout*. Before
 * F-06 the seller sidebar's "การแจ้งเตือน" link and the bell's "ดูทั้งหมด" both pointed at
 * `/notifications`, which threw the seller into the buyer layout.
 */
@Component({
  selector: 'app-seller-notifications',
  standalone: true,
  imports: [NotificationsListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
})
export class SellerNotificationsPage {
  private readonly route = inject(ActivatedRoute);

  readonly audience = signal<NotificationAudience>(
    toNotificationAudience(this.route.snapshot.data['audience']) ?? 'seller',
  );
}
