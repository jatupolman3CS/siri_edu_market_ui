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
      personalizedWatermarkFontFamily?: string;
      personalizedWatermarkColor?: string;
      personalizedWatermarkOpacity?: number;
      personalizedWatermarkRotation?: number;
      personalizedWatermarkFontSize?: number;
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
    personalizedWatermarkFontFamily: 'Kanit',
    personalizedWatermarkColor: '#654321',
    personalizedWatermarkOpacity: 0.6,
    personalizedWatermarkRotation: 15,
    personalizedWatermarkFontSize: 24,
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

    // watermark-completion v5 §3.12.1/§4.9: the 5 new personalized style signals must default to
    // the exact values the backend falls back to when the config columns are null, so an
    // untouched document renders identically to what the backend will actually stamp.
    it('should default the 5 new personalized style signals to the backend fallback values', () => {
      expect(component.downloadWatermarkFontFamily()).toBe('Noto Sans Thai');
      expect(component.downloadWatermarkColor()).toBe('#b41e1e');
      expect(component.downloadWatermarkOpacity()).toBe(35);
      expect(component.downloadWatermarkFontSize()).toBe(16);
      expect(component.downloadWatermarkRotation()).toBe(-30);
    });

    it('should update the personalized color via setDownloadColor', () => {
      component.setDownloadColor('#4F46E5');
      expect(component.downloadWatermarkColor()).toBe('#4F46E5');
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

    // watermark-completion v5 §3.12.2/§4.9: the 5 new personalized style fields must also be
    // persisted into the local template config (used to seed new documents), same as the
    // existing personalizedWatermarkPosition/Template fields already are.
    it('should save the 5 new personalized style fields into the local watermark template', () => {
      component.downloadWatermarkFontFamily.set('Prompt');
      component.downloadWatermarkColor.set('#4F46E5');
      component.downloadWatermarkOpacity.set(70);
      component.downloadWatermarkFontSize.set(20);
      component.downloadWatermarkRotation.set(45);
      component.saveConfig();

      const saved = storedTemplate;
      expect(saved?.config.personalizedWatermarkFontFamily).toBe('Prompt');
      expect(saved?.config.personalizedWatermarkColor).toBe('#4F46E5');
      expect(saved?.config.personalizedWatermarkOpacity).toBeCloseTo(0.7);
      expect(saved?.config.personalizedWatermarkFontSize).toBe(20);
      expect(saved?.config.personalizedWatermarkRotation).toBe(45);
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
      // watermark-completion v5 §3.12.2/§4.9: the 5 new personalized style fields map from the
      // GET response into their signals the same way the existing web-preview fields do.
      expect(component.downloadWatermarkFontFamily()).toBe('Kanit');
      expect(component.downloadWatermarkColor()).toBe('#654321');
      expect(component.downloadWatermarkOpacity()).toBe(60);
      expect(component.downloadWatermarkFontSize()).toBe(24);
      expect(component.downloadWatermarkRotation()).toBe(15);
    });

    // watermark-completion v5 §3.12.1/§4.9: when the backend response has the 5 new fields
    // absent/null (not-yet-configured document), the signals fall back to the same backend
    // default values used for a brand-new config, not `undefined`/`NaN`.
    it('should fall back to backend default values when the 5 new personalized fields are absent from the GET response', async () => {
      const { personalizedWatermarkFontFamily, personalizedWatermarkColor, personalizedWatermarkOpacity, personalizedWatermarkRotation, personalizedWatermarkFontSize, ...rest } = sampleDocumentConfig;
      stubRoute('GET', watermarkConfigPath('doc-1'), rest);

      await setup('doc-1');
      fixture.detectChanges();
      await settle();

      expect(component.downloadWatermarkFontFamily()).toBe('Noto Sans Thai');
      expect(component.downloadWatermarkColor()).toBe('#b41e1e');
      expect(component.downloadWatermarkOpacity()).toBe(35);
      expect(component.downloadWatermarkFontSize()).toBe(16);
      expect(component.downloadWatermarkRotation()).toBe(-30);
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

    // watermark-completion v5 §3.12.2/§4.9: the 5 new personalized style fields must be included
    // in the POST body sent to `postApiSellerDocumentsByIdWatermarkConfig`, using the loaded
    // values from GET when untouched by the seller (mirrors the previewWatermarkOpacity
    // round-trip assertion above).
    it('should include the 5 new personalized style fields in the POST body', async () => {
      stubRoute('GET', watermarkConfigPath('doc-1'), sampleDocumentConfig);
      stubRoute('POST', watermarkConfigPath('doc-1'), sampleDocumentConfig);

      await setup('doc-1');
      fixture.detectChanges();
      await settle();

      component.downloadWatermarkFontFamily.set('Prompt');
      component.downloadWatermarkColor.set('#4F46E5');
      component.downloadWatermarkOpacity.set(70);
      component.downloadWatermarkFontSize.set(20);
      component.downloadWatermarkRotation.set(45);
      component.saveConfig();
      await settle();

      const postCalls = requests.filter(
        (r) => r.method === 'POST' && r.path === watermarkConfigPath('doc-1'),
      );
      expect(postCalls.length).toBe(1);
      const sentBody = JSON.parse(postCalls[0].body) as SellerWatermarkConfigRequest;
      expect(sentBody.personalizedWatermarkFontFamily).toBe('Prompt');
      expect(sentBody.personalizedWatermarkColor).toBe('#4F46E5');
      // opacity round-trips as a 0-1 fraction on the wire, same convention as previewWatermarkOpacity.
      expect(sentBody.personalizedWatermarkOpacity).toBeCloseTo(0.7);
      expect(sentBody.personalizedWatermarkFontSize).toBe(20);
      expect(sentBody.personalizedWatermarkRotation).toBe(45);
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

    // Real-preview fix, case (a): hasMainFile=true + non-empty previewImageUrls renders the
    // real-preview affordance, and opening it shows the modal with the URLs resolved via
    // `resolvePublicUrl` (absolute https URLs round-trip unchanged).
    it('should render the real-preview thumbnail grid and open the modal with resolved URLs', async () => {
      const rasterUrls = [
        'https://cdn.example.com/previews/doc-1-page-1.jpg',
        'https://cdn.example.com/previews/doc-1-page-2.jpg',
      ];
      stubRoute('GET', watermarkConfigPath('doc-1'), {
        ...sampleDocumentConfig,
        hasMainFile: true,
        previewImageUrls: rasterUrls,
      });

      await setup('doc-1');
      fixture.detectChanges();
      await settle();
      fixture.detectChanges();

      expect(component.hasRealPreview()).toBe(true);
      expect(component.previewImageUrls()).toEqual(rasterUrls);

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('ตัวอย่างจริงบนเว็บไซต์');
      expect(el.textContent).not.toContain('ยังไม่มีตัวอย่างจริง');

      component.openRealPreview();
      fixture.detectChanges();

      expect(component.showPreviewGallery()).toBe(true);
      const modalImages = Array.from(
        el.querySelectorAll<HTMLImageElement>('.preview-modal-content img'),
      ).map((img) => img.src);
      expect(modalImages).toEqual(rasterUrls);
    });

    // Real-preview fix, case (b): hasMainFile=false (or an empty previewImageUrls) shows the
    // informative message instead of the thumbnail grid.
    it('should show the "not generated yet" notice when hasMainFile is false', async () => {
      stubRoute('GET', watermarkConfigPath('doc-1'), {
        ...sampleDocumentConfig,
        hasMainFile: false,
        previewImageUrls: [],
      });

      await setup('doc-1');
      fixture.detectChanges();
      await settle();
      fixture.detectChanges();

      expect(component.hasRealPreview()).toBe(false);
      expect(component.showRealPreviewEmptyNotice()).toBe(true);

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('ยังไม่มีตัวอย่างจริง');
      expect(el.querySelectorAll('.preview-modal-content')).toHaveLength(0);
    });

    it('should show the "not generated yet" notice when previewImageUrls is empty even with a main file', async () => {
      stubRoute('GET', watermarkConfigPath('doc-1'), {
        ...sampleDocumentConfig,
        hasMainFile: true,
        previewImageUrls: [],
      });

      await setup('doc-1');
      fixture.detectChanges();
      await settle();
      fixture.detectChanges();

      expect(component.hasRealPreview()).toBe(false);
      expect(component.showRealPreviewEmptyNotice()).toBe(true);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('ยังไม่มีตัวอย่างจริง');
    });
  });

  // Real-preview fix, case (c): template mode (no `:id`) never renders the real-preview section,
  // regardless of what the loaded config would say — there is no `getConfig()` call at all in
  // this mode, so `hasMainFile`/`previewImageUrls` stay at their initial empty defaults.
  describe('real preview — template mode never renders it', () => {
    it('should not render the real-preview section in template mode', async () => {
      await setup(null);
      fixture.detectChanges();
      await settle();
      fixture.detectChanges();

      expect(component.documentId()).toBeNull();
      expect(component.hasRealPreview()).toBe(false);
      expect(component.showRealPreviewEmptyNotice()).toBe(false);

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).not.toContain('ตัวอย่างจริงบนเว็บไซต์');
      expect(el.textContent).not.toContain('ยังไม่มีตัวอย่างจริง');
    });
  });

  // watermark-completion v5 §4.9: the personalized tab's 5 new style controls exist and the Buyer
  // Simulator reacts live to them, mirroring the "web-preview" tab's own established pattern.
  // Load/save wiring against the real SDK is covered separately above (document-mode GET/POST
  // and template-mode local-storage save tests).
  describe('personalized watermark style controls (watermark-completion v5 §4.9)', () => {
    beforeEach(async () => {
      await setup(null);
      component.activeTab.set('personalized');
      fixture.detectChanges();
    });

    function findByText(selector: string, text: string): Element | undefined {
      const el: HTMLElement = fixture.nativeElement;
      return Array.from(el.querySelectorAll(selector)).find((node) =>
        node.textContent?.includes(text),
      );
    }

    it('should render a font family select populated from previewWatermarkFontOptions', () => {
      const el: HTMLElement = fixture.nativeElement;
      const select = el.querySelector<HTMLSelectElement>('select');
      expect(select).not.toBeNull();
      const optionValues = Array.from(select?.querySelectorAll('option') ?? []).map(
        (o) => o.value,
      );
      expect(optionValues).toEqual(component.previewWatermarkFontOptions);
    });

    it('should render opacity/font-size/rotation range sliders for the personalized tab', () => {
      const el: HTMLElement = fixture.nativeElement;
      const ranges = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="range"]'));
      // one set on 'web-preview' (not rendered while personalized is active) — this tab renders
      // exactly opacity + fontSize + rotation = 3 sliders of its own.
      expect(ranges.length).toBe(3);
    });

    it("should show the diagonal-only hint when position isn't diagonal, and hide it when it is", () => {
      component.downloadWatermarkPosition.set('footer');
      fixture.detectChanges();
      expect(findByText('p', 'มีผลเฉพาะตำแหน่งพาดเฉียงกลางหน้า')).toBeTruthy();

      component.downloadWatermarkPosition.set('diagonal');
      fixture.detectChanges();
      expect(findByText('p', 'มีผลเฉพาะตำแหน่งพาดเฉียงกลางหน้า')).toBeFalsy();
    });

    it('should reflect downloadWatermarkColor/Opacity live on the footer buyer-simulator stamp', () => {
      component.downloadWatermarkPosition.set('footer');
      component.downloadWatermarkColor.set('#4F46E5');
      component.downloadWatermarkOpacity.set(70);
      fixture.detectChanges();

      const stamp = findByText('span.font-mono', component.simulatedDownloadText()) as
        | HTMLElement
        | undefined;
      expect(stamp).toBeTruthy();
      expect(stamp?.style.color).toBe('rgb(79, 70, 229)');
      expect(stamp?.style.opacity).toBe('0.7');
    });

    it('should reflect downloadWatermarkRotation live via transform on the diagonal buyer-simulator stamp', () => {
      component.downloadWatermarkPosition.set('diagonal');
      component.downloadWatermarkRotation.set(45);
      fixture.detectChanges();

      const stamp = findByText('span.font-mono', component.simulatedDownloadText()) as
        | HTMLElement
        | undefined;
      expect(stamp).toBeTruthy();
      expect(stamp?.style.transform).toBe('rotate(45deg)');
    });

    it('should reflect downloadWatermarkFontSize live via font-size on the buyer-simulator stamp', () => {
      component.downloadWatermarkPosition.set('footer');
      component.downloadWatermarkFontSize.set(40);
      fixture.detectChanges();

      const stamp = findByText('span.font-mono', component.simulatedDownloadText()) as
        | HTMLElement
        | undefined;
      expect(stamp).toBeTruthy();
      expect(stamp?.style.fontSize).toBe('20px');
    });
  });

  /**
   * pdf-preview-popup-and-i18n-fix v1 §4 — AC-1/AC-2:
   * download position radio options must show translated label/description text,
   * not raw seller.* key strings.
   */
  describe('(i18n) download positions section — no raw seller. keys rendered', () => {
    beforeEach(async () => {
      await setup(null);
      component.activeTab.set('personalized');
      fixture.detectChanges();
    });

    it('renders no element whose text content starts with "seller." in the download positions section', () => {
      const root = fixture.nativeElement as HTMLElement;
      const leafTexts = Array.from(root.querySelectorAll('*'))
        .filter((el: Element) => el.children.length === 0)
        .map((el: Element) => (el.textContent ?? '').trim())
        .filter((t) => t.length > 0);

      for (const text of leafTexts) {
        expect(text).not.toMatch(/^seller\./);
      }
    });
  });

  /**
   * preview-pdf-error-shape-and-watermark-template-length v1 §4.4 — AC-18.
   *
   * The DTO has said `[MaxLength(512)]` all along while the column was `varchar(256)` and the
   * textarea had no limit at all, so a seller could type 300 characters, save, and get a 500 out
   * of the DB layer. The column is now 512 and the input is capped at the same number.
   */
  describe('(AC-18) personalized watermark template length cap', () => {
    beforeEach(async () => {
      await setup(null);
      component.activeTab.set('personalized');
      fixture.detectChanges();
    });

    it('caps the template textarea at 512 characters — the DTO/column limit', () => {
      const textarea = (fixture.nativeElement as HTMLElement).querySelector(
        'textarea[data-testid="watermark-template-input"]',
      ) as HTMLTextAreaElement | null;

      expect(textarea).toBeTruthy();
      expect(textarea?.getAttribute('maxlength')).toBe('512');
      expect(textarea?.maxLength).toBe(512);
    });

    it('shows an n/512 counter that tracks the current template length', () => {
      component.downloadWatermarkTemplate.set('ก๐'.repeat(7));
      fixture.detectChanges();

      const counter = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="watermark-template-counter"]',
      );
      expect(counter?.textContent?.trim()).toBe('14/512');
    });

    it('shows the Thai length hint next to the counter', () => {
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('ใช้ได้สูงสุด 512 ตัวอักษร');
    });
  });
});
