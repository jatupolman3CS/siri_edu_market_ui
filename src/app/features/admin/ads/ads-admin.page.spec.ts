import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdsAdminPage } from './ads-admin.page';
import { AdsService } from '../../../core/services';
import type { AdminAdsCampaign, AdminAdsPlacement } from '../../../core/models';

/**
 * seller-ads-promotion v1 (docs/contracts/seller-ads-promotion.md §1.4 "frontend spec", §3.11,
 * §4.1, §4.4) — AC-37: `/admin/ads` shows the all-campaigns queue + a stop button (forced reason
 * + refund choice) and a placements tab with price/capacity/switch validation.
 */
function buildCampaign(over: Partial<AdminAdsCampaign> = {}): AdminAdsCampaign {
  return {
    id: 'camp-1',
    documentId: 'doc-1',
    documentTitle: 'สรุปเคมี ม.6',
    documentCoverUrl: '',
    sellerId: 'seller-1',
    sellerName: 'ครูพิม',
    sellerAvailableBalance: 1600,
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
    status: 'active',
    stopReason: null,
    stopNote: null,
    stoppedAt: null,
    impressions: 12,
    clicks: 3,
    createdAt: '2026-09-15T00:00:00.000Z',
    ...over,
  };
}

function buildPlacement(over: Partial<AdminAdsPlacement> = {}): AdminAdsPlacement {
  return {
    placementKey: 'search_top',
    displayName: 'บนสุดของผลค้นหา',
    description: 'd',
    pricePerDay: 199,
    weeklyPrice: 999,
    dailySlotCapacity: 2,
    requiresTarget: false,
    maxPerResultPage: 2,
    isEnabled: true,
    activeCampaignCount: 3,
    updatedAt: null,
    ...over,
  };
}

function buildAdsFake() {
  return {
    adminListCampaigns: vi.fn().mockResolvedValue({
      items: [buildCampaign()],
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
    }),
    adminStopCampaign: vi.fn().mockResolvedValue({ ok: true, campaign: buildCampaign({ status: 'stopped' }) }),
    adminListPlacements: vi.fn().mockResolvedValue([buildPlacement()]),
    adminUpdatePlacement: vi.fn().mockResolvedValue({ ok: true, placement: buildPlacement({ pricePerDay: 250 }) }),
  };
}

