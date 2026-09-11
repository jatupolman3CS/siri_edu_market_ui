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
import type {
  NotificationFeedItemResponse as GeneratedNotificationFeedItemResponse,
  NotificationFeedUnreadCountResponse,
} from '../api/types.gen';

/**
 * follow-store-notifications v1 (docs/contracts/follow-store-notifications.md §3.3-3.4)
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
}

export type { NotificationFeedUnreadCountResponse };

export interface NotificationStyleInfo {
  icon: 'star' | 'mail' | 'check' | 'x' | 'doc' | 'sparkle' | 'bell' | 'shield';
  label: string;
  badgeClass: string;
  iconBgClass: string;
  iconUnreadBgClass: string;
  borderClass: string;
}

export function getNotificationStyle(key: string, title = ''): NotificationStyleInfo {
  const normKey = (key || '').trim().toLowerCase();
  const normTitle = (title || '').trim().toLowerCase();

  if (normKey === 'review' || normTitle.includes('รีวิว')) {
    return {
      icon: 'star',
      label: 'รีวิวใหม่',
      badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200',
      iconBgClass: 'bg-amber-100 text-amber-600',
      iconUnreadBgClass: 'bg-amber-500 text-white shadow-soft',
      borderClass: 'border-amber-200',
    };
  }

  if (normKey === 'reviewreply' || normTitle.includes('ตอบกลับ')) {
    return {
      icon: 'mail',
      label: 'ตอบกลับรีวิว',
      badgeClass: 'bg-sky-100 text-sky-800 border border-sky-200',
      iconBgClass: 'bg-sky-100 text-sky-600',
      iconUnreadBgClass: 'bg-sky-500 text-white shadow-soft',
      borderClass: 'border-sky-200',
    };
  }

  if (normKey === 'documentapproved' || normTitle.includes('อนุมัติแล้ว')) {
    return {
      icon: 'check',
      label: 'อนุมัติแล้ว',
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      iconBgClass: 'bg-emerald-100 text-emerald-600',
      iconUnreadBgClass: 'bg-emerald-500 text-white shadow-soft',
      borderClass: 'border-emerald-200',
    };
  }

  if (normKey === 'documentrejected' || normTitle.includes('ไม่ผ่านการอนุมัติ') || normTitle.includes('ไม่อนุมัติ')) {
    return {
      icon: 'x',
      label: 'ไม่อนุมัติ',
      badgeClass: 'bg-rose-100 text-rose-800 border border-rose-200',
      iconBgClass: 'bg-rose-100 text-rose-600',
      iconUnreadBgClass: 'bg-rose-500 text-white shadow-soft',
      borderClass: 'border-rose-200',
    };
  }

  if (normKey === 'documentpendingapproval' || normTitle.includes('รอการตรวจสอบ') || normTitle.includes('รออนุมัติ')) {
    return {
      icon: 'doc',
      label: 'รออนุมัติ',
      badgeClass: 'bg-purple-100 text-purple-800 border border-purple-200',
      iconBgClass: 'bg-purple-100 text-purple-600',
      iconUnreadBgClass: 'bg-purple-500 text-white shadow-soft',
      borderClass: 'border-purple-200',
    };
  }

  if (normKey === 'announcement' || normTitle.includes('ประกาศ') || normTitle.includes('ข่าวสาร')) {
    return {
      icon: 'sparkle',
      label: 'ข่าวประกาศ',
      badgeClass: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
      iconBgClass: 'bg-indigo-100 text-indigo-600',
      iconUnreadBgClass: 'bg-indigo-500 text-white shadow-soft',
      borderClass: 'border-indigo-200',
    };
  }

  if (normKey === 'newdocumentalert' || normKey === 'documentpublished' || normTitle.includes('ผลงานใหม่')) {
    return {
      icon: 'doc',
      label: 'ผลงานใหม่',
      badgeClass: 'bg-pink-100 text-pink-800 border border-pink-200',
      iconBgClass: 'bg-pink-100 text-pink-600',
      iconUnreadBgClass: 'bg-pink-500 text-white shadow-soft',
      borderClass: 'border-pink-200',
    };
  }

  return {
    icon: 'bell',
    label: 'การแจ้งเตือน',
    badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
    iconBgClass: 'bg-slate-100 text-slate-600',
    iconUnreadBgClass: 'bg-slate-600 text-white shadow-soft',
    borderClass: 'border-slate-200',
  };
}

/** Matches the backend default in spec §3.3 (clamp [1,50], default 20). */
const PAGE_SIZE = 20;

