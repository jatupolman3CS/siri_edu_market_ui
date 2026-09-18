import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import {
  getApiNotificationsFeed,
  getApiNotificationsFeedUnreadCount,
  postApiNotificationsFeedByIdRead,
  postApiNotificationsFeedReadAll,
} from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import {
  NOTIFICATION_AUDIENCES,
  toNotificationAudience,
  type NotificationAudience,
} from './notification-context.service';
import type {
  NotificationFeedItemResponse as GeneratedNotificationFeedItemResponse,
  NotificationFeedUnreadCountResponse,
} from '../api/types.gen';

/**
 * follow-store-notifications v1 (docs/contracts/follow-store-notifications.md §3.3-3.4)
 * · notification-master-config v1 §3.3 (adds `audience`).
 *
 * The generated `NotificationFeedItemResponse` (`core/api/types.gen.ts`) marks every field
 * optional — the OpenAPI schema this project's backend emits never populates `required`
 * (same as e.g. `NotificationSettingResponse`) even though the API always sends every field.
 * Re-exported here with the fields the rest of the app (`notification-bell`,
 * `/notifications`) actually relies on narrowed back to non-optional, so callers don't need
 * `??`/non-null-assertion sprinkled through templates — `fetchFeedPage` below is the single
 * place that normalises a raw response into this shape.
 */
export interface NotificationFeedItemResponse
  extends Omit<GeneratedNotificationFeedItemResponse, 'id' | 'key' | 'title' | 'body' | 'linkUrl' | 'isRead' | 'createdAt'> {
  id: string;
  key: string;
  title: string;
  body: string;
  linkUrl: string;
  isRead: boolean;
  createdAt: string;
  /** notification-master-config §3.3 — which layout this row belongs to. */
  audience: NotificationAudience;
}

export type { NotificationFeedUnreadCountResponse };

/** notification-master-config §3.4 — per-audience split of the unread badge count. */
export type NotificationUnreadByAudience = Readonly<Record<NotificationAudience, number>>;

const ZERO_BY_AUDIENCE: NotificationUnreadByAudience = { buyer: 0, seller: 0, admin: 0 };

export interface NotificationStyleInfo {
  icon: 'star' | 'mail' | 'check' | 'x' | 'doc' | 'sparkle' | 'bell' | 'shield' | 'wallet' | 'cart' | 'heart' | 'eye';
  label: string;
  badgeClass: string;
  iconBgClass: string;
  iconUnreadBgClass: string;
  borderClass: string;
}

type StyleTone = 'amber' | 'sky' | 'emerald' | 'rose' | 'purple' | 'indigo' | 'pink' | 'slate';

/**
 * Tailwind class sets are written out as complete literals (never built by string
 * concatenation) so the scanner keeps them in the produced stylesheet.
 */
const TONES: Readonly<Record<StyleTone, Omit<NotificationStyleInfo, 'icon' | 'label'>>> = {
  amber: {
    badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200',
    iconBgClass: 'bg-amber-100 text-amber-600',
    iconUnreadBgClass: 'bg-amber-500 text-white shadow-soft',
    borderClass: 'border-amber-200',
  },
  sky: {
    badgeClass: 'bg-sky-100 text-sky-800 border border-sky-200',
    iconBgClass: 'bg-sky-100 text-sky-600',
    iconUnreadBgClass: 'bg-sky-500 text-white shadow-soft',
    borderClass: 'border-sky-200',
  },
  emerald: {
    badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    iconBgClass: 'bg-emerald-100 text-emerald-600',
    iconUnreadBgClass: 'bg-emerald-500 text-white shadow-soft',
    borderClass: 'border-emerald-200',
  },
  rose: {
    badgeClass: 'bg-rose-100 text-rose-800 border border-rose-200',
    iconBgClass: 'bg-rose-100 text-rose-600',
    iconUnreadBgClass: 'bg-rose-500 text-white shadow-soft',
    borderClass: 'border-rose-200',
  },
  purple: {
    badgeClass: 'bg-purple-100 text-purple-800 border border-purple-200',
    iconBgClass: 'bg-purple-100 text-purple-600',
    iconUnreadBgClass: 'bg-purple-500 text-white shadow-soft',
    borderClass: 'border-purple-200',
  },
  indigo: {
    badgeClass: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
    iconBgClass: 'bg-indigo-100 text-indigo-600',
    iconUnreadBgClass: 'bg-indigo-500 text-white shadow-soft',
    borderClass: 'border-indigo-200',
  },
  pink: {
    badgeClass: 'bg-pink-100 text-pink-800 border border-pink-200',
    iconBgClass: 'bg-pink-100 text-pink-600',
    iconUnreadBgClass: 'bg-pink-500 text-white shadow-soft',
    borderClass: 'border-pink-200',
  },
  slate: {
    badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
    iconBgClass: 'bg-slate-100 text-slate-600',
    iconUnreadBgClass: 'bg-slate-600 text-white shadow-soft',
    borderClass: 'border-slate-200',
  },
};

