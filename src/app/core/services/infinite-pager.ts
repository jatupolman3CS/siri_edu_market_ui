import { computed, signal } from '@angular/core';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';

export type PagedResult<T> = {
  items?: T[];
  page?: number;
  pageSize?: number;
  totalCount?: number;
  totalPages?: number;
};

export function createInfinitePager<T>(opts: {
  pageSize: number;
  fetch: (page: number, pageSize: number) => Promise<PagedResult<T>>;
  errorMessage: string;
}) {
  const items = signal<T[]>([]);
  const page = signal(0);
  const pageSize = opts.pageSize;
  const totalCount = signal<number | null>(null);
  const state = signal<ActionState>(idleActionState());

  const hasMore = computed(() => {
    const total = totalCount();
    if (total == null) return true;
    return items().length < total;
  });

  /** Records the failure in `state` and rethrows, so callers can decide what to do. */
  async function fetchPage(): Promise<void> {
    if (state().status === 'loading') return;
    if (!hasMore()) return;

    state.set(loadingActionState());
    const nextPage = page() + 1;

    try {
      const res = await opts.fetch(nextPage, pageSize);
      const batch = res.items ?? [];
      items.update((prev) => (nextPage === 1 ? batch : [...prev, ...batch]));
      page.set(res.page ?? nextPage);
      totalCount.set(res.totalCount ?? totalCount());
      state.set(idleActionState());
    } catch (e) {
      state.set(errorActionState(opts.errorMessage));
      throw e;
    }
  }

  /**
   * F-30-2: this propagates the failure. It used to swallow it, so a service that awaited
   * `loadFirst()` inside a try/catch took the success path and reported idle — a wishlist or
   * library that failed to load looked exactly like an empty one, with no message and no way
   * to retry. Every caller awaits this inside a try/catch already.
   */
  async function loadFirst(): Promise<void> {
    items.set([]);
    page.set(0);
    totalCount.set(null);
    await fetchPage();
  }

  /**
   * Deliberately does not propagate: this one is wired straight to scroll handlers that have
   * nowhere to put an error, and an unhandled rejection there would be worse than a quiet
   * failure. The failure is still in `state` for anyone rendering it.
   */
  async function loadMore(): Promise<void> {
    try {
      await fetchPage();
    } catch {
      /* recorded in state above */
    }
  }

  function reset(): void {
    items.set([]);
    page.set(0);
    totalCount.set(null);
    state.set(idleActionState());
  }

  return {
    items: items.asReadonly(),
    page: page.asReadonly(),
    pageSize,
    totalCount: totalCount.asReadonly(),
    state: state.asReadonly(),
    hasMore,
    loadFirst,
    loadMore,
    reset,
  };
}

