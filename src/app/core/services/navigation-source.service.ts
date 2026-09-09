import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * seller-analytics-insights v1 §0/§4: the 3-way internal attribution the backend accepts on
 * `POST /api/marketplace/documents/{id}/view` — "search" (came from a search result), "category"
 * (came from browsing a category), "direct" (everything else: home, recommendations, wishlist,
 * a seller's storefront, exam hub, a raw link/refresh).
 */
export type TrafficSource = 'search' | 'category' | 'direct';

export interface DocumentEntrySource {
  source: TrafficSource;
  /** Only meaningful when `source === 'search'` — the trimmed search term used to find the document. */
  searchTerm?: string;
}

/**
 * seller-analytics-insights v1 §4: classifies which page a buyer was on right before landing on
 * the current one, purely from client-side route history — no backend call, no state beyond the
 * URL of the last completed navigation.
 *
 * Must be instantiated once at app startup (`inject()`'d in `app.ts`'s constructor, even though
 * nothing there reads the value) so it starts listening to `NavigationEnd` before the very first
 * route activates — Angular does not create a `providedIn: 'root'` instance until something
 * injects it, and this needs to have subscribed before the first navigation completes.
 */
@Injectable({ providedIn: 'root' })
export class NavigationSourceService {
  private readonly router = inject(Router);

  /**
   * URL of the *previous* completed navigation — never the page currently being entered.
   * `NavigationEnd` for the navigation into the page whose constructor is running right now has
   * not fired yet (component activation happens before `NavigationEnd` in the Angular router
   * lifecycle), so whatever is stored here at that moment is exactly "the page the user came
   * from". This is intentional, not a race — see the class doc above.
   */
  private lastCompletedUrl: string | null = null;

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        this.lastCompletedUrl = e.urlAfterRedirects;
      });
  }

  /**
   * Classifies the page currently being entered. Call once, synchronously, from the entering
   * page's constructor (e.g. `document-detail.page.ts`) — not from an effect/later callback,
   * or `lastCompletedUrl` may have already moved on to a different navigation.
   */
  classifyEntrySource(): DocumentEntrySource {
    const raw = this.lastCompletedUrl;
    if (!raw) return { source: 'direct' };

    const tree = this.router.parseUrl(raw);
    const path = tree.root.children['primary']?.segments.map((s) => s.path).join('/') ?? '';
    const qp = tree.queryParams;

    if (path === 'marketplace') {
      const q = String(qp['q'] ?? '').trim();
      if (q) return { source: 'search', searchTerm: q };
      if (qp['category'] || qp['subcategory']) return { source: 'category' };
      return { source: 'direct' };
    }
    if (path.startsWith('category/')) return { source: 'category' };
    return { source: 'direct' };
  }
}
