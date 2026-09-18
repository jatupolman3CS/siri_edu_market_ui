import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerUploadPage } from './upload.page';
import { CatalogService, PlatformStatsService, SellerService } from '../../../core/services';
import { mapSellerDocument } from '../../../core/api-mappers/mappers';
import { downloadUrlForStorageKey } from '../../../core/api-runtime';
import type { DocumentItem, PlatformStats } from '../../../core/models';
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

