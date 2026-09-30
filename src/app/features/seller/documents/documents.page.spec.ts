import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { SellerDocumentsPage } from './documents.page';
import { AuthService, SellerService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import type { DocumentItem } from '../../../core/models';
import type { PagedResult } from '../../../core/services/infinite-pager';

/**
 * document-rejection-reason v1 §4/AC-9/AC-11 — the seller documents list must show the
 * rejection reason inline under the "ไม่ผ่าน" status pill when present, and must never render
 * anything extra for rows in any other status (or a rejected row with no reason at all — a
 * defensive case for pre-migration data / SDK not regenerated yet, AC-12).
 */
function fakeDocument(overrides: Partial<DocumentItem> = {}): DocumentItem {
  return {
    id: 'doc-1',
    slug: 'doc-1',
    title: 'เอกสารทดสอบ',
    shortDescription: '',
    description: '',
    cover: '',
    gallery: [],
    galleryCount: 0,
    price: 100,
    format: 'pdf',
    pages: 10,
    fileSize: '1MB',
    language: 'th',
    categoryIds: [],
    gradeLevels: [],
    resourceType: 'lesson-summary',
    tags: [],
    rating: 0,
    reviewCount: 0,
    downloads: 0,
    status: 'approved',
    watermarkEnabled: false,
    previewPages: 0,
    seller: {
      id: 's1',
      studioName: 'ร้านทดสอบ',
      ownerName: '',
      avatar: '',
      bio: '',
      joinedAt: '2026-01-01T00:00:00Z',
      rating: 0,
      totalSales: 0,
      totalDocuments: 0,
      followerCount: 0,
      responseHours: 0,
      badges: [],
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    reviews: [],
    isBestseller: false,
    isFeatured: false,
    isEditorsPick: false,
    bundleDocumentIds: [],
    ...overrides,
  } as unknown as DocumentItem;
}

type MessageSpies = {
  success: ReturnType<typeof vi.fn>;
  warning: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
};

/** Spies of the most recently rendered fixture — read by the D3 download specs below. */
let message: MessageSpies;

function render(items: DocumentItem[], sellerOverrides: Partial<SellerService> = {}) {
  const fakeSeller: Partial<SellerService> = {
    sellerProfileRequired: signal(false).asReadonly(),
    listDocumentsPaged: async () =>
      ({
        items,
        page: 1,
        pageSize: 10,
        totalCount: items.length,
        totalPages: 1,
      }) as PagedResult<DocumentItem>,
    ...sellerOverrides,
  };

  message = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() };

  TestBed.configureTestingModule({
    imports: [SellerDocumentsPage],
    providers: [
      provideRouter([]),
      { provide: SellerService, useValue: fakeSeller },
      { provide: NzMessageService, useValue: message },
      { provide: NzModalService, useValue: { confirm: vi.fn() } },
      // The real AuthService drags in Router / NzMessageService / Google OAuth; the page only
      // reads `accessToken()` (to hand the token to `resolveDownloadUrl`).
      { provide: AuthService, useValue: { accessToken: () => 'jwt-token' } },
    ],
  });

  const fixture = TestBed.createComponent(SellerDocumentsPage);
  fixture.detectChanges();
  return fixture;
}

async function settle(fixture: { detectChanges: () => void }): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  fixture.detectChanges();
}

afterEach(() => TestBed.resetTestingModule());

describe('SellerDocumentsPage — rejection reason row (document-rejection-reason v1 §4/AC-9)', () => {
  it('AC-9: shows the rejection reason under the pill for a rejected row that has one', async () => {
    const fixture = render([
      fakeDocument({
        status: 'rejected',
        rejectionReason: 'ภาพหน้าปกไม่ตรงกับเนื้อหาเอกสาร',
      }),
    ]);
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ไม่ผ่าน');
    expect(text).toContain('เหตุผล: ภาพหน้าปกไม่ตรงกับเนื้อหาเอกสาร');
  });

  it('AC-11: does not show any reason line for an approved row', async () => {
    const fixture = render([fakeDocument({ status: 'approved' })]);
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('เหตุผล:');
  });

  it('AC-11/AC-12: a rejected row with no rejectionReason renders no reason line and does not throw', async () => {
    const fixture = render([
      fakeDocument({ status: 'rejected', rejectionReason: null }),
    ]);

    await expect(settle(fixture)).resolves.toBeUndefined();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ไม่ผ่าน');
    expect(text).not.toContain('เหตุผล:');
  });

  it('AC-12: rejectionReason undefined on a rejected row does not throw and shows no reason line', async () => {
    const fixture = render([
      fakeDocument({ status: 'rejected', rejectionReason: undefined }),
    ]);

    await expect(settle(fixture)).resolves.toBeUndefined();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('เหตุผล:');
  });
});

