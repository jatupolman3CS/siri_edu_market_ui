import { TestBed } from '@angular/core/testing';
import { ExamHubService } from './exam-hub.service';

describe('ExamHubService', () => {
  let service: ExamHubService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ExamHubService],
    });
    service = TestBed.inject(ExamHubService);
  });

  it('initializes with null page, empty docs, and idle states', () => {
    expect(service.page()).toBeNull();
    expect(service.state().status).toBe('idle');
    expect(service.updateState().status).toBe('idle');
    expect(service.docs()).toEqual([]);
  });

  it('loadPage loads stub page data for tgas-tpat', async () => {
    await service.loadPage('tgat-tpat');
    const page = service.page();
    expect(page).not.toBeNull();
    expect(page?.examType).toBe('tgat-tpat');
    expect(page?.title).toBe('TGAT/TPAT — เตรียมสอบวัดความถนัด');
    expect(service.state().status).toBe('idle');
  });

  it('loadPage loads stub page data for a-level', async () => {
    await service.loadPage('a-level');
    const page = service.page();
    expect(page).not.toBeNull();
    expect(page?.examType).toBe('a-level');
    expect(page?.title).toBe('A-Level — สอบวิชาสามัญ');
  });

  it('loadDocuments resets and loads first page', async () => {
    await service.loadDocuments('onet');
    expect(service.docs()).toEqual([]);
    expect(service.docsState().status).toBe('idle');
  });

  it('updatePage updates page state in stub mode and sets updateState to success', async () => {
    await service.loadPage('tcas');
    await service.updatePage('tcas', {
      title: 'TCAS 2570 — ระบบคัดเลือกใหม่',
      examDateInfo: 'พฤษภาคม 2570',
    });

    const page = service.page();
    expect(page?.title).toBe('TCAS 2570 — ระบบคัดเลือกใหม่');
    expect(page?.examDateInfo).toBe('พฤษภาคม 2570');
    expect(service.updateState().status).toBe('success');
  });

  it('setPageForTesting overrides page signal', () => {
    service.setPageForTesting({
      examType: 'onet',
      title: 'O-NET พิเศษ',
      metaDescription: 'Desc',
      introText: 'Intro',
    });

    expect(service.page()?.title).toBe('O-NET พิเศษ');
  });
});
