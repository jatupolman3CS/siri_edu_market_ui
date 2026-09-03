import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BuyerFreePage } from './free.page';
import { CartService, CatalogService, WishlistService } from '../../../core/services';
import { idleActionState } from '../../../core/services/action-state';
import { mapDocument } from '../../../core/api-mappers/mappers';
import type { MarketplaceDocumentResponse } from '../../../core/api';
import type { DocumentItem } from '../../../core/models';

function buildFreeDoc(over: Partial<MarketplaceDocumentResponse> = {}): DocumentItem {
  return mapDocument({
    id: 'doc-1',
    slug: 'doc-1',
    title: 'สรุปเคมี ม.6',
    shortDescription: 'สรุปเข้มก่อนสอบ',
    price: 0,
    isFree: true,
    ...over,
  });
}

const fakeCart = { has: () => false, openDrawer: vi.fn(), add: vi.fn() };
const fakeWishlist = { has: () => false, toggle: vi.fn() };

function buildCatalogFake(freeResources: DocumentItem[]) {
  return {
    freeResources: () => freeResources,
    freeState: () => idleActionState(),
    freeHasMore: () => false,
    loadFreeResources: vi.fn(),
    loadMoreFreeResources: vi.fn(),
  };
}

function render(catalog: ReturnType<typeof buildCatalogFake>) {
  TestBed.configureTestingModule({
    imports: [BuyerFreePage],
    providers: [
      provideRouter([]),
      { provide: CatalogService, useValue: catalog },
      { provide: CartService, useValue: fakeCart },
      { provide: WishlistService, useValue: fakeWishlist },
    ],
  });

  const fixture = TestBed.createComponent(BuyerFreePage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('BuyerFreePage — total downloads (marketplace-list-downloads-field v1 §1 AC-3)', () => {
  it('sums the real per-document downloads instead of reporting 0 when documents have real counts', () => {
    const docs = [
      buildFreeDoc({ id: 'doc-1', slug: 'doc-1', downloads: 120 }),
      buildFreeDoc({ id: 'doc-2', slug: 'doc-2', downloads: 118 }),
    ];
    const fixture = render(buildCatalogFake(docs));

    const page = fixture.componentInstance;
    expect(page.totalDownloads()).toBe(238);
  });

  it('renders "ดาวน์โหลดรวม" with the summed, compact-formatted total — not "0 ครั้ง"', () => {
    const docs = [
      buildFreeDoc({ id: 'doc-1', slug: 'doc-1', downloads: 120 }),
      buildFreeDoc({ id: 'doc-2', slug: 'doc-2', downloads: 118 }),
    ];
    const fixture = render(buildCatalogFake(docs));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('238 ครั้ง');
    expect(text).not.toContain('0 ครั้ง');
  });

  it('falls back to 0 when the free catalog is empty (no documents to sum)', () => {
    const fixture = render(buildCatalogFake([]));

    expect(fixture.componentInstance.totalDownloads()).toBe(0);
  });
});