function toneStyle(icon: NotificationStyleInfo['icon'], label: string, tone: StyleTone): NotificationStyleInfo {
  return { icon, label, ...TONES[tone] };
}

/**
 * notification-master-config v1 §3.1 — the 18 catalog keys, matched by exact key first.
 *
 * Exact-key matching has to come before the legacy title heuristics below: `review_reply`'s
 * Thai title contains "รีวิว", which the old `normKey === 'review' || title.includes('รีวิว')`
 * arm would otherwise have swallowed.
 */
const STYLE_BY_KEY: Readonly<Record<string, NotificationStyleInfo>> = {
  sale: toneStyle('wallet', 'มีการขาย', 'emerald'),
  review: toneStyle('star', 'รีวิวใหม่', 'amber'),
  qna_question: toneStyle('mail', 'คำถามใหม่', 'sky'),
  seller_follow: toneStyle('heart', 'ผู้ติดตามใหม่', 'pink'),
  store_visit_digest: toneStyle('eye', 'สรุปการเข้าชม', 'indigo'),
  cart_add_digest: toneStyle('cart', 'สรุปตะกร้า', 'indigo'),
  wishlist_add_digest: toneStyle('heart', 'สรุปรายการโปรด', 'pink'),
  review_reply: toneStyle('mail', 'ตอบกลับรีวิว', 'sky'),
  qna_answer: toneStyle('mail', 'ตอบคำถามแล้ว', 'sky'),
  document_submitted: toneStyle('doc', 'ส่งตรวจแล้ว', 'purple'),
  document_approved: toneStyle('check', 'อนุมัติแล้ว', 'emerald'),
  document_rejected: toneStyle('x', 'ไม่อนุมัติ', 'rose'),
  admin_document_submitted: toneStyle('shield', 'รออนุมัติ', 'purple'),
  admin_payout_requested: toneStyle('wallet', 'คำขอถอนเงิน', 'amber'),
  payout: toneStyle('wallet', 'ถอนเงิน', 'emerald'),
  new_document_from_followed_seller: toneStyle('doc', 'ผลงานใหม่', 'pink'),
  // crm-targeted-document-alerts v2 §3.1/§4.1 (F-12, AC-28) — 19th catalog key, same `doc` icon
  // as the followed-seller arm above but its own label so the two never read as one event.
  new_document_for_interest: toneStyle('doc', 'ตรงกับความสนใจของคุณ', 'purple'),
  announcement: toneStyle('sparkle', 'ข่าวประกาศ', 'indigo'),
  tips: toneStyle('sparkle', 'เคล็ดลับ', 'slate'),
};

