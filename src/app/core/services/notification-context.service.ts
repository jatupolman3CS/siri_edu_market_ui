import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * notification-master-config v1 (docs/contracts/notification-master-config.md §0.4, §0.5).
 *
 * Root cause #1/#2 of "อยู่หน้าผู้ซื้อแล้วกดแจ้งเตือนแล้วกระโดดไปหน้าผู้ขาย": the feed has no
 * "which role is reading this" dimension, and `USER.Role` is a `[Flags]` enum, so one account
 * can legitimately be buyer + seller + admin at the same time. The fix is to derive the
 * reader's current layout from the URL and scope every feed request/link to it.
 */
export type NotificationAudience = 'buyer' | 'seller' | 'admin';

export const NOTIFICATION_AUDIENCES: readonly NotificationAudience[] = ['buyer', 'seller', 'admin'];

/** Spec §4.1: one notification history route per layout (root cause #4 — only `/notifications` existed). */
const AUDIENCE_ROUTES: Readonly<Record<NotificationAudience, string>> = {
  buyer: '/notifications',
  seller: '/seller/notifications',
  admin: '/admin/notifications',
};


/** Strips query string / fragment so `/orders?tab=paid` is classified by its path only. */
function pathOf(url: string): string {
  const raw = (url || '/').trim();
  const cut = raw.search(/[?#]/);
  return cut === -1 ? raw : raw.slice(0, cut);
}

/**
 * Spec §0.5 decision 1: `/seller` prefix → seller, `/admin` prefix → admin, everything else
 * (`/`, `/marketplace`, `/orders/1`, …) → buyer. Matching is segment-aware so a hypothetical
 * `/sellers-directory` stays a buyer page.
 */
export function resolveNotificationAudience(url: string): NotificationAudience {
  const path = pathOf(url);
  if (path === '/seller' || path.startsWith('/seller/')) return 'seller';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  return 'buyer';
}

/** Narrowing helper for untyped sources (route `data`, raw API payloads) — keeps `any` out. */
export function toNotificationAudience(value: unknown): NotificationAudience | null {
  return value === 'buyer' || value === 'seller' || value === 'admin' ? value : null;
}

export function notificationsRouteFor(audience: NotificationAudience): string {
  return AUDIENCE_ROUTES[audience];
}


/**
 * Spec §3.2 "กฎ linkUrl" applied a second time on the client (root cause #3).
 *
 * The backend validates `linkUrl` against the row's audience before writing, but rows written
 * before that validation existed — and anything an older deploy wrote — can still point at the
 * other layout. Re-checking here is what makes AC-6 ("URL ปลายทางต้องไม่ขึ้นต้นด้วย /seller")
 * hold regardless of what is already sitting in `NOTIFICATION_FEED_ITEM`.
 */
/** Spec §4.2 — page heading per audience. */
const NOTIFICATION_HEADINGS: Readonly<Record<NotificationAudience, string>> = {
  buyer: 'การแจ้งเตือนของฉัน',
  seller: 'การแจ้งเตือนของร้าน',
  admin: 'การแจ้งเตือนของผู้ดูแลระบบ',
};

export function notificationHeadingFor(audience: NotificationAudience): string {
  return NOTIFICATION_HEADINGS[audience];
}

export function resolveSafeLinkUrl(linkUrl: string, audience: NotificationAudience): string {
  const fallback = AUDIENCE_ROUTES[audience];
  const raw = (linkUrl || '').trim();
  // Relative in-app paths only — `http://…` and protocol-relative `//host` never navigate.
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return resolveNotificationAudience(raw) === audience ? raw : fallback;
}

@Injectable({ providedIn: 'root' })
export class NotificationContextService {
  private readonly router = inject(Router);

  private readonly _context = signal<NotificationAudience>(resolveNotificationAudience(this.router.url));

  /** Which layout the reader is standing in right now. */
  readonly context = this._context.asReadonly();

  /** Notification history route of the current layout — used by "ดูการแจ้งเตือนทั้งหมด" (AC-7). */
  readonly notificationsRoute = computed(() => notificationsRouteFor(this._context()));

  /** Spec §4.2 — page heading for the current audience. */
  readonly heading = computed(() => notificationHeadingFor(this._context()));

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this._context.set(resolveNotificationAudience(event.urlAfterRedirects)));
  }

  /**
   * Test helper — component specs assert bell behaviour per layout without driving a real
   * router navigation (which would need dummy routed components). Mirrors the `*ForTest`
   * helpers on `NotificationFeedService`.
   */
  setContextForTest(audience: NotificationAudience): void {
    this._context.set(audience);
  }
}
