import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CartItem, DocumentItem } from '../models';
import { deleteApiCart, deleteApiCartItemsByDocumentId, getApiCart, postApiCartItems } from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { NzMessageService } from 'ng-zorro-antd/message';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);

  private readonly _items = signal<CartItem[]>([]);
  private readonly _drawerOpen = signal<boolean>(false);

  readonly items = this._items.asReadonly();
  readonly drawerOpen = this._drawerOpen.asReadonly();

  readonly count = computed(() => this._items().length);

  readonly subtotal = computed(() =>
    this._items().reduce((sum, item) => sum + item.document.price, 0),
  );

  readonly originalSubtotal = computed(() =>
    this._items().reduce(
      (sum, item) =>
        sum + (item.document.originalPrice ?? item.document.price),
      0,
    ),
  );

  readonly savings = computed(() =>
    Math.max(0, this.originalSubtotal() - this.subtotal()),
  );

  readonly tax = computed(() => Math.round(this.subtotal() * 0.07));

  readonly total = computed(() => this.subtotal() + this.tax());

  constructor() {
    this.loadCart();
  }

  loadCart(): void {
    void (async () => {
      try {
        const result = await getApiCart();
        const data = unwrapSdkResult(result);
        const items: CartItem[] = (data.items ?? []).map((ci) => ({
          document: {
            id: ci.documentId ?? '',
            title: ci.title ?? '',
            price: ci.price ?? 0,
            cover: ci.coverUrl ?? '',
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
            rating: 0,
            reviewCount: 0,
            downloads: 0,
            shortDescription: '',
            description: '',
            slug: '',
            gallery: [],
            format: 'pdf',
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
            isFree: (ci.price ?? 0) === 0,
            isBestseller: false,
            isFeatured: false,
            isEditorsPick: false,
            bundleDocumentIds: [],
            createdAt: '',
            updatedAt: '',
            reviews: [],
          } as DocumentItem,
          addedAt: new Date().toISOString(),
        }));
        this._items.set(items);
      } catch (e) {
        this.apiFail.report('โหลดตะกร้า', e);
      }
    })();
  }

  add(document: DocumentItem): boolean {
    if (this._items().some((i) => i.document.id === document.id)) {
      return false;
    }
    // Optimistic update
    this._items.update((items) => [
      ...items,
      { document, addedAt: new Date().toISOString() },
    ]);
    this.openDrawer();
    // Persist to API
    void (async () => {
      try {
        await postApiCartItems({ body: { documentId: document.id } });
      } catch (e) {
        const status = (e as any)?.status ?? (e as any)?.response?.status;
        if (status === 409) {
          // Revert optimistic update
          this._items.update((items) =>
            items.filter((i) => i.document.id !== document.id),
          );
          this.message.warning('คุณเป็นเจ้าของเอกสารนี้แล้ว');
          this.router.navigate(['/library']);
          return;
        }
        this.apiFail.report('เพิ่มลงตะกร้า', e);
      }
    })();
    return true;
  }

  remove(documentId: string): void {
    // Optimistic update
    this._items.update((items) =>
      items.filter((i) => i.document.id !== documentId),
    );
    // Persist to API
    void (async () => {
      try {
        await deleteApiCartItemsByDocumentId({ path: { documentId } });
      } catch (e) {
        this.apiFail.report('ลบออกจากตะกร้า', e);
      }
    })();
  }

  clear(): void {
    this._items.set([]);
    void (async () => {
      try {
        await deleteApiCart();
      } catch (e) {
        this.apiFail.report('ล้างตะกร้า', e);
      }
    })();
  }

  has(documentId: string): boolean {
    return this._items().some((i) => i.document.id === documentId);
  }

  openDrawer(): void {
    this._drawerOpen.set(true);
  }

  closeDrawer(): void {
    this._drawerOpen.set(false);
  }

  toggleDrawer(): void {
    this._drawerOpen.update((v) => !v);
  }
}
