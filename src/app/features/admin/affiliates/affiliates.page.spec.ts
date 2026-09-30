import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminAffiliatesPage } from './affiliates.page';
import { AdminService } from '../../../core/services/admin.service';
import type { AdminAffiliateSummary } from '../../../core/models';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';

describe('AdminAffiliatesPage', () => {
  let component: AdminAffiliatesPage;
  let fixture: ComponentFixture<AdminAffiliatesPage>;
  let mockAffiliates: AdminAffiliateSummary[];
  let getAffiliatesSpy: ReturnType<typeof vi.fn>;
  let updateSettingsSpy: ReturnType<typeof vi.fn>;
  let messageSuccessSpy: ReturnType<typeof vi.fn>;
  let messageErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockAffiliates = [
      {
        userId: 'usr-1',
        displayName: 'สมชาย นักแชร์',
        email: 'somchai@example.com',
        code: 'SOMCHAI10',
        commissionRatePercent: 10,
        commissionRatePercentOverride: 10,
        isActive: true,
        totalClicks: 55,
        totalConversions: 8,
        commissionEarnedTotal: 1200,
      },
      {
        userId: 'usr-2',
        displayName: 'สมหญิง การค้า',
        email: 'somying@example.com',
        code: 'SOMYING20',
        commissionRatePercent: 15,
        commissionRatePercentOverride: null,
        isActive: false,
        totalClicks: 12,
        totalConversions: 1,
        commissionEarnedTotal: 150,
      },
    ];

    getAffiliatesSpy = vi.fn().mockResolvedValue({
      items: mockAffiliates,
      totalCount: 2,
      page: 1,
      pageSize: 10,
    });

    updateSettingsSpy = vi.fn().mockResolvedValue(true);
    messageSuccessSpy = vi.fn();
    messageErrorSpy = vi.fn();

    const fakeAdminService = {
      getAffiliates: getAffiliatesSpy,
      updateAffiliateSettings: updateSettingsSpy,
    };

    const fakeMessageService = {
      success: messageSuccessSpy,
      error: messageErrorSpy,
    };

    await TestBed.configureTestingModule({
      imports: [AdminAffiliatesPage],
      providers: [
        { provide: AdminService, useValue: fakeAdminService },
        { provide: NzMessageService, useValue: fakeMessageService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminAffiliatesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('loads affiliates on mount and renders header copy', () => {
    expect(getAffiliatesSpy).toHaveBeenCalledWith(1, 10);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('จัดการลิงก์พันธมิตร');
    expect(el.textContent).toContain('สมชาย นักแชร์');
    expect(el.textContent).toContain('SOMCHAI10');
    expect(el.textContent).toContain('สมหญิง การค้า');
  });

  // referral-program v3 §1.6/§4.2, AC-40: toggling `isActive` must echo the row's existing
  // `commissionRatePercentOverride` back — omitting it makes the backend clear the override (§3.10).
  it('toggles affiliate active state and echoes the existing rate override (AC-40)', async () => {
    const item = component.items()[0];
    expect(item.commissionRatePercentOverride).toBe(10);

    await component.toggleActive(item);

    expect(updateSettingsSpy).toHaveBeenCalledWith('usr-1', {
      isActive: false,
      commissionRatePercentOverride: 10,
    });
    expect(component.items()[0].isActive).toBe(false);
    // the override itself must be untouched by a toggle-only update
    expect(component.items()[0].commissionRatePercentOverride).toBe(10);
    expect(messageSuccessSpy).toHaveBeenCalledWith('ปิดใช้งานสำเร็จ');
  });

  // AC-40: same behavior when the row has no override set — must echo `null`, not omit the field.
  it('toggles affiliate active state and echoes null when no override is set (AC-40)', async () => {
    const item = component.items()[1];
    expect(item.commissionRatePercentOverride).toBeNull();

    await component.toggleActive(item);

    expect(updateSettingsSpy).toHaveBeenCalledWith('usr-2', {
      isActive: true,
      commissionRatePercentOverride: null,
    });
  });

  it('opens and closes settings modal', () => {
    const item = component.items()[0];
    component.openSettingsModal(item);

    expect(component.editingAffiliate()).toBe(item);
    expect(component.rateOverrideInput()).toBe(10);

    component.closeSettingsModal();
    expect(component.editingAffiliate()).toBeNull();
    expect(component.rateOverrideInput()).toBeNull();
  });

  it('saves rate override in settings modal', async () => {
    const item = component.items()[0];
    component.openSettingsModal(item);
    component.rateOverrideInput.set(20);

    await component.saveSettings();

    // §3.10: the request always carries `isActive` alongside the rate — the required field on
    // the wire has no partial-update semantics (see the comment on `AdminService.updateAffiliateSettings`).
    expect(updateSettingsSpy).toHaveBeenCalledWith('usr-1', {
      isActive: true,
      commissionRatePercentOverride: 20,
    });
    expect(component.items()[0].commissionRatePercent).toBe(20);
    expect(messageSuccessSpy).toHaveBeenCalledWith('บันทึกการตั้งค่าสำเร็จ');
    expect(component.editingAffiliate()).toBeNull();
  });

  // referral-program v3 §1.6/§4.2, AC-41: an intentional "clear the override" via the rate-edit
  // form must still send `commissionRatePercentOverride: null` — the AC-40 fix above only changes
  // `toggleActive()`, `saveSettings()` is untouched and keeps working as before.
  it('still sends commissionRatePercentOverride: null when the admin intentionally clears the rate (AC-41)', async () => {
    const item = component.items()[0];
    component.openSettingsModal(item);
    component.rateOverrideInput.set(null);

    await component.saveSettings();

    expect(updateSettingsSpy).toHaveBeenCalledWith('usr-1', {
      isActive: true,
      commissionRatePercentOverride: null,
    });
    expect(messageSuccessSpy).toHaveBeenCalledWith('บันทึกการตั้งค่าสำเร็จ');
  });

  // responsive-ui v1.6 R-27: at >=744 the table shows at most 10 rows and scrolls the rest inside
  // its wrapper; the pagination stays outside it, and a new page or page size starts at the top.
  it('R-27: the table sits in a named table viewport that a new page or page size scrolls back to the top', async () => {
    const el: HTMLElement = fixture.nativeElement;
    const wrapper = (el.querySelector('table.rtable') as HTMLTableElement).parentElement as HTMLElement;
    const pagination = el.querySelector('app-pagination') as HTMLElement;
    expect(wrapper.classList).toContain('rt-viewport');
    expect(wrapper.contains(pagination)).toBe(false);
    expect(wrapper.compareDocumentPosition(pagination) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const viewport = fixture.debugElement.query(By.directive(TableViewportDirective)).injector.get(TableViewportDirective);
    expect(viewport.rtLabel()).toBe('จัดการลิงก์พันธมิตร');

    getAffiliatesSpy.mockImplementation(async (p: number, size: number) => ({
      items: mockAffiliates,
      totalCount: 40,
      page: p,
      pageSize: size,
    }));
    const scrollTopAfter = async (act: () => unknown): Promise<number> => {
      wrapper.scrollTop = 300;
      await act();
      fixture.detectChanges();
      for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      return wrapper.scrollTop;
    };

    expect(await scrollTopAfter(() => component.onPageChange(2))).toBe(0);
    expect(await scrollTopAfter(() => component.onPageSizeChange(20))).toBe(0);
    // A row action updates the row in place: same query, same place.
    expect(await scrollTopAfter(() => component.toggleActive(component.items()[0]))).toBe(300);
  });
});
