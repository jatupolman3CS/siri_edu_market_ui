import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerUploadPage } from './upload.page';
import { CatalogService, PlatformStatsService, SellerService } from '../../../core/services';
import {
  SellerWatermarkTemplateService,
  type SellerWatermarkTemplate,
} from '../../../core/services/seller-watermark-template.service';
import { SellerWatermarkService } from '../../../core/services/seller-watermark.service';
import { mapSellerDocument } from '../../../core/api-mappers/mappers';
import { downloadUrlForStorageKey } from '../../../core/api-runtime';
import type { DocumentItem, PlatformStats } from '../../../core/models';
import type {
  CreateDocumentRequest,
  DocumentGalleryItemRequest,
  SellerDocumentResponse,
  SellerWatermarkConfigRequest,
  SellerWatermarkConfigResponse,
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

/**
 * discount-urgency v1 §1/§4 — AC-12/AC-13: the "ราคาเดิม" input closes a dead-field gap (§0.2 —
 * `originalPrice` was previously never sent in the submit payload), and the new
 * "วันหมดอายุส่วนลด" field follows the same `formStartAt`/`formEndAt` date-string pattern. Both
 * `originalPrice`/`discountExpiresAt` are TODO(contract) on `UpdateDocumentRequest`/
 * `SellerDocumentResponse` (not in the generated SDK yet) — `renderForEdit` below builds the raw
 * response as an untyped object + `as SellerDocumentResponse` cast so the extra fields don't trip
 * excess-property checking, matching `mapSellerDocument`'s own `readSellerOriginalPriceFields`
 * staging in `core/api-mappers/mappers.ts`.
 */
describe('SellerUploadPage — discount urgency originalPrice/discountExpiresAt (discount-urgency v1 §4)', () => {
  function readDiscountFields(
    body: UpdateSellerDocumentRequest,
  ): { originalPrice?: number | null; discountExpiresAt?: string | null } {
    return body as unknown as { originalPrice?: number | null; discountExpiresAt?: string | null };
  }

  function renderForEdit(rawDocOverrides: Record<string, unknown> = {}) {
    const updateDocumentCalls: { id: string; body: UpdateSellerDocumentRequest }[] = [];
    const rawDoc = {
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสารทดสอบ',
      shortDescription: 'คำอธิบายสั้น',
      price: 300,
      ...rawDocOverrides,
    };
    const doc = mapSellerDocument(rawDoc as SellerDocumentResponse);

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

  async function settleConstructorLoad(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  it('AC-13: edit-mode prefill sets originalPrice/discountExpiresAt (date-only) from the loaded document', async () => {
    const { component } = renderForEdit({
      originalPrice: 599,
      discountExpiresAt: '2026-12-31T00:00:00Z',
    });
    await settleConstructorLoad();

    expect(component.originalPrice()).toBe(599);
    expect(component.discountExpiresAt()).toBe('2026-12-31');
  });

  it('AC-13: prefill leaves discountExpiresAt as "" when the document has none set', async () => {
    const { component } = renderForEdit({ originalPrice: 599, discountExpiresAt: null });
    await settleConstructorLoad();

    expect(component.originalPrice()).toBe(599);
    expect(component.discountExpiresAt()).toBe('');
  });

  it('AC-12: submit sends originalPrice/discountExpiresAt matching the form signals', async () => {
    const { component, updateDocumentCalls } = renderForEdit();
    await settleConstructorLoad();

    component.title.set('เอกสารทดสอบ');
    component.shortDescription.set('คำอธิบายสั้น');
    component.categoryIds.set(['cat-1']);
    component.originalPrice.set(599);
    component.discountExpiresAt.set('2026-12-31');

    component.submit();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateDocumentCalls).toHaveLength(1);
    const body = readDiscountFields(updateDocumentCalls[0].body);
    expect(body.originalPrice).toBe(599);
    expect(body.discountExpiresAt).toBe('2026-12-31');
  });

  it('AC-12: clearing "ราคาเดิม" to 0 and submitting sends originalPrice: 0 (closes the dead-field gap, §0.2)', async () => {
    const { component, updateDocumentCalls } = renderForEdit({
      originalPrice: 599,
      discountExpiresAt: '2026-12-31T00:00:00Z',
    });
    await settleConstructorLoad();
    expect(component.originalPrice()).toBe(599);

    component.title.set('เอกสารทดสอบ');
    component.shortDescription.set('คำอธิบายสั้น');
    component.categoryIds.set(['cat-1']);
    component.originalPrice.set(0);

    component.submit();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateDocumentCalls).toHaveLength(1);
    const body = readDiscountFields(updateDocumentCalls[0].body);
    expect(body.originalPrice).toBe(0);
  });

  it('sets both fields to null/0 in the payload when "ตั้งเป็นเอกสารฟรี" is toggled on', async () => {
    const { component, updateDocumentCalls } = renderForEdit({
      originalPrice: 599,
      discountExpiresAt: '2026-12-31T00:00:00Z',
    });
    await settleConstructorLoad();

    component.title.set('เอกสารทดสอบ');
    component.shortDescription.set('คำอธิบายสั้น');
    component.categoryIds.set(['cat-1']);
    component.setIsFree(true);

    expect(component.originalPrice()).toBe(0);
    expect(component.discountExpiresAt()).toBe('');

    component.submit();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateDocumentCalls).toHaveLength(1);
    const body = readDiscountFields(updateDocumentCalls[0].body);
    expect(body.originalPrice).toBe(0);
    expect(body.discountExpiresAt).toBeNull();
  });

  it('validates originalPrice must be greater than current price when greater than 0', async () => {
    const { component } = renderForEdit();
    await settleConstructorLoad();

    component.price.set(199);
    component.originalPrice.set(100);
    expect(component.originalPriceError()).toContain('ราคาเต็มก่อนลดต้องมากกว่าราคาขายปัจจุบัน (฿199)');

    component.originalPrice.set(199);
    expect(component.originalPriceError()).toContain('ราคาเต็มก่อนลดต้องมากกว่าราคาขายปัจจุบัน (฿199)');

    component.originalPrice.set(299);
    expect(component.originalPriceError()).toBeNull();

    component.originalPrice.set(0);
    expect(component.originalPriceError()).toBeNull();

    component.originalPrice.set(100);
    component.setIsFree(true);
    expect(component.originalPriceError()).toBeNull();
  });

  it('blocks step 3 next() and submit() when originalPrice is less than or equal to current price', async () => {
    const { component, updateDocumentCalls } = renderForEdit();
    await settleConstructorLoad();

    component.title.set('เอกสารทดสอบ');
    component.shortDescription.set('คำอธิบายสั้น');
    component.categoryIds.set(['cat-1']);
    component.price.set(199);
    component.originalPrice.set(150);
    component.step.set(3);

    component.next();
    expect(component.step()).toBe(3);

    component.submit();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateDocumentCalls).toHaveLength(0);
  });
});

/**
 * seller-pricing-and-storefront-stats v1 §4 — AC-7..AC-10: the competitor pricing hint box on
 * step 3 ("ตั้งราคา"). `getDocumentPricingHint` must fire exactly once on first entry to step 3
 * (never while toggling categories on step 2), and the hint box only renders once the response
 * arrives with `sampleSize >= 3` — anything else (loading, `null`, thrown error, too-few-samples)
 * must render nothing and never toast.
 */
