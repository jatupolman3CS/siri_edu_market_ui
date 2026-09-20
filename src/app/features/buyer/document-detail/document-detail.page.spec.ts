import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { of } from 'rxjs';
import { BuyerDocumentDetailPage } from './document-detail.page';
import {
  AuthService,
  BundleService,
  CartService,
  CatalogService,
  FollowService,
  LibraryService,
  NavigationSourceService,
  RecentlyViewedService,
  WishlistService,
} from '../../../core/services';
import { idleActionState } from '../../../core/services/action-state';
import { mapDocumentDetail } from '../../../core/api-mappers/mappers';
import type { BoughtTogetherItem, Bundle, DocumentItem } from '../../../core/models';

/**
 * document-bundle-cross-sell v1 §4 / §1 test list — "ในแพ็กเกจที่คุ้มกว่า" cross-sell section:
 *  - AC-8: shows the section with >=1 bundle, hides the whole section (no empty state) with 0
 *  - AC-9: "ประหยัด N%" badge + strikethrough original price only when originalPrice > price
 *  - skeleton (no text) while `BundleService.loadBundlesContainingDocument` is pending
 *  - exact Thai copy from spec §4 (header / subtitle / badges / pill / button)
 *
 * `BundleService` is faked here — round 1 is a stub (`loadBundlesContainingDocument` always
 * resolves to `[]` for real), so the fake lets these specs drive the page as if the endpoint
 * already existed, matching what round 2 (SDK wired) will do.
 */

const fakeAuth = { isAuthenticated: () => false, accessToken: () => undefined, user: () => null };
const fakeCart = { has: () => false, openDrawer: vi.fn(), add: vi.fn() };
const fakeWishlist = { has: () => false, toggle: vi.fn() };
const fakeFollow = { toggle: vi.fn(), isFollowing: () => false, hydrateFromApi: vi.fn(async () => {}) };
const fakeLibrary = {
  library: () => [],
  refreshLibraryOnce: vi.fn(async () => {}),
  download: vi.fn(),
};
const fakeRecent = { push: vi.fn() };

function buildDoc(over: Partial<DocumentItem> = {}): DocumentItem {
  const base = mapDocumentDetail({
    id: 'doc-1',
    slug: 'doc-1',
    title: 'สรุปคณิต ม.6',
    shortDescription: 'สรุปเข้มก่อนสอบ',
    description: 'สรุปเนื้อหาคณิตศาสตร์ ม.6 ครบทุกบท',
    price: 49,
    seller: { id: 'seller-1', studioName: 'ครูเอ' },
    reviews: [],
    categoryIds: [],
  });
  return { ...base, ...over };
}

function buildBundle(id: string, over: Partial<Bundle> = {}): Bundle {
  return {
    id,
    slug: id,
    title: `แพ็กเกจ ${id}`,
    description: 'รวมเอกสารคุ้ม ๆ',
    cover: 'https://example.test/cover.jpg',
    price: 150,
    originalPrice: 200,
    // Deliberately diverges from `documentCount` below: `BundleResponse` (paged) never sends
    // member document ids (mapBundle always maps this to `[]` — see core/models/index.ts), so a
    // single-element stub here proves the "N เอกสาร" pill assertions actually read
    // `documentCount` and not `documentIds.length` (integrator-qa gate-close fixture fix,
    // document-bundle-cross-sell v1).
    documentIds: ['doc-1'],
    documentCount: 2,
    seller: {
      id: 'seller-1',
      studioName: 'ครูเอ',
      ownerName: 'เอ',
      avatar: '',
      bio: '',
      joinedAt: '2026-01-01T00:00:00Z',
      rating: 4.5,
      totalSales: 10,
      totalDocuments: 5,
      followerCount: 20,
      responseHours: 1,
      badges: [],
    },
    createdAt: '2026-01-01T00:00:00Z',
    rating: 4.7,
    reviewCount: 12,
    downloads: 340,
    ...over,
  };
}

function buildCatalog(doc: DocumentItem | undefined) {
  return {
    documentDetailState: () => idleActionState(),
    getById: () => doc,
    getCategoryById: () => undefined,
    getSubcategoryById: () => undefined,
    documents: () => [],
    getRelated: () => [],
    loadDocumentDetail: vi.fn(),
    askDocumentQuestion: vi.fn(async () => {}),
    loadDocumentPreview: vi.fn(async () => ({})),
    updateSellerFollowerCount: vi.fn(),
    fetchSellerProfile: vi.fn(async () => null),
    // ml-embedding-recommendations v1 §4.3: "มักซื้อคู่กับเอกสารนี้" — non-blocking, resolves []
    // by default so every existing spec in this file keeps rendering exactly as before.
    loadBoughtTogether: vi.fn(async (): Promise<BoughtTogetherItem[]> => []),
    // pdf-preview-popup-and-i18n-fix v1 §4: stub so openPreview(true) on PDF docs doesn't error
    loadDocumentPreviewPdf: vi.fn(async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
  };
}

function render(bundlesResult: () => Promise<Bundle[]>) {
  const doc = buildDoc();
  const fakeBundleService = {
    loadBundlesContainingDocument: vi.fn(bundlesResult),
  };
  const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };

  TestBed.configureTestingModule({
    imports: [BuyerDocumentDetailPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: fakeRoute },
      { provide: AuthService, useValue: fakeAuth },
      { provide: CatalogService, useValue: buildCatalog(doc) },
      { provide: CartService, useValue: fakeCart },
      { provide: WishlistService, useValue: fakeWishlist },
      { provide: FollowService, useValue: fakeFollow },
      { provide: LibraryService, useValue: fakeLibrary },
      { provide: RecentlyViewedService, useValue: fakeRecent },
      { provide: BundleService, useValue: fakeBundleService },
    ],
  });

  const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
  fixture.detectChanges();
  return { fixture, fakeBundleService };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => TestBed.resetTestingModule());

