import { Injectable, computed, inject, signal } from '@angular/core';
import { DocumentItem } from '../models';
import {
  deleteApiWishlist,
  deleteApiWishlistByDocumentId,
  getApiWishlist,
  postApiWishlist,
} from '../api';
import { unwrapSdkResult } from './api-result';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  successActionState,
  type ActionState,
} from './action-state';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { createInfinitePager } from './infinite-pager';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _state = signal<ActionState>(idleActionState());

  private readonly pager = createInfinitePager<DocumentItem>({
    pageSize: 24,
    errorMessage: 'โหลดรายการโปรดไม่สำเร็จ',
    fetch: async (Page, PageSize) => {
      const result = await getApiWishlist({ query: { Page, PageSize } });
      const data = unwrapSdkResult(result);
      const items: DocumentItem[] = (data.items ?? []).map((w) => ({
        id: w.documentId ?? '',
        title: w.title ?? '',
        price: w.price ?? 0,
        originalPrice: w.originalPrice ?? undefined,
        cover: w.coverUrl ?? '',
        seller: {
          id: '',
          studioName: '',
          ownerName: '',
          avatar: '',
          bio: '',
          joinedAt: '',
          rating: 0,
          totalSales: 0,
          totalDocuments: 0,
          followerCount: 0,
          responseHours: 0,
          badges: [],
        },
        rating: w.averageRating ?? 0,
        reviewCount: 0,
        downloads: 0,
        shortDescription: '',
        description: '',
        slug: '',
        gallery: [],
        format: (w.format ?? 'pdf') as DocumentItem['format'],
        pages: 0,
        fileSize: '',
        language: 'th',
        categoryIds: [],
        gradeLevels: [],
        resourceType: 'lesson-summary',
        standards: [],
        tags: [],
        status: 'approved',
        watermarkEnabled: false,
        previewPages: 0,
        isFree: (w.price ?? 0) === 0,
        isBestseller: false,
        isFeatured: false,
        isEditorsPick: false,
        bundleDocumentIds: [],
        createdAt: w.addedAt ?? '',
        updatedAt: '',
        reviews: [],
      })) as DocumentItem[];

      return {
        items,
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  readonly items = this.pager.items;
  readonly hasMore = this.pager.hasMore;
  readonly count = computed(() => this.items().length);
  readonly state = this._state.asReadonly();

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this._state.set(loadingActionState());
    try {
      await this.pager.loadFirst();
      this._state.set(idleActionState());
    } catch (e) {
      this.apiFail.report('โหลดรายการโปรด', e);
      this._state.set(errorActionState('โหลดรายการโปรดไม่สำเร็จ'));
    }
  }

  loadMore(): Promise<void> {
    return this.pager.loadMore();
  }

  has(id: string): boolean {
    return this.items().some((d) => d.id === id);
  }

  toggle(doc: DocumentItem): boolean {
    if (this.has(doc.id)) {
      this.pager.reset();
      this._state.set(loadingActionState());
      void (async () => {
        try {
          await deleteApiWishlistByDocumentId({ path: { documentId: doc.id } });
          this._state.set(successActionState('ลบออกจากรายการโปรดแล้ว'));
          await this.refresh();
        } catch {
          this._state.set(errorActionState('ลบออกจากรายการโปรดไม่สำเร็จ'));
        }
      })();
      return false;
    }
    // After add/remove, refresh first page to keep paging state consistent.
    this._state.set(loadingActionState());
    void (async () => {
      try {
        await postApiWishlist({ body: { documentId: doc.id } });
        this._state.set(successActionState('เพิ่มในรายการโปรดแล้ว'));
        await this.refresh();
      } catch (e) {
        this.apiFail.report('เพิ่มในรายการโปรด', e);
        this._state.set(errorActionState('เพิ่มในรายการโปรดไม่สำเร็จ'));
      }
    })();
    return true;
  }

  remove(id: string): void {
    void (async () => {
      try {
        await deleteApiWishlistByDocumentId({ path: { documentId: id } });
        await this.refresh();
      } catch (e) {
        this.apiFail.report('ลบออกจากรายการโปรด', e);
      }
    })();
  }

  clear(): void {
    this.pager.reset();
    this._state.set(loadingActionState());
    void (async () => {
      try {
        await deleteApiWishlist();
        this._state.set(successActionState('ล้างรายการโปรดแล้ว'));
      } catch (e) {
        this.apiFail.report('ล้างรายการโปรด', e);
        this._state.set(errorActionState('ล้างรายการโปรดไม่สำเร็จ'));
      }
    })();
  }
}
