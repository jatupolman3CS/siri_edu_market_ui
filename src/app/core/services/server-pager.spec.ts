import { describe, expect, it, vi } from 'vitest';
import { createServerPager } from './server-pager';
import type { PagedResult } from './infinite-pager';

describe('createServerPager', () => {
  it('initializes with default page and pageSize', () => {
    const pager = createServerPager<string>({
      pageSize: 10,
      fetch: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
    });

    expect(pager.page()).toBe(1);
    expect(pager.pageSize()).toBe(10);
    expect(pager.totalCount()).toBe(0);
    expect(pager.items()).toEqual([]);
  });

  it('loads data on reload and updates signals', async () => {
    const fetchSpy = vi.fn().mockImplementation((page: number, pageSize: number): Promise<PagedResult<string>> => {
      return Promise.resolve({
        items: ['item 1', 'item 2'],
        page,
        pageSize,
        totalCount: 25,
        totalPages: 3,
      });
    });

    const pager = createServerPager<string>({
      pageSize: 10,
      fetch: fetchSpy,
    });

    await pager.reload();

    expect(fetchSpy).toHaveBeenCalledWith(1, 10, undefined);
    expect(pager.items()).toEqual(['item 1', 'item 2']);
    expect(pager.totalCount()).toBe(25);
    expect(pager.totalPages()).toBe(3);
  });

  it('updates page and fetches next page on onPageChange', async () => {
    const fetchSpy = vi.fn().mockImplementation((page: number, pageSize: number): Promise<PagedResult<string>> => {
      return Promise.resolve({
        items: [`item for page ${page}`],
        page,
        pageSize,
        totalCount: 50,
        totalPages: 5,
      });
    });

    const pager = createServerPager<string>({
      pageSize: 10,
      fetch: fetchSpy,
    });

    await pager.onPageChange(2);

    expect(fetchSpy).toHaveBeenCalledWith(2, 10, undefined);
    expect(pager.page()).toBe(2);
    expect(pager.items()).toEqual(['item for page 2']);
  });

  it('resets page to 1 and updates pageSize on onPageSizeChange', async () => {
    const fetchSpy = vi.fn().mockImplementation((page: number, pageSize: number): Promise<PagedResult<string>> => {
      return Promise.resolve({
        items: [`items with size ${pageSize}`],
        page,
        pageSize,
        totalCount: 100,
        totalPages: Math.ceil(100 / pageSize),
      });
    });

    const pager = createServerPager<string>({
      initialPage: 3,
      pageSize: 10,
      fetch: fetchSpy,
    });

    await pager.onPageSizeChange(50);

    expect(fetchSpy).toHaveBeenCalledWith(1, 50, undefined);
    expect(pager.page()).toBe(1);
    expect(pager.pageSize()).toBe(50);
    expect(pager.totalPages()).toBe(2);
  });

  it('reloadFromPage1 resets page to 1 and fetches with the given filter', async () => {
    const fetchSpy = vi.fn().mockImplementation((page: number, pageSize: number, filter?: string): Promise<PagedResult<string>> => {
      return Promise.resolve({
        items: [`item for ${filter ?? 'no filter'}`],
        page,
        pageSize,
        totalCount: 10,
        totalPages: 1,
      });
    });

    const pager = createServerPager<string, string>({
      pageSize: 10,
      fetch: fetchSpy,
    });

    await pager.onPageChange(3);
    expect(pager.page()).toBe(3);

    await pager.reloadFromPage1('คณิต');

    expect(fetchSpy).toHaveBeenLastCalledWith(1, 10, 'คณิต');
    expect(pager.page()).toBe(1);
    expect(pager.items()).toEqual(['item for คณิต']);
  });

  it('discards a stale response when a newer request resolves first (AC-7 generation guard)', async () => {
    // page 2's fetch resolves *after* page 3's fetch, simulating overlapping requests where the
    // slower, older one arrives last. The final state must reflect page 3, not page 2.
    let resolvePage2!: (value: PagedResult<string>) => void;
    const fetchSpy = vi.fn().mockImplementation((page: number, pageSize: number): Promise<PagedResult<string>> => {
      if (page === 2) {
        return new Promise((resolve) => {
          resolvePage2 = resolve;
        });
      }
      return Promise.resolve({
        items: [`item for page ${page}`],
        page,
        pageSize,
        totalCount: 50,
        totalPages: 5,
      });
    });

    const pager = createServerPager<string>({
      pageSize: 10,
      fetch: fetchSpy,
    });

    const page2Promise = pager.onPageChange(2); // starts, but its fetch() won't resolve yet
    await pager.onPageChange(3); // resolves immediately, should "win"

    expect(pager.page()).toBe(3);
    expect(pager.items()).toEqual(['item for page 3']);

    // now let the stale page-2 response resolve — it must not overwrite page 3's state
    resolvePage2({ items: ['item for page 2'], page: 2, pageSize: 10, totalCount: 50, totalPages: 5 });
    await page2Promise;

    expect(pager.page()).toBe(3);
    expect(pager.items()).toEqual(['item for page 3']);
  });
});
