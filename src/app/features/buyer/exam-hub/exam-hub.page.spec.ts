import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { ExamHubPage } from './exam-hub.page';
import { ExamHubService, CartService, WishlistService } from '../../../core/services';
import type { ExamHubType } from '../../../core/models';
import { signal } from '@angular/core';

const fakeCart = { has: () => false, openDrawer: vi.fn(), add: vi.fn() };
const fakeWishlist = { has: () => false, toggle: vi.fn() };

describe('ExamHubPage', () => {
  let examHubService: ExamHubService;
  let titleService: Title;
  let metaService: Meta;

  function setup(examType: ExamHubType) {
    TestBed.configureTestingModule({
      imports: [ExamHubPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { examType },
            },
          },
        },
        { provide: CartService, useValue: fakeCart },
        { provide: WishlistService, useValue: fakeWishlist },
      ],
    });

    examHubService = TestBed.inject(ExamHubService);
    titleService = TestBed.inject(Title);
    metaService = TestBed.inject(Meta);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('renders correctly for tgat-tpat with its specific title and empty state', async () => {
    setup('tgat-tpat');
    const fixture = TestBed.createComponent(ExamHubPage);
    await fixture.componentInstance.loadAll();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent?.trim()).toBe(
      'TGAT/TPAT — เตรียมสอบวัดความถนัด',
    );
    expect(compiled.textContent).toContain('ยังไม่มีเอกสารสำหรับสนามสอบนี้ในตอนนี้');
    expect(titleService.getTitle()).toContain('TGAT/TPAT');
  });

  it('renders different content for a-level', async () => {
    setup('a-level');
    const fixture = TestBed.createComponent(ExamHubPage);
    await fixture.componentInstance.loadAll();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent?.trim()).toBe(
      'A-Level — สอบวิชาสามัญ',
    );
    expect(titleService.getTitle()).toContain('A-Level');
  });

  it('renders different content for tcas and onet', async () => {
    setup('onet');
    const fixture = TestBed.createComponent(ExamHubPage);
    await fixture.componentInstance.loadAll();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent?.trim()).toBe(
      'O-NET — สอบมาตรฐานการศึกษา',
    );
  });

  it('renders info cards when examDateInfo is present', async () => {
    setup('tcas');
    const fixture = TestBed.createComponent(ExamHubPage);
    fixture.detectChanges();
    await fixture.whenStable();

    examHubService.setPageForTesting({
      examType: 'tcas',
      title: 'TCAS — ระบบคัดเลือกเข้ามหาวิทยาลัย',
      metaDescription: 'รายละเอียด TCAS',
      introText: 'รวมเอกสาร TCAS',
      examDateInfo: 'รอบ 3 Admission 1-10 พ.ค. 2570',
      scoreCriteriaInfo: 'ใช้คะแนน TGAT/TPAT และ A-Level',
      trendInfo: 'แข่งขันสูงในสายแพทย์และวิศวะ',
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const cards = compiled.querySelector('[data-testid="exam-hub-info-cards"]');
    expect(cards).not.toBeNull();
    expect(compiled.textContent).toContain('กำหนดการสอบ');
    expect(compiled.textContent).toContain('รอบ 3 Admission 1-10 พ.ค. 2570');
    expect(compiled.textContent).toContain('เกณฑ์คะแนน');
    expect(compiled.textContent).toContain('เทรนด์ข้อสอบ');
  });

  it('hides info cards section when all 3 info fields are absent', async () => {
    setup('tcas');
    const fixture = TestBed.createComponent(ExamHubPage);
    fixture.detectChanges();
    await fixture.whenStable();

    examHubService.setPageForTesting({
      examType: 'tcas',
      title: 'TCAS',
      metaDescription: 'Desc',
      introText: 'Intro',
      examDateInfo: undefined,
      scoreCriteriaInfo: undefined,
      trendInfo: undefined,
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const cards = compiled.querySelector('[data-testid="exam-hub-info-cards"]');
    expect(cards).toBeNull();
  });
});
