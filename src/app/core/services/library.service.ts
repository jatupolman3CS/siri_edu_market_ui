import { Injectable, computed, inject, signal } from '@angular/core';
import { BuyerDocumentVersionInfo, LibraryItem, Order, WatermarkMode } from '../models';
import { mapBuyerDocumentVersion, mapLibraryItem, mapOrder } from '../api-mappers/mappers';
import { resolvePublicUrl, resolveApiUrl, resolveDownloadUrl } from '../api-runtime';
import {
  getApiLibrary,
  getApiLibraryByDocumentIdVersions,
  getApiOrders,
  postApiLibraryByDocumentIdDownload,
} from '../api';
import { unwrapSdkResult } from './api-result';
import { AuthService } from './auth.service';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  successActionState,
  type ActionState,
} from './action-state';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { createInfinitePager } from './infinite-pager';
import { TranslationService } from '../i18n/translation.service';

export type LibraryFilter = 'all' | 'unreviewed' | 'unread';

/**
 * order-status-tabs v1 §1/§4: the 4 tabs shown on `/orders`. "successful" groups
 * `Paid` + `Fulfilled`, "cancelled_refunded" groups `Cancelled` + `Refunded` — the grouping
 * itself happens at the backend (§1 decision 2), this type only names the wire value sent as
 * the `tab` query param.
 */
export type OrderTabFilter = 'all' | 'awaiting_payment' | 'successful' | 'cancelled_refunded';

/**
 * watermark-completion v1 §3.1 — the answer of `POST /api/library/{documentId}/download`.
 * `watermarkNotice` is Thai copy written by the backend (it embeds the `WMK-XXXXXXXX` code of
 * this buyer's own copy); the UI shows it verbatim and never composes its own version.
 */
export interface DocumentDownloadResult {
  downloadUrl: string;
  watermarkApplied: boolean;
  watermarkMode: WatermarkMode;
  /** `null` only while `WatermarkForensicEnabled` is off (§3.1). */
  watermarkToken: string | null;
  /** `null` = nothing to tell the buyer. */
  watermarkNotice: string | null;
}

/** watermark-completion v1 §3.1: the 4 modes the delivery pipeline may report. */
function toWatermarkMode(value: string | null | undefined): WatermarkMode {
  switch ((value ?? '').trim()) {
    case 'raster':
    case 'ooxml':
    case 'repack':
      return (value ?? '').trim() as WatermarkMode;
    default:
      return 'none';
  }
}

export interface SubmitReviewRequest {
  rating: number;
  comment: string;
}

export interface SubmitReviewResponse {
  id: string;
  documentId: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly auth = inject(AuthService);
  private readonly translation = inject(TranslationService);

  private readonly _state = signal<ActionState>(idleActionState());
  private _refreshOnceAttempted = false;

  readonly state = this._state.asReadonly();

  /**
   * library-is-reviewed v1: tab "ทั้งหมด" / "ยังไม่ได้รีวิว" must re-query the API instead of
   * filtering the page already loaded — a client-side filter only sees whatever page happened
   * to load, so a buyer with hundreds of items would see an empty (or wrong-count) tab.
   */
  readonly libraryFilter = signal<LibraryFilter>('all');

  /**
   * order-status-tabs v1 §4: same reasoning as `libraryFilter` above — the 4 order tabs must
   * re-query `GET /api/orders` (grouping happens server-side), never `Array.filter()` the page
   * already loaded.
   */
  readonly ordersTab = signal<OrderTabFilter>('all');

