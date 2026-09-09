import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ExamHubAdminPage } from './exam-hub-admin.page';
import { ExamHubService } from '../../../core/services';

describe('ExamHubAdminPage', () => {
  let examHubService: ExamHubService;
  let messageService: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    messageService = {
      success: vi.fn(),
      error: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ExamHubAdminPage],
      providers: [
        ExamHubService,
        { provide: NzMessageService, useValue: messageService },
      ],
    });

    examHubService = TestBed.inject(ExamHubService);
  });

  afterEach(() => TestBed.resetTestingModule());

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
