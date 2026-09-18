import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { SellerDocumentsPage } from './documents.page';
import { SellerService } from '../../../core/services';
import type { DocumentItem } from '../../../core/models';
import type { PagedResult } from '../../../core/services/infinite-pager';

/**
 * document-rejection-reason v1 §4/AC-9/AC-11 — the seller documents list must show the
 * rejection reason inline under the "ไม่ผ่าน" status pill when present, and must never render
 * anything extra for rows in any other status (or a rejected row with no reason at all — a
 * defensive case for pre-migration data / SDK not regenerated yet, AC-12).
 */
function fakeDocument(overrides: Partial<DocumentItem> = {}): DocumentItem {
  return {
    id: 'doc-1',
    slug: 'doc-1',
    title: 'เอกสารทดสอบ',
    shortDescription: '',
    description: '',
    cover: '',
    gallery: [],
    galleryCount: 0,
    price: 100,
    format: 'pdf',
    pages: 10,
    fileSize: '1MB',
    language: 'th',
    categoryIds: [],
    gradeLevels: [],
    resourceType: 'lesson-summary',
    tags: [],
    rating: 0,
    reviewCount: 0,
    downloads: 0,
    status: 'approved',
    watermarkEnabled: false,
    previewPages: 0,
    seller: {
      id: 's1',
      studioName: 'ร้านทดสอบ',
      ownerName: '',
      avatar: '',
      bio: '',
      joinedAt: '2026-01-01T00:00:00Z',
      rating: 0,
      totalSales: 0,
      totalDocuments: 0,
      followerCount: 0,
      responseHours: 0,
      badges: [],
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    reviews: [],
    isBestseller: false,
    isFeatured: false,
    isEditorsPick: false,
    bundleDocumentIds: [],
    ...overrides,
  } as unknown as DocumentItem;
}

function render(items: DocumentItem[]) {
  const fakeSeller: Partial<SellerService> = {
    sellerProfileRequired: signal(false).asReadonly(),
    listDocumentsPaged: async () =>
      ({
        items,
        page: 1,
        pageSize: 10,
        totalCount: items.length,
        totalPages: 1,
      }) as PagedResult<DocumentItem>,
  };

  TestBed.configureTestingModule({
    imports: [SellerDocumentsPage],
    providers: [
      provideRouter([]),
      { provide: SellerService, useValue: fakeSeller },
      {
        provide: NzMessageService,
        useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
      },
      { provide: NzModalService, useValue: { confirm: vi.fn() } },
    ],
  });

  const fixture = TestBed.createComponent(SellerDocumentsPage);
  fixture.detectChanges();
  return fixture;
}

async function settle(fixture: { detectChanges: () => void }): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  fixture.detectChanges();
}

afterEach(() => TestBed.resetTestingModule());

describe('SellerDocumentsPage — rejection reason row (document-rejection-reason v1 §4/AC-9)', () => {
  it('AC-9: shows the rejection reason under the pill for a rejected row that has one', async () => {
    const fixture = render([
      fakeDocument({
        status: 'rejected',
        rejectionReason: 'ภาพหน้าปกไม่ตรงกับเนื้อหาเอกสาร',
      }),
    ]);
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ไม่ผ่าน');
    expect(text).toContain('เหตุผล: ภาพหน้าปกไม่ตรงกับเนื้อหาเอกสาร');
  });

  it('AC-11: does not show any reason line for an approved row', async () => {
    const fixture = render([fakeDocument({ status: 'approved' })]);
    await settle(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('เหตุผล:');
  });

  it('AC-11/AC-12: a rejected row with no rejectionReason renders no reason line and does not throw', async () => {
    const fixture = render([
      fakeDocument({ status: 'rejected', rejectionReason: null }),
    ]);

    await expect(settle(fixture)).resolves.toBeUndefined();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ไม่ผ่าน');
    expect(text).not.toContain('เหตุผล:');
  });

  it('AC-12: rejectionReason undefined on a rejected row does not throw and shows no reason line', async () => {
    const fixture = render([
      fakeDocument({ status: 'rejected', rejectionReason: undefined }),
    ]);

    await expect(settle(fixture)).resolves.toBeUndefined();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('เหตุผล:');
  });
});
