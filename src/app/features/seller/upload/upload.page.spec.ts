import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerUploadPage } from './upload.page';
import { CatalogService, PlatformStatsService, SellerService } from '../../../core/services';
import { mapSellerDocument } from '../../../core/api-mappers/mappers';
import { downloadUrlForStorageKey } from '../../../core/api-runtime';
import type { PlatformStats } from '../../../core/models';
import type {
  DocumentGalleryItemRequest,
  SellerDocumentResponse,
  UploadResponse,
} from '../../../core/api/types.gen';
import type { UpdateSellerDocumentRequest } from '../../../core/api/seller-document-update';

/**
 * real-data-stats v1 §4.6 — Seller upload page:
 *  - `fee`/`feeRatePercent` read `PlatformStatsService.stats()?.feeRatePercent`, fallback 10
 *    only while loading (§4.6: "กัน UI กระพริบเป็น 0")
 *  - the "ราคายอดนิยมในหมวดเดียวกัน" label no longer claims to be scoped by category (§4.6/§5)
 *  - the approval-time copy drops the invented "24 ชั่วโมง" (remove-only, §4.6/§5)
 */
const fakeCatalog = { loadCategories: vi.fn(), getCategoryById: () => undefined };
const fakeSeller = { fetchDocumentForEdit: vi.fn(async () => null), myDocuments: () => [], refreshDocuments: vi.fn(async () => {}) };
const fakeMessage = { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() };

function render(stats: PlatformStats | undefined) {
  const fakeRoute = { queryParamMap: of(convertToParamMap({})) };
  const fakePlatformStats = { stats: () => stats, loadStats: vi.fn() };

  TestBed.configureTestingModule({
    imports: [SellerUploadPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: fakeRoute },
      { provide: CatalogService, useValue: fakeCatalog },
      { provide: SellerService, useValue: fakeSeller },
      { provide: NzMessageService, useValue: fakeMessage },
      { provide: PlatformStatsService, useValue: fakePlatformStats },
    ],
  });

  const fixture = TestBed.createComponent(SellerUploadPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('SellerUploadPage — fee % (real-data-stats v1 §4.6)', () => {
  it('falls back to 10% while platform stats have not loaded', () => {
    const fixture = render(undefined);
    const page = fixture.componentInstance;
    page.price.set(1000);

    expect(page.feeRatePercent()).toBe(10);
    expect(page.fee()).toBe(100);
  });

  it('uses the real feeRatePercent once platform stats load', () => {
    const fixture = render({
      totalApprovedDocuments: 1,
      totalSellers: 1,
      totalDownloads: 1,
      reviewCount: 1,
      feeRatePercent: 20,
    });
    const page = fixture.componentInstance;
    page.price.set(1000);

    expect(page.feeRatePercent()).toBe(20);
    expect(page.fee()).toBe(200);
  });

  it('charges no fee at all when the document is free, regardless of feeRatePercent', () => {
    const fixture = render({
      totalApprovedDocuments: 1,
      totalSellers: 1,
      totalDownloads: 1,
      reviewCount: 1,
      feeRatePercent: 20,
    });
    const page = fixture.componentInstance;
    page.price.set(1000);
    page.setIsFree(true);

    expect(page.fee()).toBe(0);
  });
});

describe('SellerUploadPage — remove-only copy (real-data-stats v1 §4.6/§5)', () => {
  it('does not claim the popular-price suggestions are scoped to "หมวดเดียวกัน"', () => {
    const fixture = render(undefined);
    fixture.componentInstance.step.set(3);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ราคายอดนิยมในหมวดเดียวกัน');
  });

  it('drops the invented "24 ชั่วโมง" approval-time claim on the review step', () => {
    const fixture = render(undefined);
    fixture.componentInstance.step.set(4);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('24 ชั่วโมง');
    expect(text).toContain('ทีมงานจะตรวจสอบและแจ้งผลโดยเร็วที่สุด');
  });
});

/**
 * image-upload-optimization v1 §4 / AC-12: the gallery `<img>` preview should use
 * `optimizedUrl ?? publicUrl`, but the payload sent to the backend
 * (`galleryItems[].imageUrl`) must always keep using the original URL
 * (`downloadUrlForStorageKey(item.key)`), never the optimized one — see spec §2 for why
 * (the watermark re-burn pipeline must always read the true original).
 */

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

function renderForGalleryUpload(uploadFile: (file: File) => Promise<UploadResponse>) {
  const updateDocumentCalls: { id: string; body: UpdateSellerDocumentRequest }[] = [];
  const fakeSellerForGallery: Partial<SellerService> = {
    uploadFile,
    updateDocument: async (id: string, body: UpdateSellerDocumentRequest) => {
      updateDocumentCalls.push({ id, body });
    },
  };
  const fakeCatalogForGallery: Partial<CatalogService> = {
    loadCategories: () => {},
    getCategoryById: () => undefined,
  };
  const fakePlatformStats = { stats: () => undefined, loadStats: vi.fn() };

  TestBed.configureTestingModule({
    imports: [SellerUploadPage],
    providers: [
      provideRouter([]),
      // submit() navigates to /seller/documents on success; the real Router (from
      // provideRouter([])) has no routes registered here and would reject with NG04002.
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      { provide: CatalogService, useValue: fakeCatalogForGallery },
      { provide: SellerService, useValue: fakeSellerForGallery },
      { provide: NzMessageService, useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: PlatformStatsService, useValue: fakePlatformStats },
    ],
  });

  const fixture = TestBed.createComponent(SellerUploadPage);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, updateDocumentCalls };
}

