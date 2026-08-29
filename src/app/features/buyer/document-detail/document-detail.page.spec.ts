import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BuyerDocumentDetailPage } from './document-detail.page';
import {
  AuthService,
  BundleService,
  CartService,
  CatalogService,
  FollowService,
  LibraryService,
  RecentlyViewedService,
  WishlistService,
} from '../../../core/services';
import { idleActionState } from '../../../core/services/action-state';
import { mapDocumentDetail } from '../../../core/api-mappers/mappers';
import type { Bundle, DocumentItem } from '../../../core/models';

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

const fakeAuth = { isAuthenticated: () => false, accessToken: () => undefined };
const fakeCart = { has: () => false, openDrawer: vi.fn(), add: vi.fn() };
const fakeWishlist = { has: () => false, toggle: vi.fn() };
const fakeFollow = { toggle: vi.fn(), isFollowing: () => false };
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
    const skeletons = root.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
    expect(root.textContent ?? '').not.toContain('ดูแพ็กเกจ');
    expect(root.textContent ?? '').not.toContain('📦 BUNDLE');

    // avoid an unresolved promise leaking into the next test
    resolveBundles([]);
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