describe('BuyerDocumentDetailPage — cross-sell "ในแพ็กเกจที่คุ้มกว่า" (document-bundle-cross-sell v1)', () => {
  it('AC-8: shows the section with the exact header/subtitle copy when there is at least one bundle', async () => {
    const { fixture } = render(async () => [buildBundle('bundle-1')]);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ในแพ็กเกจที่คุ้มกว่า');
    expect(text).toContain('เอกสารนี้รวมอยู่ในแพ็กเกจด้านล่าง ซื้อยกแพ็กคุ้มกว่า');
    expect(text).toContain('📦 BUNDLE');
    expect(text).toContain('2 เอกสาร');
    expect(text).toContain('ดูแพ็กเกจ');
  });

  it('AC-9: shows "ประหยัด N%" badge, strikethrough original price, and "ประหยัด ฿{n}" when originalPrice > price', async () => {
    const { fixture } = render(async () => [buildBundle('bundle-1', { price: 150, originalPrice: 200 })]);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ประหยัด 25%');
    expect(text).toContain('ประหยัด ฿50');

    const strikethrough = (fixture.nativeElement as HTMLElement).querySelector('.line-through');
    expect(strikethrough?.textContent?.trim()).toBe('฿200');
  });

  it('AC-9: hides the discount badge and strikethrough price when originalPrice === price', async () => {
    const { fixture } = render(async () => [buildBundle('bundle-1', { price: 200, originalPrice: 200 })]);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ประหยัด');
    expect((fixture.nativeElement as HTMLElement).querySelector('.line-through')).toBeNull();
  });

  it('AC-8: hides the whole section (no empty state) when there are no bundles', async () => {
    const { fixture } = render(async () => []);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ในแพ็กเกจที่คุ้มกว่า');
  });

  it('shows 3 skeleton cards with no text while loading, and no fabricated bundle data', () => {
    let resolveBundles!: (value: Bundle[]) => void;
    const pending = new Promise<Bundle[]>((resolve) => {
      resolveBundles = resolve;
    });
    const { fixture } = render(() => pending);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    // Scoped to this section: the sibling "มักซื้อคู่กับเอกสารนี้" section (ml-embedding-recommendations
    // v1 §4.3) also renders skeleton cards of its own while its independent load is in flight.
    const section = Array.from(root.querySelectorAll('section')).find((s) =>
      s.textContent?.includes('ในแพ็กเกจที่คุ้มกว่า'),
    );
    expect(section).toBeDefined();
    const skeletons = section!.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
    expect(root.textContent ?? '').not.toContain('ดูแพ็กเกจ');
    expect(root.textContent ?? '').not.toContain('📦 BUNDLE');

    // avoid an unresolved promise leaking into the next test
    resolveBundles([]);
  });
});

/**
 * ml-embedding-recommendations v1 §4.1/§4.3/§4.4 — "มักซื้อคู่กับเอกสารนี้": non-blocking, hides
 * entirely (no empty state) when there are 0 items or the call fails, shows skeleton cards
 * (no text) while loading, and the exact Thai copy from §4.4.
 */
describe('BuyerDocumentDetailPage — "มักซื้อคู่กับเอกสารนี้" (ml-embedding-recommendations v1 §4.3)', () => {
  function boughtTogetherItem(id: string, coPurchaseCount = 3): BoughtTogetherItem {
    return { document: buildDoc({ id, title: `เอกสาร ${id}` }), coPurchaseCount };
  }

  function renderWithBoughtTogether(boughtTogetherResult: () => Promise<BoughtTogetherItem[]>) {
    const doc = buildDoc();
    const catalog = buildCatalog(doc);
    catalog.loadBoughtTogether = vi.fn(boughtTogetherResult);
    const fakeBundleService = { loadBundlesContainingDocument: vi.fn(async () => []) };
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: catalog },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: fakeFollow },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: fakeBundleService },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    return { fixture, catalog };
  }

  it('shows the section with the exact copy + coPurchaseCount badge when there is >=1 item', async () => {
    const { fixture, catalog } = renderWithBoughtTogether(async () => [boughtTogetherItem('doc-2', 5)]);
    await settle();
    fixture.detectChanges();

    expect(catalog.loadBoughtTogether).toHaveBeenCalledWith('doc-1', 6);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('มักซื้อคู่กับเอกสารนี้');
    expect(text).toContain('ผู้ที่ซื้อเอกสารนี้มักซื้อเอกสารเหล่านี้ด้วย');
    expect(text).toContain('ซื้อคู่กันแล้ว 5 ครั้ง');
    expect(text).toContain('เอกสาร doc-2');
  });

  it('hides the whole section (no empty state) when there are no items', async () => {
    const { fixture } = renderWithBoughtTogether(async () => []);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('มักซื้อคู่กับเอกสารนี้');
  });

  it('shows 6 skeleton cards with no text while loading, and no fabricated data', () => {
    let resolveItems!: (value: BoughtTogetherItem[]) => void;
    const pending = new Promise<BoughtTogetherItem[]>((resolve) => {
      resolveItems = resolve;
    });
    const { fixture } = renderWithBoughtTogether(() => pending);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const section = Array.from(root.querySelectorAll('section')).find((s) =>
      s.textContent?.includes('มักซื้อคู่กับเอกสารนี้'),
    );
    expect(section).toBeDefined();
    expect(section!.querySelectorAll('.animate-pulse').length).toBe(6);
    expect(section!.textContent ?? '').not.toContain('ซื้อคู่กันแล้ว');

    // avoid an unresolved promise leaking into the next test
    resolveItems([]);
  });
});

