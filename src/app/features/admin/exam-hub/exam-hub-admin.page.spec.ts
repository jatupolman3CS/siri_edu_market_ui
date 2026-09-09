import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ExamHubAdminPage } from './exam-hub-admin.page';
import { ExamHubService } from '../../../core/services';

describe('ExamHubAdminPage', () => {
  let examHubService: ExamHubService;
  let messageService: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let realFetch: typeof globalThis.fetch;
  let pageStore: Record<string, { examType: string; title: string; introText: string; metaDescription: string; examDateInfo?: string }>;

  beforeEach(() => {
    messageService = {
      success: vi.fn(),
      error: vi.fn(),
    };

    pageStore = {
      tcas: {
        examType: 'tcas',
        title: 'TCAS — ระบบคัดเลือกเข้ามหาวิทยาลัย',
        introText: 'รวมเอกสารและข้อมูลอัปเดตล่าสุดสำหรับระบบ TCAS ครบทุกรอบ',
        metaDescription: 'รวมเอกสารและข้อมูลอัปเดตล่าสุดสำหรับระบบ TCAS ครบทุกรอบ',
      },
      'a-level': {
        examType: 'a-level',
        title: 'A-Level — สอบวิชาสามัญ',
        introText: 'รวมเอกสารติว A-Level ครบทุกวิชา',
        metaDescription: 'รวมเอกสารติว A-Level ครบทุกวิชา',
      },
      'tgat-tpat': {
        examType: 'tgat-tpat',
        title: 'TGAT/TPAT — เตรียมสอบวัดความถนัด',
        introText: 'รวมเอกสารติว TGAT และ TPAT ทุกพาร์ท',
        metaDescription: 'รวมเอกสารติว TGAT และ TPAT ทุกพาร์ท',
      },
      onet: {
        examType: 'onet',
        title: 'O-NET — สอบมาตรฐานการศึกษา',
        introText: 'รวมเอกสารติว O-NET ครบทุกช่วงชั้น',
        metaDescription: 'รวมเอกสารติว O-NET ครบทุกช่วงชั้น',
      },
    };

    realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;

      if (request.method === 'GET' && path.startsWith('/api/exam-hub/')) {
        const type = path.replace('/api/exam-hub/', '');
        const data = pageStore[type];
        return new Response(JSON.stringify(data ?? null), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (request.method === 'PUT' && path.startsWith('/api/admin/exam-hub/')) {
        const type = path.replace('/api/admin/exam-hub/', '');
        const body = (await request.clone().json()) as Record<string, string>;
        pageStore[type] = {
          ...pageStore[type],
          ...body,
        };
        return new Response(JSON.stringify(pageStore[type]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    TestBed.configureTestingModule({
      imports: [ExamHubAdminPage],
      providers: [
        ExamHubService,
        { provide: NzMessageService, useValue: messageService },
      ],
    });

    examHubService = TestBed.inject(ExamHubService);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    TestBed.resetTestingModule();
  });

  it('renders header and loads initial tcas page data', async () => {
    const fixture = TestBed.createComponent(ExamHubAdminPage);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent?.trim()).toBe(
      'จัดการเนื้อหาหน้า Exam Hub',
    );
    expect(fixture.componentInstance.selectedExamType()).toBe('tcas');
    expect(fixture.componentInstance.form().title).toBe(
      'TCAS — ระบบคัดเลือกเข้ามหาวิทยาลัย',
    );
  });

  it('switches examType on dropdown selection and updates form', async () => {
    const fixture = TestBed.createComponent(ExamHubAdminPage);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    await fixture.componentInstance.onExamTypeChange('a-level');
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedExamType()).toBe('a-level');
    expect(fixture.componentInstance.form().title).toBe(
      'A-Level — สอบวิชาสามัญ',
    );
  });

  it('saves form data and shows success message', async () => {
    const fixture = TestBed.createComponent(ExamHubAdminPage);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    fixture.componentInstance.patch('title', 'TCAS อัปเดตล่าสุด 2570');
    fixture.componentInstance.patch('examDateInfo', 'สอบธันวาคม 2569');

    await fixture.componentInstance.save();

    expect(messageService.success).toHaveBeenCalledWith('บันทึกเนื้อหาเรียบร้อย');
    const updatedPage = examHubService.page();
    expect(updatedPage?.title).toBe('TCAS อัปเดตล่าสุด 2570');
    expect(updatedPage?.examDateInfo).toBe('สอบธันวาคม 2569');
  });
});
