import { computed, signal, type Signal } from '@angular/core';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';
import type { PagedResult } from './infinite-pager';

export interface ServerPagerOptions<T, TFilter = void> {
  pageSize?: number;
  pageSizeOptions?: number[];
  initialPage?: number;
  errorMessage?: string;
  fetch: (page: number, pageSize: number, filter?: TFilter) => Promise<PagedResult<T>>;
}

export interface ServerPager<T, TFilter = void> {
  items: Signal<T[]>;
  page: Signal<number>;
  pageSize: Signal<number>;
  totalCount: Signal<number>;
  totalPages: Signal<number>;
  state: Signal<ActionState>;
  loading: Signal<boolean>;
  pageSizeOptions: number[];
  onPageChange: (newPage: number) => Promise<void>;
  onPageSizeChange: (newSize: number) => Promise<void>;
  reload: (filter?: TFilter) => Promise<void>;
  reset: () => void;
}

/**
 * Central server-side pagination composable / helper for Angular signals.
 * Manages `page`, `pageSize`, `items`, `totalCount`, `totalPages`, and `loading` states,
 * and handles page navigation and page size changes by querying the backend API.
 */
export function createServerPager<T, TFilter = void>(
  opts: ServerPagerOptions<T, TFilter>,
): ServerPager<T, TFilter> {
  const page = signal(opts.initialPage ?? 1);
  const pageSize = signal(opts.pageSize ?? 10);
  const items = signal<T[]>([]);
  const totalCount = signal(0);
  const totalPages = signal(1);
  const state = signal<ActionState>(idleActionState());
  const loading = computed(() => state().status === 'loading');
  const pageSizeOptions = opts.pageSizeOptions ?? [10, 20, 50, 100];
  let currentFilter: TFilter | undefined;

  async function executeFetch(): Promise<void> {
    state.set(loadingActionState());
    try {
      const res = await opts.fetch(page(), pageSize(), currentFilter);
      items.set(res.items ?? []);
      page.set(res.page ?? page());
      pageSize.set(res.pageSize ?? pageSize());
      const total = res.totalCount ?? (res.items?.length ?? 0);
      totalCount.set(total);
      const computedPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize())));
      totalPages.set(res.totalPages != null && res.totalPages > 0 ? res.totalPages : computedPages);
      state.set(idleActionState());
    } catch (e) {
      state.set(errorActionState(opts.errorMessage ?? 'โหลดข้อมูลไม่สำเร็จ'));
      items.set([]);
      throw e;
    }
  }

  async function onPageChange(newPage: number): Promise<void> {
    if (newPage < 1) return;
    page.set(newPage);
    await executeFetch();
  }

  async function onPageSizeChange(newSize: number): Promise<void> {
    if (newSize < 1 || newSize === pageSize()) return;
    pageSize.set(newSize);
    page.set(1);
    await executeFetch();
  }

  async function reload(filter?: TFilter): Promise<void> {
    if (filter !== undefined) {
      currentFilter = filter;
    }
    await executeFetch();
  }

  function reset(): void {
    page.set(opts.initialPage ?? 1);
    pageSize.set(opts.pageSize ?? 10);
    items.set([]);
    totalCount.set(0);
    totalPages.set(1);
    state.set(idleActionState());
  }

  return {
    items: items.asReadonly(),
    page: page.asReadonly(),
    pageSize: pageSize.asReadonly(),
    totalCount: totalCount.asReadonly(),
    totalPages: totalPages.asReadonly(),
    state: state.asReadonly(),
    loading,
    pageSizeOptions,
    onPageChange,
    onPageSizeChange,
    reload,
    reset,
  };
}