describe('SellerUploadPage — gallery preview vs. payload URL (AC-12)', () => {
  it('uses optimizedUrl for the gallery preview when the upload response has one', async () => {
    const { component } = renderForGalleryUpload(async () => ({
      key: 'seller-1/2026/09/01/cover.jpg',
      publicUrl: 'https://cdn.example.test/original-cover.jpg',
      eTag: 'etag-1',
      optimizedKey: 'seller-1/2026/09/01/optimized/cover.webp',
      optimizedUrl: 'https://cdn.example.test/optimized-cover.webp',
    }));

    // onGalleryFiles() returns void (fire-and-forget async IIFE inside) — flush microtasks so
    // the mocked uploadFile()/galleryItems.update() chain has settled before we assert.
    component.onGalleryFiles(buildFileEvent(new File(['x'], 'cover.jpg', { type: 'image/jpeg' })));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const item = component.galleryItems()[0];
    expect(item.previewUrl).toBe('https://cdn.example.test/optimized-cover.webp');
    expect(item.key).toBe('seller-1/2026/09/01/cover.jpg');
    expect(item.publicUrl).toBe(downloadUrlForStorageKey('seller-1/2026/09/01/cover.jpg'));
  });

  it('falls back to publicUrl for the preview when optimizedUrl is null/undefined', async () => {
    const { component } = renderForGalleryUpload(async () => ({
      key: 'seller-1/2026/09/01/cover.jpg',
      publicUrl: 'https://cdn.example.test/original-cover.jpg',
      eTag: 'etag-1',
      optimizedKey: null,
      optimizedUrl: null,
    }));

    // onGalleryFiles() returns void (fire-and-forget async IIFE inside) — flush microtasks so
    // the mocked uploadFile()/galleryItems.update() chain has settled before we assert.
    component.onGalleryFiles(buildFileEvent(new File(['x'], 'cover.jpg', { type: 'image/jpeg' })));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const item = component.galleryItems()[0];
    const expectedPublicUrl = downloadUrlForStorageKey('seller-1/2026/09/01/cover.jpg');
    expect(item.previewUrl).toBe(expectedPublicUrl);
    expect(item.publicUrl).toBe(expectedPublicUrl);
  });

  it('sends the raw storage key (never a URL, optimized or otherwise) in the update payload', async () => {
    const { component, updateDocumentCalls } = renderForGalleryUpload(async () => ({
      key: 'seller-1/2026/09/01/cover.jpg',
      publicUrl: 'https://cdn.example.test/original-cover.jpg',
      eTag: 'etag-1',
      optimizedKey: 'seller-1/2026/09/01/optimized/cover.webp',
      optimizedUrl: 'https://cdn.example.test/optimized-cover.webp',
    }));

    // onGalleryFiles() returns void (fire-and-forget async IIFE inside) — flush microtasks so
    // the mocked uploadFile()/galleryItems.update() chain has settled before we assert.
    component.onGalleryFiles(buildFileEvent(new File(['x'], 'cover.jpg', { type: 'image/jpeg' })));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Force edit mode so submit() goes through SellerService.updateDocument, which is where
    // galleryItems[].imageStorageKey is composed from the gallery list.
    component.editId.set('doc-1');
    component.title.set('เอกสารทดสอบ');
    component.shortDescription.set('คำอธิบายสั้น');
    component.categoryIds.set(['cat-1']);

    component.submit();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateDocumentCalls).toHaveLength(1);
    // storage-key-persistence v2 §4.2: `galleryKeyForApi()` returns `item.key` directly — no
    // more `downloadUrlForStorageKey`/URL fallback.
    const galleryItems = (updateDocumentCalls[0].body.galleryItems ??
      []) as DocumentGalleryItemRequest[];
    expect(galleryItems).toHaveLength(1);
    expect(galleryItems[0].imageStorageKey).toBe('seller-1/2026/09/01/cover.jpg');
    expect(galleryItems[0].imageStorageKey).not.toBe('https://cdn.example.test/optimized-cover.webp');
    expect(galleryItems[0].imageStorageKey).not.toContain('http');
  });
});

