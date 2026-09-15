import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AffiliateLinkCardComponent } from './affiliate-link-card.component';
import { AffiliateService } from '../../../core/services';
import type { AffiliateSummary } from '../../../core/models';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from '../../../core/services/action-state';

describe('AffiliateLinkCardComponent', () => {
  let component: AffiliateLinkCardComponent;
  let fixture: ComponentFixture<AffiliateLinkCardComponent>;
  let mockSummary: ReturnType<typeof signal<AffiliateSummary | null>>;
  let mockState: ReturnType<typeof signal<ActionState>>;
  let refreshCalled: boolean;

  beforeEach(async () => {
    mockSummary = signal<AffiliateSummary | null>(null);
    mockState = signal<ActionState>(idleActionState());
    refreshCalled = false;

    const fakeAffiliateService = {
      summary: mockSummary.asReadonly(),
      state: mockState.asReadonly(),
      refreshSummary: () => {
        refreshCalled = true;
        return Promise.resolve();
      },
    };

    const fakeMessageService = {
      success: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AffiliateLinkCardComponent],
      providers: [
        { provide: AffiliateService, useValue: fakeAffiliateService },
        { provide: NzMessageService, useValue: fakeMessageService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AffiliateLinkCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('calls refreshSummary on mount', () => {
    expect(refreshCalled).toBe(true);
  });

  it('renders exact header and description copy', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('ลิงก์พันธมิตร รับค่าคอมมิชชัน');
    expect(el.textContent).toContain('แชร์ลิงก์นี้ ทุกยอดขายที่เกิดจากลิงก์ของคุณภายใน 30 วันหลังมีคนคลิก');
  });

  it('renders em dash while loading', () => {
    mockState.set(loadingActionState());
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('—');
  });

  it('renders code and counters when summary is loaded', () => {
    mockSummary.set({
      code: 'AFF12345',
      shareUrl: 'http://localhost:4200/marketplace?aff=AFF12345',
      commissionRatePercent: 10,
      isActive: true,
      totalClicks: 24,
      totalConversions: 4,
      commissionEarnedTotal: 480,
    });
    mockState.set(idleActionState());
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('AFF12345');
    expect(el.textContent).toContain('10%');
    expect(el.textContent).toContain('24');
    expect(el.textContent).toContain('4');
    expect(el.textContent).toContain('480');
  });

  it('shows error state when load fails', () => {
    mockState.set(errorActionState('fail'));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('โหลดข้อมูลลิงก์พันธมิตรไม่สำเร็จ');
  });

  it('copies share link on button click', async () => {
    mockSummary.set({
      code: 'MYCODE88',
      shareUrl: 'http://localhost:4200/marketplace?aff=MYCODE88',
      commissionRatePercent: 10,
      isActive: true,
      totalClicks: 0,
      totalConversions: 0,
      commissionEarnedTotal: 0,
    });
    fixture.detectChanges();

    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextSpy },
    });

    await component.copyShareUrl();
    expect(writeTextSpy).toHaveBeenCalledWith('http://localhost:4200/marketplace?aff=MYCODE88');
    expect(component.copied()).toBe(true);
  });
});
