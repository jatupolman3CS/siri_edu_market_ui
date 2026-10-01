import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import {
  NOTIFICATION_AUDIENCES,
  NotificationContextService,
  NotificationFeedService,
  NotificationSoundService,
  getNotificationStyle,
  notificationsRouteFor,
  resolveSafeLinkUrl,
  type NotificationAudience,
  type NotificationFeedItemResponse,
  type NotificationStyleInfo,
} from '../../../core/services';
import { IconComponent } from '../icon/icon.component';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';
import { DropdownBackResetDirective } from '../../directives/dropdown-back-reset.directive';

/** Spec §4: dropdown shows a small slice ("page แรก, pageSize เล็ก เช่น 10") of the feed. */
const DROPDOWN_PREVIEW_SIZE = 10;

/** One row of the AC-10 "there is unread mail in your other role" hint. */
export interface CrossContextLink {
  audience: NotificationAudience;
  count: number;
  route: string;
  label: string;
}

/**
 * follow-store-notifications v1 §4 · notification-master-config v1 §0.4, §4.1.
 *
 * Bell icon + unread badge for the header — only rendered by `AppHeaderComponent` when
 * `auth.isAuthenticated()`, so this component's constructor can assume it is already
 * signed in (bootstrap load happens on mount) without injecting `AuthService` itself.
 *
 * Every layout embeds this same component, which is exactly why the "กระโดดข้าม layout" bug
 * existed: it used to request the whole feed and navigate to whatever `linkUrl` the backend
 * wrote. It now scopes both the request and the navigation to
 * `NotificationContextService.context()`.
 */
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [RouterLink, NzDropDownModule, IconComponent, TimeAgoPipe, TranslatePipe, DropdownBackResetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent {
  readonly feed = inject(NotificationFeedService);
  readonly sound = inject(NotificationSoundService);
  private readonly context = inject(NotificationContextService);
  private readonly router = inject(Router);
  readonly translation = inject(TranslationService);
  private readonly document = inject(DOCUMENT);

  /**
   * Dropdown visibility, bound two-way to the trigger's `nzVisible`. The 'View all' and
   * cross-role links are plain router links (not nz-menu-item), so nothing closed the menu when
   * they navigated and it stayed open over the new page; they now set this to false.
   */
  readonly menuOpen = signal(false);

  /** Presentation variant: 'icon' (default standalone bell button) or 'topbar' (inline text link with badge) */
  readonly variant = input<'icon' | 'topbar'>('icon');

  /** Theme variant: 'light' (default) or 'dark' (for dark headers/sidebars like admin) */
  readonly theme = input<'light' | 'dark'>('light');

  /** Which layout the reader is standing in — drives the request, the badge and every link. */
  readonly audience = this.context.context;

  /** AC-5/§4.4: badge counts the current layout only, never the cross-layout total. */
  readonly unreadCount = computed(() => this.feed.unreadByAudience()[this.audience()]);

  /** AC-7: "ดูการแจ้งเตือนทั้งหมด" stays inside the current layout. */
  readonly allNotificationsRoute = this.context.notificationsRoute;

  /**
   * AC-10: unread mail waiting in the reader's *other* roles. Rendered as links the user has
   * to click — never an automatic redirect, which is what the bug report was about.
   */
  readonly crossContextLinks = computed<CrossContextLink[]>(() => {
    if (!this.feed.hasAudienceBreakdown()) return [];
    const current = this.audience();
    const counts = this.feed.unreadByAudience();
    return NOTIFICATION_AUDIENCES.filter((item) => item !== current && counts[item] > 0).map((item) => ({
      audience: item,
      count: counts[item],
      route: notificationsRouteFor(item),
      label: this.translation.t('shared.notifications.crossRoleUnread', { role: this.translation.t(`shared.notifications.audiences.${item}`), count: counts[item] }),
    }));
  });

  /** Latest preview items only — full history lives on the notifications page, unwiped by the bell. */
  readonly previewItems = computed(() => {
    const preview = this.feed.previewItems?.() ?? [];
    if (preview.length > 0) {
      return preview.slice(0, DROPDOWN_PREVIEW_SIZE);
    }
    return this.feed.items().slice(0, DROPDOWN_PREVIEW_SIZE);
  });

  constructor() {
    this.feed.refreshUnreadCount();

    // §4.4: reload on every context change, not once on mount — the bell instance in
    // `app-header` survives buyer → seller navigation and would otherwise keep stale rows.
    effect(() => this.feed.loadPreview(DROPDOWN_PREVIEW_SIZE, this.audience()));

    // kafka-redis-notifications v1 §4: no timer here any more — every layout renders its own
    // bell, so the per-instance 60s interval multiplied. The one poll timer lives in
    // `NotificationFeedService` (driven by `NotificationStreamService`), and pushed SSE signals
    // refresh the badge and reload this preview through the shared feed service.
  }

  getStyle(key: string, title = ''): NotificationStyleInfo {
    return getNotificationStyle(key, title);
  }

  /** Refresh the preview list whenever the dropdown is opened, so it doesn't go stale. */
  onVisibleChange(open: boolean): void {
    if (open) {
      this.feed.loadPreview(DROPDOWN_PREVIEW_SIZE, this.audience());
      if (this.unreadCount() > 0) {
        this.feed.markAllRead(this.audience()).subscribe({ error: () => { /* reported via ApiFailureReporter */ } });
      }
      // The panel renders at the end of <body> (CDK overlay), so the Tab order used to continue
      // through the page. Move focus into it once attached (the dropdown emits before attaching).
      setTimeout(() => this.focusFirstInMenu());
    }
  }

  private focusFirstInMenu(): void {
    const menus = this.document.querySelectorAll<HTMLElement>('[data-testid="notification-menu"]');
    const menu = menus[menus.length - 1];
    if (!menu) return;
    const target =
      menu.querySelector<HTMLElement>('[data-testid="notification-menu-item"]') ??
      menu.querySelector<HTMLElement>('a[href], button:not([disabled])');
    target?.focus();
  }

  onItemClick(item: NotificationFeedItemResponse): void {
    this.menuOpen.set(false);
    // Fire-and-forget — navigate immediately, don't wait for the mark-read response.
    this.feed.markRead(item.id).subscribe({ error: () => { /* reported via ApiFailureReporter */ } });
    // AC-8: `navigateByUrl` (not `navigate([...])`) so a linkUrl carrying a query string such
    // as `/orders?tab=paid` survives instead of being encoded into a single path segment.
    // AC-6: `resolveSafeLinkUrl` keeps the destination inside the reader's current layout.
    void this.router.navigateByUrl(resolveSafeLinkUrl(item.linkUrl, this.audience()));
  }

  /**
   * Sound on/off. Turning it on plays one sample chime so the reader hears the volume — and,
   * being a real click, that same gesture is what unlocks the browser's autoplay block. The
   * click never reaches the dropdown's own handlers, so the panel stays open.
   */
  onToggleSound(event: Event): void {
    event.stopPropagation();
    if (this.sound.toggle()) this.sound.preview();
  }

  onMarkAllRead(): void {
    // AC-4: clears only the current layout's unread rows.
    this.feed.markAllRead(this.audience()).subscribe({ error: () => { /* reported via ApiFailureReporter */ } });
  }
}
