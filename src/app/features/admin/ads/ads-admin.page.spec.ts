import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdsAdminPage } from './ads-admin.page';
import { AdsService } from '../../../core/services';
import type { AdminAdsCampaign, AdminAdsPlacement } from '../../../core/models';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';

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

describe('AdsAdminPage — edit-placement form on phones (responsive-ui v1.4 R-22 / F159)', () => {
  it('number fields carry inputmode and the capacity pair only sits side by side from 640', async () => {
    const fixture = render();
    fixture.componentInstance.openEditPlacement(buildPlacement());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const inputs = Array.from(document.body.querySelectorAll('.ant-modal-body input[type="number"]'));
    expect(inputs.length).toBe(4);
    expect(inputs.map((i) => i.getAttribute('inputmode'))).toEqual(['decimal', 'decimal', 'numeric', 'numeric']);
    const pair = inputs[2].closest('.grid') as HTMLElement;
    expect(pair.className.split(/\s+/)).toEqual(expect.arrayContaining(['grid-cols-1', 'sm:grid-cols-2']));
  });
});

describe('AdsAdminPage — campaign table text boxes (responsive-ui v1.4 G-15(b) / G-14(d))', () => {
  const classesOf = (el: Element | null | undefined): string[] => (el?.getAttribute('class') ?? '').split(/\s+/);

  async function renderCampaignRow() {
    const fixture = render();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('puts the 110px table-mode floor on the title and seller text boxes, not on their cells', async () => {
    const el = await renderCampaignRow();
    const title = el.querySelector('[data-testid="ad-title"]');
    const seller = el.querySelector('[data-testid="ad-seller"]');

    expect(title?.textContent?.trim()).toBe('สรุปเคมี ม.6');
    expect(seller?.textContent?.trim()).toBe('ครูพิม');
    expect(classesOf(title)).toEqual(expect.arrayContaining(['min-w-0', 'md:min-w-[110px]', 'md:line-clamp-3']));
    expect(classesOf(seller)).toEqual(expect.arrayContaining(['md:block', 'md:min-w-[110px]']));
    // A floor on the cell also counted the cover, the gap and the padding (the text got 67-93px).
    expect(classesOf(title?.closest('td'))).not.toContain('md:min-w-[110px]');
    expect(classesOf(seller?.closest('td'))).not.toContain('md:min-w-[110px]');
  });

  it('hides the cover at 744-1023 and keeps px-3 cells only from 1280 (K2: the table fits its card)', async () => {
    const el = await renderCampaignRow();
    const titleCell = el.querySelector('[data-testid="ad-title"]')?.closest('td');

    expect(classesOf(titleCell?.querySelector('img'))).toContain('md:max-lg:hidden');
    expect(classesOf(titleCell)).toEqual(expect.arrayContaining(['pr-2', 'xl:pr-3']));
    expect(classesOf(el.querySelector('[data-testid="ad-seller"]')?.closest('td'))).toEqual(
      expect.arrayContaining(['px-2', 'xl:px-3']),
    );
  });

  // responsive-ui v1.6 R-27 item 11: a capped table's vertical scrollbar takes its width from the
  // table. In en the campaigns table was 2px too wide at 744 and 3px at 1280 once capped, so the
  // status and total cells (header and body) give up 2px a side below 1280 and 4px a side from 1280.
  it('trims the status and total cells so a capped table still fits at 744 and 1280 (R-27 item 11)', async () => {
    const el = await renderCampaignRow();
    const headers = Array.from(el.querySelectorAll('table.ads-campaigns > thead > tr > th'));
    const row = el.querySelector('table.ads-campaigns > tbody > tr') as HTMLTableRowElement;

    for (const cell of [headers[1], headers[3], row.querySelector('td.rt-status'), row.querySelectorAll('td.rt-key')[1]]) {
      expect(classesOf(cell)).toEqual(expect.arrayContaining(['px-1.5', 'xl:px-2']));
      expect(classesOf(cell)).not.toContain('px-2');
    }
  });

  it('tags the campaigns table so its phone cards move the status under the title below 375', async () => {
    const el = await renderCampaignRow();
    const table = el.querySelector('table.ads-campaigns');

    expect(table).not.toBeNull();
    expect(table?.classList.contains('rtable')).toBe(true);
    expect(table?.querySelector('td.rt-status')).not.toBeNull();

    // Component styles land in the document as <style> sheets; the rule is scoped to this table.
    const css = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules).map((rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .join('\n')
      .replace(/\s+/g, ' ');
    const media = /@media \(max-width: 374\.98px\) \{(.*?)\} \}/.exec(css)?.[1] ?? '';
    expect(media).toMatch(/\.rtable\.ads-campaigns[^{]*td\.rt-title[^{]*\{ grid-column: 1 ?\/ ?-1; \}/);
    expect(media).toMatch(/\.rtable\.ads-campaigns[^{]*td\.rt-status[^{]*\{ grid-column: 1 ?\/ ?-1; grid-row: 2; justify-self: start;/);
  });
});

describe('AdsAdminPage — table viewports (responsive-ui v1.6 R-27)', () => {
  async function ticks(fixture: ReturnType<typeof render>): Promise<void> {
    fixture.detectChanges();
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  it('the campaigns table sits in a named viewport that a new query scrolls to the top; a draft or the same query does not', async () => {
    const fixture = render();
    await ticks(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const wrapper = (root.querySelector('table.ads-campaigns') as HTMLTableElement).parentElement as HTMLElement;
    const pagination = root.querySelector('app-pagination') as HTMLElement;

    expect(wrapper.classList).toContain('rt-viewport');
    expect(wrapper.contains(pagination)).toBe(false);
    expect(wrapper.compareDocumentPosition(pagination) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const viewport = fixture.debugElement.query(By.css('table.ads-campaigns')).parent!.injector.get(TableViewportDirective);
    expect(viewport.rtLabel()).toBe('แคมเปญทั้งหมด');

    const page = fixture.componentInstance;
    const scrollTopAfter = async (act: () => unknown): Promise<number> => {
      wrapper.scrollTop = 300;
      await act();
      await ticks(fixture);
      return wrapper.scrollTop;
    };
    expect(await scrollTopAfter(() => page.onStatusFilterChange('active'))).toBe(0);
    expect(await scrollTopAfter(() => page.onPlacementFilterChange('search_top'))).toBe(0);
    // The Seller ID box is a draft until it is applied.
    expect(await scrollTopAfter(() => page.onSellerIdFilterChange('seller-9'))).toBe(300);
    expect(await scrollTopAfter(() => page.applySellerIdFilter())).toBe(0);
    expect(await scrollTopAfter(() => page.onPageChange(2))).toBe(0);
    expect(await scrollTopAfter(() => page.onPageSizeChange(20))).toBe(0);
    // A reload of the same query (as after stopping a campaign) keeps the admin's place.
    expect(await scrollTopAfter(() => page.refreshCampaigns())).toBe(300);
  });

  it('the placements table sits in its own viewport, named differently, with no reset key', async () => {
    const fixture = render();
    await ticks(fixture);
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.ant-tabs-tab-btn, [role="tab"]');
    tabs[tabs.length - 1]?.click();
    await ticks(fixture);

    const placementsTable = fixture.debugElement.query(By.css('table.rtable:not(.ads-campaigns)'));
    expect(placementsTable).not.toBeNull();
    expect((placementsTable.nativeElement as HTMLElement).parentElement?.classList).toContain('rt-viewport');
    const placements = placementsTable.parent!.injector.get(TableViewportDirective);
    expect(placements.rtLabel()).toBe('ตำแหน่งโฆษณา');
    expect(placements.rtResetKey()).toBeUndefined();
  });
});
