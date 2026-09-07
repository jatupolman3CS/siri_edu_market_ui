import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BuyerHomePage } from './home.page';
import {
  BundleService,
  CatalogService,
  PlatformStatsService,
  RecentlyViewedService,
} from '../../../core/services';
import { idleActionState } from '../../../core/services/action-state';
import type { Bundle, Category, PlatformStats } from '../../../core/models';

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

function buildCatalog(categories: Category[]) {
  return {
    initForHome: vi.fn(),
    loadFreeResources: vi.fn(),
    newArrivals: () => [],
    featured: () => [],
    editorsPicks: () => [],
    trending: () => [],
    freeResources: () => [],
    documents: () => [],
    categories: () => categories,
    catalogState: () => idleActionState(),
  };
}

function buildBundleService(featured: Bundle[]) {
  return { featured: () => featured, bundles: () => featured };
}

const fakeRecent = { count: () => 0, items: () => [], clear: vi.fn() };

function render(opts: {
  categories?: Category[];
  bundles?: Bundle[];
  stats?: PlatformStats;
}) {
  const fakeStats = {
    stats: () => opts.stats,
    statsState: () => idleActionState(),
    loadStats: vi.fn(),
  };

  TestBed.configureTestingModule({
    imports: [BuyerHomePage],
    providers: [
      provideRouter([]),
      { provide: CatalogService, useValue: buildCatalog(opts.categories ?? []) },
      { provide: BundleService, useValue: buildBundleService(opts.bundles ?? []) },
      { provide: RecentlyViewedService, useValue: fakeRecent },
      { provide: PlatformStatsService, useValue: fakeStats },
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
