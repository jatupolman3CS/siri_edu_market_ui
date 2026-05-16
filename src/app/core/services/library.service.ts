import { Injectable, computed, inject, signal } from '@angular/core';
import { LibraryItem, Order } from '../models';
import { mapLibraryItem, mapOrder } from '../api-mappers/mappers';
import { resolvePublicUrl, resolveApiUrl } from '../api-runtime';
import {
  getApiLibrary,
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

  private readonly _state = signal<ActionState>(idleActionState());
  private _refreshOnceAttempted = false;

  readonly state = this._state.asReadonly();

  private readonly libraryPager = createInfinitePager<LibraryItem>({
    pageSize: 24,
    errorMessage: 'โหลดคลังของฉันไม่สำเร็จ',
    fetch: async (Page, PageSize) => {
      const result = await getApiLibrary({ query: { Page, PageSize } });
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
    errorMessage: 'โหลดคำสั่งซื้อไม่สำเร็จ',
    fetch: async (Page, PageSize) => {
      const result = await getApiOrders({ query: { Page, PageSize } });
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
          errorActionState('เซสชันไม่สมบูรณ์ — กรุณาออกจากระบบแล้วเข้าใหม่'),
        );
      }
      return;
    }
    this._state.set(loadingActionState());
    try {
      await this.libraryPager.loadFirst();
      this._state.set(idleActionState());
    } catch (e) {
      this.apiFail.report('โหลดคลังของฉัน', e);
      this._state.set(errorActionState('โหลดคลังของฉันไม่สำเร็จ'));
    }
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
      this.apiFail.report('โหลดคำสั่งซื้อ', e);
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

  download(documentId: string): void {
    void (async () => {
      this._state.set(loadingActionState());
      try {
        const result = await postApiLibraryByDocumentIdDownload({ path: { documentId } });
        const data = unwrapSdkResult(result);
        this._state.set(successActionState('ดาวน์โหลดเรียบร้อย'));
        const url = resolvePublicUrl(data?.downloadUrl);
        if (url) {
          window.open(url, '_blank', 'noopener');
        }
      } catch (e) {
        this.apiFail.report('ขอดาวน์โหลดเอกสาร', e);
        this._state.set(errorActionState('ดาวน์โหลดไม่สำเร็จ'));
      }
    })();
  }

  private readonly _reviewState = signal<ActionState>(idleActionState());
  readonly reviewState = this._reviewState.asReadonly();

  async submitReview(documentId: string, request: SubmitReviewRequest): Promise<SubmitReviewResponse | null> {
    if (!this.auth.accessToken()) {
      this._reviewState.set(errorActionState('กรุณาเข้าสู่ระบบก่อนรีวิว'));
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
      this._reviewState.set(successActionState('รีวิวสำเร็จ ขอบคุณค่ะ!'));
      return data;
    } catch (e) {
      this.apiFail.report('ส่งรีวิว', e);
      this._reviewState.set(errorActionState('ส่งรีวิวไม่สำเร็จ'));
      return null;
    }
  }

  resetReviewState(): void {
    this._reviewState.set(idleActionState());
  }
}
