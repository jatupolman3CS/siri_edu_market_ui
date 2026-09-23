import { DestroyRef, Injectable, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { AuthService } from './auth.service';
import {
  NotificationContextService,
  notificationsRouteFor,
  resolveSafeLinkUrl,
  type NotificationAudience,
} from './notification-context.service';
import { NotificationFeedService, type NotificationFeedItemResponse } from './notification-feed.service';
import { TranslationService } from '../i18n/translation.service';

/** Page size for the arrival poll — this is "what's new", not a page of history. */
const POLL_SIZE = 10;
/** More than this many new arrivals in one poll collapse into a single "+N more" toast. */
const MAX_INDIVIDUAL_TOASTS = 3;
/** Toast body is a brief preview, not the full notification — truncated to this many characters. */
const BODY_TRUNCATE_LENGTH = 80;

const ERROR_KEYS: ReadonlySet<string> = new Set(['document_rejected']);
const SUCCESS_KEYS: ReadonlySet<string> = new Set(['sale', 'document_approved', 'payout']);
const WARNING_KEYS: ReadonlySet<string> = new Set([
  'document_submitted',
  'admin_document_submitted',
  'admin_payout_requested',
]);

/**
 * Maps a notification-master-config catalog key (`notification-feed.service.ts`'s
 * `getNotificationStyle`) to the closest nz-notification status/icon so the toast's tone
 * roughly matches the bell dropdown's tone for the same key, without inventing a second style
 * catalog just for the toast surface.
 */
export function severityForNotificationKey(key: string): 'success' | 'info' | 'warning' | 'error' {
  const normKey = (key || '').trim().toLowerCase();
  if (ERROR_KEYS.has(normKey)) return 'error';
  if (SUCCESS_KEYS.has(normKey)) return 'success';
  if (WARNING_KEYS.has(normKey)) return 'warning';
  return 'info';
}

function truncateBody(body: string): string {
  const trimmed = (body || '').trim();
  if (trimmed.length <= BODY_TRUNCATE_LENGTH) return trimmed;
  return `${trimmed.slice(0, BODY_TRUNCATE_LENGTH)}…`;
}

/**
 * Feature request: "เมื่อมีการแจ้งเตือนเข้ามาอยากให้มี popup ... เด้งขึ้นด้านขวามือ" — a
 * top-right corner toast per newly-arrived notification, on top of (not replacing) the bell.
 *
 * "New" is derived from `NotificationFeedService.fetchRecentForToast` diffed against the ids
 * this service has already shown a toast for — triggered by the feed's single poll timer and,
 * when the SSE stream is up, by `NotificationStreamService` on a pushed signal
 * (kafka-redis-notifications v1 §4). The push only says "something changed"; this diff decides. That "already
 * toasted" set is deliberately **in-memory only** (module/instance state, never persisted) —
 * this is a live "just arrived" indicator, not a read-tracking mechanism (the bell + mark-read
 * API already own that).
 *
 * §2: the very first poll for a given audience never toasts — it only records a baseline of
 * ids that already existed, exactly like `AnnouncementPopupService`'s dismiss-forever guard
 * against re-showing what the reader has already seen, except scoped to "this session" instead
 * of `sessionStorage`.
 *
 * Force-instantiated once from the app root (`app.ts`, same pattern as `NavigationSourceService`)
 * so it fires across every layout (buyer/seller/admin) without each layout wiring its own copy.
 */
@Injectable({ providedIn: 'root' })
export class NotificationToastService {
  private readonly feed = inject(NotificationFeedService);
  private readonly context = inject(NotificationContextService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly nzNotification = inject(NzNotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translation = inject(TranslationService);

  /** Audiences that have had at least one poll — see the §2 baseline note above. */
  private readonly baselinedAudiences = new Set<NotificationAudience>();
  /** Ids already toasted this session, so the same arrival never fires twice across polls. */
  private readonly toastedIds = new Set<string>();
  /**
   * Identity the account-switch watcher last saw. Seeded synchronously (mirrors
   * `SellerApplicationService.lastSeenUserId`) so the effect's first flush is a no-op — it must
   * react to a *change* of account, never wipe state the very first poll just built.
   */
  private lastSeenUserId: string | null;

  constructor() {
    this.lastSeenUserId = untracked(() => this.auth.user()?.id ?? null);

    // kafka-redis-notifications v1 §4: no timer of its own any more — it rides the single poll
    // timer in `NotificationFeedService` (60s while the SSE stream is down, 5 min while it is
    // up); `NotificationStreamService` calls `checkForNewNotifications()` on a pushed signal.
    const removePollListener = this.feed.addPollListener(() => void this.checkForNewNotifications());
    this.destroyRef.onDestroy(removePollListener);

    // Poll immediately on mount and on every layout switch (buyer → seller → admin) rather than
    // waiting for the next 60s tick — and never let a second account on the same browser inherit
    // the first account's "already toasted" state or baseline.
    effect(() => {
      const userId = this.auth.user()?.id ?? null;
      this.context.context();
      if (userId !== this.lastSeenUserId) {
        this.lastSeenUserId = userId;
        this.toastedIds.clear();
        this.baselinedAudiences.clear();
      }
      void this.checkForNewNotifications();
    });
  }

  /**
   * Fetches the latest notifications for the reader's current layout and toasts whatever
   * arrived since the last successful poll. Public — not only wired to the timer/effect above —
   * so tests can drive it deterministically instead of depending on real timers/effect flushing.
   */
  async checkForNewNotifications(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;

    const audience = this.context.context();
    let items: NotificationFeedItemResponse[];
    try {
      items = await this.feed.fetchRecentForToast(POLL_SIZE, audience);
    } catch {
      return; // already reported via ApiFailureReporter inside fetchRecentForToast
    }

    if (!this.baselinedAudiences.has(audience)) {
      // §2: first observation of this layout this session — record ids, toast nothing.
      this.baselinedAudiences.add(audience);
      for (const item of items) this.toastedIds.add(item.id);
      return;
    }

    const freshItems = items.filter((item) => !this.toastedIds.has(item.id));
    if (freshItems.length === 0) return;
    for (const item of freshItems) this.toastedIds.add(item.id);
    this.presentToasts(freshItems, audience);
  }

  private presentToasts(items: NotificationFeedItemResponse[], audience: NotificationAudience): void {
    const individual = items.slice(0, MAX_INDIVIDUAL_TOASTS);
    for (const item of individual) this.presentOne(item, audience);

    const remaining = items.length - individual.length;
    if (remaining > 0) this.presentGrouped(remaining, audience);
  }

  private presentOne(item: NotificationFeedItemResponse, audience: NotificationAudience): void {
    const ref = this.nzNotification.create(
      severityForNotificationKey(item.key),
      item.title,
      truncateBody(item.body),
    );
    ref.onClick.pipe(take(1)).subscribe(() => this.openItem(item, audience));
  }

  private presentGrouped(count: number, audience: NotificationAudience): void {
    const ref = this.nzNotification.info(
      this.translation.t('notifToast.newNotifications', { count }),
      this.translation.t('notifToast.clickToViewAll'),
    );
    ref.onClick.pipe(take(1)).subscribe(() => void this.router.navigateByUrl(notificationsRouteFor(audience)));
  }

  private openItem(item: NotificationFeedItemResponse, audience: NotificationAudience): void {
    // Fire-and-forget, same as the bell dropdown's onItemClick — navigate immediately, mark
    // read in the background.
    this.feed.markRead(item.id).subscribe({ error: () => { /* reported via ApiFailureReporter */ } });
    void this.router.navigateByUrl(resolveSafeLinkUrl(item.linkUrl, audience));
  }
}
