import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminDocumentDetailPage } from './document-detail.page';
import { AdminService } from '../../../core/services/admin.service';
import { SellerService } from '../../../core/services/seller.service';
import { resolvePublicUrl, downloadUrlForStorageKey } from '../../../core/api-runtime';
import type { UploadResponse } from '../../../core/api/types.gen';
import type { Category } from '../../../core/models';

/**
 * image-upload-optimization v1 §4 / AC-13: same rule as the seller upload wizard (AC-12) —
 * `onCoverFile`/`onGalleryFiles` preview uses `optimizedUrl ?? publicUrl`, reconstructing from
 * existing data (no upload response) leaves `previewUrl === publicUrl`, and `save()`'s payload
 * (`galleryItems[].imageUrl`) always keeps using the original URL.
 */

type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; body: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

const baseDoc = {
  id: 'doc-1',
  title: 'เอกสารทดสอบ',
  shortDescription: 'คำอธิบายสั้น',
  description: 'รายละเอียด',
  price: 199,
  format: 'pdf',
  status: 'pending',
  categoryIds: [] as string[],
  subcategoryId: null,
  resourceType: 'lesson-summary',
  isFeatured: false,
  isFree: false,
  watermarkEnabled: true,
  previewPages: 5,
  pages: 10,
  fileSize: '1 MB',
  language: 'th',
  fileStorageKey: 'orig/main.pdf',
  previewStorageKey: null,
  tags: [] as string[],
  gradeLevels: [] as string[],
  standards: [] as string[],
  // storage-key-persistence v1 §3.4: GET response carries both `imageUrl` (resolved,
  // display-only) and the new `imageStorageKey` sibling (bare key) — real backend response after
  // regen; this fixture stands in for it until then.
  galleryItems: [{ id: 'g1', imageUrl: 'gallery/img1.jpg', imageStorageKey: 'gallery/img1.jpg' }],
  galleryUrls: [] as string[],
};

function stubLoad(): void {
  stubRoute('GET', '/api/admin/documents/doc-1', baseDoc);
  stubRoute('GET', '/api/admin/documents/doc-1/reports', []);
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function render(
  uploadFile: (file: File) => Promise<UploadResponse>,
  adminOverrides: Partial<AdminService> = {},
) {
  const fakeSeller: Partial<SellerService> = { uploadFile };
  const fakeAdmin: Partial<AdminService> = {
    adminCategories: signal<Category[]>([]),
    refreshAdminCategories: async () => {},
    getFileDownloadUrl: vi.fn(async () => null),
    ...adminOverrides,
  };
  const message = {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  };

  TestBed.configureTestingModule({
    imports: [AdminDocumentDetailPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'doc-1' }) } },
      },
      { provide: AdminService, useValue: fakeAdmin },
      { provide: SellerService, useValue: fakeSeller },
      { provide: NzMessageService, useValue: message },
    ],
  });

  const fixture = TestBed.createComponent(AdminDocumentDetailPage);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, message };
}

// jsdom (the test environment here) does not implement `DataTransfer`, so a real
// `<input type="file">` selection can't be simulated through it — build a minimal
// `FileList`-shaped object instead, matching what the component reads (`input.files`).
function toFileList(file: File): FileList {
  const list = {
    0: file,
    length: 1,
    item: (index: number) => (index === 0 ? file : null),
    [Symbol.iterator]: function* () {
      yield file;
    },
  };
  return list as unknown as FileList;
}