function render(ads: ReturnType<typeof buildAdsFake> = buildAdsFake()) {
  TestBed.configureTestingModule({
    imports: [AdsAdminPage],
    providers: [
      { provide: AdsService, useValue: ads },
      { provide: NzMessageService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(AdsAdminPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('AdsAdminPage — campaigns tab (AC-37)', () => {
  it('loads campaigns + placements on construction', async () => {
    const ads = buildAdsFake();
    const fixture = render(ads);
    await fixture.whenStable();

    expect(ads.adminListCampaigns).toHaveBeenCalled();
    expect(ads.adminListPlacements).toHaveBeenCalled();
    expect(fixture.componentInstance.campaigns()).toHaveLength(1);
    expect(fixture.componentInstance.placements()).toHaveLength(1);
  });

  it('re-fetches with status/placement/sellerId filters', async () => {
    const ads = buildAdsFake();
    const fixture = render(ads);
    const page = fixture.componentInstance;
    await fixture.whenStable();
    ads.adminListCampaigns.mockClear();

    page.onStatusFilterChange('stopped');
    await fixture.whenStable();
    page.onPlacementFilterChange('category_top');
    await fixture.whenStable();
    page.onSellerIdFilterChange('seller-9');
    page.applySellerIdFilter();
    await fixture.whenStable();

    expect(ads.adminListCampaigns).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'stopped', placement: 'category_top', sellerId: 'seller-9' }),
    );
  });

  it('canStop() only allows stopping scheduled/active campaigns', () => {
    const fixture = render();
    const page = fixture.componentInstance;

    expect(page.canStop(buildCampaign({ status: 'active' }))).toBe(true);
    expect(page.canStop(buildCampaign({ status: 'scheduled' }))).toBe(true);
    expect(page.canStop(buildCampaign({ status: 'stopped' }))).toBe(false);
    expect(page.canStop(buildCampaign({ status: 'completed' }))).toBe(false);
    expect(page.canStop(buildCampaign({ status: 'cancelled' }))).toBe(false);
  });

  describe('stop-campaign modal (§3.11.2)', () => {
    it('stopReasonValid() requires at least 10 trimmed characters', async () => {
      const fixture = render();
      const page = fixture.componentInstance;
      page.openStop(buildCampaign());

      page.stopReason.set('สั้นไป');
      expect(page.stopReasonValid()).toBe(false);

      page.stopReason.set('ละเมิดกฎการโฆษณาของแพลตฟอร์ม');
      expect(page.stopReasonValid()).toBe(true);
    });

    it('defaults refundRemainingDays to true when opening the modal', () => {
      const fixture = render();
      const page = fixture.componentInstance;

      page.openStop(buildCampaign());

      expect(page.refundRemainingDays()).toBe(true);
    });

    it('confirmStop() sends reason + refundRemainingDays and refreshes the list on success', async () => {
      const ads = buildAdsFake();
      const fixture = render(ads);
      const page = fixture.componentInstance;
      await fixture.whenStable();
      page.openStop(buildCampaign());
      page.stopReason.set('ละเมิดกฎการโฆษณาของแพลตฟอร์ม');
      page.refundRemainingDays.set(false);
      ads.adminListCampaigns.mockClear();

      await page.confirmStop();

      expect(ads.adminStopCampaign).toHaveBeenCalledWith('camp-1', 'ละเมิดกฎการโฆษณาของแพลตฟอร์ม', false);
      expect(ads.adminListCampaigns).toHaveBeenCalled();
      expect(page.stopTarget()).toBeNull();
    });

    it('confirmStop() is a no-op while the reason is still invalid', async () => {
      const ads = buildAdsFake();
      const fixture = render(ads);
      const page = fixture.componentInstance;
      page.openStop(buildCampaign());
      page.stopReason.set('สั้นไป');

      await page.confirmStop();

      expect(ads.adminStopCampaign).not.toHaveBeenCalled();
    });
  });
});

describe('AdsAdminPage — placements tab (AC-37, §3.11.4)', () => {
  it('openEditPlacement() seeds the form from the row', () => {
    const fixture = render();
    const page = fixture.componentInstance;

    page.openEditPlacement(buildPlacement({ pricePerDay: 250, weeklyPrice: null }));

    expect(page.placementForm()).toEqual({
      pricePerDay: 250,
      weeklyPrice: null,
      dailySlotCapacity: 2,
      maxPerResultPage: 2,
      isEnabled: true,
    });
  });

  describe('placementFormError() — §3.11.4 validation', () => {
    it('rejects pricePerDay <= 0 or > 100000', () => {
      const fixture = render();
      const page = fixture.componentInstance;
      page.openEditPlacement(buildPlacement());

      page.updatePlacementForm({ pricePerDay: 0 });
      expect(page.placementFormError()).not.toBeNull();

      page.updatePlacementForm({ pricePerDay: 100001 });
      expect(page.placementFormError()).not.toBeNull();

      page.updatePlacementForm({ pricePerDay: 199 });
      expect(page.placementFormError()).toBeNull();
    });

    it('rejects weeklyPrice > pricePerDay * 7', () => {
      const fixture = render();
      const page = fixture.componentInstance;
      page.openEditPlacement(buildPlacement({ pricePerDay: 100, weeklyPrice: 999 }));

      page.updatePlacementForm({ weeklyPrice: 701 });
      expect(page.placementFormError()).not.toBeNull();

      page.updatePlacementForm({ weeklyPrice: 700 });
      expect(page.placementFormError()).toBeNull();
    });

    it('accepts weeklyPrice = null (no weekly package)', () => {
      const fixture = render();
      const page = fixture.componentInstance;
      page.openEditPlacement(buildPlacement());

      page.updatePlacementForm({ weeklyPrice: null });

      expect(page.placementFormError()).toBeNull();
    });

    it('rejects dailySlotCapacity outside 1..10', () => {
      const fixture = render();
      const page = fixture.componentInstance;
      page.openEditPlacement(buildPlacement());

      page.updatePlacementForm({ dailySlotCapacity: 11 });
      expect(page.placementFormError()).not.toBeNull();
      page.updatePlacementForm({ dailySlotCapacity: 0 });
      expect(page.placementFormError()).not.toBeNull();
    });

    it('rejects maxPerResultPage outside 1..2', () => {
      const fixture = render();
      const page = fixture.componentInstance;
      page.openEditPlacement(buildPlacement());

      page.updatePlacementForm({ maxPerResultPage: 3 });
      expect(page.placementFormError()).not.toBeNull();
    });
  });

  it('savePlacement() sends the full body and refreshes the list on success', async () => {
    const ads = buildAdsFake();
    const fixture = render(ads);
    const page = fixture.componentInstance;
    await fixture.whenStable();
    page.openEditPlacement(buildPlacement());
    page.updatePlacementForm({ pricePerDay: 250 });
    ads.adminListPlacements.mockClear();

    await page.savePlacement();

    expect(ads.adminUpdatePlacement).toHaveBeenCalledWith('search_top', {
      pricePerDay: 250,
      weeklyPrice: 999,
      dailySlotCapacity: 2,
      maxPerResultPage: 2,
      isEnabled: true,
    });
    expect(ads.adminListPlacements).toHaveBeenCalled();
    expect(page.editingPlacement()).toBeNull();
  });

  it('savePlacement() shows the server 409 message inline and keeps the modal open', async () => {
    const ads = buildAdsFake();
    ads.adminUpdatePlacement.mockResolvedValue({ ok: false, message: 'มีวันที่ขายเกินความจุใหม่ไปแล้ว' });
    const fixture = render(ads);
    const page = fixture.componentInstance;
    page.openEditPlacement(buildPlacement());

    await page.savePlacement();

    expect(page.placementFormErrorMessage()).toBe('มีวันที่ขายเกินความจุใหม่ไปแล้ว');
    expect(page.editingPlacement()).not.toBeNull();
  });

  it('savePlacement() is a no-op while the form is invalid', async () => {
    const ads = buildAdsFake();
    const fixture = render(ads);
    const page = fixture.componentInstance;
    page.openEditPlacement(buildPlacement());
    page.updatePlacementForm({ pricePerDay: 0 });

    await page.savePlacement();

    expect(ads.adminUpdatePlacement).not.toHaveBeenCalled();
  });
});