/**
 * Q-05: `discountPercent` badge on the price card and cover pill — the response never sends
 * `discountPercent`, so the page must derive it from `price`/`originalPrice` (same helper the
 * cross-sell bundle cards above already use) instead of rendering `d.discountPercent` (always
 * `undefined`) blank.
 */
describe('BuyerDocumentDetailPage — discount badge (Q-05)', () => {
  function renderDoc(doc: DocumentItem) {
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    const fakeBundleService = { loadBundlesContainingDocument: vi.fn(async () => []) };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: buildCatalog(doc) },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: fakeFollow },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: fakeBundleService },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  it('shows "ประหยัด N%" in the price card when originalPrice > price', () => {
    const doc = buildDoc({ price: 150, originalPrice: 200 });
    const fixture = renderDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ประหยัด 25%');
  });

  it('shows the "-N% ส่วนลด" cover pill when originalPrice > price', () => {
    const doc = buildDoc({ price: 150, originalPrice: 200 });
    const fixture = renderDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('-25% ส่วนลด');
  });

  it('renders no discount badge at all when there is no originalPrice', () => {
    const doc = buildDoc({ price: 150, originalPrice: undefined });
    const fixture = renderDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ส่วนลด');
    expect(text).not.toContain('ประหยัด');
  });
});

/**
 * real-data-stats v1 §4.5 (Group A — no backend needed): "สรุป N ข้อโดย AI" reads
 * `d.aiSummary.length` instead of a hardcoded "3", and the whole tab is hidden with nothing to
 * summarize instead of showing an empty list under the title.
 */
describe('BuyerDocumentDetailPage — AI summary count (real-data-stats v1 §4.5)', () => {
  function renderDoc(doc: DocumentItem) {
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    const fakeBundleService = { loadBundlesContainingDocument: vi.fn(async () => []) };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: buildCatalog(doc) },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: fakeFollow },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: fakeBundleService },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  /**
   * ng-zorro's `nz-tabs` only instantiates a pane's body on (or after) first activation — see
   * the identical note on `clickTabByLabel` in the FAQ describe block below. The tab nav's own
   * title ("✨ AI Summary") always renders; the "สรุป N ข้อโดย AI" text is pane *content* and
   * needs the tab clicked first.
   */
  function clickAiSummaryTab(fixture: { nativeElement: HTMLElement; detectChanges: () => void }): void {
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('.ant-tabs-tab')) as HTMLElement[];
    const target = tabs.find((el) => (el.textContent ?? '').includes('AI Summary'));
    if (!target) throw new Error('AI Summary tab not found');
    target.click();
    fixture.detectChanges();
  }

  it('shows "สรุป N ข้อโดย AI" using aiSummary.length, not a hardcoded "3"', () => {
    const doc = buildDoc({ aiSummary: ['ข้อ 1', 'ข้อ 2', 'ข้อ 3', 'ข้อ 4', 'ข้อ 5'] });
    const fixture = renderDoc(doc);
    clickAiSummaryTab(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('สรุป 5 ข้อโดย AI');
  });

  it('hides the AI Summary tab entirely when aiSummary is an empty array', () => {
    const doc = buildDoc({ aiSummary: [] });
    const fixture = renderDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    // "สรุป" alone isn't a safe check here — it's also a substring of the document title
    // "สรุปคณิต ม.6" (`buildDoc`'s default). "ข้อโดย AI" only ever comes from this feature.
    expect(text).not.toContain('AI Summary');
    expect(text).not.toContain('ข้อโดย AI');
  });

  it('hides the AI Summary tab entirely when aiSummary is undefined', () => {
    const doc = buildDoc({ aiSummary: undefined });
    const fixture = renderDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('AI Summary');
  });
});

/**
 * document-faq-tab v1 §1/§4 test list — "คำถามที่พบบ่อย (FAQ)" tab:
 *  - AC-10: tab shown only when `faqCount > 0`, badge count reads `faqCount`/`qnaCount` from
 *    the API (not `qna.length`)
 *  - AC-11: the renamed "ถาม-ตอบ" tab keeps working (no regression)
 *  - FAQ list = `isFaq` items sorted by `faqSortOrder` ascending, tie-break `answeredAt` oldest→newest
 *  - "ยังไม่มีคำถามที่พบบ่อย" when `faqCount > 0` but the filtered list is empty (stub-round shape)
 */