describe('SellerUploadPage — competitor pricing hint (seller-pricing-and-storefront-stats v1 §4)', () => {
  function renderForPricingHint(
    getDocumentPricingHint: SellerService['getDocumentPricingHint'],
    messageError = vi.fn(),
  ) {
    const fakeSellerForHint: Partial<SellerService> = {
      fetchDocumentForEdit: async () => null,
      myDocuments: signal<ReturnType<typeof mapSellerDocument>[]>([]),
      refreshDocuments: async () => {},
      getDocumentPricingHint,
    };
    const fakeCatalogForHint: Partial<CatalogService> = {
      loadCategories: () => {},
      getCategoryById: () => undefined,
    };
    const fakePlatformStats = { stats: () => undefined, loadStats: vi.fn() };

    TestBed.configureTestingModule({
      imports: [SellerUploadPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: CatalogService, useValue: fakeCatalogForHint },
        { provide: SellerService, useValue: fakeSellerForHint },
        {
          provide: NzMessageService,
          useValue: { success: vi.fn(), warning: vi.fn(), error: messageError, info: vi.fn() },
        },
        { provide: PlatformStatsService, useValue: fakePlatformStats },
      ],
    });

    const fixture = TestBed.createComponent(SellerUploadPage);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, messageError };
  }

  it('AC-7: does not fetch while toggling categories on step 2', async () => {
    const getDocumentPricingHint = vi.fn(async () => null);
    const { component } = renderForPricingHint(getDocumentPricingHint);

    component.next(); // step 1 -> 2 (never triggers the hint fetch)
    component.toggleCategory('cat-1');
    component.toggleCategory('cat-2');
    component.removeCategory('cat-1');
    await Promise.resolve();

    expect(getDocumentPricingHint).not.toHaveBeenCalled();
  });

  it('AC-7: fetches exactly once on first entry to step 3 with the selected categories', async () => {
    const getDocumentPricingHint = vi.fn(async () => null);
    const { component } = renderForPricingHint(getDocumentPricingHint);

    component.next(); // -> 2
    component.toggleCategory('cat-1');
    component.toggleCategory('cat-2');
    component.next(); // -> 3, first entry: exactly one fetch
    await Promise.resolve();

    expect(getDocumentPricingHint).toHaveBeenCalledTimes(1);
    expect(getDocumentPricingHint).toHaveBeenCalledWith(['cat-1', 'cat-2'], undefined);
  });

  it('AC-8: no categories selected on entering step 3 → box stays hidden, no fetch of an empty array', async () => {
    const getDocumentPricingHint = vi.fn(async () => null);
    const { fixture, component } = renderForPricingHint(getDocumentPricingHint);

    component.next(); // -> 2
    component.next(); // -> 3, categoryIds still []
    await Promise.resolve();
    fixture.detectChanges();

    expect(component.pricingHint()).toBeNull();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ราคาคู่แข่งในหมวดเดียวกัน');
  });

  it('AC-8: sampleSize < 3 → hint box does not render', async () => {
    const getDocumentPricingHint = vi.fn(async () => ({
      sampleSize: 2,
      minPrice: 100,
      maxPrice: 200,
      averagePrice: 150,
    }));
    const { fixture, component } = renderForPricingHint(getDocumentPricingHint);

    component.next();
    component.toggleCategory('cat-1');
    component.next();
    await Promise.resolve();
    fixture.detectChanges();

    expect(component.pricingHint()?.sampleSize).toBe(2);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ราคาคู่แข่งในหมวดเดียวกัน');
  });

  it('AC-9: sampleSize >= 3 → shows avg/min/max/sample count formatted with ThbPipe', async () => {
    const getDocumentPricingHint = vi.fn(async () => ({
      sampleSize: 5,
      minPrice: 100,
      maxPrice: 300,
      averagePrice: 200,
    }));
    const { fixture, component } = renderForPricingHint(getDocumentPricingHint);

    component.next();
    component.toggleCategory('cat-1');
    component.next();
    await Promise.resolve();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ราคาคู่แข่งในหมวดเดียวกัน');
    expect(text).toContain('฿200');
    expect(text).toContain('฿100');
    expect(text).toContain('฿300');
    expect(text).toContain('5 รายการ');
  });

  it('AC-10: request failure (service resolves null per §4 "ไม่ toast ตอน error") hides the box silently — no toast/error state', async () => {
    // The real SellerService.getDocumentPricingHint (round 2) wraps its network call in a
    // try/catch and resolves `null` on failure by design (§4) — it never rejects, so the page
    // never needs its own error handling for this request. This fake reproduces that contract.
    const getDocumentPricingHint = vi.fn(async () => null);
    const messageError = vi.fn();
    const { fixture, component } = renderForPricingHint(getDocumentPricingHint, messageError);

    component.next();
    component.toggleCategory('cat-1');
    component.next();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(component.pricingHint()).toBeNull();
    expect(component.pricingHintLoading()).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ราคาคู่แข่งในหมวดเดียวกัน');
    expect(messageError).not.toHaveBeenCalled();
  });
});

/**
 * ai-listing-autofill v1 §1 test list — "เติมข้อมูลด้วย AI" button (`requestAiAutofill`):
 *  - success: fills every returned field into the draft form signals
 *  - AC-4: when `isSuccess=false`, no form field is touched at all (values typed before stay put)
 *  - AI/network failure shows the generic error toast, again without touching the form
 */
describe('SellerUploadPage — requestAiAutofill (ai-listing-autofill v1 §1/AC-4)', () => {
  function renderForAutofill(getAutofillSuggestion: SellerService['getAutofillSuggestion']) {
    const fakeSellerForAutofill: Partial<SellerService> = {
      fetchDocumentForEdit: async () => null,
      myDocuments: signal<ReturnType<typeof mapSellerDocument>[]>([]),
      refreshDocuments: async () => {},
      getAutofillSuggestion,
    };
    const fakeCatalogForAutofill: Partial<CatalogService> = {
      loadCategories: () => {},
      getCategoryById: () => undefined,
    };
    const fakePlatformStats = { stats: () => undefined, loadStats: vi.fn() };
    const messages = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      imports: [SellerUploadPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: CatalogService, useValue: fakeCatalogForAutofill },
        { provide: SellerService, useValue: fakeSellerForAutofill },
        { provide: NzMessageService, useValue: messages },
        { provide: PlatformStatsService, useValue: fakePlatformStats },
      ],
    });

    const fixture = TestBed.createComponent(SellerUploadPage);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, messages };
  }

  it('fills title/shortDescription/description/categoryIds/tags on success', async () => {
    const { component, messages } = renderForAutofill(async () => ({
      isSuccess: true,
      failureReason: null,
      title: 'แบบฝึกหัดคณิตศาสตร์ ป.4',
      shortDescription: 'โจทย์เศษส่วนพร้อมเฉลย',
      description: 'เนื้อหาเต็ม...',
      categoryIds: ['cat-math'],
      subcategoryId: null,
      resourceType: 'worksheet',
      gradeLevels: ['primary-late'],
      tags: ['คณิตศาสตร์', 'เศษส่วน'],
    }));

    await component.requestAiAutofill();

    expect(component.title()).toBe('แบบฝึกหัดคณิตศาสตร์ ป.4');
    expect(component.shortDescription()).toBe('โจทย์เศษส่วนพร้อมเฉลย');
    expect(component.longDescription()).toBe('เนื้อหาเต็ม...');
    expect(component.categoryIds()).toEqual(['cat-math']);
    expect(component.tags()).toEqual(['คณิตศาสตร์', 'เศษส่วน']);
    expect(messages.success).toHaveBeenCalledWith(
      'AI ช่วยเติมข้อมูลให้แล้ว ตรวจสอบและแก้ไขได้เลยครับ',
    );
  });

  it('AC-4: does not touch any form field when isSuccess=false, and shows the failureReason as a warning', async () => {
    const { component, messages } = renderForAutofill(async () => ({
      isSuccess: false,
      failureReason: 'ไม่มีข้อความให้วิเคราะห์',
    }));
    component.title.set('ชื่อที่ผู้ขายพิมพ์เอง');
    component.shortDescription.set('คำอธิบายที่ผู้ขายพิมพ์เอง');

    await component.requestAiAutofill();

    expect(component.title()).toBe('ชื่อที่ผู้ขายพิมพ์เอง');
    expect(component.shortDescription()).toBe('คำอธิบายที่ผู้ขายพิมพ์เอง');
    expect(component.categoryIds()).toEqual([]);
    expect(component.tags()).toEqual([]);
    expect(messages.warning).toHaveBeenCalledWith('ไม่มีข้อความให้วิเคราะห์');
  });

  it('AC-4: does not touch any form field when the request throws (network/service failure)', async () => {
    const { component, messages } = renderForAutofill(async () => {
      throw new Error('network down');
    });
    component.title.set('ชื่อที่ผู้ขายพิมพ์เอง');

    await component.requestAiAutofill();

    expect(component.title()).toBe('ชื่อที่ผู้ขายพิมพ์เอง');
    expect(messages.error).toHaveBeenCalledWith('เกิดข้อผิดพลาดในการขอข้อมูลแนะนำจาก AI');
  });
});

/**
 * watermark-completion v1 §3.4/§4.3 — the seller's watermark checkbox must obey the platform
 * policy: locked = disabled and ticked, and the warning under it is the backend's own Thai text
 * (`watermarkWarning`), never something this page composes from `format`.
 */
