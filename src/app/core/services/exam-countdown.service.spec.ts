import { TestBed } from '@angular/core/testing';
import { ExamCountdownService, daysRemainingFromExamDate } from './exam-countdown.service';
import { mapExamCountdownSetting } from '../api-mappers/mappers';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * exam-countdown-mode v1 (docs/contracts/exam-countdown-mode.md §1 test list / §4).
 *
 * Round 2 (wired): `GET`/`PUT`/`PATCH .../enabled`/`DELETE /api/me/exam-countdown` all hit the
 * real, regenerated SDK now (gate 1 confirmed backend matches this contract, snapshot updated) —
 * this spec stubs `fetch` (mirrors the pattern in `payout-account.service.spec.ts`) rather than
 * the service under test.
 *
 * Response shapes verified against the live backend (`dotnet run` on :5282):
 *  - `GET`'s `404` (never set, AC-5) is ASP.NET Core's auto-`ProblemDetails` body
 *    (`{"type":...,"title":"Not Found","status":404,"traceId":...}`). The SDK client defaults
 *    `throwOnError: true` (`api-runtime.ts`), so `getApiMeExamCountdown()` **throws** rather than
 *    resolving with a `{ response }` to branch on — the service reads the thrown body's own
 *    `status` field via `extractErrorStatus`, never anything else in the body.
 *  - `PUT`'s `400` body is `{"message":"ประเภทสอบไม่ถูกต้อง (Parameter 'ExamType')"}` — no
 *    `status`/`statusCode`/`code`/`title` at all, exactly like `PayoutAccountService`'s `PUT`
 *    `400` (`plainValidationMessage`'s doc comment).
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; body: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  // `undefined` = a truly empty body (matches DELETE's real `204`).
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

function settingBody(over: Record<string, unknown> = {}) {
  return {
    examType: 'TGAT',
    examDate: '2026-12-01',
    isEnabled: true,
    ...over,
  };
}

/** ASP.NET Core's auto-`ProblemDetails` shape — every failure here except `PUT`'s `400`. */
function problemDetails(status: number, title: string) {
  return {
    type: `https://tools.ietf.org/html/rfc9110#section-15.5.5`,
    title,
    status,
    traceId: 'test-trace-id',
  };
}

function searchPage(items: unknown[] = []) {
  return { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 };
}

function documentRow(id: string) {
  return {
    id,
    slug: id,
    title: `เอกสาร ${id}`,
    shortDescription: '',
    price: 100,
    isFree: false,
    format: 'pdf',
    resourceType: 'worksheet',
    averageRating: 4,
    reviewCount: 2,
    downloadCount: 10,
    categoryIds: ['math'],
    seller: { id: 'seller-1', studioName: 'Siri Studio' },
    createdAt: '2026-08-01T00:00:00Z',
  };
}

function buildService(
  apiFail: { report: ReturnType<typeof vi.fn> } = { report: vi.fn() },
): ExamCountdownService {
  TestBed.configureTestingModule({
    providers: [ExamCountdownService, { provide: ApiFailureReporter, useValue: apiFail }],
  });
  return TestBed.inject(ExamCountdownService);
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    const body = await request.clone().text();
    requests.push({ method: request.method, path, body });

    const route = routes.get(`${request.method.toUpperCase()} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub for this route', status: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('mapExamCountdownSetting', () => {
  it('maps every field from a full response', () => {
    const mapped = mapExamCountdownSetting({
      examType: 'TGAT',
      examDate: '2026-10-01',
      isEnabled: true,
    });

    expect(mapped).toEqual({ examType: 'TGAT', examDate: '2026-10-01', isEnabled: true });
  });

  it('maps isEnabled:false correctly (not defaulted to true)', () => {
    const mapped = mapExamCountdownSetting({
      examType: 'A-Level',
      examDate: '2026-11-15',
      isEnabled: false,
    });

    expect(mapped.isEnabled).toBe(false);
  });

  it('falls back to the first known preset when examType is missing/unknown (defensive only)', () => {
    expect(mapExamCountdownSetting({}).examType).toBe('O-NET');
    expect(mapExamCountdownSetting({ examType: 'ไม่รู้จัก' }).examType).toBe('O-NET');
  });
});

describe('daysRemainingFromExamDate (AC-17)', () => {
  function isoDaysFromToday(offsetDays: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  it('returns 14 when examDate is 14 days in the future', () => {
    expect(daysRemainingFromExamDate(isoDaysFromToday(14))).toBe(14);
  });

  it('returns 0 when examDate is today', () => {
    expect(daysRemainingFromExamDate(isoDaysFromToday(0))).toBe(0);
  });

  it('returns -1 when examDate is yesterday', () => {
    expect(daysRemainingFromExamDate(isoDaysFromToday(-1))).toBe(-1);
  });
});

describe('ExamCountdownService — initial state', () => {
  it('starts with setting=null, state=idle, docs=[]', () => {
    const service = buildService();

    expect(service.setting()).toBeNull();
    expect(service.state()).toEqual({ status: 'idle' });
    expect(service.docs()).toEqual([]);
    expect(service.hasMoreDocs()).toBe(true);
  });
});

describe('ExamCountdownService — loadSetting() (§3.1)', () => {
  it('AC-5: 404 (never set) resolves setting=null, state=idle — not a user-facing failure', async () => {
    stubRoute('GET', '/api/me/exam-countdown', problemDetails(404, 'Not Found'), 404);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await service.loadSetting();

    expect(service.setting()).toBeNull();
    expect(service.state()).toEqual({ status: 'idle' });
    expect(apiFail.report).not.toHaveBeenCalled();
  });

  it('AC-6: 200 maps the response and kicks off the exam-filtered docs grid', async () => {
    stubRoute('GET', '/api/me/exam-countdown', settingBody());
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-1')]));
    const service = buildService();

    await service.loadSetting();
    await settle();

    expect(service.setting()).toEqual({ examType: 'TGAT', examDate: '2026-12-01', isEnabled: true });
    expect(service.state()).toEqual({ status: 'idle' });
    expect(service.docs().map((d) => d.id)).toEqual(['doc-1']);
    const search = requests.find((r) => r.method === 'GET' && r.path === '/api/marketplace/search');
    expect(search).toBeDefined();
  });

  it('generic failure (5xx) reports through ApiFailureReporter and sets state=error', async () => {
    stubRoute('GET', '/api/me/exam-countdown', problemDetails(500, 'Internal Server Error'), 500);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await service.loadSetting();

    expect(service.setting()).toBeNull();
    expect(service.state()).toEqual({ status: 'error', message: 'โหลดข้อมูลไม่สำเร็จ' });
    expect(apiFail.report).toHaveBeenCalled();
  });
});

describe('ExamCountdownService — saveSetting() (§3.2)', () => {
  it('PUTs examType/examDate and maps the returned setting (isEnabled forced true by backend)', async () => {
    stubRoute(
      'PUT',
      '/api/me/exam-countdown',
      settingBody({ examType: 'IELTS', examDate: '2026-12-25', isEnabled: true }),
    );
    const service = buildService();

    const result = await service.saveSetting('IELTS', '2026-12-25');

    expect(result).toEqual({ ok: true });
    expect(service.setting()).toEqual({ examType: 'IELTS', examDate: '2026-12-25', isEnabled: true });
    expect(service.state()).toEqual({ status: 'idle' });
    const call = requests.find((r) => r.method === 'PUT' && r.path === '/api/me/exam-countdown');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ examType: 'IELTS', examDate: '2026-12-25' });
  });

  it('AC-2/AC-3: 400 returns { ok:false, error } from the real { message }-only body, no toast', async () => {
    stubRoute('PUT', '/api/me/exam-countdown', { message: 'ประเภทสอบไม่ถูกต้อง' }, 400);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    const result = await service.saveSetting('TGAT', '2026-12-01');

    expect(result).toEqual({ ok: false, error: 'ประเภทสอบไม่ถูกต้อง' });
    expect(service.setting()).toBeNull();
    expect(apiFail.report).not.toHaveBeenCalled();
  });

  it('generic failure falls back to a fixed message, not the raw ProblemDetails body', async () => {
    stubRoute('PUT', '/api/me/exam-countdown', problemDetails(500, 'Internal Server Error'), 500);
    const service = buildService();

    const result = await service.saveSetting('TGAT', '2026-12-01');

    expect(result).toEqual({ ok: false, error: 'บันทึกโหมดใกล้สอบไม่สำเร็จ' });
  });

  it('ends state=idle (not stuck loading) after a successful save', async () => {
    stubRoute('PUT', '/api/me/exam-countdown', settingBody());
    const service = buildService();

    await service.saveSetting('TGAT', '2026-12-01');

    expect(service.state()).toEqual({ status: 'idle' });
  });
});

describe('ExamCountdownService — setEnabled() (§3.3)', () => {
  it('PATCHes { enabled } and updates setting() without touching examType/examDate', async () => {
    stubRoute('PATCH', '/api/me/exam-countdown/enabled', settingBody({ isEnabled: false }));
    const service = buildService();
    service.setSettingForTest({ examType: 'TGAT', examDate: '2026-12-01', isEnabled: true });

    await service.setEnabled(false);

    expect(service.setting()).toEqual({ examType: 'TGAT', examDate: '2026-12-01', isEnabled: false });
    const call = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/api/me/exam-countdown/enabled',
    );
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ enabled: false });
  });

  it('AC-8: 404 (never set) reports through ApiFailureReporter, does not throw', async () => {
    stubRoute('PATCH', '/api/me/exam-countdown/enabled', problemDetails(404, 'Not Found'), 404);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await expect(service.setEnabled(true)).resolves.toBeUndefined();

    expect(apiFail.report).toHaveBeenCalled();
  });
});

describe('ExamCountdownService — clearSetting() (§3.4, idempotent by contract)', () => {
  it('AC-9: DELETEs and clears setting() to null', async () => {
    stubRoute('DELETE', '/api/me/exam-countdown', undefined, 204);
    const service = buildService();
    service.setSettingForTest({ examType: 'IELTS', examDate: '2026-12-25', isEnabled: true });

    await service.clearSetting();

    expect(service.setting()).toBeNull();
    const call = requests.find((r) => r.method === 'DELETE' && r.path === '/api/me/exam-countdown');
    expect(call).toBeDefined();
  });

  it('failure reports through ApiFailureReporter and leaves setting() untouched', async () => {
    stubRoute('DELETE', '/api/me/exam-countdown', problemDetails(500, 'Internal Server Error'), 500);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);
    service.setSettingForTest({ examType: 'IELTS', examDate: '2026-12-25', isEnabled: true });

    await service.clearSetting();

    expect(service.setting()).toEqual({ examType: 'IELTS', examDate: '2026-12-25', isEnabled: true });
    expect(apiFail.report).toHaveBeenCalled();
  });
});

describe('ExamCountdownService — setSettingForTest()', () => {
  it('overrides the setting signal directly, for component-facing tests', () => {
    const service = buildService();

    service.setSettingForTest({ examType: 'O-NET', examDate: '2026-09-20', isEnabled: true });

    expect(service.setting()).toEqual({ examType: 'O-NET', examDate: '2026-09-20', isEnabled: true });
  });
});