describe('BuyerDocumentDetailPage — FAQ tab (document-faq-tab v1)', () => {
  /**
   * ng-zorro's `nz-tabs` only instantiates a pane's body on (or after) first activation
   * (`nzSelectedIndex === $index || tab.hasBeenActive`) — inactive panes are simply absent from
   * the DOM, not just CSS-hidden. Tests that assert tab *content* (as opposed to the nav bar's
   * title/badge, which always renders) must first click the tab to activate it.
   */
  function clickTabByLabel(fixture: { nativeElement: HTMLElement; detectChanges: () => void }, labelSubstring: string): void {
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('.ant-tabs-tab')) as HTMLElement[];
    const target = tabs.find((el) => (el.textContent ?? '').includes(labelSubstring));
    if (!target) throw new Error(`tab not found: ${labelSubstring}`);
    target.click();
    fixture.detectChanges();
  }

  function renderWithDoc(doc: DocumentItem) {
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    const fakeBundleService = { loadBundlesContainingDocument: vi.fn(async () => []) };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: buildCatalog(doc) },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: fakeFollow },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: fakeBundleService },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  it('AC-10: hides the FAQ tab and its exact copy when faqCount is 0', () => {
    const doc = buildDoc({ qna: [], faqCount: 0, qnaCount: 0 });
    const fixture = renderWithDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('คำถามที่พบบ่อย (FAQ)');
  });

  it('AC-10: shows the FAQ tab with the badge count from faqCount, not qna.length', () => {
    const doc = buildDoc({
      faqCount: 1,
      qnaCount: 3,
      qna: [
        { id: 'q-1', buyerName: 'A', buyerAvatar: '', question: 'Q1', askedAt: '2026-08-01T00:00:00Z', isFaq: true, faqSortOrder: 0, answer: { text: 'A1', answeredAt: '2026-08-02T00:00:00Z' } },
        { id: 'q-2', buyerName: 'B', buyerAvatar: '', question: 'Q2', askedAt: '2026-08-01T00:00:00Z', isFaq: false, faqSortOrder: 0 },
        { id: 'q-3', buyerName: 'C', buyerAvatar: '', question: 'Q3', askedAt: '2026-08-01T00:00:00Z', isFaq: false, faqSortOrder: 0 },
      ],
    });
    const fixture = renderWithDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    // Badge count reads faqCount (1), not qna.length (3) and not the isFaq-filtered count.
    expect(text).toContain('คำถามที่พบบ่อย (FAQ) (1)');
  });

  it('renders the FAQ answer under the exact "คำตอบจากผู้ขาย" heading', () => {
    const doc = buildDoc({
      faqCount: 1,
      qnaCount: 1,
      qna: [
        {
          id: 'q-1',
          buyerName: 'A',
          buyerAvatar: '',
          question: 'มีบทที่ 5 ไหม',
          askedAt: '2026-08-01T00:00:00Z',
          isFaq: true,
          faqSortOrder: 0,
          answer: { text: 'มีค่ะ ครบทุกบท', answeredAt: '2026-08-02T00:00:00Z' },
        },
      ],
    });
    const fixture = renderWithDoc(doc);
    clickTabByLabel(fixture, 'คำถามที่พบบ่อย (FAQ)');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('คำตอบจากผู้ขาย');
    expect(text).toContain('มีค่ะ ครบทุกบท');
  });

  it('shows "ยังไม่มีคำถามที่พบบ่อย" when faqCount > 0 but no item in the array is actually pinned (defensive: count/array mismatch never crashes)', () => {
    const doc = buildDoc({
      faqCount: 2,
      qnaCount: 2,
      qna: [
        { id: 'q-1', buyerName: 'A', buyerAvatar: '', question: 'Q1', askedAt: '2026-08-01T00:00:00Z', isFaq: false, faqSortOrder: 0 },
        { id: 'q-2', buyerName: 'B', buyerAvatar: '', question: 'Q2', askedAt: '2026-08-01T00:00:00Z', isFaq: false, faqSortOrder: 0 },
      ],
    });
    const fixture = renderWithDoc(doc);
    clickTabByLabel(fixture, 'คำถามที่พบบ่อย (FAQ)');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่มีคำถามที่พบบ่อย');
  });

  it('sorts FAQ items by faqSortOrder ascending, tie-break by answeredAt oldest→newest', () => {
    const doc = buildDoc({
      faqCount: 3,
      qnaCount: 3,
      qna: [
        { id: 'q-late', buyerName: 'A', buyerAvatar: '', question: 'คำถามลำดับ 2 (ตอบทีหลัง)', askedAt: '2026-08-01T00:00:00Z', isFaq: true, faqSortOrder: 1, answer: { text: '-', answeredAt: '2026-08-05T00:00:00Z' } },
        { id: 'q-early', buyerName: 'B', buyerAvatar: '', question: 'คำถามลำดับ 2 (ตอบก่อน)', askedAt: '2026-08-01T00:00:00Z', isFaq: true, faqSortOrder: 1, answer: { text: '-', answeredAt: '2026-08-03T00:00:00Z' } },
        { id: 'q-first', buyerName: 'C', buyerAvatar: '', question: 'คำถามลำดับ 0', askedAt: '2026-08-01T00:00:00Z', isFaq: true, faqSortOrder: 0, answer: { text: '-', answeredAt: '2026-08-09T00:00:00Z' } },
      ],
    });
    const fixture = renderWithDoc(doc);
    clickTabByLabel(fixture, 'คำถามที่พบบ่อย (FAQ)');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    const posFirst = text.indexOf('คำถามลำดับ 0');
    const posEarly = text.indexOf('คำถามลำดับ 2 (ตอบก่อน)');
    const posLate = text.indexOf('คำถามลำดับ 2 (ตอบทีหลัง)');

    expect(posFirst).toBeGreaterThanOrEqual(0);
    expect(posEarly).toBeGreaterThanOrEqual(0);
    expect(posLate).toBeGreaterThanOrEqual(0);
    // faqSortOrder 0 before faqSortOrder 1 group
    expect(posFirst).toBeLessThan(posEarly);
    // within the faqSortOrder:1 tie, older answeredAt (q-early) comes before newer (q-late)
    expect(posEarly).toBeLessThan(posLate);
  });

  it('AC-11: the renamed "ถาม-ตอบ" tab still shows its badge count and existing Q&A list (no regression)', () => {
    const doc = buildDoc({
      qnaCount: 2,
      qna: [
        { id: 'q-1', buyerName: 'A', buyerAvatar: '', question: 'คำถามทั่วไป', askedAt: '2026-08-01T00:00:00Z', isFaq: false, faqSortOrder: 0 },
        { id: 'q-2', buyerName: 'B', buyerAvatar: '', question: 'อีกคำถาม', askedAt: '2026-08-01T00:00:00Z', isFaq: false, faqSortOrder: 0 },
      ],
    });
    const fixture = renderWithDoc(doc);
    clickTabByLabel(fixture, 'ถาม-ตอบ');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ถาม-ตอบ (2)');
    expect(text).toContain('คำถามทั่วไป');
    expect(text).toContain('อีกคำถาม');
  });
});

