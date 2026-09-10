import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { BuyerHomePage } from './home.page';
import {
  AuthService,
  BundleService,
  CartService,
  CatalogService,
  ExamCountdownService,
  PlatformStatsService,
  RecentlyViewedService,
  WishlistService,
} from '../../../core/services';
import { idleActionState, loadingActionState, type ActionState } from '../../../core/services/action-state';
import { mapDocument } from '../../../core/api-mappers/mappers';
import type { MarketplaceDocumentResponse } from '../../../core/api';
import type { Bundle, Category, DocumentItem, ExamCountdownSetting, PlatformStats, Seller } from '../../../core/models';

/**
 * real-data-stats v1 §4.2 — Home page:
 *  - trust stats (12k+/3.2k/98k+/4.9★) read `PlatformStatsService.stats()`: skeleton while
 *    `undefined`, the averageRating block hidden entirely (not "0 ★") until it has a value
 *  - "แตกย่อยเป็น N หมวดย่อย" only appended once `subcategoryCount` is actually known
 *  - "ประหยัดได้สูงสุด N%" (Group A, no backend needed) computed from the bundles rendered in
 *    the strip, dropped entirely when nothing in that set has a real discount
 */
function buildCategory(over: Partial<Category>): Category {
  return {
    id: 'cat-1',
    name: 'การศึกษา',
    slug: 'education',
    icon: '📚',
    color: '#F9A8D4',
    description: '',
    documentCount: 100,
    ...over,
  };
}