export function getNotificationStyle(key: string, title = ''): NotificationStyleInfo {
  const normKey = (key || '').trim().toLowerCase();
  const normTitle = (title || '').trim().toLowerCase();

  const catalogStyle = STYLE_BY_KEY[normKey];
  if (catalogStyle) return catalogStyle;

  // Legacy arms below: PascalCase keys written before the §2.4 key-normalisation migration
  // (and rows seeded by older builds) still have to render sensibly. Kept as fallback per §4.1.
  if (normKey === 'review' || normTitle.includes('รีวิว')) {
    return toneStyle('star', 'รีวิวใหม่', 'amber');
  }

  if (normKey === 'reviewreply' || normTitle.includes('ตอบกลับ')) {
    return toneStyle('mail', 'ตอบกลับรีวิว', 'sky');
  }

  if (normKey === 'documentapproved' || normTitle.includes('อนุมัติแล้ว')) {
    return toneStyle('check', 'อนุมัติแล้ว', 'emerald');
  }

  if (normKey === 'documentrejected' || normTitle.includes('ไม่ผ่านการอนุมัติ') || normTitle.includes('ไม่อนุมัติ')) {
    return toneStyle('x', 'ไม่อนุมัติ', 'rose');
  }

  if (normKey === 'documentpendingapproval' || normTitle.includes('รอการตรวจสอบ') || normTitle.includes('รออนุมัติ')) {
    return toneStyle('doc', 'รออนุมัติ', 'purple');
  }

  if (normKey === 'announcement' || normTitle.includes('ประกาศ') || normTitle.includes('ข่าวสาร')) {
    return toneStyle('sparkle', 'ข่าวประกาศ', 'indigo');
  }

  if (normKey === 'newdocumentalert' || normKey === 'documentpublished' || normTitle.includes('ผลงานใหม่')) {
    return toneStyle('doc', 'ผลงานใหม่', 'pink');
  }

  return toneStyle('bell', 'การแจ้งเตือน', 'slate');
}

/** Matches the backend default in spec §3.3 (clamp [1,50], default 20). */
const PAGE_SIZE = 20;

function normalizeFeedItem(
  raw: GeneratedNotificationFeedItemResponse,
  fallbackAudience: NotificationAudience,
): NotificationFeedItemResponse {
  return {
    id: raw.id ?? '',
    key: raw.key ?? '',
    title: raw.title ?? '',
    body: raw.body ?? '',
    linkUrl: raw.linkUrl ?? '',
    isRead: raw.isRead ?? false,
    createdAt: raw.createdAt ?? '',
    // §3.3: the server always scopes a row to one audience; the fallback only covers the
    // (contract-breaking) case of an empty string arriving on the wire.
    audience: toNotificationAudience(raw.audience) ?? fallbackAudience,
  };
}

/**
 * Separate from `NotificationService` (which only manages `NOTIFICATION_SETTING`
 * preferences) — this service owns the in-app notification feed/inbox: the bell badge
 * count and the paginated history list. Kept as its own service per the codebase's
 * "1 concern per service" convention (see e.g. `WishlistService`/`CartService`).
 *
 * notification-master-config v1 §3.3-§3.5: every read/write is now scoped by `audience`, so
 * the bell on a buyer page never surfaces a seller row (and vice versa) — root cause #1 of
 * the "กระโดดข้าม layout" bug.
 */