/**
 * Preview-tab empty state regression: `GetPreviewAsync` on the backend always returns a
 * non-empty `excerptLines` (real content, or its own hardcoded "Preview not available."
 * fallback when there's nothing else) — so the non-PDF "ไม่มีตัวอย่างแบบภาพสำหรับไฟล์ประเภทนี้"
 * message must be decided BEFORE the `excerptLines?.length` check, not as a trailing
 * `@else if` after it (which QA found was permanently unreachable).
 */
describe('BuyerDocumentDetailPage — preview tab empty state (non-PDF vs excerpt fallback)', () => {
  function renderWithPreview(doc: DocumentItem, previewResponse: { excerptTitle?: string; excerptLines?: string[]; previewImageUrls?: string[] }) {
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    const fakeBundleService = { loadBundlesContainingDocument: vi.fn(async () => []) };
    const catalog = {
      ...buildCatalog(doc),
      loadDocumentPreview: vi.fn(async () => previewResponse),
    };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: catalog },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: fakeFollow },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: fakeBundleService },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  function clickOpenPreview(fixture: { nativeElement: HTMLElement; detectChanges: () => void }): void {
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLElement[];
    const target = buttons.find((el) => (el.textContent ?? '').includes('เปิดพรีวิว'));
    if (!target) throw new Error('เปิดพรีวิว button not found');
    target.click();
    fixture.detectChanges();
  }

  it('non-PDF doc with no raster previews shows "ไม่มีตัวอย่างแบบภาพ" even though excerptLines is non-empty (backend fallback text)', async () => {
    const doc = buildDoc({ format: 'zip', previewPages: 3 });
    const fixture = renderWithPreview(doc, {
      excerptLines: ['Preview not available.'],
      previewImageUrls: [],
    });
    clickOpenPreview(fixture);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ไม่มีตัวอย่างแบบภาพสำหรับไฟล์ประเภทนี้');
    expect(text).not.toContain('Preview not available.');
  });

  it('PDF doc with real excerpt content still shows its excerpt text normally (regression)', async () => {
    const doc = buildDoc({ format: 'pdf', previewPages: 3 });
    const fixture = renderWithPreview(doc, {
      excerptTitle: 'บทที่ 1',
      excerptLines: ['เนื้อหาตัวอย่างบรรทัดที่ 1', 'เนื้อหาตัวอย่างบรรทัดที่ 2'],
      previewImageUrls: [],
    });
    clickOpenPreview(fixture);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('บทที่ 1');
    expect(text).toContain('เนื้อหาตัวอย่างบรรทัดที่ 1');
    expect(text).toContain('เนื้อหาตัวอย่างบรรทัดที่ 2');
    expect(text).not.toContain('ไม่มีตัวอย่างแบบภาพสำหรับไฟล์ประเภทนี้');
  });

  it('PDF doc with no rasters and empty excerptLines still shows the "ยังไม่มีตัวอย่างพรีวิว" processing message (unchanged)', async () => {
    const doc = buildDoc({ format: 'pdf', previewPages: 3 });
    const fixture = renderWithPreview(doc, {
      excerptLines: [],
      previewImageUrls: [],
    });
    clickOpenPreview(fixture);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่มีตัวอย่างพรีวิว');
  });
});

/**
 * discount-urgency v1 §1/§4 — AC-9/AC-10/AC-11: countdown vs social-proof fallback on the price
 * card, mutually exclusive, and no empty placeholder when neither applies.
 */