function buildFileEvent(file: File): Event {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: toFileList(file) });
  return { target: input } as unknown as Event;
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    requests.push({ method: request.method, path, body: await request.clone().text() });

    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('AdminDocumentDetailPage — gallery preview vs. payload URL (AC-13)', () => {
  it('reconstructs from existing data with previewUrl === publicUrl (no upload response involved)', async () => {
    stubLoad();
    const { component } = render(async () => {
      throw new Error('uploadFile should not be called for reconstruct-from-existing-data');
    });
    await settle();

    const item = component.galleryItems()[0];
    const expected = resolvePublicUrl('gallery/img1.jpg');
    expect(item.previewUrl).toBe(expected);
    expect(item.publicUrl).toBe(expected);
    // storage-key-persistence v1 §4.2: key must round-trip from imageStorageKey, not stay ''.
    expect(item.key).toBe('gallery/img1.jpg');
  });

  it('onCoverFile uses optimizedUrl for the preview when the upload response has one', async () => {
    stubLoad();
    const { component } = render(async () => ({
      key: 'admin/2026/09/01/cover.jpg',
      publicUrl: 'https://cdn.example.test/original-cover.jpg',
      eTag: 'etag-1',
      optimizedKey: 'admin/2026/09/01/optimized/cover.webp',
      optimizedUrl: 'https://cdn.example.test/optimized-cover.webp',
    }));
    await settle();

    await component.onCoverFile(buildFileEvent(new File(['x'], 'cover.jpg', { type: 'image/jpeg' })));

    const item = component.galleryItems()[0];
    expect(item.previewUrl).toBe('https://cdn.example.test/optimized-cover.webp');
    expect(item.key).toBe('admin/2026/09/01/cover.jpg');
    expect(item.publicUrl).toBe(downloadUrlForStorageKey('admin/2026/09/01/cover.jpg'));
  });

  it('onGalleryFiles falls back to publicUrl for the preview when optimizedUrl is null/undefined', async () => {
    stubLoad();
    const { component } = render(async () => ({
      key: 'admin/2026/09/01/gallery-2.jpg',
      publicUrl: 'https://cdn.example.test/original-gallery-2.jpg',
      eTag: 'etag-2',
      optimizedKey: null,
      optimizedUrl: null,
    }));
    await settle();

    await component.onGalleryFiles(
      buildFileEvent(new File(['x'], 'gallery-2.jpg', { type: 'image/jpeg' })),
    );

    const added = component.galleryItems().find((g) => g.key === 'admin/2026/09/01/gallery-2.jpg');
    expect(added).toBeDefined();
    const expectedPublicUrl = downloadUrlForStorageKey('admin/2026/09/01/gallery-2.jpg');
    expect(added!.previewUrl).toBe(expectedPublicUrl);
    expect(added!.publicUrl).toBe(expectedPublicUrl);
  });

  it('save() always sends the raw storage key in galleryItems[].imageStorageKey, never a URL', async () => {
    stubLoad();
    stubRoute('PATCH', '/api/admin/documents/doc-1', baseDoc);
    const { component } = render(async () => ({
      key: 'admin/2026/09/01/cover.jpg',
      publicUrl: 'https://cdn.example.test/original-cover.jpg',
      eTag: 'etag-1',
      optimizedKey: 'admin/2026/09/01/optimized/cover.webp',
      optimizedUrl: 'https://cdn.example.test/optimized-cover.webp',
    }));
    await settle();

    await component.onCoverFile(buildFileEvent(new File(['x'], 'cover.jpg', { type: 'image/jpeg' })));
    await component.save();
    await settle();

    const patch = requests.find((r) => r.method === 'PATCH' && r.path === '/api/admin/documents/doc-1');
    expect(patch).toBeDefined();
    const body = JSON.parse(patch!.body) as {
      galleryItems?: { id?: string; imageStorageKey: string }[];
    };
    const sentKeys = (body.galleryItems ?? []).map((g) => g.imageStorageKey);
    expect(sentKeys).toContain('admin/2026/09/01/cover.jpg');
    expect(sentKeys).not.toContain('https://cdn.example.test/optimized-cover.webp');
    expect(sentKeys).not.toContain(downloadUrlForStorageKey('admin/2026/09/01/cover.jpg'));
  });

  it('resubmitting an unchanged gallery item sends its imageStorageKey, not a URL', async () => {
    stubLoad();
    stubRoute('PATCH', '/api/admin/documents/doc-1', baseDoc);
    const { component } = render(async () => {
      throw new Error('uploadFile should not be called — the gallery item is left untouched');
    });
    await settle();

    // g1 was reconstructed from imageStorageKey on load(), never touched here — only an
    // unrelated field changes.
    expect(component.galleryItems()[0].key).toBe('gallery/img1.jpg');
    component.patchDoc({ title: 'ชื่อใหม่ (แก้เฉพาะชื่อ)' });

    await component.save();
    await settle();

    const patch = requests.find((r) => r.method === 'PATCH' && r.path === '/api/admin/documents/doc-1');
    expect(patch).toBeDefined();
    const body = JSON.parse(patch!.body) as {
      galleryItems?: { id?: string; imageStorageKey: string }[];
    };
    expect(body.galleryItems).toHaveLength(1);
    expect(body.galleryItems?.[0].id).toBe('g1');
    expect(body.galleryItems?.[0].imageStorageKey).toBe('gallery/img1.jpg');
    expect(body.galleryItems?.[0].imageStorageKey).not.toContain('http');
  });

  it('downloadMainFile() opens window with resolved download URL', async () => {
    stubLoad();
    // Pre-open window pattern: window.open('', '_blank') is called synchronously,
    // then win.location.href is set to the resolved URL after the async presigned-URL fetch.
    const mockWin = { location: { href: '' }, close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => mockWin as unknown as Window);
    const { component } = render(async () => {
      throw new Error('upload should not be called');
    });
    await settle();

    await component.downloadMainFile();
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(mockWin.location.href).toContain('orig/main.pdf');
    openSpy.mockRestore();
  });
});