describe('SellerUploadPage — watermark policy (watermark-completion v1 §4.3)', () => {
  function renderForWatermark(rawDocOverrides: Record<string, unknown> = {}) {
    const rawDoc = {
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสารทดสอบ',
      shortDescription: 'คำอธิบายสั้น',
      price: 300,
      watermarkEnabled: false,
      ...rawDocOverrides,
    };
    const doc = mapSellerDocument(rawDoc as SellerDocumentResponse);

    const fakeSellerForEdit: Partial<SellerService> = {
      fetchDocumentForEdit: async () => doc,
      fetchDocumentMainFiles: async () => [],
      myDocuments: signal<ReturnType<typeof mapSellerDocument>[]>([]),
      refreshDocuments: async () => {},
      updateDocument: async () => {},
    };

    TestBed.configureTestingModule({
      imports: [SellerUploadPage],
      providers: [
        provideRouter([]),
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ id: 'doc-1' })) },
        },
        {
          provide: CatalogService,
          useValue: { loadCategories: () => {}, getCategoryById: () => undefined },
        },
        { provide: SellerService, useValue: fakeSellerForEdit },
        {
          provide: NzMessageService,
          useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
        { provide: PlatformStatsService, useValue: { stats: () => undefined, loadStats: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(SellerUploadPage);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  async function settleLoad(fixture: { detectChanges: () => void }): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function watermarkCheckbox(fixture: { nativeElement: unknown }): HTMLInputElement {
    const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[name="watermark-enabled"]',
    );
    expect(el).not.toBeNull();
    return el as HTMLInputElement;
  }

  it('AC-08: watermarkPolicyLocked disables the checkbox and forces it on', async () => {
    const { fixture, component } = renderForWatermark({
      watermarkEnabled: false,
      watermarkCapability: 'raster',
      watermarkEffective: true,
      watermarkPolicyLocked: true,
    });
    await settleLoad(fixture);
    // The watermark checkbox lives in step 1 (upload + gallery + watermark options).
    component.step.set(1);
    fixture.detectChanges();

    expect(component.watermarkPolicyLocked()).toBe(true);
    // The server would override a `false` anyway (AC-08) — the form must not pretend otherwise.
    expect(component.watermark()).toBe(true);
    expect(watermarkCheckbox(fixture).disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'ระบบกำหนดให้เอกสารทุกฉบับต้องมีลายน้ำ',
    );
  });

  it('leaves the checkbox editable when the policy is seller_choice', async () => {
    const { fixture, component } = renderForWatermark({
      watermarkEnabled: false,
      watermarkCapability: 'raster',
      watermarkEffective: false,
      watermarkPolicyLocked: false,
    });
    await settleLoad(fixture);
    // The watermark checkbox lives in step 1 (upload + gallery + watermark options).
    component.step.set(1);
    fixture.detectChanges();

    expect(component.watermark()).toBe(false);
    expect(watermarkCheckbox(fixture).disabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'ระบบกำหนดให้เอกสารทุกฉบับต้องมีลายน้ำ',
    );
  });

  it('renders watermarkWarning exactly as the backend worded it', async () => {
    const warning =
      'ไฟล์ ZIP ฝังลายน้ำลงในเนื้อไฟล์ไม่ได้ ระบบจะแนบไฟล์ระบุรหัสสำเนาไว้ในแพ็กเกจแทน หากต้องการลายน้ำที่มองเห็นได้ กรุณาอัปโหลดเป็น PDF';
    const { fixture, component } = renderForWatermark({
      format: 'zip',
      watermarkEnabled: true,
      watermarkCapability: 'none',
      watermarkEffective: false,
      watermarkPolicyLocked: false,
      watermarkWarning: warning,
    });
    await settleLoad(fixture);
    // The watermark checkbox lives in step 1 (upload + gallery + watermark options).
    component.step.set(1);
    fixture.detectChanges();

    expect(component.watermarkWarning()).toBe(warning);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(warning);
  });

  it('shows nothing when the backend sent no warning', async () => {
    const { fixture, component } = renderForWatermark({
      watermarkCapability: 'raster',
      watermarkWarning: null,
    });
    await settleLoad(fixture);
    // The watermark checkbox lives in step 1 (upload + gallery + watermark options).
    component.step.set(1);
    fixture.detectChanges();

    expect(component.watermarkWarning()).toBeNull();
  });
});

describe('SellerUploadPage — document versioning (document-versioning v1 §4/§6)', () => {
  it('opens versionModalVisible when setting main file on approved document with salesCount > 0', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.editId.set('doc-1');
    component.mainFiles.set([
      { id: 'file-1', storageKey: 'k1', originalFileName: 'f1.pdf', uploadedAt: '', isListedForSale: false },
    ]);
    component.editDocument.set({
      id: 'doc-1',
      status: 'approved',
      salesCount: 5,
    } as unknown as DocumentItem);

    component.selectListedMainFile('file-1');

    expect(component.versionModalVisible()).toBe(true);
    expect(component.pendingListedFileId()).toBe('file-1');
  });

  it('calls executeSetListedMainFile immediately without modal when salesCount === 0', async () => {
    const setListedSpy = vi.fn().mockResolvedValue({ id: 'doc-1', status: 'approved' });
    Object.assign(fakeSeller, { setListedMainFile: setListedSpy });

    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.editId.set('doc-1');
    component.mainFiles.set([
      { id: 'file-1', storageKey: 'k1', originalFileName: 'f1.pdf', uploadedAt: '', isListedForSale: false },
    ]);
    component.editDocument.set({
      id: 'doc-1',
      status: 'approved',
      salesCount: 0,
    } as unknown as DocumentItem);


    component.selectListedMainFile('file-1');

    expect(component.versionModalVisible()).toBe(false);
    expect(setListedSpy).toHaveBeenCalledWith('doc-1', 'file-1', { isNewVersion: false });
  });

  it('confirms version modal with new version option and changeNote', async () => {
    const setListedSpy = vi.fn().mockResolvedValue({ id: 'doc-1', status: 'approved' });
    Object.assign(fakeSeller, { setListedMainFile: setListedSpy });

    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.editId.set('doc-1');
    component.pendingListedFileId.set('file-2');
    component.isNewVersionOption.set(true);
    component.changeNoteInput.set('ปรับปรุงข้อสอบ');
    component.versionModalVisible.set(true);

    component.confirmVersionModal();

    expect(component.versionModalVisible()).toBe(false);
    expect(setListedSpy).toHaveBeenCalledWith('doc-1', 'file-2', {
      isNewVersion: true,
      changeNote: 'ปรับปรุงข้อสอบ',
    });
  });

  it('opens history modal and loads document versions', async () => {
    const getVersionsSpy = vi.fn().mockResolvedValue([
      { versionNumber: 1, changeNote: 'first', createdAt: '2026-09-01' },
    ]);
    Object.assign(fakeSeller, { getDocumentVersions: getVersionsSpy });

    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.editId.set('doc-1');

    await component.openHistoryModal();

    expect(component.historyModalVisible()).toBe(true);
    expect(getVersionsSpy).toHaveBeenCalledWith('doc-1');
    expect(component.historyVersions()).toHaveLength(1);
  });
});

/**
 * document-rejection-reason v1 §4 — AC-10/AC-11/AC-12: the edit-mode rejection banner on
 * `upload.page.html`. `rawDoc` carries `rejectionReason`/`rejectedAt` directly — these two fields
 * are now real properties on the generated `SellerDocumentResponse` (post SDK regen), and
 * `mapSellerDocument` reads them off the response with plain property access, no cast.
 */
