import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services';
import { SellerWatermarkTemplateService } from '../../../core/services/seller-watermark-template.service';
import type { SellerWatermarkConfigRequest } from '../../../core/api';
import { WatermarkEditorPage } from './watermark-editor.page';

// `SellerWatermarkService` (real, non-mocked instance via `providedIn: 'root'`) calls the
// generated SDK, which ultimately calls `fetch` — rather than mocking the service itself, this
// stubs the underlying `globalThis.fetch` (same pattern already used by
// `admin/document-detail.page.spec.ts` for its own direct API-function calls) and lets the real
// request/response mapping run end-to-end.
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; body: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

describe('WatermarkEditorPage', () => {
  let component: WatermarkEditorPage;
  let fixture: ComponentFixture<WatermarkEditorPage>;

  const fakeAuthService = {
    user: vi.fn().mockReturnValue({ id: 'seller-test-1', email: 'seller@test.com' }),
  };

  const fakeMessageService = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  };

  type TemplateData = {
    enabled: boolean;
    previewWatermarkSubtitle: string;
    previewWatermarkFontFamily: string;
    config: {
      previewWatermarkPosition: string;
      previewWatermarkOpacity: number;
      previewWatermarkColor: string;
      previewWatermarkFontSize: number;
      previewWatermarkRotation: number;
      personalizedWatermarkPosition: string;
      personalizedWatermarkTemplate: string;
    };
  };

  let storedTemplate: TemplateData | null = null;
  const mockTemplateService = {
    loadOrDefault: vi.fn((): TemplateData => {
      return (
        storedTemplate ?? {
          enabled: true,
          previewWatermarkSubtitle: '',
          previewWatermarkFontFamily: 'Noto Sans Thai',
          config: {
            previewWatermarkPosition: 'center-diagonal',
            previewWatermarkOpacity: 0.25,
            previewWatermarkColor: '#E11D48',
            previewWatermarkFontSize: 42,
            previewWatermarkRotation: -30,
            personalizedWatermarkPosition: 'footer',
            personalizedWatermarkTemplate: '',
          },
        }
      );
    }),
    save: vi.fn((_id: string | null | undefined, tpl: TemplateData) => {
      storedTemplate = tpl;
      return true;
    }),
    load: vi.fn((_id?: string | null): TemplateData | null => storedTemplate),
  };

  const fakeRouter = {
    navigate: vi.fn(),
  };

  const sampleDocumentConfig = {
    documentId: 'doc-1',
    title: 'เอกสารตัวอย่าง',
    format: 'pdf',
    watermarkEnabled: true,
    previewWatermarkSubtitle: 'DOC WATERMARK TEXT',
    previewWatermarkFontFamily: 'Sarabun',
    previewWatermarkPosition: 'top-left',
    previewWatermarkOpacity: 0.4,
    previewWatermarkColor: '#123456',
    previewWatermarkRotation: 10,
    previewWatermarkFontSize: 30,
    personalizedWatermarkPosition: 'header',
    personalizedWatermarkTemplate: 'ดาวน์โหลดโดย {email}',
    previewImageUrls: [],
    hasMainFile: true,
  };

  const watermarkConfigPath = (id: string) => `/api/seller/documents/${id}/watermark-config`;

  beforeEach(() => {
    routes = new Map();
    requests = [];
    realFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      const path = url.pathname;
      requests.push({ method: request.method, path, body: await request.clone().text() });

      const route = routes.get(`${request.method} ${path}`);
      if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
      return jsonResponse(route.body, route.status ?? 200);
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** Builds the TestBed with a given route param map (present `id` = document mode). */
  async function setup(routeId: string | null): Promise<void> {
    storedTemplate = null;
    fakeRouter.navigate.mockClear();
    fakeMessageService.success.mockClear();
    fakeMessageService.error.mockClear();

    await TestBed.configureTestingModule({
      imports: [WatermarkEditorPage],
      providers: [
        { provide: AuthService, useValue: fakeAuthService },
        { provide: NzMessageService, useValue: fakeMessageService },
        { provide: SellerWatermarkTemplateService, useValue: mockTemplateService },
        { provide: Router, useValue: fakeRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatermarkEditorPage);
    component = fixture.componentInstance;
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  describe('template mode (no :id)', () => {
    beforeEach(async () => {
      await setup(null);
      fixture.detectChanges();
    });

    it('should create component with default tab and settings', () => {
      expect(component).toBeTruthy();
      expect(component.documentId()).toBeNull();
      expect(component.activeTab()).toBe('web-preview');
      expect(component.watermarkPosition()).toBe('center-diagonal');
      expect(component.watermarkOpacity()).toBe(25);
      expect(component.watermarkColor()).toBe('#E11D48');
    });

    it('should switch tabs correctly', () => {
      component.activeTab.set('personalized');
      expect(component.activeTab()).toBe('personalized');

      component.activeTab.set('web-preview');
      expect(component.activeTab()).toBe('web-preview');
    });

    it('should adjust rotation when changing to center-diagonal or tile', () => {
      component.setPosition('top-left');
      expect(component.watermarkPosition()).toBe('top-left');
      expect(component.watermarkRotation()).toBe(0);

      component.setPosition('center-diagonal');
      expect(component.watermarkPosition()).toBe('center-diagonal');
      expect(component.watermarkRotation()).toBe(-30);

      component.setPosition('tile');
      expect(component.watermarkPosition()).toBe('tile');
      expect(component.watermarkRotation()).toBe(-25);
    });

    it('should insert variable tags into download template', () => {
      component.downloadWatermarkTemplate.set('เอกสารนี้ของ {email}');
      component.insertTag('{token}');
      expect(component.downloadWatermarkTemplate()).toBe('เอกสารนี้ของ {email} {token}');
    });

    it('should compute personalized download text replacing {email}, {token}, {date}, and {platform}', () => {
      component.simBuyerEmail.set('test.buyer@edu.ac.th');
      component.simToken.set('SEC-TEST-999');
      component.downloadWatermarkTemplate.set(
        'ผู้ซื้อ: {email} | รหัส: {token} | แพลตฟอร์ม: {platform}'
      );

      const result = component.simulatedDownloadText();
      expect(result).toContain('ผู้ซื้อ: test.buyer@edu.ac.th');
      expect(result).toContain('รหัส: SEC-TEST-999');
      expect(result).toContain('แพลตฟอร์ม: SIRI EDUMARKET');
    });

    // AC-04 / AC-08: the "ข้อความลายน้ำ" input is bound to `watermarkText` — saveConfig() must
    // persist exactly that value, in both modes. No orphaned parallel signal any more.
    it('should save template configuration using SellerWatermarkTemplateService', () => {
      component.watermarkText.set('CUSTOM SELLER WATERMARK');
      component.watermarkPosition.set('bottom-right');
      component.saveConfig();

      expect(mockTemplateService.save).toHaveBeenCalled();
      const saved = storedTemplate;
      expect(saved).not.toBeNull();
      expect(saved?.previewWatermarkSubtitle).toBe('CUSTOM SELLER WATERMARK');
      expect(saved?.config.previewWatermarkPosition).toBe('bottom-right');
    });

    // AC-06: template mode must never call the document watermark-config endpoints.
    it('should never call the document watermark-config API in template mode', async () => {
      component.saveConfig();
      await settle();

      expect(requests.some((r) => r.path.includes('watermark-config'))).toBe(false);
    });

    it('should not be in a loading state', () => {
      expect(component.loading()).toBe(false);
    });
  });

  describe('document mode (:id present)', () => {
    // AC-01 / AC-02: the route param reaches the component and every field maps per §4.
    it('should read the document id from the route and load config via GET once on init', async () => {
      stubRoute('GET', watermarkConfigPath('doc-1'), sampleDocumentConfig);

      await setup('doc-1');
      fixture.detectChanges();
      await settle();

      expect(component.documentId()).toBe('doc-1');
      const getCalls = requests.filter(
        (r) => r.method === 'GET' && r.path === watermarkConfigPath('doc-1'),
      );
      expect(getCalls.length).toBe(1);

      expect(component.loading()).toBe(false);
      expect(component.documentTitle()).toBe('เอกสารตัวอย่าง');
      expect(component.watermarkEnabled()).toBe(true);
      expect(component.watermarkText()).toBe('DOC WATERMARK TEXT');
      expect(component.watermarkPosition()).toBe('top-left');
      expect(component.watermarkOpacity()).toBe(40);
      expect(component.watermarkColor()).toBe('#123456');
      expect(component.watermarkFontSize()).toBe(30);
      expect(component.watermarkRotation()).toBe(10);
      expect(component.downloadWatermarkPosition()).toBe('header');
      expect(component.downloadWatermarkTemplate()).toBe('ดาวน์โหลดโดย {email}');
    });

    it('should show a loading state until GET resolves', async () => {
      stubRoute('GET', watermarkConfigPath('doc-1'), sampleDocumentConfig);

      await setup('doc-1');
      fixture.detectChanges();

      expect(component.loading()).toBe(true);

      await settle();

      expect(component.loading()).toBe(false);
    });

    // AC-03: GET failure -> Thai error toast + navigate away, form never rendered.
    it('should show an error toast and navigate to /seller/documents when GET fails', async () => {
      // No stub registered for 'doc-missing' -> the fetch mock answers 404, matching a real
      // "not found / not this seller's document" response.
      await setup('doc-missing');
      fixture.detectChanges();
      await settle();

      expect(fakeMessageService.error).toHaveBeenCalledWith(
        'ไม่พบเอกสารนี้ หรือคุณไม่มีสิทธิ์แก้ไข',
      );
      expect(fakeRouter.navigate).toHaveBeenCalledWith(['/seller/documents']);
      expect(component.loading()).toBe(true);
    });

    // AC-04 / AC-05: save in document mode calls POST with the field currently bound to the
    // "ข้อความลายน้ำ" input, shows a mode-specific success toast, and does not navigate away.
    it('should save via POST in document mode using the current watermarkText value', async () => {
      stubRoute('GET', watermarkConfigPath('doc-1'), sampleDocumentConfig);
      stubRoute('POST', watermarkConfigPath('doc-1'), sampleDocumentConfig);

      await setup('doc-1');
      fixture.detectChanges();
      await settle();

      component.watermarkText.set('EDITED FOR THIS DOCUMENT');
      component.saveConfig();
      await settle();

      const postCalls = requests.filter(
        (r) => r.method === 'POST' && r.path === watermarkConfigPath('doc-1'),
      );
      expect(postCalls.length).toBe(1);
      const sentBody = JSON.parse(postCalls[0].body) as SellerWatermarkConfigRequest;
      expect(sentBody.previewWatermarkSubtitle).toBe('EDITED FOR THIS DOCUMENT');
      // opacity round-trips as a 0-1 fraction on the wire (watermark-editor-document-mode v1 §4).
      expect(sentBody.previewWatermarkOpacity).toBeCloseTo(0.4);

      expect(fakeMessageService.success).toHaveBeenCalledWith(
        'บันทึกลายน้ำของเอกสารนี้เรียบร้อยแล้ว',
      );
      expect(fakeRouter.navigate).not.toHaveBeenCalled();
    });

    it('should show an error toast and keep the form values when POST fails', async () => {
      stubRoute('GET', watermarkConfigPath('doc-1'), sampleDocumentConfig);
      stubRoute('POST', watermarkConfigPath('doc-1'), { title: 'save failed' }, 500);

      await setup('doc-1');
      fixture.detectChanges();
      await settle();

      component.watermarkText.set('SHOULD SURVIVE FAILURE');
      component.saveConfig();
      await settle();

      expect(fakeMessageService.error).toHaveBeenCalledWith(
        'บันทึกลายน้ำของเอกสารนี้ไม่สำเร็จ กรุณาลองใหม่',
      );
      expect(component.watermarkText()).toBe('SHOULD SURVIVE FAILURE');
      expect(component.saving()).toBe(false);
    });
  });
});
