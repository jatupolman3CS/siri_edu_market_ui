import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NZ_I18N, en_US } from 'ng-zorro-antd/i18n';
import { SellerAdsPage } from './ads.page';
import { AdsService, CatalogService, SellerService } from '../../../core/services';
import type { AdsCampaign, AdsCampaignQuote, AdsPlacement, DocumentItem } from '../../../core/models';
import { mapDocument } from '../../../core/api-mappers/mappers';

/**
 * seller-ads-promotion v1 (docs/contracts/seller-ads-promotion.md §1.4 "frontend spec", §4.2,
 * §4.4) — AC-34 (list + balance + create-campaign form fields), AC-35 (the 4 documented submit
 * -disable conditions), AC-36 (cancel uses `NzModalService.confirm`, never native `confirm()`).
 */
function buildDoc(id: string, title: string): DocumentItem {
  return mapDocument({ id, slug: id, title, shortDescription: '', price: 100 });
}

function buildCampaign(over: Partial<AdsCampaign> = {}): AdsCampaign {
  return {
    id: 'camp-1',
    documentId: 'doc-1',
    documentTitle: 'สรุปเคมี ม.6',
    documentCoverUrl: '',
    sellerId: 'seller-1',
    placementKey: 'search_top',
    placementName: 'บนสุดของผลค้นหา',
    targetKey: '*',
    targetLabel: null,
    startDate: '2026-09-20',
    endDate: '2026-09-26',
    dayCount: 7,
    pricePerDay: 199,
    totalAmount: 999,
    refundedAmount: 0,
    status: 'scheduled',
    stopReason: null,
    stopNote: null,
    stoppedAt: null,
    impressions: 0,
    clicks: 0,
    createdAt: '2026-09-15T00:00:00.000Z',
    ...over,
  };
}

function buildQuote(over: Partial<AdsCampaignQuote> = {}): AdsCampaignQuote {
  return {
    dayCount: 7,
    pricePerDay: 142.71,
    pricingMode: 'weekly',
    totalAmount: 999,
    availableBalance: 1500,
    canAfford: true,
    fullDates: [],
    ...over,
  };
}

function buildAdsFake() {
  return {
    loadPlacements: vi.fn().mockResolvedValue([
      {
        placementKey: 'search_top',
        displayName: 'บนสุดของผลค้นหา',
        description: 'd',
        pricePerDay: 199,
        weeklyPrice: 999,
        dailySlotCapacity: 2,
        requiresTarget: false,
      } satisfies AdsPlacement,
    ]),
    loadAvailability: vi.fn().mockResolvedValue({
      placementKey: 'search_top',
      targetKey: '*',
      pricePerDay: 199,
      weeklyPrice: 999,
      dailySlotCapacity: 2,
      days: [],
    }),
    getQuote: vi.fn().mockResolvedValue({ ok: true, quote: buildQuote() }),
    listCampaigns: vi.fn().mockResolvedValue({ items: [buildCampaign()], page: 1, pageSize: 10, totalCount: 1, totalPages: 1 }),
    createCampaign: vi.fn().mockResolvedValue({ ok: true, campaign: buildCampaign() }),
    cancelCampaign: vi.fn().mockResolvedValue({ ok: true, campaign: buildCampaign({ status: 'cancelled', refundedAmount: 500 }) }),
  };
}

function buildSellerFake() {
  return {
    loadEarnings: vi.fn().mockResolvedValue(undefined),
    earnings: () => ({ availableBalance: 1500, onHoldAmount: 0, totalEarnings: 5000, minPayoutAmount: 100, maxPayoutAmount: 0, hasPayoutAccount: true, payouts: [] }),
    listDocumentsPaged: vi.fn().mockResolvedValue({
      items: [buildDoc('doc-1', 'สรุปเคมี ม.6')],
      page: 1,
      pageSize: 100,
      totalCount: 1,
      totalPages: 1,
    }),
  };
}

function buildCatalogFake() {
  return {
    ensureCategories: vi.fn(),
    categories: () => [],
  };
}

/**
 * `NzModalModule` (imported by `SellerAdsPage` itself) registers its own
 * (non-`providedIn: 'root'`) `NzModalService` provider, resolved from the *component's own*
 * element injector — a level below `TestBed.inject()`, which resolves from the outer testing
 * -module injector and would return a different instance. `fixture.debugElement.injector` walks
 * the same hierarchy the component itself uses, so this spies on the one the page actually calls
 * (same technique as `categories-admin.page.spec.ts`).
 */