@Injectable({ providedIn: 'root' })
export class NotificationFeedService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _items = signal<NotificationFeedItemResponse[]>([]);
  private readonly _previewItems = signal<NotificationFeedItemResponse[]>([]);
  private readonly _unreadCount = signal<number>(0);
  private readonly _unreadByAudience = signal<NotificationUnreadByAudience>(ZERO_BY_AUDIENCE);
  private readonly _hasAudienceBreakdown = signal<boolean>(false);
  private readonly _loading = signal<boolean>(false);
  private readonly _totalCount = signal<number>(0);

  /** Accumulated page(s) loaded so far for the notifications history page. */
  readonly items = this._items.asReadonly();
  /** Dedicated preview slice for the bell dropdown, avoiding clobbering items loaded in the history page. */
  readonly previewItems = this._previewItems.asReadonly();
  /** Total unread across every audience — unchanged meaning (spec §3.4). */
  readonly unreadCount = this._unreadCount.asReadonly();
  /** Badge source per layout (spec §4.4: badge = unreadByAudience()[context()]). */
  readonly unreadByAudience = this._unreadByAudience.asReadonly();
  /**
   * False until the API actually returns the §3.4 per-audience fields. While false the
   * buckets mirror the total (so the badge keeps working against a pre-`be-2` backend) and
   * the bell hides its cross-context links instead of showing three copies of the same number.
   */
  readonly hasAudienceBreakdown = this._hasAudienceBreakdown.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** Total row count from the server — used to decide whether "โหลดเพิ่มเติม" has more to fetch. */
  readonly totalCount = this._totalCount.asReadonly();

  /** Loads preview slice for the notification bell dropdown without altering the history page's feed. */
  loadPreview(size: number = 10, audience?: NotificationAudience): void {
    void (async () => {
      try {
        const data = await this.fetchFeedPage(1, size, audience);
        this._previewItems.set(data.items);
      } catch (e) {
        this.apiFail.report('โหลดการแจ้งเตือนพรีวิว', e);
      }
    })();
  }

  /** Replaces `items` on page 1, appends on page > 1 — matches the history page's "โหลดเพิ่มเติม" flow. */
  loadFeed(page: number, audience?: NotificationAudience): void {
    this._loading.set(true);
    void (async () => {
      try {
        const data = await this.fetchFeedPage(page, PAGE_SIZE, audience);
        this._items.update((items) => (page > 1 ? [...items, ...data.items] : data.items));
        this._totalCount.set(data.totalCount);
      } catch (e) {
        this.apiFail.report('โหลดการแจ้งเตือน', e);
      } finally {
        this._loading.set(false);
      }
    })();
  }

  refreshUnreadCount(): void {
    void (async () => {
      try {
        const data = await this.fetchUnreadCount();
        const total = data.count ?? 0;
        // §3.4: the per-audience breakdown is optional on the DTO, so a server that only sends
        // `count` still drives the bell — every audience then shows the same total.
        const hasBreakdown =
          data.buyerCount !== undefined ||
          data.sellerCount !== undefined ||
          data.adminCount !== undefined;

        this._unreadCount.set(total);
        this._hasAudienceBreakdown.set(hasBreakdown);
        this._unreadByAudience.set(
          hasBreakdown
            ? {
                buyer: data.buyerCount ?? 0,
                seller: data.sellerCount ?? 0,
                admin: data.adminCount ?? 0,
              }
            : { buyer: total, seller: total, admin: total },
        );
      } catch (e) {
        this.apiFail.report('โหลดจำนวนแจ้งเตือนที่ยังไม่อ่าน', e);
      }
    })();
  }

  /** Optimistic: flips `isRead` + decrements the badge locally before the API responds. */
  markRead(id: string): Observable<void> {
    const target = this._items().find((item) => item.id === id) ?? this._previewItems().find((item) => item.id === id);
    const wasUnread = !!target && !target.isRead;

    this._items.update((items) =>
      items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );
    this._previewItems.update((items) =>
      items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );
    if (wasUnread && target) {
      this._unreadCount.update((count) => Math.max(0, count - 1));
      this.decrementAudience(target.audience);
    }

    return from(this.postMarkRead(id)).pipe(
      // Resync with the server in case the optimistic update drifted.
      tap(() => this.refreshUnreadCount()),
      catchError((e) => {
        this.apiFail.report('ทำเครื่องหมายว่าอ่านแล้ว', e);
        return throwError(() => e);
      }),
    );
  }

  /**
   * Optimistic: marks every loaded item of `audience` read + zeroes that bucket locally.
   * Passing no audience keeps the original "mark everything" behaviour (spec §3.5).
   */
  markAllRead(audience?: NotificationAudience): Observable<void> {
    const inScope = (item: NotificationFeedItemResponse) => !audience || item.audience === audience;

    this._items.update((items) => items.map((item) => (inScope(item) ? { ...item, isRead: true } : item)));
    this._previewItems.update((items) => items.map((item) => (inScope(item) ? { ...item, isRead: true } : item)));

    if (audience) {
      const cleared = this._unreadByAudience()[audience];
      this._unreadByAudience.update((counts) => ({ ...counts, [audience]: 0 }));
      this._unreadCount.update((count) => Math.max(0, count - cleared));
    } else {
      this._unreadByAudience.set(ZERO_BY_AUDIENCE);
      this._unreadCount.set(0);
    }

    return from(this.postMarkAllRead(audience)).pipe(
      tap(() => this.refreshUnreadCount()),
      catchError((e) => {
        this.apiFail.report('ทำเครื่องหมายว่าอ่านแล้วทั้งหมด', e);
        return throwError(() => e);
      }),
    );
  }

  private decrementAudience(audience: NotificationAudience): void {
    this._unreadByAudience.update((counts) => ({
      ...counts,
      [audience]: Math.max(0, counts[audience] - 1),
    }));
  }

  /**
   * notification-toast v1 — dedicated fetch for `NotificationToastService`'s "did anything
   * new arrive" poller. Deliberately bypasses `_items`/`_previewItems` so polling for a toast
   * never clobbers state the bell dropdown or the history page is rendering from.
   */
  async fetchRecentForToast(
    size: number,
    audience?: NotificationAudience,
  ): Promise<NotificationFeedItemResponse[]> {
    try {
      const data = await this.fetchFeedPage(1, size, audience);
      return data.items;
    } catch (e) {
      this.apiFail.report('โหลดการแจ้งเตือนใหม่', e);
      throw e;
    }
  }

  private async fetchFeedPage(
    page: number,
    pageSize: number,
    audience?: NotificationAudience,
  ): Promise<{ items: NotificationFeedItemResponse[]; totalCount: number }> {
    // §3.3: `audience` is omitted (not sent empty) when the caller wants every audience.
    const result = await getApiNotificationsFeed({
      query: { Page: page, PageSize: pageSize, ...(audience ? { audience } : {}) },
    });
    const data = unwrapSdkResult(result);
    return {
      items: (data.items ?? []).map((item) => normalizeFeedItem(item, audience ?? 'buyer')),
      totalCount: data.totalCount ?? 0,
    };
  }

  private async fetchUnreadCount(): Promise<NotificationFeedUnreadCountResponse> {
    const result = await getApiNotificationsFeedUnreadCount();
    return unwrapSdkResult(result);
  }

  /** 204 No Content on success — `throwOnError` (api-runtime.ts) already rejects on non-2xx. */
  private async postMarkRead(id: string): Promise<void> {
    await postApiNotificationsFeedByIdRead({ path: { id } });
  }

  /** 204 No Content on success — `throwOnError` (api-runtime.ts) already rejects on non-2xx. */
  private async postMarkAllRead(audience?: NotificationAudience): Promise<void> {
    // §3.5: no `audience` = mark every audience read (the bell's own "อ่านทั้งหมด" always scopes).
    await postApiNotificationsFeedReadAll(audience ? { query: { audience } } : {});
  }

  /**
   * Test helper — round-1 stub has no real fetch layer to intercept (unlike wired services,
   * which mock `globalThis.fetch`), so tests seed state directly. Mirrors `setSummaryForTest`
   * in `ReferralService` / `setPageForTesting` in `ExamHubService`.
   */
  setItemsForTest(items: NotificationFeedItemResponse[]): void {
    this._items.set(items);
  }

  /** Test helper — seeds preview items for the bell dropdown. */
  setPreviewItemsForTest(items: NotificationFeedItemResponse[]): void {
    this._previewItems.set(items);
  }

  /**
   * Test helper — see {@link setItemsForTest}. Mirrors the total into every audience bucket,
   * matching the pre-`be-2` fallback in {@link refreshUnreadCount}.
   */
  setUnreadCountForTest(count: number): void {
    this._unreadCount.set(count);
    this._unreadByAudience.set({ buyer: count, seller: count, admin: count });
    this._hasAudienceBreakdown.set(false);
  }

  /** Test helper — seeds the §3.4 per-audience breakdown (AC-10 cross-context links). */
  setUnreadByAudienceForTest(counts: Partial<Record<NotificationAudience, number>>): void {
    const resolved = {
      buyer: counts.buyer ?? 0,
      seller: counts.seller ?? 0,
      admin: counts.admin ?? 0,
    };
    this._unreadByAudience.set(resolved);
    this._unreadCount.set(NOTIFICATION_AUDIENCES.reduce((sum, key) => sum + resolved[key], 0));
    this._hasAudienceBreakdown.set(true);
  }

  /** Test helper — see {@link setItemsForTest}. Drives the history page's "โหลดเพิ่มเติม" visibility. */
  setTotalCountForTest(count: number): void {
    this._totalCount.set(count);
  }
}