describe('BuyerDocumentDetailPage — discount urgency countdown / social proof (discount-urgency v1)', () => {
  function renderDoc(doc: DocumentItem) {
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    const fakeBundleService = { loadBundlesContainingDocument: vi.fn(async () => []) };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: buildCatalog(doc) },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: fakeFollow },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: fakeBundleService },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const pastIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  it('AC-9: discountExpiresAt in the future shows the countdown only, even when soldThisMonthCount > 0', () => {
    const doc = buildDoc({
      price: 150,
      originalPrice: 200,
      discountExpiresAt: futureIso,
      soldThisMonthCount: 42,
    });
    const fixture = renderDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ราคานี้ถึง');
    expect(text).not.toContain('ขายแล้ว');
    expect(text).not.toContain('ครั้งในเดือนนี้');
  });

  it('AC-10: discountExpiresAt is null and soldThisMonthCount > 0 shows social proof only', () => {
    const doc = buildDoc({
      price: 150,
      originalPrice: 200,
      discountExpiresAt: undefined,
      soldThisMonthCount: 7,
    });
    const fixture = renderDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ขายแล้ว 7 ครั้งในเดือนนี้');
    expect(text).not.toContain('ราคานี้ถึง');
  });

  it('AC-10: discountExpiresAt already in the past and soldThisMonthCount > 0 shows social proof only', () => {
    const doc = buildDoc({
      price: 150,
      originalPrice: 200,
      discountExpiresAt: pastIso,
      soldThisMonthCount: 3,
    });
    const fixture = renderDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ขายแล้ว 3 ครั้งในเดือนนี้');
    expect(text).not.toContain('ราคานี้ถึง');
  });

  it('AC-11: neither discountExpiresAt nor soldThisMonthCount shows nothing (no empty placeholder)', () => {
    const doc = buildDoc({
      price: 150,
      originalPrice: 200,
      discountExpiresAt: undefined,
      soldThisMonthCount: undefined,
    });
    const fixture = renderDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ราคานี้ถึง');
    expect(text).not.toContain('ขายแล้ว');
    expect(text).not.toContain('ครั้งในเดือนนี้');
  });

  it('AC-11: soldThisMonthCount = 0 (past/no discount) shows nothing', () => {
    const doc = buildDoc({
      price: 150,
      originalPrice: 200,
      discountExpiresAt: pastIso,
      soldThisMonthCount: 0,
    });
    const fixture = renderDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ราคานี้ถึง');
    expect(text).not.toContain('ขายแล้ว');
  });

  it('does not show the countdown/social-proof line on a free document even if fields are set', () => {
    const doc = buildDoc({
      price: 0,
      isFree: true,
      originalPrice: undefined,
      discountExpiresAt: undefined,
      soldThisMonthCount: 9,
    });
    const fixture = renderDoc(doc);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ขายแล้ว');
    expect(text).not.toContain('ครั้งในเดือนนี้');
  });
});

/**
 * seller-analytics-insights v1 §4 (AC-16/17/18/19) — the page must forward
 * `NavigationSourceService.classifyEntrySource()` straight through to
 * `catalog.loadDocumentDetail()` on mount, exactly once per navigation.
 */
describe('BuyerDocumentDetailPage — view-tracking entrySource wiring (seller-analytics-insights v1 §4)', () => {
  function renderWithNavSource(classifyEntrySource: () => { source: 'search' | 'category' | 'direct'; searchTerm?: string }) {
    const doc = buildDoc();
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    const fakeBundleService = { loadBundlesContainingDocument: vi.fn(async () => []) };
    const fakeCatalog = buildCatalog(doc);
    const fakeNavSource = { classifyEntrySource: vi.fn(classifyEntrySource) };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: fakeCatalog },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: fakeFollow },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: fakeBundleService },
        { provide: NavigationSourceService, useValue: fakeNavSource },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    return { fixture, fakeCatalog, fakeNavSource, doc };
  }

  it('AC-17: forwards a "search" classification (with searchTerm) to catalog.loadDocumentDetail on mount', () => {
    const { fakeCatalog, fakeNavSource, doc } = renderWithNavSource(() => ({
      source: 'search',
      searchTerm: 'เลข ม.3',
    }));

    expect(fakeNavSource.classifyEntrySource).toHaveBeenCalledTimes(1);
    expect(fakeCatalog.loadDocumentDetail).toHaveBeenCalledWith(doc.id, {
      source: 'search',
      searchTerm: 'เลข ม.3',
    });
  });

  it('AC-18: forwards a "category" classification to catalog.loadDocumentDetail on mount', () => {
    const { fakeCatalog, doc } = renderWithNavSource(() => ({ source: 'category' }));

    expect(fakeCatalog.loadDocumentDetail).toHaveBeenCalledWith(doc.id, { source: 'category' });
  });

  it('AC-19: forwards a "direct" classification to catalog.loadDocumentDetail on mount', () => {
    const { fakeCatalog, doc } = renderWithNavSource(() => ({ source: 'direct' }));

    expect(fakeCatalog.loadDocumentDetail).toHaveBeenCalledWith(doc.id, { source: 'direct' });
  });

  it('AC-16: classifies and loads exactly once per mount, even across extra change-detection cycles', () => {
    const { fixture, fakeCatalog, fakeNavSource } = renderWithNavSource(() => ({ source: 'direct' }));

    fixture.detectChanges();
    fixture.detectChanges();

    expect(fakeNavSource.classifyEntrySource).toHaveBeenCalledTimes(1);
    expect(fakeCatalog.loadDocumentDetail).toHaveBeenCalledTimes(1);
  });
});

/**
 * subscription-membership v2 §1 AC-24 / §4: buy-button area now has 3 states (was 2: buy /
 * already-owned-download) — adds "ดาวน์โหลด (สิทธิ์สมาชิก)" when
 * `isAccessibleViaActiveSubscription=true` and the buyer does not already own the document
 * outright. Calls the SAME existing `POST /api/library/{id}/download` endpoint the free-download
 * button already uses (`LibraryService.download`, already wired — no round-1 stub needed here).
 */
