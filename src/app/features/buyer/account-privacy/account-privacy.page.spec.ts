import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AccountPrivacyPage } from './account-privacy.page';
import { CrmService } from '../../../core/services';
import type { MyCrmProfile } from '../../../core/models';

/**
 * crm-core v1 §1.3/§4.3 (`docs/contracts/crm-core.md`) — AC-21, AC-22.
 *
 * Round 1: `CrmService.loadMine/setTracking/deleteMyData` are `TODO(contract)` stubs (see the
 * service's class doc). These specs drive the page against a stubbed `CrmService` (`vi.fn`),
 * the same style `account-subscription.page.spec.ts` / `announcements-admin.page.spec.ts` use
 * for their own round-1-stubbed services — a unit test of the page's wiring/state, not of the
 * SDK calls the stubs will make once wired (round 2, `crm-core-fe-wire`).
 */

function buildProfile(overrides: Partial<MyCrmProfile> = {}): MyCrmProfile {
  return {
    trackingEnabled: true,
    computedAt: '2026-09-10T00:00:00Z',
    interestConfidence: 0.42,
    topInterests: [
      {
        facetType: 'category',
        value: 'cat-1',
        label: 'คณิตศาสตร์',
        score: 0.8,
        reason: 'เพราะคุณเคยซื้อเอกสารในหมวดนี้ 2 รายการ',
      },
    ],
    segments: [{ code: 'repeat_buyer', label: 'ซื้อซ้ำ', kind: 'lifecycle', reason: 'ซื้อไปแล้ว 2 รายการ' }],
    signalCounts: {
      documentViews: 10,
      searches: 5,
      purchases: 2,
      subscriptionAccesses: 0,
      wishlistItems: 1,
      cartItems: 0,
      sellerFollows: 0,
      reviews: 0,
      declaredInterests: 1,
    },
    dataRetentionDays: 90,
    ...overrides,
  };
}

function buildCrmFake(initial: MyCrmProfile | null) {
  let profile = initial;
  return {
    myProfile: () => profile,
    loadingMine: () => false,
    loadMine: vi.fn(async () => {}),
    // Mirrors what the wired §3.2 handler will do: an `enabled=false` response also carries the
    // now-empty interest/segment lists (§3.2 — the delete happens server-side, same request).
    setTracking: vi.fn(async (enabled: boolean) => {
      if (!profile) return;
      profile = {
        ...profile,
        trackingEnabled: enabled,
        topInterests: enabled ? profile.topInterests : [],
        segments: enabled ? profile.segments : [],
      };
    }),
    deleteMyData: vi.fn(async () => {
      if (!profile) return;
      profile = { ...profile, computedAt: null, interestConfidence: 0, topInterests: [], segments: [] };
    }),
  };
}

function render(crmFake: ReturnType<typeof buildCrmFake>) {
  TestBed.configureTestingModule({
    imports: [AccountPrivacyPage],
    providers: [
      { provide: CrmService, useValue: crmFake },
      {
        provide: NzMessageService,
        useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
      },
    ],
  });
  const fixture = TestBed.createComponent(AccountPrivacyPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('AccountPrivacyPage', () => {
  it('AC-21: turning the tracking switch off calls the service exactly once and clears the interest/segment lists immediately, no reload', async () => {
    const crmFake = buildCrmFake(buildProfile());
    const fixture = render(crmFake);

    let text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('คณิตศาสตร์');
    expect(text).toContain('ซื้อซ้ำ');

    await fixture.componentInstance.onToggleTracking(false);
    fixture.detectChanges();

    expect(crmFake.setTracking).toHaveBeenCalledTimes(1);
    expect(crmFake.setTracking).toHaveBeenCalledWith(false);

    text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ปิดอยู่ — ระบบจะไม่เก็บพฤติกรรมของคุณอีก และข้อมูลเดิมถูกลบไปแล้ว');
    expect(text).toContain('ยังไม่มีข้อมูลมากพอที่จะวิเคราะห์ความสนใจของคุณ');
    expect(text).not.toContain('คณิตศาสตร์');
    expect(text).not.toContain('ซื้อซ้ำ');
  });

  it('AC-22: the delete button always opens NzModalService.confirm first — cancelling never calls the service', () => {
    const crmFake = buildCrmFake(buildProfile());
    const fixture = render(crmFake);
    const modal = fixture.debugElement.injector.get(NzModalService);
    const confirmSpy = vi.spyOn(modal, 'confirm');

    fixture.componentInstance.confirmDelete();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const options = confirmSpy.mock.calls[0][0] as { nzTitle?: string };
    expect(options.nzTitle).toBe('ยืนยันการลบข้อมูล');
    expect(crmFake.deleteMyData).not.toHaveBeenCalled();
  });

  it('AC-22: confirming the delete dialog calls deleteMyData exactly once', async () => {
    const crmFake = buildCrmFake(buildProfile());
    const fixture = render(crmFake);
    const modal = fixture.debugElement.injector.get(NzModalService);
    vi.spyOn(modal, 'confirm').mockImplementation((...args: Parameters<typeof modal.confirm>) => {
      const options = args[0] as { nzOnOk?: () => unknown } | undefined;
      void options?.nzOnOk?.();
      return {} as ReturnType<typeof modal.confirm>;
    });

    fixture.componentInstance.confirmDelete();
    await Promise.resolve();
    await Promise.resolve();

    expect(crmFake.deleteMyData).toHaveBeenCalledTimes(1);
  });
});