function buildBundle(id: string, over: Partial<Bundle> = {}): Bundle {
  return {
    id,
    slug: id,
    title: `แพ็กเกจ ${id}`,
    description: '',
    cover: '',
    price: 100,
    originalPrice: 100,
    documentIds: [],
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

function buildCatalog(
  categories: Category[],
  recommended: DocumentItem[] = [],
  recommendedStrategy: 'purchase-history' | 'popular-fallback' | null = null,
  documents: DocumentItem[] = [],
  sellerProfiles: Map<string, Seller> = new Map(),
) {
  return {
    initForHome: vi.fn(),
    loadFreeResources: vi.fn(),
    loadRecommended: vi.fn(),
    loadSellerProfilesForDocuments: vi.fn(),
    newArrivals: () => [],
    featured: () => [],
    editorsPicks: () => [],
    trending: () => [],
    freeResources: () => [],
    documents: () => documents,
    categories: () => categories,
    catalogState: () => idleActionState(),
    recommended: () => recommended,
    recommendedStrategy: () => recommendedStrategy,
    sellerProfiles: () => sellerProfiles,
  };
}

function buildBundleService(featured: Bundle[]) {
  return { featured: () => featured, bundles: () => featured };
}

const fakeRecent = { count: () => 0, items: () => [], clear: vi.fn() };
// app-document-card (used by the "แนะนำสำหรับคุณ" section below) injects these directly —
// same fake shape as free.page.spec.ts to avoid the real services' network calls in tests.
const fakeCart = { has: () => false, openDrawer: vi.fn(), add: vi.fn() };
const fakeWishlist = { has: () => false, toggle: vi.fn() };

/** exam-countdown-mode v1 §4 — same-shape fake as `ExamCountdownService`, real signals so setEnabled() re-renders. */
function fakeExamCountdownService(
  initialSetting: ExamCountdownSetting | null = null,
  initialState: ActionState = idleActionState(),
  docs: DocumentItem[] = [],
) {
  const setting = signal<ExamCountdownSetting | null>(initialSetting);
  const state = signal<ActionState>(initialState);
  return {
    setting: setting.asReadonly(),
    state: state.asReadonly(),
    docs: () => docs,
    docsState: () => idleActionState(),
    hasMoreDocs: () => false,
    docsPager: { loadMore: vi.fn() },
    loadSetting: vi.fn(async () => {}),
    setEnabled: vi.fn(async (enabled: boolean) => {
      const current = setting();
      if (current) setting.set({ ...current, isEnabled: enabled });
    }),
    _setting: setting,
    _state: state,
  };
}

function render(opts: {
  categories?: Category[];
  bundles?: Bundle[];
  stats?: PlatformStats;
  recommended?: DocumentItem[];
  recommendedStrategy?: 'purchase-history' | 'popular-fallback' | null;
  isAuthenticated?: boolean;
  examCountdown?: ReturnType<typeof fakeExamCountdownService>;
  documents?: DocumentItem[];
  sellerProfiles?: Map<string, Seller>;
}) {
  const fakeStats = {
    stats: () => opts.stats,
    statsState: () => idleActionState(),
    loadStats: vi.fn(),
  };
  const catalog = buildCatalog(
    opts.categories ?? [],
    opts.recommended ?? [],
    opts.recommendedStrategy ?? null,
    opts.documents ?? [],
    opts.sellerProfiles ?? new Map(),
  );
  const examCountdown = opts.examCountdown ?? fakeExamCountdownService();

  TestBed.configureTestingModule({
    imports: [BuyerHomePage],
    providers: [
      provideRouter([]),
      { provide: CatalogService, useValue: catalog },
      { provide: BundleService, useValue: buildBundleService(opts.bundles ?? []) },
      { provide: RecentlyViewedService, useValue: fakeRecent },
      { provide: PlatformStatsService, useValue: fakeStats },
      { provide: CartService, useValue: fakeCart },
      { provide: WishlistService, useValue: fakeWishlist },
      { provide: AuthService, useValue: { isAuthenticated: () => opts.isAuthenticated ?? false } },
      { provide: ExamCountdownService, useValue: examCountdown },
    ],
  });

  const fixture = TestBed.createComponent(BuyerHomePage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('BuyerHomePage — trust stats (real-data-stats v1 §4.2)', () => {
  it('shows a skeleton (not "0") for every counter while stats() is undefined', () => {
    const fixture = render({ stats: undefined });

    const root = fixture.nativeElement as HTMLElement;
    // At least 3 skeleton placeholders (documents/sellers/downloads) — none of the compact-piped
    // counters render at all while stats() is undefined (checked via the pipe/mapper specs;
    // the page's unrelated decorative Seller CTA mock card already contains its own literal
    // numbers, so asserting on whole-page text here would be a false-positive risk).
    expect(root.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(3);
  });

  it('renders the real counters once stats() resolves', () => {
    const fixture = render({
      stats: {
        totalApprovedDocuments: 12000,
        totalSellers: 3200,
        totalDownloads: 98000,
        reviewCount: 8400,
        averageRating: 4.9,
        positiveReviewPercent: 98,
        feeRatePercent: 10,
      },
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('12k+');
    expect(text).toContain('3.2k');
    expect(text).toContain('98k+');
    expect(text).toContain('ดาวน์โหลดสะสม');
    expect(text).toContain('4.9 ★');
    expect(text).toContain('8.4k รีวิว');
  });

  it('hides the rating block entirely (not "0 ★") when averageRating is undefined', () => {
    const fixture = render({
      stats: {
        totalApprovedDocuments: 100,
        totalSellers: 10,
        totalDownloads: 500,
        reviewCount: 0,
        feeRatePercent: 10,
      },
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    // "จาก"/"รีวิว" alone aren't safe substrings — both appear elsewhere on this page unrelated
    // to this feature (hero subtitle "...จากครีเอเตอร์ตัวจริง...", "How it works" copy). This
    // feature's rating block is the only place that renders "N.N ★" (digit, dot, digit, star) —
    // the page's unrelated decorative floating-card mockup renders "★" *before* its number.
    expect(text).not.toMatch(/\d\.\d\s★/);
  });
});

describe('BuyerHomePage — categories subtitle (real-data-stats v1 §4.2)', () => {
  it('omits the "แตกย่อยเป็น N หมวดย่อย" clause when subcategoryCount is not wired yet', () => {
    const fixture = render({
      categories: [buildCategory({ documentCount: 50 }), buildCategory({ id: 'cat-2', documentCount: 30 })],
    });

    const page = fixture.componentInstance;
    expect(page.categoriesSubtitle()).toBe('กว่า 80 เอกสารใน 2 หมวดหมู่หลัก');
    expect(page.categoriesSubtitle()).not.toContain('หมวดย่อย');
  });

  it('includes the sub-category count once at least one category reports it', () => {
    const fixture = render({
      categories: [
        buildCategory({ documentCount: 50, subcategoryCount: 5 }),
        buildCategory({ id: 'cat-2', documentCount: 30, subcategoryCount: 3 }),
      ],
    });

    const page = fixture.componentInstance;
    expect(page.categoriesSubtitle()).toBe('กว่า 80 เอกสารใน 2 หมวดหมู่หลัก แตกย่อยเป็น 8 หมวดย่อย');
  });
});

describe('BuyerHomePage — bundle savings subtitle (Group A, §4.2)', () => {
  it('drops "ประหยัดได้สูงสุด N%" entirely when no rendered bundle has a real discount', () => {
    const fixture = render({ bundles: [buildBundle('b-1', { price: 100, originalPrice: 100 })] });

    const page = fixture.componentInstance;
    expect(page.bundlesSubtitle()).toBe('ครีเอเตอร์รวมเอกสารที่เข้ากันให้แล้ว');
    expect(page.bundlesSubtitle()).not.toContain('%');
  });

  it('shows the max save percent among the bundles actually rendered in the strip', () => {
    const fixture = render({
      bundles: [
        buildBundle('b-1', { price: 100, originalPrice: 100 }),
        buildBundle('b-2', { price: 60, originalPrice: 100 }),
      ],
    });

    const page = fixture.componentInstance;
    expect(page.bundlesSubtitle()).toBe('ครีเอเตอร์รวมเอกสารที่เข้ากันให้แล้ว ประหยัดได้สูงสุด 40%');
  });
});

describe('BuyerHomePage — "แนะนำสำหรับคุณ" (personalized-recommendations v1)', () => {
  function buildRecommendedDoc(over: Partial<MarketplaceDocumentResponse> = {}): DocumentItem {
    return mapDocument({
      id: 'rec-1',
      slug: 'rec-1',
      title: 'สรุปชีววิทยา ม.5',
      shortDescription: 'สรุปเข้มก่อนสอบ',
      price: 120,
      ...over,
    });
  }

  it('AC-12: does not render the section when recommended() is empty', () => {
    const fixture = render({ recommended: [], recommendedStrategy: null });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('แนะนำสำหรับคุณ');
  });

  it('AC-13: uses the purchase-history subtitle copy when strategy is "purchase-history"', () => {
    const fixture = render({
      recommended: [buildRecommendedDoc()],
      recommendedStrategy: 'purchase-history',
    });

    const page = fixture.componentInstance;
    expect(page.recommendedSubtitle()).toBe('เพราะคุณเคยเลือกเอกสารแนวนี้');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('แนะนำสำหรับคุณ');
    expect(text).toContain('เพราะคุณเคยเลือกเอกสารแนวนี้');
  });

  it('AC-13: uses the popular-fallback subtitle copy when strategy is "popular-fallback"', () => {
    const fixture = render({
      recommended: [buildRecommendedDoc()],
      recommendedStrategy: 'popular-fallback',
    });

    const page = fixture.componentInstance;
    expect(page.recommendedSubtitle()).toBe('เอกสารยอดนิยมที่ผู้ซื้อคนอื่นเลือกกัน');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('แนะนำสำหรับคุณ');
    expect(text).toContain('เอกสารยอดนิยมที่ผู้ซื้อคนอื่นเลือกกัน');
  });

  it('AC-13: the two strategy copy variants are actually different strings', () => {
    const purchaseHistoryFixture = render({
      recommended: [buildRecommendedDoc()],
      recommendedStrategy: 'purchase-history',
    });
    const purchaseHistorySubtitle = purchaseHistoryFixture.componentInstance.recommendedSubtitle();

    TestBed.resetTestingModule();
    const fallbackFixture = render({
      recommended: [buildRecommendedDoc()],
      recommendedStrategy: 'popular-fallback',
    });
    const fallbackSubtitle = fallbackFixture.componentInstance.recommendedSubtitle();

    expect(purchaseHistorySubtitle).not.toBe(fallbackSubtitle);
  });

  it('AC-14: loadRecommended() is called exactly once on page init', () => {
    render({ recommended: [buildRecommendedDoc()], recommendedStrategy: 'popular-fallback' });

    const catalog = TestBed.inject(CatalogService) as unknown as { loadRecommended: ReturnType<typeof vi.fn> };
    expect(catalog.loadRecommended).toHaveBeenCalledTimes(1);
  });
});

describe('Home search', () => {
  it.each(['  TOEIC  ', '   '])('submits the native form with normalized query %s', (value) => {
    const fixture = render({});
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
    const input = form.elements.namedItem('q') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    expect(navigate).not.toHaveBeenCalled();
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/marketplace'], {
      queryParams: value.trim() ? { q: value.trim() } : {},
    });
  });
});

/**
 * exam-countdown-mode v1 (docs/contracts/exam-countdown-mode.md §1 test list / §4) — AC-14..21.
 * `ExamCountdownService` is faked (same shape, real signals) so these exercise `BuyerHomePage`'s
 * own template/computed logic independently of the service's own `TODO(contract)` stub body
 * (covered separately in `exam-countdown.service.spec.ts`).
 */
function isoDaysFromToday(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

describe('BuyerHomePage — exam countdown (exam-countdown-mode v1)', () => {
  it('AC-14: an anonymous visitor never calls loadSetting() and never renders the section', () => {
    const examCountdown = fakeExamCountdownService();
    const fixture = render({ isAuthenticated: false, examCountdown });

    expect(examCountdown.loadSetting).not.toHaveBeenCalled();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('โหมดใกล้สอบ');
  });

  it('calls loadSetting() once when the visitor is authenticated', () => {
    const examCountdown = fakeExamCountdownService();
    render({ isAuthenticated: true, examCountdown });

    expect(examCountdown.loadSetting).toHaveBeenCalledTimes(1);
  });

  it('AC-15: authenticated, never set (setting()===null, not loading) → shows the "ตั้งวันสอบ" CTA, not a banner', () => {
    const examCountdown = fakeExamCountdownService(null, idleActionState());
    const fixture = render({ isAuthenticated: true, examCountdown });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ตั้งวันสอบของคุณ เพื่อดูเอกสารที่เกี่ยวข้องและนับถอยหลังก่อนสอบ');
    expect(text).not.toContain('เหลืออีก');
  });

  it('does not show the CTA while still loading (avoids a flash before the real state is known)', () => {
    const examCountdown = fakeExamCountdownService(null, loadingActionState());
    const fixture = render({ isAuthenticated: true, examCountdown });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ตั้งวันสอบของคุณ');
  });

  it('AC-16: active (isEnabled, future examDate) → banner shows days remaining + examType, and renders the filtered doc grid', () => {
    const doc: DocumentItem = mapDocument({ id: 'doc-1', slug: 'doc-1', title: 'สรุป TGAT เข้ม', price: 99 });
    const examCountdown = fakeExamCountdownService(
      { examType: 'TGAT', examDate: isoDaysFromToday(14), isEnabled: true },
      idleActionState(),
      [doc],
    );
    const fixture = render({ isAuthenticated: true, examCountdown });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('เหลืออีก 14 วันก่อนสอบ TGAT');
    expect(text).toContain('เอกสารที่เกี่ยวข้องกับสอบของคุณ');
    expect(text).toContain('สรุป TGAT เข้ม');
  });

  it('AC-18: isEnabled but examDate is in the past → "สอบผ่านไปแล้ว" + "ตั้งวันสอบใหม่", no doc grid', () => {
    const doc: DocumentItem = mapDocument({ id: 'doc-1', slug: 'doc-1', title: 'ไม่ควรเห็นการ์ดนี้', price: 0 });
    const examCountdown = fakeExamCountdownService(
      { examType: 'A-Level', examDate: isoDaysFromToday(-3), isEnabled: true },
      idleActionState(),
      [doc],
    );
    const fixture = render({ isAuthenticated: true, examCountdown });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('สอบ A-Level ผ่านไปแล้ว');
    expect(text).toContain('ตั้งวันสอบใหม่');
    expect(text).not.toContain('เหลืออีก');
    expect(text).not.toContain('ไม่ควรเห็นการ์ดนี้');
  });

  it('AC-19: isEnabled=false with a future examDate → the whole section is gone, not just the grid', () => {
    const examCountdown = fakeExamCountdownService(
      { examType: 'IELTS', examDate: isoDaysFromToday(10), isEnabled: false },
      idleActionState(),
    );
    const fixture = render({ isAuthenticated: true, examCountdown });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('โหมดใกล้สอบ');
    expect(text).not.toContain('เหลืออีก');
  });

  it('AC-19: isEnabled=false with a past examDate → still fully hidden (not the "ผ่านไปแล้ว" message either)', () => {
    const examCountdown = fakeExamCountdownService(
      { examType: 'IELTS', examDate: isoDaysFromToday(-10), isEnabled: false },
      idleActionState(),
    );
    const fixture = render({ isAuthenticated: true, examCountdown });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('โหมดใกล้สอบ');
    expect(text).not.toContain('ผ่านไปแล้ว');
  });

  it('AC-20: clicking "ปิดโหมดนี้" calls setEnabled(false) and the section disappears without a page reload', async () => {
    const examCountdown = fakeExamCountdownService(
      { examType: 'PAT', examDate: isoDaysFromToday(5), isEnabled: true },
      idleActionState(),
    );
    const fixture = render({ isAuthenticated: true, examCountdown });
    const el = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(el.querySelectorAll('button'));
    const disableButton = buttons.find((b) => b.textContent?.trim() === 'ปิดโหมดนี้') as HTMLButtonElement;
    expect(disableButton).toBeTruthy();

    disableButton.click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(examCountdown.setEnabled).toHaveBeenCalledWith(false);
    const text = el.textContent ?? '';
    expect(text).not.toContain('โหมดใกล้สอบ');
  });

  it('AC-21: "ดูเอกสารทั้งหมด" links straight to /marketplace with no query filter', () => {
    const examCountdown = fakeExamCountdownService(
      { examType: 'GAT', examDate: isoDaysFromToday(3), isEnabled: true },
      idleActionState(),
    );
    const fixture = render({ isAuthenticated: true, examCountdown });
    const el = fixture.nativeElement as HTMLElement;
    const link = Array.from(el.querySelectorAll('a')).find(
      (a) => a.textContent?.trim() === 'ดูเอกสารทั้งหมด',
    ) as HTMLAnchorElement;

    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/marketplace');
  });
});

describe('BuyerHomePage — featured creators follower count', () => {
  it('enriches featured sellers with follower count and profile stats from catalog.sellerProfiles()', () => {
    const doc = mapDocument({
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสารตัวอย่าง',
      price: 50,
      sellerId: 'seller-abc',
      sellerName: 'ครูสมศรี',
    } as unknown as MarketplaceDocumentResponse);

    const enrichedProfile: Seller = {
      id: 'seller-abc',
      studioName: 'ครูสมศรีติวเตอร์',
      ownerName: 'สมศรี',
      avatar: '',
      bio: 'ครูสอนภาษาไทย 10 ปี',
      joinedAt: '2026-01-01T00:00:00Z',
      rating: 4.8,
      totalSales: 150,
      totalDocuments: 25,
      followerCount: 42,
      responseHours: 1,
      badges: ['Verified'],
    };

    const sellerProfiles = new Map<string, Seller>([['seller-abc', enrichedProfile]]);
    const fixture = render({ documents: [doc], sellerProfiles });

    const page = fixture.componentInstance;
    const sellers = page.featuredSellers;
    expect(sellers.length).toBe(1);
    expect(sellers[0].id).toBe('seller-abc');
    expect(sellers[0].followerCount).toBe(42);
    expect(sellers[0].totalDocuments).toBe(25);
    expect(sellers[0].rating).toBe(4.8);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('42 ฟอลโลเวอร์');
    expect(text).toContain('25 เอกสาร');
  });
});