/**
 * document-preview-access-fixes v1 §4.2 (D3) / AC-23..AC-26 — the seller had no way at all to
 * download their own file. The button was only half the fix, and the other half was wrong: it
 * pre-opened a blank tab and navigated it, which a popup blocker turns into a silent no-op
 * (`window.open` returns `null`) — exactly what sellers hit. The page now fetches the bytes
 * through `downloadFileFromUrl`, which doubles as the liveness probe (the presigned URL resolves
 * even when the storage object is gone), and still tells the three failure modes apart with
 * three distinct Thai messages.
 */
const DOWNLOAD_TITLE = 'ดาวน์โหลดไฟล์ต้นฉบับ';
const MSG_NO_FILE = 'เอกสารนี้ยังไม่มีไฟล์ให้ดาวน์โหลด';
const MSG_MISSING_OBJECT =
  'ไม่พบไฟล์ของเอกสารนี้ในระบบจัดเก็บ กรุณาอัปโหลดไฟล์ใหม่อีกครั้ง';
const MSG_FAILED = 'ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

describe('SellerDocumentsPage — download original file (document-preview-access-fixes v1 §4.2)', () => {
  let realFetch: typeof globalThis.fetch;
  let realOpen: typeof window.open;
  let realCreateObjectURL: typeof URL.createObjectURL;
  let realRevokeObjectURL: typeof URL.revokeObjectURL;
  let realCreateElement: typeof document.createElement;
  let fetchMock: ReturnType<typeof vi.fn>;
  let openMock: ReturnType<typeof vi.fn>;
  /** Anchors the helper actually clicked — Angular creates unrelated <a> elements too. */
  let saved: HTMLAnchorElement[];

  function fileResponse(ok = true): Response {
    return {
      ok,
      status: ok ? 200 : 404,
      headers: new Headers(),
      blob: async () => new Blob(['bytes'], { type: 'application/pdf' }),
    } as unknown as Response;
  }

  beforeEach(() => {
    realFetch = globalThis.fetch;
    fetchMock = vi.fn(async () => fileResponse());
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    // A blocked popup is the *default* here on purpose: the page must still deliver the file.
    realOpen = window.open;
    openMock = vi.fn(() => null);
    window.open = openMock as unknown as typeof window.open;

    realCreateObjectURL = URL.createObjectURL;
    realRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock/seller') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    saved = [];
    realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        const anchor = el as HTMLAnchorElement;
        anchor.click = () => {
          saved.push(anchor);
        };
      }
      return el;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    window.open = realOpen;
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
    vi.restoreAllMocks();
  });

  function renderWith(
    getDocumentDownloadUrl: SellerService['getDocumentDownloadUrl'],
    items: DocumentItem[] = [fakeDocument({ id: 'doc-42' })],
  ) {
    return render(items, { getDocumentDownloadUrl } as Partial<SellerService>);
  }

  function downloadButtonOf(fixture: { nativeElement: unknown }): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      `button[title="${DOWNLOAD_TITLE}"]`,
    );
  }

  it('AC-23: every row renders a download button that calls the service with that row id', async () => {
    const spy = vi.fn(async () => ({ url: '/api/files/download/docs/a.pdf' }));
    const fixture = renderWith(spy as unknown as SellerService['getDocumentDownloadUrl'], [
      fakeDocument({ id: 'doc-42' }),
      fakeDocument({ id: 'doc-43' }),
    ]);
    await settle(fixture);

    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      `button[title="${DOWNLOAD_TITLE}"]`,
    );
    expect(buttons.length).toBe(2);

    (buttons[1] as HTMLButtonElement).click();
    await settle(fixture);

    expect(spy).toHaveBeenCalledWith('doc-43');
  });

  it('AC-26: on success the file is saved through a hidden anchor — no popup involved', async () => {
    const fixture = renderWith(
      (async () => ({ url: '/api/files/download/docs/a.pdf' })) as SellerService['getDocumentDownloadUrl'],
    );
    await settle(fixture);

    await fixture.componentInstance.download(fakeDocument({ id: 'doc-42' }));

    expect(openMock).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
    expect(saved[0].getAttribute('href')).toBe('blob:mock/seller');
    expect(saved[0].getAttribute('download')).toBeTruthy();
    expect(message.error).not.toHaveBeenCalled();
    expect(fixture.componentInstance.downloadingId()).toBeNull();
  });

  it('fetches the token-carrying resolved URL exactly once (the fetch *is* the probe)', async () => {
    const fixture = renderWith(
      (async () => ({ url: '/api/files/download/docs/a.pdf' })) as SellerService['getDocumentDownloadUrl'],
    );
    await settle(fixture);

    await fixture.componentInstance.download(fakeDocument({ id: 'doc-42' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [fetchedUrl] = fetchMock.mock.calls[0] as [string];
    expect(fetchedUrl).toContain('/api/files/download/docs/a.pdf');
    expect(fetchedUrl).toContain('token=jwt-token');
  });

  it('AC-24: a non-2xx response (storage object gone) saves nothing and shows the storage message', async () => {
    fetchMock.mockResolvedValue(fileResponse(false));
    const fixture = renderWith(
      (async () => ({ url: '/api/files/download/it/stale.pdf' })) as SellerService['getDocumentDownloadUrl'],
    );
    await settle(fixture);

    await fixture.componentInstance.download(fakeDocument({ id: 'doc-42' }));

    expect(saved).toHaveLength(0);
    expect(message.error).toHaveBeenCalledWith(MSG_MISSING_OBJECT);
    expect(fixture.componentInstance.downloadingId()).toBeNull();
  });

  it('AC-24: a fetch that throws is treated as a failure, not as success', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    const fixture = renderWith(
      (async () => ({ url: '/api/files/download/docs/a.pdf' })) as SellerService['getDocumentDownloadUrl'],
    );
    await settle(fixture);

    await fixture.componentInstance.download(fakeDocument({ id: 'doc-42' }));

    expect(saved).toHaveLength(0);
    expect(message.error).toHaveBeenCalledWith(MSG_MISSING_OBJECT);
  });

  it('AC-25: a listing with no file (400) warns with its own message and never fetches', async () => {
    const fixture = renderWith(
      (async () => ({ error: 'no_file' as const })) as SellerService['getDocumentDownloadUrl'],
    );
    await settle(fixture);

    await fixture.componentInstance.download(fakeDocument({ id: 'doc-42' }));

    expect(message.warning).toHaveBeenCalledWith(MSG_NO_FILE);
    expect(message.error).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a generic service failure shows the generic message, distinct from the other two', async () => {
    const fixture = renderWith(
      (async () => ({ error: 'failed' as const })) as SellerService['getDocumentDownloadUrl'],
    );
    await settle(fixture);

    await fixture.componentInstance.download(fakeDocument({ id: 'doc-42' }));

    expect(message.error).toHaveBeenCalledWith(MSG_FAILED);
    expect(message.warning).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fixture.componentInstance.downloadingId()).toBeNull();
  });

  it('disables only the row being prepared while the URL is in flight', async () => {
    let release!: (value: { url: string }) => void;
    const pending = new Promise<{ url: string }>((resolve) => {
      release = resolve;
    });
    const fixture = renderWith(
      (() => pending) as unknown as SellerService['getDocumentDownloadUrl'],
      [fakeDocument({ id: 'doc-42' }), fakeDocument({ id: 'doc-43' })],
    );
    await settle(fixture);

    const running = fixture.componentInstance.download(fakeDocument({ id: 'doc-42' }));
    await settle(fixture);

    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      `button[title="${DOWNLOAD_TITLE}"]`,
    );
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(false);

    release({ url: '/api/files/download/docs/a.pdf' });
    await running;
    await settle(fixture);
    expect(downloadButtonOf(fixture)?.disabled).toBe(false);
  });
});