function render(
  ads: ReturnType<typeof buildAdsFake> = buildAdsFake(),
  seller: ReturnType<typeof buildSellerFake> = buildSellerFake(),
  modalConfirm = vi.fn(),
) {
  TestBed.configureTestingModule({
    imports: [SellerAdsPage],
    providers: [
      { provide: NZ_I18N, useValue: en_US },
      { provide: AdsService, useValue: ads },
      { provide: SellerService, useValue: seller },
      { provide: CatalogService, useValue: buildCatalogFake() },
      { provide: NzMessageService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
    ],
  });

  const fixture = TestBed.createComponent(SellerAdsPage);
  const comp = fixture.componentInstance as unknown as { modal: NzModalService };
  if (comp.modal) {
    vi.spyOn(comp.modal, 'confirm').mockImplementation(modalConfirm as unknown as typeof comp.modal.confirm);
  }
  fixture.detectChanges();
  return fixture;
}





afterEach(() => TestBed.resetTestingModule());

describe('SellerAdsPage — list + balance (AC-34)', () => {
  it('loads earnings and campaigns on construction', async () => {
    const ads = buildAdsFake();
    const seller = buildSellerFake();
    const fixture = render(ads, seller);
    await fixture.whenStable();

    expect(seller.loadEarnings).toHaveBeenCalled();
    expect(ads.listCampaigns).toHaveBeenCalledWith({ status: 'all', page: 1, pageSize: 10 });
    expect(fixture.componentInstance.campaigns()).toHaveLength(1);
    expect(fixture.componentInstance.availableBalance()).toBe(1500);
  });

  it('re-fetches with the new status when the filter changes', async () => {
    const ads = buildAdsFake();
    const fixture = render(ads);
    await fixture.whenStable();
    ads.listCampaigns.mockClear();

    fixture.componentInstance.onStatusFilterChange('active');
    await fixture.whenStable();

    expect(ads.listCampaigns).toHaveBeenCalledWith({ status: 'active', page: 1, pageSize: 10 });
  });
});

describe('SellerAdsPage — create-campaign form (AC-34, §4.2)', () => {
  it('openCreate() loads placements + the seller\'s own approved documents', async () => {
    const ads = buildAdsFake();
    const seller = buildSellerFake();
    const fixture = render(ads, seller);
    await fixture.whenStable();

    await fixture.componentInstance.openCreate();

    expect(ads.loadPlacements).toHaveBeenCalled();
    expect(seller.listDocumentsPaged).toHaveBeenCalledWith({ status: 'approved', pageSize: 100 });
    expect(fixture.componentInstance.placements()).toHaveLength(1);
    expect(fixture.componentInstance.myDocuments()).toHaveLength(1);
    expect(fixture.componentInstance.formOpen()).toBe(true);
  });

  it('§4.2 rule 2: changing the placement re-fetches availability', async () => {
    const ads = buildAdsFake();
    const fixture = render(ads);
    await fixture.componentInstance.openCreate();
    ads.loadAvailability.mockClear();

    fixture.componentInstance.onPlacementChange('search_top');
    await fixture.whenStable();

    expect(ads.loadAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ placement: 'search_top' }),
    );
  });

  it('§4.2 rule 3: debounces the quote fetch 300ms after the 4 values are set, never computing price itself', async () => {
    const ads = buildAdsFake();
    const fixture = render(ads);
    const page = fixture.componentInstance;
    await page.openCreate();

    page.onDocumentChange('doc-1');
    page.onPlacementChange('search_top');
    page.onDateRangeChange([new Date('2026-09-20'), new Date('2026-09-26')]);
    expect(ads.getQuote).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 350));

    expect(ads.getQuote).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-1', placementKey: 'search_top' }),
    );
    expect(page.quote()).toEqual(buildQuote());
  });

  describe('§4.2 rule 4 / AC-35: submitDisabled() — the 4 documented conditions', () => {
    it('disabled when there is no quote yet', async () => {
      const fixture = render();
      const page = fixture.componentInstance;
      await page.openCreate();

      expect(page.quote()).toBeNull();
      expect(page.submitDisabled()).toBe(true);
    });

    it('disabled when canAfford is false', async () => {
      const fixture = render();
      const page = fixture.componentInstance;
      await page.openCreate();
      page.selectedDocumentId.set('doc-1');
      page.quote.set(buildQuote({ canAfford: false }));

      expect(page.submitDisabled()).toBe(true);
      expect(page.submitDisabledReason()).toContain('ยอดคงเหลือไม่พอ');
    });

    it('disabled when fullDates is non-empty', async () => {
      const fixture = render();
      const page = fixture.componentInstance;
      await page.openCreate();
      page.selectedDocumentId.set('doc-1');
      page.quote.set(buildQuote({ fullDates: ['2026-09-21'] }));

      expect(page.submitDisabled()).toBe(true);
      expect(page.submitDisabledReason()).toContain('เต็มแล้ว');
    });


    it('disabled while submitting', async () => {
      const fixture = render();
      const page = fixture.componentInstance;
      await page.openCreate();
      page.quote.set(buildQuote());
      page.submitting.set(true);

      expect(page.submitDisabled()).toBe(true);
    });

    it('enabled once a valid, affordable, non-full quote exists and nothing is submitting', async () => {
      const fixture = render();
      const page = fixture.componentInstance;
      await page.openCreate();
      page.quote.set(buildQuote());

      expect(page.submitDisabled()).toBe(false);
    });
  });

  it('submit() sends expectedTotalAmount straight from quote().totalAmount (never recomputed)', async () => {
    const ads = buildAdsFake();
    const fixture = render(ads);
    const page = fixture.componentInstance;
    await page.openCreate();
    page.selectedDocumentId.set('doc-1');
    page.selectedPlacementKey.set('search_top');
    page.dateRange.set([new Date('2026-09-20'), new Date('2026-09-26')]);
    page.quote.set(buildQuote({ totalAmount: 999 }));

    await page.submit();

    expect(ads.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ expectedTotalAmount: 999 }),
    );
  });

  it('§4.2 rule 5: a 409 price-changed result re-fetches the quote instead of resubmitting', async () => {
    const ads = buildAdsFake();
    ads.createCampaign.mockResolvedValue({
      ok: false,
      kind: 'price_changed',
      message: 'ราคาเปลี่ยนแปลง กรุณาตรวจสอบราคาใหม่อีกครั้ง',
    });
    const fixture = render(ads);
    const page = fixture.componentInstance;
    await page.openCreate();
    page.selectedDocumentId.set('doc-1');
    page.selectedPlacementKey.set('search_top');
    page.dateRange.set([new Date('2026-09-20'), new Date('2026-09-26')]);
    page.quote.set(buildQuote());
    ads.getQuote.mockClear();

    await page.submit();

    expect(page.formError()).toBe('ราคาเปลี่ยนแปลง กรุณาตรวจสอบราคาใหม่อีกครั้ง');
    expect(ads.getQuote).toHaveBeenCalled();
    expect(page.formOpen()).toBe(true);
  });

  it('§4.2 rule 6: a 409 full-dates result highlights the calendar (re-fetches availability) and keeps the modal open', async () => {
    const ads = buildAdsFake();
    ads.createCampaign.mockResolvedValue({
      ok: false,
      kind: 'full_dates',
      message: 'ช่วงวันที่เลือกมีวันที่เต็มแล้ว กรุณาเลือกวันอื่น',
      fullDates: ['2026-09-21'],
    });
    const fixture = render(ads);
    const page = fixture.componentInstance;
    await page.openCreate();
    page.selectedDocumentId.set('doc-1');
    page.selectedPlacementKey.set('search_top');
    page.dateRange.set([new Date('2026-09-20'), new Date('2026-09-26')]);
    page.quote.set(buildQuote());
    ads.loadAvailability.mockClear();

    await page.submit();

    expect(page.formError()).toBe('ช่วงวันที่เลือกมีวันที่เต็มแล้ว กรุณาเลือกวันอื่น');
    expect(ads.loadAvailability).toHaveBeenCalled();
    expect(page.formOpen()).toBe(true);
  });

  it('isDateDisabled() blocks any date reported un-selectable by the server', async () => {
    const ads = buildAdsFake();
    ads.loadAvailability.mockResolvedValue({
      placementKey: 'search_top',
      targetKey: '*',
      pricePerDay: 199,
      weeklyPrice: 999,
      dailySlotCapacity: 2,
      days: [{ date: '2026-09-21', remainingSlots: 0, isSelectable: false }],
    });
    const fixture = render(ads);
    const page = fixture.componentInstance;
    await page.openCreate();
    page.onPlacementChange('search_top');
    await fixture.whenStable();

    expect(page.isDateDisabled(new Date('2026-09-21T12:00:00'))).toBe(true);
  });
});

