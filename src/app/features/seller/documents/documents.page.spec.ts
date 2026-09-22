import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { SellerDocumentsPage } from './documents.page';
import { AuthService, SellerService } from '../../../core/services';
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