describe('BuyerDocumentDetailPage — three-state buy button (subscription-membership v2)', () => {
  function renderDoc(
    doc: DocumentItem,
    opts: { owned?: boolean; authenticated?: boolean; routes?: Parameters<typeof provideRouter>[0] } = {},
  ) {
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    const fakeBundleService = { loadBundlesContainingDocument: vi.fn(async () => []) };
    const libraryFake = {
      library: () => (opts.owned ? [{ document: doc }] : []),
      refreshLibraryOnce: vi.fn(async () => {}),
      download: vi.fn(),
    };
    const authFake = {
      isAuthenticated: () => opts.authenticated ?? true,
      accessToken: () => (opts.authenticated ?? true ? 'token' : undefined),
    };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter(opts.routes ?? []),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: authFake },
        { provide: CatalogService, useValue: buildCatalog(doc) },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: fakeFollow },
        { provide: LibraryService, useValue: libraryFake },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: fakeBundleService },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    return { fixture, libraryFake };
  }

  it('shows "ดาวน์โหลด (สิทธิ์สมาชิก)" when isAccessibleViaActiveSubscription=true and not owned', () => {
    const doc = buildDoc({ isAccessibleViaActiveSubscription: true });
    const { fixture } = renderDoc(doc, { owned: false });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ดาวน์โหลด (สิทธิ์สมาชิก)');
    expect(text).not.toContain('เพิ่มลงตะกร้า');
  });

  it('prefers "อยู่ในคลังแล้ว" over the subscription state when the buyer already owns the document', () => {
    const doc = buildDoc({ isAccessibleViaActiveSubscription: true });
    const { fixture } = renderDoc(doc, { owned: true });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('อยู่ในคลังแล้ว');
    expect(text).not.toContain('ดาวน์โหลด (สิทธิ์สมาชิก)');
  });

  it('falls back to the normal buy/add-to-cart state when isAccessibleViaActiveSubscription is false', () => {
    const doc = buildDoc({ isAccessibleViaActiveSubscription: false });
    const { fixture } = renderDoc(doc, { owned: false });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('เพิ่มลงตะกร้า');
    expect(text).not.toContain('ดาวน์โหลด (สิทธิ์สมาชิก)');
  });

  it('clicking the subscription-download button calls the SAME LibraryService.download(id) the free-download path uses', () => {
    const doc = buildDoc({ isAccessibleViaActiveSubscription: true });
    const { fixture, libraryFake } = renderDoc(doc, { owned: false });

    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('ดาวน์โหลด (สิทธิ์สมาชิก)'));
    expect(button).toBeTruthy();
    button?.dispatchEvent(new Event('click'));

    expect(libraryFake.download).toHaveBeenCalledWith(doc.id);
  });

  it('redirects to login instead of downloading when not authenticated', () => {
    const doc = buildDoc({ isAccessibleViaActiveSubscription: true });
    // A real matching route for the redirect target, so `router.navigate(['/auth/login'], ...)`
    // resolves instead of rejecting with NG04002 (unrelated to what this test verifies).
    const { fixture, libraryFake } = renderDoc(doc, {
      owned: false,
      authenticated: false,
      routes: [{ path: 'auth/login', children: [] }],
    });

    fixture.componentInstance.downloadViaSubscription();

    expect(libraryFake.download).not.toHaveBeenCalled();
  });
});

describe('BuyerDocumentDetailPage — seller profile enrichment & toggleFollow', () => {
  it('calls fetchSellerProfile and hydrateFromApi when document is loaded with seller id', async () => {
    const doc = buildDoc();
    const fakeCatalog = buildCatalog(doc);
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    const followFake = {
      isFollowing: vi.fn(() => false),
      hydrateFromApi: vi.fn(async () => {}),
      setFollowing: vi.fn(),
      toggle: vi.fn(async () => true),
    };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: fakeCatalog },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: followFake },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: { loadBundlesContainingDocument: vi.fn(async () => []) } },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    await settle();

    expect(followFake.hydrateFromApi).toHaveBeenCalledWith('seller-1');
    expect(fakeCatalog.fetchSellerProfile).toHaveBeenCalledWith('seller-1');
  });

  it('updates seller follower count on toggleFollow when follow state changed', async () => {
    const doc = buildDoc();
    const fakeCatalog = buildCatalog(doc);
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    let following = false;
    const followFake = {
      isFollowing: vi.fn(() => following),
      hydrateFromApi: vi.fn(async () => {}),
      setFollowing: vi.fn(),
      toggle: vi.fn(async () => {
        following = !following;
        return following;
      }),
    };
    const authFake = {
      isAuthenticated: () => true,
      accessToken: () => 'token',
      user: () => ({ id: 'other-user' }),
    };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: authFake },
        { provide: CatalogService, useValue: fakeCatalog },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: followFake },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: { loadBundlesContainingDocument: vi.fn(async () => []) } },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    await settle();

    await fixture.componentInstance.toggleFollow();
    expect(fakeCatalog.updateSellerFollowerCount).toHaveBeenCalledWith(1, 'seller-1');

    await fixture.componentInstance.toggleFollow();
    expect(fakeCatalog.updateSellerFollowerCount).toHaveBeenCalledWith(-1, 'seller-1');
  });

  it('does not update follower count if toggleFollow network call failed / state unchanged', async () => {
    const doc = buildDoc();
    const fakeCatalog = buildCatalog(doc);
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    const followFake = {
      isFollowing: vi.fn(() => false),
      hydrateFromApi: vi.fn(async () => {}),
      setFollowing: vi.fn(),
      toggle: vi.fn(async () => false), // failed
    };
    const authFake = {
      isAuthenticated: () => true,
      accessToken: () => 'token',
      user: () => ({ id: 'other-user' }),
    };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: authFake },
        { provide: CatalogService, useValue: fakeCatalog },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: followFake },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: { loadBundlesContainingDocument: vi.fn(async () => []) } },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    await settle();

    await fixture.componentInstance.toggleFollow();
    expect(fakeCatalog.updateSellerFollowerCount).not.toHaveBeenCalled();
  });
});