describe('SellerAdsPage — cancel campaign (AC-36)', () => {
  it('confirmCancel() opens NzModalService.confirm (never native confirm) stating the refund amount', async () => {
    const modalConfirm = vi.fn();
    const fixture = render(buildAdsFake(), buildSellerFake(), modalConfirm);
    await fixture.whenStable();

    fixture.componentInstance.confirmCancel(
      buildCampaign({ startDate: '2026-01-01', endDate: '2026-01-01', pricePerDay: 199 }),
    );

    expect(modalConfirm).toHaveBeenCalledTimes(1);
    const args = modalConfirm.mock.calls[0][0];
    expect(args.nzContent).toContain('ไม่มีเงินคืน');
    expect(args.nzOkDanger).toBe(true);
  });

  it('cancelling calls AdsService.cancelCampaign and refreshes the list on success', async () => {
    const ads = buildAdsFake();
    const modalConfirm = vi.fn((opts: { nzOnOk: () => void }) => opts.nzOnOk());
    const fixture = render(ads, buildSellerFake(), modalConfirm);
    await fixture.whenStable();
    ads.listCampaigns.mockClear();

    fixture.componentInstance.confirmCancel(buildCampaign());
    await fixture.whenStable();

    expect(ads.cancelCampaign).toHaveBeenCalledWith('camp-1');
    expect(ads.listCampaigns).toHaveBeenCalled();
  });
});
