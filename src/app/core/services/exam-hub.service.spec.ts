import { TestBed } from '@angular/core/testing';
import { ExamHubService } from './exam-hub.service';

describe('ExamHubService', () => {
  let service: ExamHubService;
  let realFetch: typeof globalThis.fetch;
  let routes: Map<string, { status?: number; body: unknown }>;

  function jsonResponse(body: unknown, status = 200): Response {
    if (body === undefined) return new Response(null, { status });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function stubRoute(method: string, path: string, body: unknown, status = 200): void {
    routes.set(`${method.toUpperCase()} ${path}`, { body, status });
  }

  beforeEach(() => {
    routes = new Map();
    realFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      const route = routes.get(`${request.method.toUpperCase()} ${path}`);
      if (!route) {
        return jsonResponse({ title: 'not found', status: 404 }, 404);
      }
      return jsonResponse(route.body, route.status ?? 200);
    }) as typeof globalThis.fetch;

    TestBed.configureTestingModule({
      providers: [ExamHubService],
    });
    service = TestBed.inject(ExamHubService);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    TestBed.resetTestingModule();
  });

  it('initializes with null page, empty docs, and idle states', () => {
    expect(service.page()).toBeNull();
    expect(service.state().status).toBe('idle');
    expect(service.updateState().status).toBe('idle');
    expect(service.docs()).toEqual([]);
  });

  it('loadPage loads page data when SDK returns data', async () => {
    stubRoute('GET', '/api/exam-hub/tgat-tpat', {
      examType: 'tgat-tpat',
      title: 'TGAT/TPAT — เตรียมสอบวัดความถนัด (Live)',
      introText: 'รวมเอกสารติว TGAT/TPAT',
      metaDescription: 'คำอธิบาย TGAT/TPAT',
      examDateInfo: '10 ธ.ค. 2569',
      scoreCriteriaInfo: 'เกณฑ์ 50%',
      trendInfo: 'เน้นพาร์ทภาษาอังกฤษ',
      updatedAt: '2026-09-01T00:00:00Z',
    });

    await service.loadPage('tgat-tpat');
    const page = service.page();
    expect(page).not.toBeNull();
    expect(page?.examType).toBe('tgat-tpat');
    expect(page?.title).toBe('TGAT/TPAT — เตรียมสอบวัดความถนัด (Live)');
    expect(page?.examDateInfo).toBe('10 ธ.ค. 2569');
    expect(service.state().status).toBe('idle');
  });

  it('loadPage falls back to stub default page when SDK returns 200 with null data', async () => {
    stubRoute('GET', '/api/exam-hub/a-level', null, 200);

    await service.loadPage('a-level');
    const page = service.page();
    expect(page).not.toBeNull();
    expect(page?.examType).toBe('a-level');
    expect(page?.title).toBe('A-Level — สอบวิชาสามัญ');
    expect(service.state().status).toBe('idle');
  });

  it('loadPage sets error state and clears page when SDK throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    await service.loadPage('tcas');

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.message).toBe('โหลดข้อมูลไม่สำเร็จ');
    }
    expect(service.page()).toBeNull();
  });

  it('loadDocuments resets and loads first page', async () => {
    stubRoute('GET', '/api/exam-hub/onet/documents', {
      items: [],
      page: 1,
      pageSize: 20,
      totalCount: 0,
      totalPages: 0,
    });

    await service.loadDocuments('onet');
    expect(service.docs()).toEqual([]);
    expect(service.docsState().status).toBe('idle');
  });

  it('updatePage updates page state and sets updateState to success on SDK success', async () => {
    stubRoute('PUT', '/api/admin/exam-hub/tcas', {
      examType: 'tcas',
      title: 'TCAS 2570 — ระบบคัดเลือกใหม่',
      introText: 'Intro',
      metaDescription: 'Desc',
      examDateInfo: 'พฤษภาคม 2570',
      updatedAt: '2026-09-02T00:00:00Z',
    });

    await service.updatePage('tcas', {
      title: 'TCAS 2570 — ระบบคัดเลือกใหม่',
      examDateInfo: 'พฤษภาคม 2570',
    });

    const page = service.page();
    expect(page?.title).toBe('TCAS 2570 — ระบบคัดเลือกใหม่');
    expect(page?.examDateInfo).toBe('พฤษภาคม 2570');
    const updateState = service.updateState();
    expect(updateState.status).toBe('success');
    if (updateState.status === 'success') {
      expect(updateState.message).toBe('บันทึกเนื้อหาเรียบร้อย');
    }
  });

  it('updatePage sets error state, rethrows, and does not apply optimistic update when SDK throws', async () => {
    service.setPageForTesting({
      examType: 'tcas',
      title: 'Original Title',
      introText: 'Original Intro',
      metaDescription: 'Original Meta',
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    await expect(
      service.updatePage('tcas', {
        title: 'Optimistic Title Should Not Apply',
        examDateInfo: '2026-12-31',
      }),
    ).rejects.toThrow();

    const updateState = service.updateState();
    expect(updateState.status).toBe('error');
    if (updateState.status === 'error') {
      expect(updateState.message).toBe('บันทึกไม่สำเร็จ');
    }
    expect(service.page()?.title).toBe('Original Title');
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