describe('SellerUploadPage — rejection reason banner (document-rejection-reason v1 §4)', () => {
  function renderForRejection(rawDocOverrides: Record<string, unknown> = {}) {
    const rawDoc = {
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสารทดสอบ',
      shortDescription: 'คำอธิบายสั้น',
      price: 300,
      status: 'rejected',
      ...rawDocOverrides,
    };
    const doc = mapSellerDocument(rawDoc as SellerDocumentResponse);

    const fakeSellerForEdit: Partial<SellerService> = {
      fetchDocumentForEdit: async () => doc,
      fetchDocumentMainFiles: async () => [],
      myDocuments: signal<ReturnType<typeof mapSellerDocument>[]>([]),
      refreshDocuments: async () => {},
      updateDocument: async () => {},
    };

    TestBed.configureTestingModule({
      imports: [SellerUploadPage],
      providers: [
        provideRouter([]),
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ id: 'doc-1' })) },
        },
        {
          provide: CatalogService,
          useValue: { loadCategories: () => {}, getCategoryById: () => undefined },
        },
        { provide: SellerService, useValue: fakeSellerForEdit },
        {
          provide: NzMessageService,
          useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
        { provide: PlatformStatsService, useValue: { stats: () => undefined, loadStats: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(SellerUploadPage);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  async function settleLoad(fixture: { detectChanges: () => void }): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  it('AC-10: shows the rejection banner with the reason and rejectedAt when editing a rejected document', async () => {
    const { fixture, component } = renderForRejection({
      rejectionReason: 'ภาพหน้าปกไม่ตรงกับเนื้อหาเอกสาร',
      rejectedAt: '2026-09-10T08:00:00Z',
    });
    await settleLoad(fixture);

    expect(component.editDocument()?.rejectionReason).toBe('ภาพหน้าปกไม่ตรงกับเนื้อหาเอกสาร');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('เอกสารนี้ไม่ผ่านการตรวจ');
    expect(text).toContain('เหตุผล: ภาพหน้าปกไม่ตรงกับเนื้อหาเอกสาร');
    expect(text).toContain('ตรวจเมื่อ');
  });

  it('AC-11: does not show the banner for a document that is not rejected', async () => {
    const { fixture } = renderForRejection({
      status: 'approved',
      rejectionReason: 'เหตุผลเก่าที่ค้างอยู่',
    });
    await settleLoad(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('เอกสารนี้ไม่ผ่านการตรวจ');
    expect(text).not.toContain('เหตุผลเก่าที่ค้างอยู่');
  });

  it('AC-11/AC-12: a rejected document with no rejectionReason renders no banner and does not throw', async () => {
    const { fixture } = renderForRejection({
      rejectionReason: null,
      rejectedAt: null,
    });

    await expect(settleLoad(fixture)).resolves.toBeUndefined();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('เอกสารนี้ไม่ผ่านการตรวจ');
  });

  it('AC-12: rejectedAt undefined does not throw and hides the "ตรวจเมื่อ" line', async () => {
    const { fixture, component } = renderForRejection({
      rejectionReason: 'ต้องแก้คำอธิบาย',
      rejectedAt: undefined,
    });
    await settleLoad(fixture);

    expect(component.editDocument()?.rejectionReason).toBe('ต้องแก้คำอธิบาย');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('เหตุผล: ต้องแก้คำอธิบาย');
    expect(text).not.toContain('ตรวจเมื่อ');
  });
});

/**
 * cover-image-mode v1 §1/§4 — the "รูปปกและแกลเลอรี" custom-vs-auto toggle on the upload page.
 * `coverImageMode` is a real field on `CreateDocumentRequest`/`UpdateDocumentRequest`/
 * `SellerDocumentResponse` post-SDK-regen (generated as a bare `string`, not a literal union —
 * see `readSellerCoverImageMode` in `mappers.ts`) — raw response objects below are still built
 * untyped + `as SellerDocumentResponse` cast at the `mapSellerDocument` call site, matching the
 * other loosely-typed fixtures already in this file (see the discount-urgency/rejection-reason
 * describe blocks above), and `component.submit()`'s outgoing bodies are read back with a local
 * structural probe (`CoverModeBodyProbe` below) purely for convenient dot access.
 */
describe('SellerUploadPage — cover image mode (cover-image-mode v1 §1/§4)', () => {
  function getCoverModeButtons(fixture: { nativeElement: unknown }) {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const customBtn = buttons.find((b) => b.textContent?.trim() === 'อัปโหลดรูปปกเอง');
    const autoBtn = buttons.find((b) => b.textContent?.trim() === 'สร้างรูปปกจากเอกสารอัตโนมัติ');
    return { customBtn, autoBtn };
  }

  function renderForCoverEdit(rawDocOverrides: Record<string, unknown> = {}) {
    const updateDocumentCalls: { id: string; body: UpdateSellerDocumentRequest }[] = [];
    const rawDoc = {
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสารทดสอบ',
      shortDescription: 'คำอธิบายสั้น',
      price: 300,
      format: 'pdf',
      ...rawDocOverrides,
    };
    const doc = mapSellerDocument(rawDoc as SellerDocumentResponse);

    const fakeSellerForEdit: Partial<SellerService> = {
      fetchDocumentForEdit: async () => doc,
      fetchDocumentMainFiles: async () => [],
      myDocuments: signal<ReturnType<typeof mapSellerDocument>[]>([]),
      refreshDocuments: async () => {},
      updateDocument: async (id: string, body: UpdateSellerDocumentRequest) => {
        updateDocumentCalls.push({ id, body });
      },
    };

    TestBed.configureTestingModule({
      imports: [SellerUploadPage],
      providers: [
        provideRouter([]),
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ id: 'doc-1' })) },
        },
        {
          provide: CatalogService,
          useValue: { loadCategories: () => {}, getCategoryById: () => undefined },
        },
        { provide: SellerService, useValue: fakeSellerForEdit },
        {
          provide: NzMessageService,
          useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
        { provide: PlatformStatsService, useValue: { stats: () => undefined, loadStats: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(SellerUploadPage);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, updateDocumentCalls };
  }

  /**
   * Narrow structural probe over the outgoing request bodies — lets assertions use plain dot
   * access instead of index-signature bracket access (`noPropertyAccessFromIndexSignature`),
   * and covers `galleryItems`/`galleryImageUrls` which only exist on `UpdateDocumentRequest`
   * (not on `CreateDocumentRequest`, whose follow-up PUT is captured via raw `fetch` instead).
   */
  type CoverModeBodyProbe = {
    coverImageMode?: string;
    galleryItems?: unknown[];
    galleryImageUrls?: unknown[];
  };

  function renderForCoverCreate() {
    const createDocumentCalls: { body: CoverModeBodyProbe }[] = [];
    const fakeSellerForCreate: Partial<SellerService> = {
      createDocument: async (req) => {
        createDocumentCalls.push({ body: req as unknown as CoverModeBodyProbe });
        return { id: 'doc-new', slug: 'doc-new', title: req.title ?? '' } as SellerDocumentResponse;
      },
      refreshDocuments: async () => {},
    };

    TestBed.configureTestingModule({
      imports: [SellerUploadPage],
      providers: [
        provideRouter([]),
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        {
          provide: CatalogService,
          useValue: { loadCategories: () => {}, getCategoryById: () => undefined },
        },
        { provide: SellerService, useValue: fakeSellerForCreate },
        {
          provide: NzMessageService,
          useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
        { provide: PlatformStatsService, useValue: { stats: () => undefined, loadStats: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(SellerUploadPage);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, createDocumentCalls };
  }

  async function settleLoad(fixture: { detectChanges: () => void }): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function fillRequiredFields(component: SellerUploadPage): void {
    component.title.set('เอกสารทดสอบ');
    component.shortDescription.set('คำอธิบายสั้น');
    component.categoryIds.set(['cat-1']);
  }

  function makeGalleryItem(key: string) {
    return {
      id: null,
      key,
      publicUrl: `https://cdn.example.test/${key}`,
      previewUrl: `https://cdn.example.test/${key}`,
    };
  }

  /**
   * cover-image-mode v1 §4/AC-05 (create-mode branch only): `putApiSellerDocumentsById` is
   * called directly in the create-mode follow-up PUT (bypassing `SellerService`, so it isn't a
   * TestBed-injectable dependency), and Angular's vitest unit-test system blocks `vi.mock` for
   * *any* relative-path import ("Please use Angular TestBed for mocking dependencies") — and
   * `audit:guard` separately forbids `features/**` from importing `core/api/client.gen`/
   * `sdk.gen` directly even from a spec file. Spying on the global `fetch` (not a module import
   * at all) sidesteps both: it returns a synthetic successful response instead of hitting a
   * real (absent) backend, and reading the request's already-JSON-serialized body is actually
   * the most faithful check for AC-05's "omit the field from the wire, not send `[]`" wording.
   */
  function captureNextPutBody() {
    let captured: CoverModeBodyProbe | undefined;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        if (request.method === 'PUT' && captured === undefined) {
          const text = await request.text();
          captured = text ? (JSON.parse(text) as CoverModeBodyProbe) : undefined;
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
    return {
      get: () => captured,
      restore: () => fetchSpy.mockRestore(),
    };
  }

  async function flushCreateModeSubmit(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
    // The mocked `fetch`'s `Request#text()` resolves via a real (macrotask) tick in this
    // environment, not a plain microtask — a couple of `setTimeout(0)` round-trips give it
    // room to finish before assertions run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('AC-01: defaults to custom mode on a fresh (create-mode) page, both toggle buttons rendered', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;

    expect(component.coverImageMode()).toBe('custom');
    const { customBtn, autoBtn } = getCoverModeButtons(fixture);
    expect(customBtn).toBeTruthy();
    expect(autoBtn).toBeTruthy();
  });

  it('AC-02(a): auto mode unavailable in create mode with no file selected at all', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;

    expect(component.coverAutoModeAvailable()).toBe(false);
    fixture.detectChanges();
    expect(getCoverModeButtons(fixture).autoBtn?.disabled).toBe(true);
  });

  it('AC-02(b): auto mode unavailable in create mode when the selected file is not a PDF', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.file.set(new File(['x'], 'notes.docx'));

    expect(component.coverAutoModeAvailable()).toBe(false);
  });

  it('AC-02: auto mode becomes available in create mode once a .pdf file is selected', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.file.set(new File(['x'], 'notes.pdf'));

    expect(component.coverAutoModeAvailable()).toBe(true);
    fixture.detectChanges();
    expect(getCoverModeButtons(fixture).autoBtn?.disabled).toBe(false);
  });

  it('AC-02(a): auto mode unavailable in edit mode before the document has finished loading', () => {
    const { component } = renderForCoverEdit({ format: 'pdf' });
    // Deliberately not awaiting settleLoad() — editDocument() is still null at this point.
    expect(component.coverAutoModeAvailable()).toBe(false);
  });

  it('AC-02(b): auto mode unavailable in edit mode when the loaded document is not a PDF', async () => {
    const { fixture, component } = renderForCoverEdit({ format: 'docx' });
    await settleLoad(fixture);

    expect(component.coverAutoModeAvailable()).toBe(false);
  });

  it('AC-02: auto mode available in edit mode when the loaded document is a PDF', async () => {
    const { fixture, component } = renderForCoverEdit({ format: 'pdf' });
    await settleLoad(fixture);

    expect(component.coverAutoModeAvailable()).toBe(true);
  });

  it('AC-02: a newly selected non-PDF file overrides an already-PDF loaded document, disabling auto mode', async () => {
    const { fixture, component } = renderForCoverEdit({ format: 'pdf' });
    await settleLoad(fixture);
    component.upload.set({ key: 'seller-1/new.docx', publicUrl: 'https://cdn.example.test/new.docx' });
    component.file.set(new File(['x'], 'new.docx'));

    expect(component.coverAutoModeAvailable()).toBe(false);
  });

  it('AC-02: a newly selected PDF file overrides an already non-PDF loaded document, enabling auto mode', async () => {
    const { fixture, component } = renderForCoverEdit({ format: 'docx' });
    await settleLoad(fixture);
    component.upload.set({ key: 'seller-1/new.pdf', publicUrl: 'https://cdn.example.test/new.pdf' });
    component.file.set(new File(['x'], 'new.pdf'));

    expect(component.coverAutoModeAvailable()).toBe(true);
  });

  it('AC-03: selecting auto mode hides the upload box/gallery list/clear-all button and shows the info box', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.file.set(new File(['x'], 'notes.pdf'));
    component.galleryItems.set([makeGalleryItem('k1')]);
    component.coverImageMode.set('auto');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ล้างรูปทั้งหมด');
    expect(text).not.toContain('ปกหลัก');
    expect(text).not.toContain('คลิกเพื่อเลือกรูป');
    expect(text).not.toContain('เพิ่มรูป');
    expect(text).toContain('ใช้หน้าแรกของเอกสารเป็นรูปปกอัตโนมัติ');
    expect(text).toContain('ตัวอย่างจริงจะแสดงหลังบันทึก');
  });

  it('AC-04: custom mode (default) keeps the existing upload box/gallery list/clear-all button unchanged', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.galleryItems.set([makeGalleryItem('k1')]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ล้างรูปทั้งหมด');
    expect(text).toContain('ปกหลัก');
    expect(text).toContain('เพิ่มรูป');
    expect(text).not.toContain('ใช้หน้าแรกของเอกสารเป็นรูปปกอัตโนมัติ');
  });

  it('clicking the auto toggle does nothing while it is disabled (no file selected)', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;
    const { autoBtn } = getCoverModeButtons(fixture);

    autoBtn?.click();

    expect(component.coverImageMode()).toBe('custom');
  });

  it('clicking the auto toggle switches mode once a .pdf file is selected', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.file.set(new File(['x'], 'notes.pdf'));
    fixture.detectChanges();
    const { autoBtn } = getCoverModeButtons(fixture);

    autoBtn?.click();

    expect(component.coverImageMode()).toBe('auto');
  });

  it('AC-05: edit mode + custom sends coverImageMode "custom" with galleryItems included', async () => {
    const { fixture, component, updateDocumentCalls } = renderForCoverEdit();
    await settleLoad(fixture);
    fillRequiredFields(component);
    component.galleryItems.set([makeGalleryItem('k1')]);
    component.coverImageMode.set('custom');

    component.submit();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateDocumentCalls).toHaveLength(1);
    const body = updateDocumentCalls[0].body as unknown as {
      coverImageMode?: string;
      galleryItems?: unknown[];
    };
    expect(body.coverImageMode).toBe('custom');
    expect(body.galleryItems).toHaveLength(1);
  });

  it('AC-05: edit mode + auto sends coverImageMode "auto" and omits galleryItems entirely (not [])', async () => {
    const { fixture, component, updateDocumentCalls } = renderForCoverEdit({ format: 'pdf' });
    await settleLoad(fixture);
    fillRequiredFields(component);
    component.galleryItems.set([]);
    component.coverImageMode.set('auto');

    component.submit();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateDocumentCalls).toHaveLength(1);
    const body = updateDocumentCalls[0].body as unknown as CoverModeBodyProbe;
    expect(body.coverImageMode).toBe('auto');
    expect('galleryItems' in body).toBe(false);
  });

  it('AC-05: create mode + custom sends coverImageMode "custom" on both createDocument and the follow-up PUT, galleryImageUrls included', async () => {
    const { component, createDocumentCalls } = renderForCoverCreate();
    const putCapture = captureNextPutBody();
    try {
      fillRequiredFields(component);
      component.file.set(new File(['x'], 'notes.pdf'));
      component.upload.set({ key: 'seller-1/notes.pdf', publicUrl: 'https://cdn.example.test/notes.pdf' });
      component.galleryItems.set([makeGalleryItem('k1')]);
      component.coverImageMode.set('custom');

      component.submit();
      await flushCreateModeSubmit();

      expect(createDocumentCalls).toHaveLength(1);
      expect(createDocumentCalls[0].body.coverImageMode).toBe('custom');

      const putBody = putCapture.get();
      expect(putBody).toBeDefined();
      expect(putBody?.coverImageMode).toBe('custom');
      expect(putBody?.galleryImageUrls).toHaveLength(1);
    } finally {
      putCapture.restore();
    }
  });

  it('AC-05: create mode + auto sends coverImageMode "auto" and omits galleryImageUrls entirely on both calls', async () => {
    const { component, createDocumentCalls } = renderForCoverCreate();
    const putCapture = captureNextPutBody();
    try {
      fillRequiredFields(component);
      component.file.set(new File(['x'], 'notes.pdf'));
      component.upload.set({ key: 'seller-1/notes.pdf', publicUrl: 'https://cdn.example.test/notes.pdf' });
      component.galleryItems.set([]);
      component.coverImageMode.set('auto');

      component.submit();
      await flushCreateModeSubmit();

      expect(createDocumentCalls).toHaveLength(1);
      expect(createDocumentCalls[0].body.coverImageMode).toBe('auto');

      const putBody = putCapture.get();
      expect(putBody).toBeDefined();
      expect(putBody?.coverImageMode).toBe('auto');
      expect(putBody && 'galleryImageUrls' in putBody).toBe(false);
    } finally {
      putCapture.restore();
    }
  });

  it('AC-06: step1NextDisabled is false in auto mode with an empty gallery, once other create-mode conditions pass', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.file.set(new File(['x'], 'notes.pdf'));
    component.upload.set({ key: 'seller-1/notes.pdf', publicUrl: 'https://cdn.example.test/notes.pdf' });
    component.coverImageMode.set('auto');
    component.galleryItems.set([]);

    expect(component.step1NextDisabled()).toBe(false);
  });

  it('AC-06 regression: step1NextDisabled stays true in custom mode with an empty gallery', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.file.set(new File(['x'], 'notes.pdf'));
    component.upload.set({ key: 'seller-1/notes.pdf', publicUrl: 'https://cdn.example.test/notes.pdf' });
    component.coverImageMode.set('custom');
    component.galleryItems.set([]);

    expect(component.step1NextDisabled()).toBe(true);
  });

  it('AC-07: loading a document saved with coverImageMode "auto" restores auto mode and hides the upload UI immediately', async () => {
    const { fixture, component } = renderForCoverEdit({
      format: 'pdf',
      coverImageMode: 'auto',
      galleryItems: [
        {
          id: 'g1',
          imageUrl: 'https://cdn.example.test/auto-cover.jpg',
          imageStorageKey: 'seller-1/gallery/auto-cover.jpg',
        },
      ],
    });
    await settleLoad(fixture);

    expect(component.coverImageMode()).toBe('auto');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ล้างรูปทั้งหมด');
    expect(text).not.toContain('คลิกเพื่อเลือกรูป');
    expect(text).toContain('ใช้หน้าแรกของเอกสารเป็นรูปปกอัตโนมัติ');
  });
});