/**
 * document-preview-access-fixes v1 §4.3 / AC-22 — the admin review viewer.
 *
 * Context worth keeping: all three marketplace preview routes 404 while a document is pending
 * (they gate on Approved, correctly, for public traffic), so before this existed an admin
 * approved documents without ever seeing them. The viewer goes through
 * `AdminService.getDocumentReviewPdf` → `GET /api/admin/documents/{id}/preview-pdf`, which has no
 * status gate, and the failure branch (`404 { error: 'file_missing' }`) must stay visible rather
 * than leaving a blank frame.
 */
describe('AdminDocumentDetailPage — admin review viewer (AC-22)', () => {
  let createdUrls: string[];
  let revokedUrls: string[];
  let realCreateObjectURL: typeof URL.createObjectURL;
  let realRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    createdUrls = [];
    revokedUrls = [];
    realCreateObjectURL = URL.createObjectURL;
    realRevokeObjectURL = URL.revokeObjectURL;
    // jsdom implements neither, and the component's whole point is that the PDF bytes never
    // become a navigable URL — stub them so the create/revoke pairing can be asserted.
    let counter = 0;
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:review-${++counter}`;
      createdUrls.push(url);
      return url;
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url);
    }) as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
  });

  function pdfBlob(): Blob {
    return new Blob(['%PDF-1.7 fake'], { type: 'application/pdf' });
  }

  function noUpload(): Promise<UploadResponse> {
    return Promise.reject(new Error('uploadFile should not be called by the review viewer'));
  }

  it('opens a pending document through the admin route and exposes a blob URL to the iframe', async () => {
    stubLoad();
    const getDocumentReviewPdf = vi.fn(async () => pdfBlob());
    const { component } = render(noUpload, { getDocumentReviewPdf });
    await settle();

    await component.openReviewViewer();

    // watermark=false by default: the admin reviews the seller's real file, not the buyer render.
    expect(getDocumentReviewPdf).toHaveBeenCalledWith('doc-1', false);
    expect(component.reviewViewerOpen()).toBe(true);
    expect(component.reviewViewerLoading()).toBe(false);
    expect(component.reviewViewerFailed()).toBe(false);
    expect(component.reviewViewerUrl()).not.toBeNull();
    expect(createdUrls).toHaveLength(1);
  });

  it('closing the viewer revokes the object URL and clears the iframe source', async () => {
    stubLoad();
    const { component } = render(noUpload, { getDocumentReviewPdf: vi.fn(async () => pdfBlob()) });
    await settle();

    await component.openReviewViewer();
    component.closeReviewViewer();

    expect(component.reviewViewerOpen()).toBe(false);
    expect(component.reviewViewerUrl()).toBeNull();
    expect(revokedUrls).toEqual([createdUrls[0]]);
  });

  it('switching to "view as buyer" refetches with watermark=true and revokes the previous blob', async () => {
    stubLoad();
    const getDocumentReviewPdf = vi.fn(async () => pdfBlob());
    const { component } = render(noUpload, { getDocumentReviewPdf });
    await settle();

    await component.openReviewViewer();
    component.setReviewAsBuyer(true);
    await settle();

    expect(component.reviewAsBuyer()).toBe(true);
    expect(getDocumentReviewPdf).toHaveBeenNthCalledWith(1, 'doc-1', false);
    expect(getDocumentReviewPdf).toHaveBeenNthCalledWith(2, 'doc-1', true);
    expect(revokedUrls).toContain(createdUrls[0]);
    expect(createdUrls).toHaveLength(2);
  });

  it('surfaces a readable failure and the original-file download when the stored file is missing', async () => {
    stubLoad();
    // Exactly what the backend answers for a document whose stored file is gone:
    // 404 { "error": "file_missing" } — never a synthesised placeholder PDF.
    const getDocumentReviewPdf = vi.fn(async () => {
      throw { status: 404, error: 'file_missing' };
    });
    const { component, message } = render(noUpload, { getDocumentReviewPdf });
    await settle();

    await component.openReviewViewer();

    expect(component.reviewViewerFailed()).toBe(true);
    expect(component.reviewViewerLoading()).toBe(false);
    expect(component.reviewViewerUrl()).toBeNull();
    expect(createdUrls).toHaveLength(0);
    expect(message.error).toHaveBeenCalled();
    // The escape hatch stays reachable: the raw file straight out of storage.
    expect(component.reviewOriginalFileUrl()).toContain('orig/main.pdf');
  });

  it('offers no download link when the document has no storage key at all', async () => {
    stubRoute('GET', '/api/admin/documents/doc-1', { ...baseDoc, fileStorageKey: null });
    stubRoute('GET', '/api/admin/documents/doc-1/reports', []);
    const getDocumentReviewPdf = vi.fn(async () => {
      throw { status: 404, error: 'file_missing' };
    });
    const { component } = render(noUpload, { getDocumentReviewPdf });
    await settle();

    await component.openReviewViewer();

    expect(component.reviewViewerFailed()).toBe(true);
    expect(component.reviewOriginalFileUrl()).toBe('');
  });
});