function normalizeFeedItem(raw: GeneratedNotificationFeedItemResponse): NotificationFeedItemResponse {
  return {
    id: raw.id ?? '',
    key: raw.key ?? '',
    title: raw.title ?? '',
    body: raw.body ?? '',
    linkUrl: raw.linkUrl ?? '',
    isRead: raw.isRead ?? false,
    createdAt: raw.createdAt ?? '',
  };
}

/**
 * Separate from `NotificationService` (which only manages `NOTIFICATION_SETTING`
 * preferences) — this service owns the in-app notification feed/inbox: the bell badge
 * count and the paginated history list. Kept as its own service per the codebase's
 * "1 concern per service" convention (see e.g. `WishlistService`/`CartService`).
 *
 * Round 2 (docs/contracts/follow-store-notifications.md §4 "Staged rollout"): the private
 * `fetch*`/`post*` methods call the real generated SDK (`core/api/sdk.gen`) — see the
 * `NotificationFeedItemResponse` doc comment above for why `fetchFeedPage` normalises
 * the raw generated item shape before it reaches these signals.
 */
@Injectable({ providedIn: 'root' })
export class NotificationFeedService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _items = signal<NotificationFeedItemResponse[]>([]);
  private readonly _previewItems = signal<NotificationFeedItemResponse[]>([]);
  private readonly _unreadCount = signal<number>(0);
  private readonly _loading = signal<boolean>(false);
  private readonly _totalCount = signal<number>(0);

  /** Accumulated page(s) loaded so far for /notifications (full list). */
  readonly items = this._items.asReadonly();
  /** Dedicated preview slice for the bell dropdown, avoiding clobbering items loaded in /notifications. */
  readonly previewItems = this._previewItems.asReadonly();
  /** Badge count for the header bell. */
  readonly unreadCount = this._unreadCount.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** Total row count from the server — used to decide whether "โหลดเพิ่มเติม" has more to fetch. */
  readonly totalCount = this._totalCount.asReadonly();

  /** Loads preview slice for the notification bell dropdown without altering /notifications accumulated feed. */
  loadPreview(size: number = 10): void {
    void (async () => {
      try {
        const data = await this.fetchFeedPage(1, size);
        this._previewItems.set(data.items);
      } catch (e) {
        this.apiFail.report('โหลดการแจ้งเตือนพรีวิว', e);
      }
    })();
  }

  /** Replaces `items` on page 1, appends on page > 1 — matches /notifications' "โหลดเพิ่มเติม" flow. */
  loadFeed(page: number): void {
    this._loading.set(true);
    void (async () => {
      try {
        const data = await this.fetchFeedPage(page, PAGE_SIZE);
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
        this._unreadCount.set(data.count ?? 0);
      } catch (e) {
        this.apiFail.report('โหลดจำนวนแจ้งเตือนที่ยังไม่อ่าน', e);
      }
    })();
  }

  /** Optimistic: flips `isRead` + decrements `unreadCount` locally before the API responds. */
  markRead(id: string): Observable<void> {
    const target = this._items().find((item) => item.id === id) ?? this._previewItems().find((item) => item.id === id);
    const wasUnread = !!target && !target.isRead;

    this._items.update((items) =>
      items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );
    this._previewItems.update((items) =>
      items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );
    if (wasUnread) {
      this._unreadCount.update((count) => Math.max(0, count - 1));
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

  /** Optimistic: marks every loaded item read + zeroes `unreadCount` locally before the API responds. */
  markAllRead(): Observable<void> {
    this._items.update((items) => items.map((item) => ({ ...item, isRead: true })));
    this._previewItems.update((items) => items.map((item) => ({ ...item, isRead: true })));
    this._unreadCount.set(0);

    return from(this.postMarkAllRead()).pipe(
      tap(() => this.refreshUnreadCount()),
      catchError((e) => {
        this.apiFail.report('ทำเครื่องหมายว่าอ่านแล้วทั้งหมด', e);
        return throwError(() => e);
      }),
    );
  }

  private async fetchFeedPage(
    page: number,
    pageSize: number,
  ): Promise<{ items: NotificationFeedItemResponse[]; totalCount: number }> {
    const result = await getApiNotificationsFeed({ query: { Page: page, PageSize: pageSize } });
    const data = unwrapSdkResult(result);
    return {
      items: (data.items ?? []).map(normalizeFeedItem),
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
  private async postMarkAllRead(): Promise<void> {
    await postApiNotificationsFeedReadAll();
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

  /** Test helper — see {@link setItemsForTest}. */
  setUnreadCountForTest(count: number): void {
    this._unreadCount.set(count);
  }

  /** Test helper — see {@link setItemsForTest}. Drives `/notifications`' "โหลดเพิ่มเติม" visibility. */
  setTotalCountForTest(count: number): void {
    this._totalCount.set(count);
  }
}