describe('SellerDocumentsPage — responsive table (responsive-ui v1 §4.5 / U3-2)', () => {
  it('uses .rtable with exactly one title, one status, two key values, a ⋯ cell and an action cell per row', async () => {
    const fixture = render([fakeDocument({ id: 'd1', title: 'สรุปฟิสิกส์' })]);
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    const table = root.querySelector('table');
    expect(table?.classList.contains('rtable')).toBe(true);
    expect(table?.className).not.toMatch(/min-w-\[/);

    const row = root.querySelector('tbody tr') as HTMLElement;
    expect(row.querySelectorAll('td.rt-title')).toHaveLength(1);
    expect(row.querySelector('td.rt-title')?.textContent).toContain('สรุปฟิสิกส์');
    expect(row.querySelectorAll('td.rt-status')).toHaveLength(1);

    const keys = Array.from(row.querySelectorAll<HTMLElement>('td.rt-key'));
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key.getAttribute('data-label')).toBeTruthy();
    }

    expect(row.querySelectorAll('td.rt-more app-row-more')).toHaveLength(1);
    expect(row.querySelector('td.rt-action')?.querySelectorAll('button, a').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('thead th.rt-more')).toHaveLength(1);
  });

  it('renders the status filter as a single-line .chip-row', async () => {
    const fixture = render([fakeDocument()]);
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector('.chip-row')).not.toBeNull();
  });
});