/**
 * seo-ssr v1 §1.4 group C (AC-15/AC-17) — dynamic title/meta description/canonical link/JSON-LD
 * for `/document/:id`, wired through the shared `SeoMetaService` (mirrors `exam-hub.page.ts`'s
 * existing `Title`/`Meta` usage). `Title`/`Meta` are the real Angular services here (not faked)
 * so the assertions prove the tags actually land in the DOM, not just that a method was called.
 */
describe('BuyerDocumentDetailPage — SEO meta (seo-ssr v1)', () => {
  function renderDoc(doc: DocumentItem) {
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    const fakeBundleService = { loadBundlesContainingDocument: vi.fn(async () => []) };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: buildCatalog(doc) },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: fakeFollow },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: fakeBundleService },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    return { fixture, titleService: TestBed.inject(Title), meta: TestBed.inject(Meta) };
  }

  afterEach(() => {
    document.getElementById('seo-json-ld')?.remove();
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  it('AC-15: sets document.title, meta description, canonical link, and a parseable JSON-LD script', () => {
    const doc = buildDoc({
      id: 'doc-1',
      title: 'สรุปคณิต ม.6',
      shortDescription: 'สรุปเข้มก่อนสอบ',
      reviewCount: 0,
    });
    const { titleService, meta } = renderDoc(doc);

    expect(titleService.getTitle()).toBe('สรุปคณิต ม.6 — SIRIEDUMARKET');
    expect(meta.getTag('name="description"')?.content).toBe('สรุปเข้มก่อนสอบ');

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe(`${window.location.origin}/document/doc-1`);

    const script = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script!.text) as Record<string, unknown>;
    expect(data['@type']).toBe('Product');
  });

  it('DEC-7: reviewCount > 0 includes aggregateRating; reviewCount === 0 omits it entirely', () => {
    const withReviews = buildDoc({ id: 'doc-2', reviewCount: 8, rating: 4.6 });
    renderDoc(withReviews);
    const scriptWith = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    const dataWith = JSON.parse(scriptWith!.text) as Record<string, unknown>;
    expect(dataWith['aggregateRating']).toBeDefined();
    expect((dataWith['aggregateRating'] as Record<string, unknown>)['reviewCount']).toBe(8);

    // Fresh TestBed environment for the second render — `SeoMetaService` is `providedIn: 'root'`
    // so configuring the test module again after a component has been created requires a reset.
    TestBed.resetTestingModule();
    const withoutReviews = buildDoc({ id: 'doc-3', reviewCount: 0, rating: 3 });
    renderDoc(withoutReviews);
    const scriptWithout = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    const dataWithout = JSON.parse(scriptWithout!.text) as Record<string, unknown>;
    expect(dataWithout['aggregateRating']).toBeUndefined();
  });

  it('AC-17: navigating from one document to another (component re-render) does not leave a stale title/JSON-LD', () => {
    const docA = buildDoc({ id: 'doc-a', title: 'เอกสาร A', shortDescription: 'คำอธิบาย A' });
    const { titleService: titleA } = renderDoc(docA);
    expect(titleA.getTitle()).toContain('เอกสาร A');

    TestBed.resetTestingModule();
    const docB = buildDoc({ id: 'doc-b', title: 'เอกสาร B', shortDescription: 'คำอธิบาย B' });
    const { titleService: titleB } = renderDoc(docB);
    expect(titleB.getTitle()).toContain('เอกสาร B');
    expect(titleB.getTitle()).not.toContain('เอกสาร A');

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBe(1);
    const data = JSON.parse((scripts[0] as HTMLScriptElement).text) as Record<string, unknown>;
    expect(data['sku']).toBe('doc-b');
  });
});

/**
 * pdf-preview-popup-and-i18n-fix v1 §4 — AC-9/AC-10/AC-11/AC-12:
 * openPreview(true) on a PDF-format document must open the PDF iframe modal (not the JPEG gallery).
 */
describe('BuyerDocumentDetailPage — PDF preview modal (pdf-preview-popup-and-i18n-fix v1)', () => {
  async function renderWithPdfDoc() {
    const doc = buildDoc({ format: 'pdf', previewPages: 3 });
    const pdfBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const fakeCatalog = {
      ...buildCatalog(doc),
      loadDocumentPreviewPdf: vi.fn(async () => pdfBlob),
    };
    const fakeRoute = { paramMap: of(convertToParamMap({ id: doc.id })) };
    const fakeBundleService = { loadBundlesContainingDocument: vi.fn(async () => []) };

    TestBed.configureTestingModule({
      imports: [BuyerDocumentDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: fakeRoute },
        { provide: AuthService, useValue: fakeAuth },
        { provide: CatalogService, useValue: fakeCatalog },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
        { provide: FollowService, useValue: fakeFollow },
        { provide: LibraryService, useValue: fakeLibrary },
        { provide: RecentlyViewedService, useValue: fakeRecent },
        { provide: BundleService, useValue: fakeBundleService },
      ],
    });

    const fixture = TestBed.createComponent(BuyerDocumentDetailPage);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, fakeCatalog };
  }

  it('opens the PDF modal (not the JPEG gallery) when openPreview(true) is called on a PDF doc', async () => {
    const { component } = await renderWithPdfDoc();

    expect(component.showPdfPreviewModal()).toBe(false);
    expect(component.showPreviewGallery()).toBe(false);

    component.openPreview(true);
    await settle();

    expect(component.showPdfPreviewModal()).toBe(true);
    expect(component.showPreviewGallery()).toBe(false);
  });
});

