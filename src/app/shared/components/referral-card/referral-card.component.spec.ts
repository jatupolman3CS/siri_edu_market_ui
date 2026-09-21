import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ReferralCardComponent } from './referral-card.component';
import { AffiliateService, ReferralService } from '../../../core/services';
import type { ReferralSummary } from '../../../core/models';
import { errorActionState, idleActionState, loadingActionState, type ActionState } from '../../../core/services/action-state';

describe('ReferralCardComponent', () => {
  let component: ReferralCardComponent;
  let fixture: ComponentFixture<ReferralCardComponent>;
  let mockSummary: ReturnType<typeof signal<ReferralSummary | null>>;
  let mockAffSummary: ReturnType<typeof signal<any>>;
  let mockState: ReturnType<typeof signal<ActionState>>;
  let refreshCalled: boolean;

  beforeEach(async () => {
    mockSummary = signal<ReferralSummary | null>(null);
    mockAffSummary = signal<any>(null);
    mockState = signal<ActionState>(idleActionState());
    refreshCalled = false;

    const fakeReferralService = {
      summary: mockSummary.asReadonly(),
      state: mockState.asReadonly(),
      refreshSummary: () => {
        refreshCalled = true;
        return Promise.resolve();
      },
    };

    const fakeMessageService = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    };

    const fakeAffiliateService = {
      summary: mockAffSummary.asReadonly(),
      state: signal(idleActionState()).asReadonly(),
      refreshSummary: () => Promise.resolve(),
    };

    await TestBed.configureTestingModule({
      imports: [ReferralCardComponent],
      providers: [
        { provide: ReferralService, useValue: fakeReferralService },
        { provide: AffiliateService, useValue: fakeAffiliateService },
        { provide: NzMessageService, useValue: fakeMessageService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReferralCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('calls refreshSummary on mount', () => {
    expect(refreshCalled).toBe(true);
  });

  it('renders exact header and description copy', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('ชวนเพื่อน รับส่วนลดคนละ 20 บาท');
    expect(el.textContent).toContain('แชร์ลิงก์นี้ให้เพื่อน เมื่อเพื่อนซื้อเอกสารครั้งแรกสำเร็จ คุณจะได้เครดิตส่วนลด 20 บาททันที');
  });

  it('renders em dash while loading', () => {
    mockState.set(loadingActionState());
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('—');
  });

  it('renders code and counters when summary is loaded', () => {
    mockSummary.set({
      code: 'FRIEND88',
      shareUrl: 'http://localhost:4200/marketplace?ref=FRIEND88',
      totalReferred: 5,
      unusedCreditCount: 2,
      unusedCreditTotal: 40,
    });
    mockState.set(idleActionState());
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('FRIEND88');
    expect(el.textContent).toContain('แนะนำสำเร็จแล้ว 5 คน');
    expect(el.textContent).toContain('เครดิตคงเหลือ 2 ใบ (40 บาท)');
  });

  it('shows error state when load fails', () => {
    mockState.set(errorActionState('fail'));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('โหลดข้อมูลชวนเพื่อนไม่สำเร็จ');
  });

  it('copies share link on button click', async () => {
    mockSummary.set({
      code: 'SHARE123',
      shareUrl: 'http://localhost:4200/marketplace?ref=SHARE123',
      totalReferred: 0,
      unusedCreditCount: 0,
      unusedCreditTotal: 0,
    });
    fixture.detectChanges();

    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextSpy },
    });

    await component.copyShareUrl();
    expect(writeTextSpy).toHaveBeenCalledWith('http://localhost:4200/marketplace?ref=SHARE123');
    expect(component.copied()).toBe(true);
  });

  it('renders dynamic referral discount amount and affiliate commission rate percent when configured', () => {
    mockSummary.set({
      code: 'FRIEND99',
      shareUrl: 'http://localhost:4200/marketplace?ref=FRIEND99',
      totalReferred: 3,
      unusedCreditCount: 1,
      unusedCreditTotal: 50,
      referralDiscountAmount: 50,
    });
    mockAffSummary.set({
      code: 'AFF99',
      commissionRatePercent: 10,
      commissionEarnedTotal: 150,
      totalClicks: 20,
      totalConversions: 5,
    });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('ชวนเพื่อน รับส่วนลดคนละ 50 บาท & ลิงก์พันธมิตร รับค่าคอมมิชชัน 10%');
    expect(el.textContent).toContain('เครดิตส่วนลด 50 บาททันที');
    expect(el.textContent).toContain('ค่าคอมมิชชัน 10%');
    expect(el.textContent).toContain('เพื่อนได้ส่วนลด 50 บาททันที');
    expect(el.textContent).toContain('คุณได้ส่วนลด 50 บาท + คอมมิชชัน 10%');
    expect(el.textContent).toContain('150 บาท (10%)');
  });
});
