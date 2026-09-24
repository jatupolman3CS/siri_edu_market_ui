import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { CartItem, DocumentItem } from '../models';
import { defaultAvatarUrl, resolveCoverUrl } from '../brand-assets';
import {
  deleteApiCart,
  deleteApiCartItemsByDocumentId,
  getApiCart,
  postApiCartBundlesByBundleId,
  postApiCartItems,
} from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { AuthService } from './auth.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslationService } from '../i18n/translation.service';

interface CartTotals {
  subtotal: number;
  vatIncluded: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);
  private readonly translation = inject(TranslationService);
  private readonly auth = inject(AuthService);

  private readonly _items = signal<CartItem[]>([]);
  private readonly _drawerOpen = signal<boolean>(false);

  /**
   * Identity the account-switch watcher last saw — `null` for a guest. Seeded synchronously
   * (mirrors `SellerApplicationService.lastSeenUserId`/`NotificationToastService.lastSeenUserId`)
   * so the effect's first flush is a no-op, and updated by `loadCart()` itself so
   * `AuthService.signIn()`/`verifyEmail()`/external login's own explicit
   * `reloadCartAndWishlistAfterSignIn()` call (AC-17) for the same id never causes a duplicate.
   */
  private lastSeenUserId: string | null;

  readonly items = this._items.asReadonly();
  readonly drawerOpen = this._drawerOpen.asReadonly();

  readonly count = computed(() => this._items().length);

  /**
   * BUG-01: totals come from the server so the cart can never quote a figure the charge
   * will not match. Listed prices include VAT; the checkout screen used to add 7% on top
   * of a total the server never charged.
   */
  private readonly _totals = signal<CartTotals>({ subtotal: 0, vatIncluded: 0, total: 0 });

  /** Listed-price sum while a server total has not arrived yet. */
  private readonly listedTotal = computed(() =>
    this._items().reduce((sum, item) => sum + item.document.price, 0),
  );

  /** Amount the buyer will be charged, VAT included. */
  readonly total = computed(() =>
    this.count() === 0 ? 0 : (this._totals().total || this.listedTotal()),
  );

  /** Charged amount excluding VAT. */
  readonly subtotal = computed(() =>
    this.count() === 0 ? 0 : (this._totals().subtotal || this.listedTotal()),
  );

  /** VAT already contained in `total()` — displayed, never added on top. */
  readonly vatIncluded = computed(() => (this.count() === 0 ? 0 : this._totals().vatIncluded));

  readonly originalSubtotal = computed(() =>
    this._items().reduce(
      (sum, item) =>
        sum + (item.document.originalPrice ?? item.document.price),
      0,
    ),
  );

  readonly savings = computed(() =>
    Math.max(0, this.originalSubtotal() - this.listedTotal()),
  );

  constructor() {
    this.lastSeenUserId = untracked(() => this.auth.user()?.id ?? null);

    // anonymous-cart-wishlist-scoping AC-5: the server keeps a cookie-scoped cart for guests
    // too (`CartController` no longer requires `[Authorize]`), so this loads unconditionally —
    // AppHeaderComponent injects this service on every page, guest pages included, and a guard
    // here would leave a reloaded guest's header badge/drawer empty while items still sit
    // server-side.
    this.loadCart();

    // Reload whenever the signed-in identity changes so a login that never called `signIn()`
    // directly (cross-tab login via the `storage` event, or `applyDevBypassSession` in dev) still
    // picks up the merged cart, and so switching accounts or signing out refreshes state too.
    // `AuthService.signIn()`/`verifyEmail()`/external login already reload explicitly right after
    // completing sign-in (AC-17); `loadCart()` stamps `lastSeenUserId` synchronously so this
    // effect's first flush (same id as the constructor's load above) and any reload already done
    // by `AuthService` are no-ops here instead of a duplicate request.
    effect(() => {
      const userId = this.auth.user()?.id ?? null;
      if (userId === this.lastSeenUserId) return;
      this.loadCart();
    });
  }

  loadCart(): void {
    this.lastSeenUserId = this.auth.user()?.id ?? null;
    void (async () => {
      try {
        const result = await getApiCart();
        const data = unwrapSdkResult(result);
        const items: CartItem[] = (data.items ?? []).map((ci) => ({
          document: {
            id: ci.documentId ?? '',
            title: ci.title ?? '',
            price: ci.price ?? 0,
            cover: resolveCoverUrl(ci.coverUrl),
            seller: {
              id: '',
              studioName: '',
              ownerName: '',
              avatar: defaultAvatarUrl(),
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
        this._totals.set({
          subtotal: data.subtotal ?? 0,
          vatIncluded: data.vatIncluded ?? 0,
          total: data.total ?? 0,
        });
      } catch (e) {
        this.apiFail.report('errors.context.loadCart', e);
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
        this.loadCart();
      } catch (e) {
        const status = (e as any)?.status ?? (e as any)?.response?.status;
        if (status === 409) {
          // Revert optimistic update
          this._items.update((items) =>
            items.filter((i) => i.document.id !== document.id),
          );
          this.message.warning(this.translation.t('cart.alreadyOwnsDocument'));
          this.router.navigate(['/library']);
          return;
        }
        this.apiFail.report('errors.context.addToCart', e);
      }
    })();
    return true;
  }

  /**
   * BUG-03: adds every document in a bundle in one call, tagged with the bundle so the
   * server charges the bundle price. Adding the members individually charged full price.
   */
  async addBundle(bundleId: string): Promise<{ ok: boolean; alreadyOwned?: true }> {
    try {
      await postApiCartBundlesByBundleId({ path: { bundleId }, throwOnError: true });
      this.loadCart();
      this.openDrawer();
      return { ok: true };
    } catch (e) {
      const status = (e as { status?: number; response?: { status?: number } })?.status
        ?? (e as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        this.message.warning(this.translation.t('cart.alreadyOwnsSomeBundleItems'));
        void this.router.navigate(['/library']);
        return { ok: false, alreadyOwned: true };
      }
      this.apiFail.report('errors.context.addBundleToCart', e);
      return { ok: false };
    }
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
        this.loadCart();
      } catch (e) {
        this.apiFail.report('errors.context.removeFromCart', e);
      }
    })();
  }

  clear(): void {
    this._items.set([]);
    this._totals.set({ subtotal: 0, vatIncluded: 0, total: 0 });
    void (async () => {
      try {
        await deleteApiCart();
      } catch (e) {
        this.apiFail.report('errors.context.clearCart', e);
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