describe('SellerUploadPage — gallery imageStorageKey round-trip (storage-key-persistence v2 §4.2)', () => {
  function renderForEditReconstruct() {
    const updateDocumentCalls: { id: string; body: UpdateSellerDocumentRequest }[] = [];
    const rawDoc: SellerDocumentResponse = {
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสารทดสอบ',
      shortDescription: 'คำอธิบายสั้น',
      galleryItems: [
        // storage-key-persistence v2 §3.4: GET response carries both `imageUrl` (resolved,
        // display-only) and the `imageStorageKey` sibling (bare key).
        {
          id: 'g1',
          imageUrl: 'https://cdn.example.test/resolved/gallery/img1.jpg',
          imageStorageKey: 'gallery/img1.jpg',
        },
      ],
    };
    const doc = mapSellerDocument(rawDoc);

    const fakeSellerForEdit: Partial<SellerService> = {
      fetchDocumentForEdit: async () => doc,
      fetchDocumentMainFiles: async () => [],
      myDocuments: signal<ReturnType<typeof mapSellerDocument>[]>([]),
      refreshDocuments: async () => {},
      updateDocument: async (id: string, body: UpdateSellerDocumentRequest) => {
        updateDocumentCalls.push({ id, body });
      },
    };
    const fakeCatalogForEdit: Partial<CatalogService> = {
      loadCategories: () => {},
      getCategoryById: () => undefined,
    };
    const fakePlatformStats = { stats: () => undefined, loadStats: vi.fn() };

    TestBed.configureTestingModule({
      imports: [SellerUploadPage],
      providers: [
        provideRouter([]),
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ id: 'doc-1' })) },
        },
        { provide: CatalogService, useValue: fakeCatalogForEdit },
        { provide: SellerService, useValue: fakeSellerForEdit },
        {
          provide: NzMessageService,
          useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
        { provide: PlatformStatsService, useValue: fakePlatformStats },
      ],
    });

    const fixture = TestBed.createComponent(SellerUploadPage);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, updateDocumentCalls };
  }

  it('resubmitting an unchanged gallery item sends its imageStorageKey, not a URL', async () => {
    const { component, updateDocumentCalls } = renderForEditReconstruct();
    // Let the fire-and-forget async IIFE inside the constructor's queryParamMap subscription
    // (fetchDocumentForEdit → applyEditDocument) settle before touching component state.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.galleryItems()[0].key).toBe('gallery/img1.jpg');

    // Edit an unrelated field only — never touch the gallery.
    component.categoryIds.set(['cat-1']);

    component.submit();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateDocumentCalls).toHaveLength(1);
    const galleryItems = (updateDocumentCalls[0].body.galleryItems ??
      []) as DocumentGalleryItemRequest[];
    expect(galleryItems).toHaveLength(1);
    expect(galleryItems[0].id).toBe('g1');
    expect(galleryItems[0].imageStorageKey).toBe('gallery/img1.jpg');
    expect(galleryItems[0].imageStorageKey).not.toContain('http');
  });
});