/**
 * create-document-watermark-properties v1 §4.1/§4.2 — create-mode watermark follow-up call:
 *  - AC-10: `SellerWatermarkService.saveConfig` rejecting must raise
 *    `message.error(t('seller.saveWatermarkConfigFailed'))` instead of being swallowed, while the
 *    submit itself still counts as successful (success toast + navigation stay).
 *  - §4.2: the subtitle fallback (`tpl.previewWatermarkSubtitle.trim() ||
 *    tpl.config.previewWatermarkSubtitle`) is applied on the create body too, not only on the
 *    follow-up call.
 * Round 2 (post-SDK-regen) adds:
 *  - AC-09: the create body carries all seven appearance properties (§4.2) in the SINGLE
 *    `createDocument` call, so the row is right the moment it exists.
 *  - §4.1.2: the follow-up watermark-config call is narrowed to the five personalized-appearance
 *    fields no other DTO accepts, and is skipped entirely when none of them is set.
 */
describe('SellerUploadPage — create-mode watermark-config failure (create-document-watermark-properties v1 §4)', () => {
  const SAVE_WATERMARK_CONFIG_FAILED = 'บันทึกการตั้งค่าลายน้ำไม่สำเร็จ';
  const TEMPLATE_SUBTITLE = 'SIRI EDUMARKET PREVIEW';

  type CreateBodyProbe = CreateDocumentRequest;

  /**
   * The five `personalized*` appearance fields exist on no DTO other than
   * `SellerWatermarkConfigRequest`, so they are what keeps the third call alive at all (§4.1.2).
   * `withPersonalizedAppearance: false` models the seller who never opened the watermark editor.
   */
  function buildTemplate(
    perUploadSubtitle: string,
    withPersonalizedAppearance = true,
  ): SellerWatermarkTemplate {
    return {
      enabled: true,
      previewWatermarkSubtitle: perUploadSubtitle,
      previewWatermarkFontFamily: 'Noto Sans Thai',
      config: {
        previewWatermarkSubtitle: TEMPLATE_SUBTITLE,
        previewWatermarkPosition: 'tile',
        previewWatermarkOpacity: 0.91,
        previewWatermarkColor: '#123456',
        previewWatermarkFontSize: 77,
        previewWatermarkRotation: 33,
        personalizedWatermarkPosition: 'footer',
        personalizedWatermarkTemplate: 'ผู้ซื้อ {email}',
        ...(withPersonalizedAppearance
          ? {
              personalizedWatermarkFontFamily: 'Sarabun',
              personalizedWatermarkColor: '#0f172a',
              personalizedWatermarkOpacity: 0.4,
              personalizedWatermarkRotation: 0,
              personalizedWatermarkFontSize: 11,
            }
          : {}),
      },
    };
  }

  function renderForCreate(options: {
    saveConfigRejects: boolean;
    perUploadSubtitle?: string;
    withPersonalizedAppearance?: boolean;
  }) {
    const createDocumentCalls: CreateBodyProbe[] = [];
    const saveConfigCalls: { id: string; body: SellerWatermarkConfigRequest }[] = [];
    const messages = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() };
    const navigate = vi.fn();

    const fakeSellerForCreate: Partial<SellerService> = {
      createDocument: async (req) => {
        createDocumentCalls.push(req);
        return { id: 'doc-new', slug: 'doc-new', title: req.title ?? '' } as SellerDocumentResponse;
      },
      refreshDocuments: async () => {},
    };

    const template = buildTemplate(
      options.perUploadSubtitle ?? '',
      options.withPersonalizedAppearance ?? true,
    );
    const fakeTemplates: Partial<SellerWatermarkTemplateService> = {
      load: () => template,
      loadOrDefault: () => template,
      save: () => true,
    };

    const fakeWatermarkService: Partial<SellerWatermarkService> = {
      saveConfig: async (id: string, body: SellerWatermarkConfigRequest) => {
        saveConfigCalls.push({ id, body });
        if (options.saveConfigRejects) {
          throw new Error('watermark-config endpoint failed');
        }
        return {} as SellerWatermarkConfigResponse;
      },
    };

    TestBed.configureTestingModule({
      imports: [SellerUploadPage],
      providers: [
        provideRouter([]),
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        {
          provide: CatalogService,
          useValue: { loadCategories: () => {}, getCategoryById: () => undefined },
        },
        { provide: SellerService, useValue: fakeSellerForCreate },
        { provide: SellerWatermarkTemplateService, useValue: fakeTemplates },
        { provide: SellerWatermarkService, useValue: fakeWatermarkService },
        { provide: NzMessageService, useValue: messages },
        { provide: PlatformStatsService, useValue: { stats: () => undefined, loadStats: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(SellerUploadPage);
    fixture.detectChanges();
    return {
      component: fixture.componentInstance,
      createDocumentCalls,
      saveConfigCalls,
      messages,
      navigate,
    };
  }

  /**
   * The create-mode follow-up `PUT /api/seller/documents/{id}` goes out through
   * `putApiSellerDocumentsById` (not a TestBed-injectable dependency), so — exactly as the
   * cover-image-mode block above does — stub the global `fetch` to answer it with a synthetic
   * 200 instead of reaching for an absent backend.
   */
  function stubFetchOk(putBodies: UpdateSellerDocumentRequest[] = []) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const text = await request.clone().text().catch(() => '');
        if (request.method === 'PUT' && text) {
          putBodies.push(JSON.parse(text) as UpdateSellerDocumentRequest);
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    );
  }

  async function submitAndFlush(component: SellerUploadPage): Promise<void> {
    component.title.set('เอกสารทดสอบ');
    component.shortDescription.set('คำอธิบายสั้น');
    component.categoryIds.set(['cat-1']);
    component.file.set(new File(['x'], 'notes.pdf'));
    component.upload.set({
      key: 'seller-1/notes.pdf',
      publicUrl: 'https://cdn.example.test/notes.pdf',
    });
    component.galleryItems.set([
      {
        id: null,
        key: 'k1',
        publicUrl: 'https://cdn.example.test/k1',
        previewUrl: 'https://cdn.example.test/k1',
      },
    ]);

    component.submit();
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('AC-10: a rejecting saveConfig raises the seller.saveWatermarkConfigFailed error toast (no silent swallow)', async () => {
    const { component, messages, saveConfigCalls } = renderForCreate({ saveConfigRejects: true });
    const fetchSpy = stubFetchOk();
    try {
      await submitAndFlush(component);

      expect(saveConfigCalls).toHaveLength(1);
      expect(messages.error).toHaveBeenCalledWith(SAVE_WATERMARK_CONFIG_FAILED);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('AC-10: the submit still succeeds after a rejecting saveConfig — success toast + navigation to /seller/documents', async () => {
    const { component, messages, navigate } = renderForCreate({ saveConfigRejects: true });
    const fetchSpy = stubFetchOk();
    try {
      await submitAndFlush(component);

      expect(messages.success).toHaveBeenCalledWith('ส่งเอกสารเข้าระบบตรวจสอบเรียบร้อยแล้ว');
      expect(navigate).toHaveBeenCalledWith(['/seller/documents']);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('AC-10 regression: a succeeding saveConfig raises no error toast', async () => {
    const { component, messages } = renderForCreate({ saveConfigRejects: false });
    const fetchSpy = stubFetchOk();
    try {
      await submitAndFlush(component);

      expect(messages.error).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('§4.2: create body falls back to the saved template subtitle when the per-upload field is blank', async () => {
    const { component, createDocumentCalls } = renderForCreate({
      saveConfigRejects: false,
      perUploadSubtitle: '   ',
    });
    const fetchSpy = stubFetchOk();
    try {
      await submitAndFlush(component);

      expect(createDocumentCalls).toHaveLength(1);
      expect(createDocumentCalls[0].previewWatermarkSubtitle).toBe(TEMPLATE_SUBTITLE);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  /**
   * §4.2 regression guard. Create mode fires three calls in order: `POST /documents` →
   * `PUT /documents/{id}` (attaches the file) → `POST /documents/{id}/watermark-config`. The PUT
   * used to send the raw per-upload subtitle, which is blank far more often than not; that was
   * harmless only because the third call happened to rewrite the subtitle afterwards. Now that the
   * third call is narrowed to the personalized-appearance fields (§4.1.2) the PUT is the last
   * writer, so a blank subtitle there would become the value buyers actually see on the preview.
   * All three calls must carry the same resolved subtitle and the ordering must stop mattering.
   */
  it('§4.2: the file-attach PUT sends the resolved subtitle too — never the blank per-upload field', async () => {
    const { component, createDocumentCalls } = renderForCreate({
      saveConfigRejects: false,
      perUploadSubtitle: '   ',
    });
    const putBodies: UpdateSellerDocumentRequest[] = [];
    const fetchSpy = stubFetchOk(putBodies);
    try {
      await submitAndFlush(component);

      expect(putBodies).toHaveLength(1);
      expect(putBodies[0].previewWatermarkSubtitle).toBe(TEMPLATE_SUBTITLE);
      expect(putBodies[0].previewWatermarkSubtitle).toBe(
        createDocumentCalls[0].previewWatermarkSubtitle,
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('§4.2: a non-blank per-upload subtitle reaches the PUT unchanged as well', async () => {
    const { component } = renderForCreate({
      saveConfigRejects: false,
      perUploadSubtitle: '  ตัวอย่างเท่านั้น  ',
    });
    const putBodies: UpdateSellerDocumentRequest[] = [];
    const fetchSpy = stubFetchOk(putBodies);
    try {
      await submitAndFlush(component);

      expect(putBodies[0].previewWatermarkSubtitle).toBe('ตัวอย่างเท่านั้น');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  /**
   * AC-09: the seven appearance properties used to be dropped on the floor by `POST /documents`
   * and had to be smuggled in by the follow-up watermark-config call — a call wrapped in an empty
   * `catch`. They now belong to the create request itself, and must all arrive in ONE call.
   */
  it('AC-09: the single createDocument call carries all seven watermark appearance properties', async () => {
    const { component, createDocumentCalls } = renderForCreate({ saveConfigRejects: false });
    const fetchSpy = stubFetchOk();
    try {
      await submitAndFlush(component);

      expect(createDocumentCalls).toHaveLength(1);
      const body = createDocumentCalls[0];
      expect(body.previewWatermarkPosition).toBe('tile');
      expect(body.previewWatermarkOpacity).toBe(0.91);
      expect(body.previewWatermarkColor).toBe('#123456');
      expect(body.previewWatermarkRotation).toBe(33);
      expect(body.previewWatermarkFontSize).toBe(77);
      expect(body.personalizedWatermarkPosition).toBe('footer');
      expect(body.personalizedWatermarkTemplate).toBe('ผู้ซื้อ {email}');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('AC-09 (document-watermark-scope-options §3.2): the create body also states Option A explicitly', async () => {
    const { component, createDocumentCalls } = renderForCreate({ saveConfigRejects: false });
    const fetchSpy = stubFetchOk();
    try {
      component.previewWatermark.set(false);
      await submitAndFlush(component);

      expect(createDocumentCalls[0].previewWatermarkEnabled).toBe(false);
      expect(createDocumentCalls[0].watermarkEnabled).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('§4.1.2: the watermark-config call carries only the five personalized-appearance fields', async () => {
    const { component, saveConfigCalls } = renderForCreate({ saveConfigRejects: false });
    const fetchSpy = stubFetchOk();
    try {
      await submitAndFlush(component);

      expect(saveConfigCalls).toHaveLength(1);
      expect(saveConfigCalls[0].body).toEqual({
        personalizedWatermarkFontFamily: 'Sarabun',
        personalizedWatermarkColor: '#0f172a',
        personalizedWatermarkOpacity: 0.4,
        personalizedWatermarkRotation: 0,
        personalizedWatermarkFontSize: 11,
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('§4.1.2: no personalized-appearance field set → the third call is skipped entirely', async () => {
    const { component, saveConfigCalls, messages } = renderForCreate({
      saveConfigRejects: true,
      withPersonalizedAppearance: false,
    });
    const fetchSpy = stubFetchOk();
    try {
      await submitAndFlush(component);

      expect(saveConfigCalls).toHaveLength(0);
      expect(messages.error).not.toHaveBeenCalled();
      expect(messages.success).toHaveBeenCalledWith('ส่งเอกสารเข้าระบบตรวจสอบเรียบร้อยแล้ว');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('§4.2: a non-blank per-upload subtitle still wins over the saved template subtitle', async () => {
    const { component, createDocumentCalls } = renderForCreate({
      saveConfigRejects: false,
      perUploadSubtitle: '  ตัวอย่างเท่านั้น  ',
    });
    const fetchSpy = stubFetchOk();
    try {
      await submitAndFlush(component);

      expect(createDocumentCalls[0].previewWatermarkSubtitle).toBe('ตัวอย่างเท่านั้น');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

/**
 * document-watermark-scope-options v1 §4.1–§4.3 — AC-21..AC-24: two genuinely independent
 * watermark switches on `/seller/upload`.
 *  - A (`preview-watermark-enabled`) stamps the PUBLIC preview: preview pages, cover, gallery.
 *  - B (`watermark-enabled`, the existing one) stamps the buyer's DOWNLOADED file.
 * All four on/off combinations are valid, and each has its own policy lock (§3.1 — A's lock never
 * looks at the file's watermark capability).
 *
 * These specs spread the flags onto the *mapped* `DocumentItem` — the page's real input — so they
 * stay focused on what the page does with the values. That the mapper now reads them off the wire
 * instead of hard-coding them is covered separately in `mappers.spec.ts`.
 */
describe('SellerUploadPage — preview/download watermark switches (document-watermark-scope-options v1 §4)', () => {
  const PREVIEW_MANDATORY = 'ระบบกำหนดให้ตัวอย่างสาธารณะต้องมีลายน้ำเสมอ';
  const PREVIEW_OFF_WARNING = 'ปิดลายน้ำตัวอย่างแล้ว ภาพตัวอย่างของคุณจะถูกคัดลอกไปใช้ได้ง่ายขึ้น';

  function renderForScope(docOverrides: Partial<DocumentItem> = {}) {
    const rawDoc = {
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสารทดสอบ',
      shortDescription: 'คำอธิบายสั้น',
      price: 300,
    };
    const doc: DocumentItem = {
      ...mapSellerDocument(rawDoc as SellerDocumentResponse),
      ...docOverrides,
    };

    const fakeSellerForEdit: Partial<SellerService> = {
      fetchDocumentForEdit: async () => doc,
      fetchDocumentMainFiles: async () => [],
      myDocuments: signal<ReturnType<typeof mapSellerDocument>[]>([]),
      refreshDocuments: async () => {},
      updateDocument: async () => {},
    };

    TestBed.configureTestingModule({
      imports: [SellerUploadPage],
      providers: [
        provideRouter([]),
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ id: 'doc-1' })) },
        },
        {
          provide: CatalogService,
          useValue: { loadCategories: () => {}, getCategoryById: () => undefined },
        },
        { provide: SellerService, useValue: fakeSellerForEdit },
        {
          provide: NzMessageService,
          useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
        { provide: PlatformStatsService, useValue: { stats: () => undefined, loadStats: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(SellerUploadPage);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  async function settleLoad(fixture: { detectChanges: () => void }): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function checkbox(fixture: { nativeElement: unknown }, name: string): HTMLInputElement {
    const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      `input[name="${name}"]`,
    );
    expect(el).not.toBeNull();
    return el as HTMLInputElement;
  }

  it('AC-21: create mode renders both switches side by side, preview watermark defaulting to on', () => {
    const fixture = render(undefined);
    const component = fixture.componentInstance;

    expect(component.previewWatermark()).toBe(true);
    expect(checkbox(fixture, 'preview-watermark-enabled')).toBeTruthy();
    expect(checkbox(fixture, 'watermark-enabled')).toBeTruthy();
  });

  it('AC-21: edit mode loads the document\'s own previewWatermarkEnabled (not a stale default)', async () => {
    const { fixture, component } = renderForScope({
      previewWatermarkEnabled: false,
      watermarkEnabled: true,
    });
    await settleLoad(fixture);

    expect(component.previewWatermark()).toBe(false);
    expect(component.watermark()).toBe(true);
    expect(checkbox(fixture, 'preview-watermark-enabled').checked).toBe(false);
    expect(checkbox(fixture, 'watermark-enabled').checked).toBe(true);
  });

  it('AC-22: previewWatermarkPolicyLocked disables switch A, forces it on and explains why', async () => {
    const { fixture, component } = renderForScope({
      previewWatermarkEnabled: false,
      previewWatermarkPolicyLocked: true,
    });
    await settleLoad(fixture);

    expect(component.previewWatermarkPolicyLocked()).toBe(true);
    expect(component.previewWatermark()).toBe(true);
    expect(checkbox(fixture, 'preview-watermark-enabled').disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(PREVIEW_MANDATORY);
  });

  it('AC-22: an unlocked switch A stays editable and shows no mandatory line', async () => {
    const { fixture, component } = renderForScope({
      previewWatermarkEnabled: true,
      previewWatermarkPolicyLocked: false,
    });
    await settleLoad(fixture);

    expect(checkbox(fixture, 'preview-watermark-enabled').disabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(PREVIEW_MANDATORY);
    expect(component.previewWatermark()).toBe(true);
  });

  it('§4.2: turning switch A off by choice shows the copy-risk warning', async () => {
    const { fixture, component } = renderForScope({ previewWatermarkEnabled: true });
    await settleLoad(fixture);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(PREVIEW_OFF_WARNING);

    component.previewWatermark.set(false);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(PREVIEW_OFF_WARNING);
  });

  it('§1.1: the two locks are independent — B locked never locks A, and vice versa', async () => {
    const bLocked = renderForScope({
      watermarkEnabled: false,
      watermarkPolicyLocked: true,
      previewWatermarkEnabled: false,
      previewWatermarkPolicyLocked: false,
    });
    await settleLoad(bLocked.fixture);

    expect(bLocked.component.watermark()).toBe(true);
    expect(bLocked.component.previewWatermark()).toBe(false);
    expect(checkbox(bLocked.fixture, 'watermark-enabled').disabled).toBe(true);
    expect(checkbox(bLocked.fixture, 'preview-watermark-enabled').disabled).toBe(false);

    TestBed.resetTestingModule();

    const aLocked = renderForScope({
      watermarkEnabled: false,
      watermarkPolicyLocked: false,
      previewWatermarkEnabled: false,
      previewWatermarkPolicyLocked: true,
    });
    await settleLoad(aLocked.fixture);

    expect(aLocked.component.previewWatermark()).toBe(true);
    expect(aLocked.component.watermark()).toBe(false);
    expect(checkbox(aLocked.fixture, 'preview-watermark-enabled').disabled).toBe(true);
    expect(checkbox(aLocked.fixture, 'watermark-enabled').disabled).toBe(false);
  });

  it('§4.2: the review step lists the two watermarks on separate rows', async () => {
    const { fixture, component } = renderForScope({
      previewWatermarkEnabled: false,
      watermarkEnabled: true,
    });
    await settleLoad(fixture);
    component.step.set(4);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ลายน้ำตัวอย่าง');
    expect(text).toContain('ลายน้ำไฟล์ดาวน์โหลด');
    expect(text).toContain('ปิดใช้งาน');
    expect(text).toContain('เปิดใช้งาน');
  });

  it('§4.3: the main-file list states that a new version inherits the current settings', async () => {
    const { fixture } = renderForScope({
      mainFiles: [
        {
          id: 'file-1',
          storageKey: 'k1',
          originalFileName: 'f1.pdf',
          uploadedAt: '',
          isListedForSale: true,
        },
      ],
    });
    await settleLoad(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'ไฟล์เวอร์ชันใหม่จะใช้การตั้งค่าลายน้ำเดิมของเอกสารนี้',
    );
  });
});

/**
 * document-watermark-scope-options v1 §4.3 — AC-23/AC-24: what the version-confirmation modal
 * actually hands to `SellerService.setListedMainFile`. The rule the backend depends on (§3.6):
 * an omitted key means "inherit the document's setting", so an untouched modal must not put
 * `previewWatermarkEnabled`/`watermarkEnabled` into the options object at all — not even as
 * `null`/`undefined`.
 *
 * These specs assert the options object the modal hands to the service; the other half of the
 * rule — that `SellerService.setListedMainFile` then keeps those keys out of the serialized HTTP
 * body — is asserted against the real request in `seller.service.spec.ts`.
 */
describe('SellerUploadPage — version modal watermark override (document-watermark-scope-options v1 §4.3)', () => {
  type ListedOptions = {
    isNewVersion: boolean;
    changeNote?: string;
    previewWatermarkEnabled?: boolean;
    watermarkEnabled?: boolean;
  };

  function openModal(options: { previewWatermark: boolean; downloadWatermark: boolean }) {
    const setListedSpy = vi.fn().mockResolvedValue({ id: 'doc-1', status: 'approved' });
    Object.assign(fakeSeller, { setListedMainFile: setListedSpy });

    const fixture = render(undefined);
    const component = fixture.componentInstance;
    component.editId.set('doc-1');
    component.previewWatermark.set(options.previewWatermark);
    component.watermark.set(options.downloadWatermark);
    component.mainFiles.set([
      {
        id: 'file-1',
        storageKey: 'k1',
        originalFileName: 'f1.pdf',
        uploadedAt: '',
        isListedForSale: false,
      },
    ]);
    component.editDocument.set({
      id: 'doc-1',
      status: 'approved',
      salesCount: 5,
    } as unknown as DocumentItem);

    component.selectListedMainFile('file-1');
    return { component, setListedSpy };
  }

  function lastOptions(setListedSpy: ReturnType<typeof vi.fn>): ListedOptions {
    expect(setListedSpy).toHaveBeenCalledTimes(1);
    return setListedSpy.mock.calls[0][2] as ListedOptions;
  }

  it('copies the document\'s current settings into the modal and clears the override every time', () => {
    const { component } = openModal({ previewWatermark: false, downloadWatermark: true });

    expect(component.versionModalVisible()).toBe(true);
    expect(component.versionWatermarkOverride()).toBe(false);
    expect(component.versionPreviewWatermark()).toBe(false);
    expect(component.versionDownloadWatermark()).toBe(true);

    // A second open must not leak the previous session's override state.
    component.versionWatermarkOverride.set(true);
    component.cancelVersionModal();
    component.selectListedMainFile('file-1');
    expect(component.versionWatermarkOverride()).toBe(false);
  });

  it('AC-23: confirming without ticking the override omits both watermark keys entirely', () => {
    const { component, setListedSpy } = openModal({
      previewWatermark: true,
      downloadWatermark: true,
    });

    component.confirmVersionModal();

    const options = lastOptions(setListedSpy);
    expect('previewWatermarkEnabled' in options).toBe(false);
    expect('watermarkEnabled' in options).toBe(false);
    expect(options.isNewVersion).toBe(false);
  });

  it('AC-23: even flipping the modal switches sends nothing while the override box is unticked', () => {
    const { component, setListedSpy } = openModal({
      previewWatermark: true,
      downloadWatermark: true,
    });

    component.versionPreviewWatermark.set(false);
    component.versionDownloadWatermark.set(false);
    component.confirmVersionModal();

    const options = lastOptions(setListedSpy);
    expect('previewWatermarkEnabled' in options).toBe(false);
    expect('watermarkEnabled' in options).toBe(false);
  });

  it('AC-24: with the override ticked, only the switch the seller actually moved is sent', () => {
    const { component, setListedSpy } = openModal({
      previewWatermark: true,
      downloadWatermark: true,
    });

    component.versionWatermarkOverride.set(true);
    component.versionPreviewWatermark.set(false);
    component.confirmVersionModal();

    const options = lastOptions(setListedSpy);
    expect(options.previewWatermarkEnabled).toBe(false);
    expect('watermarkEnabled' in options).toBe(false);
  });

  it('AC-24: both switches moved → both keys travel, with the seller\'s values', () => {
    const { component, setListedSpy } = openModal({
      previewWatermark: true,
      downloadWatermark: false,
    });

    component.versionWatermarkOverride.set(true);
    component.versionPreviewWatermark.set(false);
    component.versionDownloadWatermark.set(true);
    component.isNewVersionOption.set(true);
    component.changeNoteInput.set('เปลี่ยนไฟล์ + ปิดลายน้ำตัวอย่าง');
    component.confirmVersionModal();

    const options = lastOptions(setListedSpy);
    expect(options.previewWatermarkEnabled).toBe(false);
    expect(options.watermarkEnabled).toBe(true);
    expect(options.isNewVersion).toBe(true);
    expect(options.changeNote).toBe('เปลี่ยนไฟล์ + ปิดลายน้ำตัวอย่าง');
  });

  it('AC-24: ticking the override but changing nothing still omits both keys', () => {
    const { component, setListedSpy } = openModal({
      previewWatermark: false,
      downloadWatermark: true,
    });

    component.versionWatermarkOverride.set(true);
    component.confirmVersionModal();

    const options = lastOptions(setListedSpy);
    expect('previewWatermarkEnabled' in options).toBe(false);
    expect('watermarkEnabled' in options).toBe(false);
  });
});

