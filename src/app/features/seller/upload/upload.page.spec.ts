import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerUploadPage } from './upload.page';
import { CatalogService, PlatformStatsService, SellerService } from '../../../core/services';
import type { PlatformStats } from '../../../core/models';

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
