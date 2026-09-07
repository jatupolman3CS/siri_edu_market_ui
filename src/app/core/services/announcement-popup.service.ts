import { Injectable, computed, signal } from '@angular/core';
import type { AnnouncementPopup } from '../models';
import { getApiAnnouncementsActive } from '../api';
import { mapAnnouncementPopup } from '../api-mappers/mappers';
import { unwrapSdkResult } from './api-result';

/**
 * announcement-popup v1 §1.5/§4 (`docs/contracts/announcement-popup.md`) — dismiss-forever scope
 * is browser `sessionStorage` only, no backend state (reasons in §1.5). Reuses the
 * `RecentlyViewedService` pattern (`siriedu.<name>` key, `typeof storage === 'undefined'` guard,
 * `try/catch` around every storage access) but with `sessionStorage` instead of `localStorage`.
 */
const DISMISSED_STORAGE_KEY = 'siriedu.announcementsDismissed';

@Injectable({ providedIn: 'root' })
export class AnnouncementPopupService {
  /**
   * §1.1/§1.3: one popup per announcement, queued in memory — not one popup covering every
   * announcement. `current` is always the head of the queue; `close()` pops it so the next
   * announcement (if any) shows immediately, with no re-fetch (§1.3, AC-22).
   */
  private readonly _queue = signal<AnnouncementPopup[]>([]);
  /**
   * Explicit `computed<AnnouncementPopup | null>` — this project's tsconfig does not enable
   * `noUncheckedIndexedAccess`, so TypeScript would otherwise infer `_queue()[0]` (and therefore
   * this whole computed) as always-defined `AnnouncementPopup`, even though it is genuinely `null`
   * at runtime whenever the queue is empty (every consumer — the popup component's `@if`, this
   * service's own `close()`/`dismissForever()` — depends on that).
   */
  readonly current = computed<AnnouncementPopup | null>(() => this._queue()[0] ?? null);

  /**
   * Plain field, not a signal — nothing needs to react to it changing, and it must survive
   * `BuyerLayoutComponent` being destroyed/recreated (e.g. navigating to `/auth/login` and back)
   * since this service is a root singleton that outlives the component (§4).
   */
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const all = await this.fetchActive();
    const dismissed = this.loadDismissed();
    this._queue.set(all.filter((a) => !dismissed.has(a.id)));
  }

  /**
   * Closes the announcement popup for the current page session.
   */
  close(): void {
    this._queue.set([]);
  }

  /** §1.4: dismiss scope persists all active announcement IDs for the current browser session. */
  dismissForever(id?: string): void {
    const dismissed = this.loadDismissed();
    if (id) {
      dismissed.add(id);
    }
    for (const item of this._queue()) {
      dismissed.add(item.id);
    }
    this.persistDismissed(dismissed);
    this.close();
  }

  private loadDismissed(): Set<string> {
    if (typeof sessionStorage === 'undefined') return new Set();
    try {
      const raw = sessionStorage.getItem(DISMISSED_STORAGE_KEY);
      if (!raw) return new Set();
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((id): id is string => typeof id === 'string'));
    } catch {
      return new Set();
    }
  }

  private persistDismissed(ids: Set<string>): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...ids]));
    } catch {
      // Storage full / disabled (private browsing) — dismiss-forever silently degrades to
      // "dismissed for this page load only", which is still safe (never throws for the caller).
    }
  }

  /**
   * §3.3/AC-13: anonymous, no query params — every active announcement comes back in one call
   * (§1.3). Fails silently to an empty list (same "never throw" philosophy as
   * `loadDismissed`/`persistDismissed` above) rather than reporting through `ApiFailureReporter`:
   * this is a best-effort marketing popup on every buyer page load, not a user-initiated action —
   * a transient network hiccup here should never surface as a toast or an unhandled rejection from
   * `initialize()`'s un-awaited call site (`AnnouncementPopupComponent`'s constructor).
   */
  private async fetchActive(): Promise<AnnouncementPopup[]> {
    try {
      const data = unwrapSdkResult(await getApiAnnouncementsActive());
      return (data ?? []).map(mapAnnouncementPopup);
    } catch {
      return [];
    }
  }
}