  private readonly libraryPager = createInfinitePager<LibraryItem>({
    pageSize: 24,
    errorMessage: this.translation.t('library.loadFailed'),
    fetch: async (Page, PageSize) => {
      // TODO(contract): wire unreadOnly after SDK regen
      const queryPayload: Record<string, unknown> = {
        Page,
        PageSize,
        unreviewedOnly: this.libraryFilter() === 'unreviewed' ? true : undefined,
        unreadOnly: this.libraryFilter() === 'unread' ? true : undefined,
      };
      const result = await getApiLibrary({
        query: queryPayload as unknown as NonNullable<Parameters<typeof getApiLibrary>[0]>['query'],
      });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapLibraryItem),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  private readonly ordersPager = createInfinitePager<Order>({
    pageSize: 20,
    errorMessage: this.translation.t('orders.loadFailed'),
    fetch: async (Page, PageSize) => {
      const result = await getApiOrders({
        query: {
          Page,
          PageSize,
          // order-status-tabs v1 §3.1: wire values ต้องตรงตาราง §3.1 เป๊ะ ๆ (ห้ามแปลงคำ) —
          // 'all' ไม่ส่ง param นี้เลย (undefined) เพื่อให้ backend ไม่กรอง
          tab: this.ordersTab() === 'all' ? undefined : this.ordersTab(),
        },
      });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapOrder),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  readonly library = this.libraryPager.items;
  readonly orders = this.ordersPager.items;
  readonly libraryHasMore = this.libraryPager.hasMore;
  readonly ordersHasMore = this.ordersPager.hasMore;

  readonly totalDocuments = computed(() => this.library().length);

  readonly totalDownloads = computed(() =>
    this.library().reduce((s, l) => s + l.downloadCount, 0),
  );

  readonly totalSpent = computed(() =>
    this.orders()
      .filter((o) => o.status !== 'awaiting_payment' && o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.total, 0),
  );

  /**
   * Library / Orders endpoints are typically protected; do not auto-call until JWT wiring exists.
   * These methods are ready for the auth phase.
   */
  async refreshLibrary(): Promise<void> {
    if (!this.auth.accessToken()) {
      if (this.auth.isAuthenticated()) {
        this._state.set(
          errorActionState(this.translation.t('library.sessionIncomplete')),
        );
      }
      return;
    }
    this._state.set(loadingActionState());
    try {
      await this.libraryPager.loadFirst();
      this._state.set(idleActionState());
    } catch (e) {
      this.apiFail.report('errors.context.loadLibrary', e);
      this._state.set(errorActionState(this.translation.t('library.loadFailed')));
    }
  }

  /**
   * AC-9: switching the "ยังไม่ได้รีวิว" tab must re-fetch page 1, never `Array.filter()` the
   * items already in memory — see the comment on `libraryFilter` above.
   */
  async setLibraryFilter(filter: LibraryFilter): Promise<void> {
    if (this.libraryFilter() === filter) return;
    this.libraryFilter.set(filter);
    await this.refreshLibrary();
  }

  /**
   * order-status-tabs v1 §4: switching tabs resets the pager back to page 1 and re-fetches
   * (`refreshOrders` → `ordersPager.loadFirst()`) — mirrors `setLibraryFilter` above.
   */
  async setOrdersTab(tab: OrderTabFilter): Promise<void> {
    if (this.ordersTab() === tab) return;
    this.ordersTab.set(tab);
    await this.refreshOrders();
  }

  /**
   * Best-effort: used on pages that need ownership info
   * but cannot assume the library page was visited.
   */
  async refreshLibraryOnce(): Promise<void> {
    if (this._refreshOnceAttempted) return;
    this._refreshOnceAttempted = true;
    await this.refreshLibrary();
  }

  async refreshOrders(): Promise<void> {
    if (!this.auth.accessToken()) return;
    try {
      await this.ordersPager.loadFirst();
    } catch (e) {
      this.apiFail.report('errors.context.loadOrders', e);
    }
  }

  loadMoreLibrary(): Promise<void> {
    if (!this.auth.accessToken()) return Promise.resolve();
    return this.libraryPager.loadMore();
  }

  loadMoreOrders(): Promise<void> {
    if (!this.auth.accessToken()) return Promise.resolve();
    return this.ordersPager.loadMore();
  }

  /**
   * watermark-completion v1 §3.1/§4.4: still opens the file exactly as before, but now also
   * hands the caller what the delivery pipeline did with it, so the page can show
   * `watermarkNotice` with the message mechanism it already uses. Returns `null` when the
   * request failed (the failure is reported centrally, as before).
   */
  async download(documentId: string): Promise<DocumentDownloadResult | null> {
    this._state.set(loadingActionState());
    try {
      const result = await postApiLibraryByDocumentIdDownload({ path: { documentId } });
      const data = unwrapSdkResult(result);
      this._state.set(successActionState(this.translation.t('library.downloadSuccess')));

      // document-versioning v1 §4.2: update local state optimistically
      this.libraryPager.updateItems((items) =>
        items.map((item) =>
          item.document.id === documentId ? { ...item, hasNewVersion: false } : item,
        ),
      );

      const url = resolveDownloadUrl(data?.downloadUrl, this.auth.accessToken());
      if (url) {
        window.open(url, '_blank', 'noopener');
      }
      return {
        downloadUrl: url ?? '',
        watermarkApplied: data?.watermarkApplied ?? false,
        watermarkMode: toWatermarkMode(data?.watermarkMode),
        watermarkToken: (data?.watermarkToken ?? '').trim() || null,
        watermarkNotice: (data?.watermarkNotice ?? '').trim() || null,
      };
    } catch (e) {
      this.apiFail.report('errors.context.downloadDocument', e);
      this._state.set(errorActionState(this.translation.t('library.downloadFailed')));
      return null;
    }
  }

  /**
   * document-versioning v1 §3.5/§4.2: `GET /api/library/{documentId}/versions` — version
   * history for the "ดูสิ่งที่อัปเดต" link on a library item (`404` when the buyer has no
   * `LIBRARY_ITEM` for this document — treated the same as "no history" here).
   */
  async getDocumentVersions(documentId: string): Promise<BuyerDocumentVersionInfo[]> {
    try {
      const result = await getApiLibraryByDocumentIdVersions({ path: { documentId } });
      const data = unwrapSdkResult(result);
      return (data ?? []).map(mapBuyerDocumentVersion);
    } catch (e) {
      this.apiFail.report('errors.context.loadVersionHistory', e);
      return [];
    }
  }

  private readonly _reviewState = signal<ActionState>(idleActionState());
  readonly reviewState = this._reviewState.asReadonly();

  async submitReview(documentId: string, request: SubmitReviewRequest): Promise<SubmitReviewResponse | null> {
    if (!this.auth.accessToken()) {
      this._reviewState.set(errorActionState(this.translation.t('library.loginBeforeReview')));
      return null;
    }

    this._reviewState.set(loadingActionState());
    try {
      const url = resolveApiUrl(`/api/library/${documentId}/reviews`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.auth.accessToken()}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw errorData;
      }

      const data: SubmitReviewResponse = await response.json();
      this._reviewState.set(successActionState(this.translation.t('library.reviewSuccess')));
      return data;
    } catch (e) {
      this.apiFail.report('errors.context.submitReview', e);
      this._reviewState.set(errorActionState(this.translation.t('library.reviewFailed')));
      return null;
    }
  }

  resetReviewState(): void {
    this._reviewState.set(idleActionState());
  }

  /**
   * library-read-progress v1 §4: toggles read status for a document.
   * Updates the item in `libraryPager` in-place without reloading the entire page.
   */
  async toggleRead(documentId: string, isRead: boolean): Promise<void> {
    if (!this.auth.accessToken()) return;

    try {
      // TODO(contract): wire putApiLibraryByDocumentIdReadStatus หลัง regen — แทน fetch บรรทัดถัดไปด้วย:
      // const res = unwrapSdkResult(await putApiLibraryByDocumentIdReadStatus({
      //   path: { documentId },
      //   body: { isRead },
      // }));
      const url = resolveApiUrl(`/api/library/${documentId}/read-status`);
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.auth.accessToken()}`,
        },
        body: JSON.stringify({ isRead }),
      });

      if (!response.ok) {
        throw new Error('Update read status failed');
      }

      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const markedReadAt = typeof data?.['markedReadAt'] === 'string'
        ? (data['markedReadAt'] as string)
        : (isRead ? new Date().toISOString() : undefined);

      this.libraryPager.updateItems((prev) =>
        prev.map((item) =>
          item.document.id === documentId
            ? { ...item, isRead, markedReadAt }
            : item,
        ),
      );
    } catch (e) {
      this.apiFail.report('errors.context.updateReadStatus', e);
    }
  }
}
