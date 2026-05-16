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

  async function loadFirst(): Promise<void> {
    items.set([]);
    page.set(0);
    totalCount.set(null);
    await loadMore();
  }

  async function loadMore(): Promise<void> {
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
    } catch {
      state.set(errorActionState(opts.errorMessage));
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

