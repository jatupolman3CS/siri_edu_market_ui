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
  galleryItems: [{ id: 'g1', imageUrl: 'gallery/img1.jpg' }],
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

function render(uploadFile: (file: File) => Promise<UploadResponse>) {
  const fakeSeller: Partial<SellerService> = { uploadFile };
  const fakeAdmin: Partial<AdminService> = {
    adminCategories: signal<Category[]>([]),
    refreshAdminCategories: async () => {},
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
      { provide: NzMessageService, useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } },
    ],
  });

  const fixture = TestBed.createComponent(AdminDocumentDetailPage);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance };
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
    const path = url.pathname.replace('/SIRIEDUMARKET.Api', '');
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

  it('save() always sends the original URL in galleryItems[].imageUrl, never the optimized one', async () => {
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
    const body = JSON.parse(patch!.body) as { galleryItems?: { id?: string; imageUrl: string }[] };
    const sentUrls = (body.galleryItems ?? []).map((g) => g.imageUrl);
    expect(sentUrls).toContain(downloadUrlForStorageKey('admin/2026/09/01/cover.jpg'));
    expect(sentUrls).not.toContain('https://cdn.example.test/optimized-cover.webp');
  });
});