/**
 * Regression: `seller.soldCount` / `seller.downloadCount` had no `{count}` placeholder, so the
 * sales cell rendered the bare label ("ยอดขาย") and silently dropped the number the template
 * passes in. Both languages must carry the number.
 */
describe('SellerDocumentsPage — sales/download counts', () => {
  // TranslationService persists the language to localStorage (when one exists — the Vitest
  // runner here has none) and reads it back on construction, so an 'en' test must not leak into
  // later specs that assert Thai copy.
  afterEach(() => globalThis.localStorage?.removeItem('siriedu_lang'));

  function salesCell(fixture: { nativeElement: unknown }): string {
    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr') as HTMLElement;
    const keys = Array.from(row.querySelectorAll<HTMLElement>('td.rt-key'));
    return (keys[1]?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  it('renders the sold and download numbers in Thai', async () => {
    const fixture = render([fakeDocument({ salesCount: 7, downloads: 42 })]);
    TestBed.inject(TranslationService).setLanguage('th');
    await settle(fixture);

    const text = salesCell(fixture);
    expect(text).toContain('ขายแล้ว 7');
    expect(text).toContain('ดาวน์โหลด 42');
    expect(text).not.toContain('{count}');
  });

  it('renders the sold and download numbers in English', async () => {
    const fixture = render([fakeDocument({ salesCount: 7, downloads: 42 })]);
    TestBed.inject(TranslationService).setLanguage('en');
    await settle(fixture);

    const text = salesCell(fixture);
    expect(text).toContain('7 sold');
    expect(text).toContain('42 downloads');
    expect(text).not.toContain('{count}');
  });

  it('falls back to 0 sold when salesCount is missing', async () => {
    const fixture = render([fakeDocument({ salesCount: undefined, downloads: 0 })]);
    TestBed.inject(TranslationService).setLanguage('th');
    await settle(fixture);

    expect(salesCell(fixture)).toContain('ขายแล้ว 0');
  });
});

/**
 * responsive-ui v1.4 gate fixes (G1-5): K3 / F68 / F164 / G-14b on /seller/documents.
 */
describe('SellerDocumentsPage — responsive v1.4 fixes', () => {
  // Thai labels are asserted below; set after render() (TestBed must be configured first).
  const thai = () => TestBed.inject(TranslationService).setLanguage('th');

  it('F164: every status chip exposes its selection through aria-pressed', async () => {
    const fixture = render([fakeDocument()]);
    thai();
    await settle(fixture);
    const chips = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.chip-row > button'));
    expect(chips.length).toBeGreaterThan(1);
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', ...chips.slice(1).map(() => 'false')]);

    chips[2].click();
    await settle(fixture);
    const after = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.chip-row > button'));
    expect(after[0].getAttribute('aria-pressed')).toBe('false');
    expect(after[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('G-14b/G-12: the search submit is a sibling button of the field, not an overlay inside it', async () => {
    const fixture = render([fakeDocument()]);
    thai();
    await settle(fixture);
    const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
    const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    const input = form.querySelector('input[type="search"]') as HTMLInputElement;
    expect(submit.classList.contains('btn-icon')).toBe(true);
    expect(submit.classList.contains('absolute')).toBe(false);
    expect(input.classList.contains('min-h-11')).toBe(true);
    expect(submit.getAttribute('aria-label')).toBe(input.getAttribute('aria-label'));
  });

  it('F68: the rejection reason wraps into a 2-line clamp (no hover-only title) and is also in the row ⋯', async () => {
    const reason = 'ภาพหน้าปกไม่ตรงกับเนื้อหาเอกสาร กรุณาแก้ไขหน้าปกและส่งตรวจอีกครั้ง';
    const fixture = render([fakeDocument({ status: 'rejected', rejectionReason: reason })]);
    thai();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const line = root.querySelector('[data-testid="seller-doc-rejection-reason"]') as HTMLElement;
    expect(line.textContent).toContain(reason);
    expect(line.hasAttribute('title')).toBe(false);
    expect(line.classList.contains('truncate')).toBe(false);
    expect(line.classList.contains('line-clamp-2')).toBe(true);
    expect(line.classList.contains('xl:line-clamp-none')).toBe(true);

    const more = root.querySelector('tbody tr td.rt-more app-row-more') as HTMLElement;
    const items = (fixture.debugElement.query((de) => de.nativeElement === more).componentInstance as {
      items: () => ReadonlyArray<{ label: string; value: unknown }>;
    }).items();
    expect(items).toContainEqual({ label: 'เหตุผลที่ไม่อนุมัติ', value: reason });
  });

  it('F68: an approved row passes no reason to the row ⋯', async () => {
    const fixture = render([fakeDocument({ status: 'approved', rejectionReason: 'stale' })]);
    thai();
    await settle(fixture);
    const more = (fixture.nativeElement as HTMLElement).querySelector('tbody tr td.rt-more app-row-more') as HTMLElement;
    const items = (fixture.debugElement.query((de) => de.nativeElement === more).componentInstance as {
      items: () => ReadonlyArray<{ label: string; value: unknown }>;
    }).items();
    expect(items.find((i) => i.label === 'เหตุผลที่ไม่อนุมัติ')?.value).toBeNull();
  });

  it('K3 / G-15: the action group has the phone >=375 3-per-row floor and the table-mode floor/cap', async () => {
    const fixture = render([fakeDocument()]);
    thai();
    await settle(fixture);
    const group = (fixture.nativeElement as HTMLElement).querySelector('td.rt-action > div') as HTMLElement;
    for (const cls of ['flex-wrap', 'min-[375px]:max-md:min-w-[140px]', 'md:min-w-[92px]', 'md:max-w-[140px]', 'xl:flex-nowrap']) {
      expect(group.classList.contains(cls)).toBe(true);
    }
    const title = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('td.rt-title div')).find((d) =>
      d.classList.contains('md:min-w-[110px]'),
    );
    expect(title).toBeTruthy();
  });
});

describe('SellerDocumentsPage — data states (responsive-ui v1.4 R-17, G-27)', () => {
  const q = (fixture: { nativeElement: unknown }, testId: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);

  it('shows a skeleton — not "ยังไม่มีเอกสาร" — while the first page is loading', async () => {
    const fixture = render([], { listDocumentsPaged: () => new Promise(() => {}) });
    await settle(fixture);

    expect(fixture.componentInstance.listState()).toBe('loading');
    expect(q(fixture, 'seller-docs-loading')?.getAttribute('aria-busy')).toBe('true');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('ยังไม่มีเอกสาร');
    expect(q(fixture, 'seller-docs-error')).toBeNull();
  });

  it('shows a message and a common.retry that re-issues the list GET when it fails', async () => {
    const listDocumentsPaged = vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 10,
      totalCount: 0,
      totalPages: 1,
      failed: true,
    }));
    const fixture = render([], { listDocumentsPaged });
    await settle(fixture);

    expect(fixture.componentInstance.listState()).toBe('error');
    const error = q(fixture, 'seller-docs-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('โหลดเอกสารของฉันไม่สำเร็จ');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('ยังไม่มีเอกสาร');
    expect(listDocumentsPaged).toHaveBeenCalledTimes(1);

    const retry = q(fixture, 'seller-docs-retry') as HTMLButtonElement;
    expect(retry.textContent?.trim()).toBe('ลองใหม่อีกครั้ง');
    expect(retry.classList).toContain('btn-pink');
    retry.click();
    await settle(fixture);
    expect(listDocumentsPaged).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state only for a request that answered with zero rows', async () => {
    const fixture = render([]);
    await settle(fixture);

    expect(fixture.componentInstance.listState()).toBe('empty');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ยังไม่มีเอกสาร');
    expect(q(fixture, 'seller-docs-loading')).toBeNull();
    expect(q(fixture, 'seller-docs-error')).toBeNull();
  });

  it('keeps the current rows on screen while another page loads', async () => {
    let resolveNext: ((v: PagedResult<DocumentItem>) => void) | null = null;
    let calls = 0;
    const fixture = render([], {
      listDocumentsPaged: () => {
        calls++;
        if (calls === 1) {
          return Promise.resolve({ items: [fakeDocument()], page: 1, pageSize: 10, totalCount: 11, totalPages: 2 });
        }
        return new Promise<PagedResult<DocumentItem>>((resolve) => (resolveNext = resolve));
      },
    });
    await settle(fixture);
    fixture.componentInstance.onPageChange(2);
    await settle(fixture);

    expect(fixture.componentInstance.loading()).toBe(true);
    expect(fixture.componentInstance.listState()).toBe('data');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="seller-doc-row"]').length).toBe(1);
    expect(resolveNext).not.toBeNull();
  });
});

describe('SellerDocumentsPage — table viewport (responsive-ui v1.6 R-27, U3-8)', () => {
  function pagedRender() {
    const listDocumentsPaged = vi.fn(async (q: { page?: number; pageSize?: number }) => ({
      items: [fakeDocument({ id: `p${q.page}-1` }), fakeDocument({ id: `p${q.page}-2` })],
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 10,
      totalCount: 250,
      totalPages: 25,
    }));
    const fixture = render([], { listDocumentsPaged });
    return { fixture, listDocumentsPaged };
  }
  const wrapperOf = (fixture: { nativeElement: unknown }) =>
    ((fixture.nativeElement as HTMLElement).querySelector('table.rtable') as HTMLTableElement).parentElement as HTMLElement;

  it('the table sits in a table viewport, with the pagination after it and never inside it', async () => {
    const { fixture } = pagedRender();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const wrapper = wrapperOf(fixture);

    expect(wrapper.classList.contains('rt-viewport')).toBe(true);
    expect(wrapper.classList.contains('table-scroll')).toBe(true);
    expect(wrapper.querySelector('app-pagination')).toBeNull();
    const pagination = root.querySelector('app-pagination') as HTMLElement;
    expect(pagination).not.toBeNull();
    expect(wrapper.compareDocumentPosition(pagination) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('G-35(l): the first list request asks for 10 rows', async () => {
    const { fixture, listDocumentsPaged } = pagedRender();
    await settle(fixture);
    expect(listDocumentsPaged.mock.calls[0][0].pageSize).toBe(10);
  });

  it('a new page, page size, status chip or applied search scrolls the table back to the top; typing does not', async () => {
    const { fixture } = pagedRender();
    await settle(fixture);
    const page = fixture.componentInstance;
    const wrapper = wrapperOf(fixture);

    wrapper.scrollTop = 300;
    page.onPageChange(2);
    await settle(fixture);
    expect(wrapperOf(fixture)).toBe(wrapper);
    expect(wrapper.scrollTop).toBe(0);

    wrapper.scrollTop = 300;
    page.onPageSizeChange(50);
    await settle(fixture);
    expect(wrapper.scrollTop).toBe(0);

    wrapper.scrollTop = 300;
    page.onStatusChange('approved');
    await settle(fixture);
    expect(wrapper.scrollTop).toBe(0);

    // The draft in the search box is not the query: no reset until it is applied.
    wrapper.scrollTop = 300;
    page.searchInput.set('ฟิสิกส์');
    await settle(fixture);
    expect(wrapper.scrollTop).toBe(300);
    page.applySearch();
    await settle(fixture);
    expect(wrapper.scrollTop).toBe(0);
  });

  it('a reload of the same query keeps the scroll position', async () => {
    const { fixture } = pagedRender();
    await settle(fixture);
    const wrapper = wrapperOf(fixture);

    wrapper.scrollTop = 300;
    void fixture.componentInstance.reload();
    await settle(fixture);
    expect(wrapper.scrollTop).toBe(300);
  });
});
