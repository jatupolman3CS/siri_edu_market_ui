import { TestBed } from '@angular/core/testing';
import { SellerWatermarkService } from './seller-watermark.service';

/**
 * seller-watermark-service-refactor: unit spec for the `core/services/` wrapper that replaced
 * the hand-written `core/api/seller-watermark.api.ts` — stubs `fetch` (same pattern as
 * `exam-countdown.service.spec.ts` / `payout-account.service.spec.ts`) rather than the service
 * under test, so the real request/response mapping through the generated SDK runs end-to-end.
 * End-to-end coverage of both call sites (create/edit flows) already exists via
 * `upload.page.spec.ts` and `watermark-editor.page.spec.ts` — this spec isolates the service
 * itself.
 */
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

function sampleConfig(over: Record<string, unknown> = {}) {
  return {
    documentId: 'doc-1',
    title: 'เอกสารตัวอย่าง',
    format: 'pdf',
    watermarkEnabled: true,
    previewWatermarkSubtitle: 'PREVIEW TEXT',
    previewWatermarkFontFamily: 'Noto Sans Thai',
    previewWatermarkPosition: 'center-diagonal',
    previewWatermarkOpacity: 0.25,
    previewWatermarkColor: '#E11D48',
    previewWatermarkRotation: -30,
    previewWatermarkFontSize: 42,
    personalizedWatermarkPosition: 'footer',
    personalizedWatermarkTemplate: 'เอกสารนี้ได้รับสิทธิ์การใช้งานโดย {email}',
    previewImageUrls: [],
    hasMainFile: true,
    ...over,
  };
}

function buildService(): SellerWatermarkService {
  TestBed.configureTestingModule({ providers: [SellerWatermarkService] });
  return TestBed.inject(SellerWatermarkService);
}

describe('SellerWatermarkService', () => {
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
      if (!route) return jsonResponse({ title: 'no stub', status: 404 }, 404);
      return jsonResponse(route.body, route.status ?? 200);
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('getConfig() calls GET /api/seller/documents/{id}/watermark-config and returns the parsed body', async () => {
    stubRoute('GET', '/api/seller/documents/doc-1/watermark-config', sampleConfig());
    const service = buildService();

    const data = await service.getConfig('doc-1');

    expect(requests).toEqual([
      { method: 'GET', path: '/api/seller/documents/doc-1/watermark-config', body: '' },
    ]);
    expect(data.title).toBe('เอกสารตัวอย่าง');
    expect(data.watermarkEnabled).toBe(true);
  });

  it('getConfig() rejects when the backend responds with a non-2xx status', async () => {
    stubRoute('GET', '/api/seller/documents/doc-missing/watermark-config', { title: 'Not Found' }, 404);
    const service = buildService();

    await expect(service.getConfig('doc-missing')).rejects.toBeTruthy();
  });

  it('saveConfig() calls POST /api/seller/documents/{id}/watermark-config with the given body', async () => {
    stubRoute('POST', '/api/seller/documents/doc-1/watermark-config', sampleConfig({
      previewWatermarkSubtitle: 'UPDATED TEXT',
    }));
    const service = buildService();

    const data = await service.saveConfig('doc-1', {
      watermarkEnabled: true,
      previewWatermarkSubtitle: 'UPDATED TEXT',
      previewWatermarkPosition: 'top-left',
      previewWatermarkOpacity: 0.4,
      previewWatermarkColor: '#123456',
      previewWatermarkFontSize: 30,
      previewWatermarkRotation: 10,
      personalizedWatermarkPosition: 'header',
      personalizedWatermarkTemplate: 'ดาวน์โหลดโดย {email}',
    });

    expect(requests.length).toBe(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].path).toBe('/api/seller/documents/doc-1/watermark-config');
    const sentBody = JSON.parse(requests[0].body) as Record<string, unknown>;
    expect(sentBody['previewWatermarkSubtitle']).toBe('UPDATED TEXT');
    expect(sentBody['previewWatermarkPosition']).toBe('top-left');
    expect(data.previewWatermarkSubtitle).toBe('UPDATED TEXT');
  });

  it('saveConfig() rejects when the backend responds with a non-2xx status', async () => {
    stubRoute('POST', '/api/seller/documents/doc-1/watermark-config', { title: 'save failed' }, 500);
    const service = buildService();

    await expect(
      service.saveConfig('doc-1', { previewWatermarkSubtitle: 'X' }),
    ).rejects.toBeTruthy();
  });
});
