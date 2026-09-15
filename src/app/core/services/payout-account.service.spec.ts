import { TestBed } from '@angular/core/testing';
import { PayoutAccountService } from './payout-account.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { mapPayoutAccount } from '../api-mappers/mappers';

/**
 * seller-payout-account-self-service v1 (docs/contracts/seller-payout-account-self-service.md
 * §1 test list / §3.1 / §4).
 * payout-request-slip-verification v1 (docs/contracts/payout-request-slip-verification.md §3.13,
 * §4.6) round 2: `accountType`/PromptPay support added to `save()`/`load()`/`reveal()`.
 *
 * Stubs `fetch` (mirrors the pattern in `payment-method.service.spec.ts`) rather than the service
 * under test, and covers:
 *  - `mapPayoutAccount` mapping a full response (bank and PromptPay), and defaulting every
 *    missing/null field (§1: "map response → model, hasAccount:false เมื่อยังไม่เคยตั้ง")
 *  - each method actually calling its endpoint (method + path + body) and mapping the response
 *  - error handling (§4): `load()` 403 `seller_profile_required` → hides the section (no toast,
 *    no error state); `load()` generic failure → toasts + inline error message; `save()` 400 →
 *    `{ ok:false, error }` from the backend's `{ message }` body, no toast; `save()` generic
 *    failure → `{ ok:false }`, no error string, no toast (component owns that toast — §1: "error
 *    ตอน save คืน error message ให้ component"); `reveal()` never toasts on failure (component
 *    owns "แสดงเลขบัญชีไม่สำเร็จ").
 *
 * Response shapes below were verified against the live backend (`dotnet run` on :5282), not just
 * the contract doc:
 *  - `PUT`'s real `400` body is `{"message":"ธนาคารไม่ถูกต้อง"}` — **no** `status`/`statusCode`/
 *    `code`/`title` at all (`accountBody`'s sibling, `errorBody` below, is only used for the
 *    other endpoints' failures, which — unlike this one — bubble through
 *    `GlobalExceptionMiddleware` and always carry a full `ApiErrorResponse`, `status` included).
 *  - `POST .../reveal`'s `404` (never saved, AC-10) is a truly empty body (`NotFound()`).
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; body: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  // `undefined` = a truly empty body (matches `NotFound()`'s real, content-less response — §AC-10).
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

function accountBody(over: Record<string, unknown> = {}) {
  return {
    hasAccount: true,
    accountType: 'bank',
    bankCode: 'KBANK',
    accountHolderName: 'สมชาย ใจดี',
    accountNumberMasked: '••••••••1234',
    promptPayType: null,
    promptPayMasked: null,
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...over,
  };
}

/**
 * `GlobalExceptionMiddleware.ApiErrorResponse`'s real camelCase shape (verified against
 * `siri_edu_market_backend/src/SIRIEDUMARKET.Api/Middleware/GlobalExceptionMiddleware.cs`) — every
 * failure in this feature *except* `PUT`'s `400` goes through this (the `403
 * seller_profile_required` from `RequireSellerProfileFilter`, and any unhandled 5xx).
 */
function errorBody(status: number, code: string, message: string) {
  return {
    type: `https://siriedumarket/errors/${status}`,
    title: message,
    status,
    detail: message,
    code,
    message,
    statusCode: status,
    traceId: 'test-trace-id',
  };
}

function buildService(apiFail: { report: ReturnType<typeof vi.fn> } = { report: vi.fn() }): PayoutAccountService {
  TestBed.configureTestingModule({
    providers: [PayoutAccountService, { provide: ApiFailureReporter, useValue: apiFail }],
  });
  return TestBed.inject(PayoutAccountService);
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
    if (!route) return jsonResponse({ title: 'no stub for this route' }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('mapPayoutAccount', () => {
  it('maps every field from a bank account response', () => {
    const mapped = mapPayoutAccount(accountBody());

    expect(mapped).toEqual({
      hasAccount: true,
      accountType: 'bank',
      bankCode: 'KBANK',
      accountHolderName: 'สมชาย ใจดี',
      accountNumberMasked: '••••••••1234',
      promptPayType: null,
      promptPayMasked: '',
      updatedAt: '2026-09-08T00:00:00.000Z',
    });
  });

  it('maps a PromptPay account response', () => {
    const mapped = mapPayoutAccount(
      accountBody({
        accountType: 'promptpay',
        bankCode: null,
        accountNumberMasked: null,
        promptPayType: 'phone',
        promptPayMasked: '••••••••5678',
      }),
    );

    expect(mapped.accountType).toBe('promptpay');
    expect(mapped.promptPayType).toBe('phone');
    expect(mapped.promptPayMasked).toBe('••••••••5678');
    expect(mapped.bankCode).toBe('');
  });

  it('§AC-2: defaults every field to a safe empty value when hasAccount is false', () => {
    const mapped = mapPayoutAccount({
      hasAccount: false,
      accountType: null,
      bankCode: null,
      accountHolderName: null,
      accountNumberMasked: null,
      promptPayType: null,
      promptPayMasked: null,
      updatedAt: null,
    });

    expect(mapped).toEqual({
      hasAccount: false,
      accountType: null,
      bankCode: '',
      accountHolderName: '',
      accountNumberMasked: '',
      promptPayType: null,
      promptPayMasked: '',
      updatedAt: '',
    });
  });

  it('defaults every missing field rather than leaving it undefined', () => {
    const mapped = mapPayoutAccount({});

    expect(mapped.hasAccount).toBe(false);
    expect(mapped.accountType).toBeNull();
    expect(mapped.bankCode).toBe('');
    expect(mapped.accountHolderName).toBe('');
    expect(mapped.accountNumberMasked).toBe('');
    expect(mapped.promptPayType).toBeNull();
    expect(mapped.promptPayMasked).toBe('');
    expect(mapped.updatedAt).toBe('');
  });
});

describe('PayoutAccountService', () => {
  it('starts with account=null, state=idle, revealed=null, sellerProfileRequired=false', () => {
    const service = buildService();

    expect(service.account()).toBeNull();
    expect(service.state()).toEqual({ status: 'idle' });
    expect(service.revealed()).toBeNull();
    expect(service.sellerProfileRequired()).toBe(false);
  });

  describe('load() — GET /api/seller/payout-account (§3.1)', () => {
    it('§AC-2: fetches and maps hasAccount:false before any account has been saved', async () => {
      stubRoute('GET', '/api/seller/payout-account', {
        hasAccount: false,
        accountType: null,
        bankCode: null,
        accountHolderName: null,
        accountNumberMasked: null,
        promptPayType: null,
        promptPayMasked: null,
        updatedAt: null,
      });
      const service = buildService();

      await service.load();

      expect(service.account()).toEqual({
        hasAccount: false,
        accountType: null,
        bankCode: '',
        accountHolderName: '',
        accountNumberMasked: '',
        promptPayType: null,
        promptPayMasked: '',
        updatedAt: '',
      });
      expect(service.state()).toEqual({ status: 'idle' });
    });

    it('fetches and maps an existing account', async () => {
      stubRoute('GET', '/api/seller/payout-account', accountBody());
      const service = buildService();

      await service.load();

      expect(service.account()?.hasAccount).toBe(true);
      expect(service.account()?.accountNumberMasked).toBe('••••••••1234');
      expect(requests.some((r) => r.method === 'GET' && r.path === '/api/seller/payout-account')).toBe(true);
    });

    it('§4: 403 seller_profile_required hides the section — no toast, no error state', async () => {
      stubRoute(
        'GET',
        '/api/seller/payout-account',
        errorBody(403, 'seller_profile_required', 'Seller profile required.'),
        403,
      );
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      await service.load();

      expect(service.account()).toBeNull();
      expect(service.sellerProfileRequired()).toBe(true);
      expect(service.state()).toEqual({ status: 'idle' });
      expect(apiFail.report).not.toHaveBeenCalled();
    });

    it('generic failure reports through ApiFailureReporter and sets state=error', async () => {
      stubRoute(
        'GET',
        '/api/seller/payout-account',
        errorBody(500, 'internal_error', 'An unexpected error occurred.'),
        500,
      );
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      await service.load();

      expect(service.account()).toBeNull();
      expect(service.sellerProfileRequired()).toBe(false);
      expect(service.state()).toEqual({ status: 'error', message: 'โหลดข้อมูลบัญชีรับเงินไม่สำเร็จ' });
      expect(apiFail.report).toHaveBeenCalled();
    });
  });

  describe('save() — PUT /api/seller/payout-account (§3.1, §3.13)', () => {
    const validBankInput = {
      accountType: 'bank' as const,
      bankCode: 'KBANK',
      accountNumber: '1234567890',
      accountHolderName: 'สมชาย ใจดี',
    };

    it('sends the bank input body and maps the returned masked account', async () => {
      stubRoute('PUT', '/api/seller/payout-account', accountBody());
      const service = buildService();

      const result = await service.save(validBankInput);

      expect(result).toEqual({ ok: true });
      expect(service.account()?.accountNumberMasked).toBe('••••••••1234');
      const call = requests.find((r) => r.method === 'PUT' && r.path === '/api/seller/payout-account');
      expect(JSON.parse(call?.body ?? '{}')).toEqual(validBankInput);
    });

    it('sends the PromptPay input body and maps the returned masked account', async () => {
      stubRoute(
        'PUT',
        '/api/seller/payout-account',
        accountBody({
          accountType: 'promptpay',
          bankCode: null,
          accountNumberMasked: null,
          promptPayType: 'phone',
          promptPayMasked: '••••••••5678',
        }),
      );
      const service = buildService();

      const promptPayInput = {
        accountType: 'promptpay' as const,
        accountHolderName: 'สมชาย ใจดี',
        promptPayType: 'phone' as const,
        promptPayId: '0812345678',
      };
      const result = await service.save(promptPayInput);

      expect(result).toEqual({ ok: true });
      expect(service.account()?.accountType).toBe('promptpay');
      expect(service.account()?.promptPayMasked).toBe('••••••••5678');
      const call = requests.find((r) => r.method === 'PUT' && r.path === '/api/seller/payout-account');
      expect(JSON.parse(call?.body ?? '{}')).toEqual(promptPayInput);
    });

    it('ends state=idle (not stuck loading) after a successful save', async () => {
      stubRoute('PUT', '/api/seller/payout-account', accountBody());
      const service = buildService();

      await service.save(validBankInput);

      expect(service.state()).toEqual({ status: 'idle' });
    });

    it('§AC-4/5/6: 400 returns { ok:false, error } from the real { message }-only body, no toast', async () => {
      // Verified live: the controller's `catch (ArgumentException)` returns exactly this shape —
      // no `status`/`statusCode`/`code`/`title`, unlike every other failure in this app.
      stubRoute('PUT', '/api/seller/payout-account', { message: 'ธนาคารไม่ถูกต้อง' }, 400);
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      const result = await service.save(validBankInput);

      expect(result).toEqual({ ok: false, error: 'ธนาคารไม่ถูกต้อง' });
      expect(apiFail.report).not.toHaveBeenCalled();
    });

    it('generic (5xx, ApiErrorResponse-shaped) failure returns { ok:false }, not the message, no toast', async () => {
      // This body DOES carry a `message` ("An unexpected error occurred.") — the assertion that
      // matters is that the `status` field present here (unlike the 400 case above) is what
      // stops `save()` from mistaking it for a validation message.
      stubRoute(
        'PUT',
        '/api/seller/payout-account',
        errorBody(500, 'internal_error', 'An unexpected error occurred.'),
        500,
      );
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      const result = await service.save(validBankInput);

      expect(result).toEqual({ ok: false });
      expect(apiFail.report).not.toHaveBeenCalled();
    });

    it('never sets account() on failure', async () => {
      stubRoute('PUT', '/api/seller/payout-account', { message: 'เลขบัญชีไม่ถูกต้อง' }, 400);
      const service = buildService();

      await service.save(validBankInput);

      expect(service.account()).toBeNull();
    });
  });

  describe('reveal() — POST /api/seller/payout-account/reveal (§3.1, §3.13.2)', () => {
    it('sets revealed().accountNumber for a bank account, promptPayId stays null', async () => {
      stubRoute('POST', '/api/seller/payout-account/reveal', { accountNumber: '1234567890', promptPayId: null });
      const service = buildService();

      await service.reveal();

      expect(service.revealed()).toEqual({ accountNumber: '1234567890', promptPayId: null });
    });

    it('sets revealed().promptPayId for a PromptPay account, accountNumber stays null', async () => {
      stubRoute('POST', '/api/seller/payout-account/reveal', { accountNumber: null, promptPayId: '0812345678' });
      const service = buildService();

      await service.reveal();

      expect(service.revealed()).toEqual({ accountNumber: null, promptPayId: '0812345678' });
    });

    it('§AC-10: 404 (never saved) — a truly empty NotFound() body — leaves revealed() null, no toast', async () => {
      stubRoute('POST', '/api/seller/payout-account/reveal', undefined, 404);
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      await service.reveal();

      expect(service.revealed()).toBeNull();
      expect(apiFail.report).not.toHaveBeenCalled();
    });

    it('403 seller_profile_required flips sellerProfileRequired() without toasting', async () => {
      stubRoute(
        'POST',
        '/api/seller/payout-account/reveal',
        errorBody(403, 'seller_profile_required', 'Seller profile required.'),
        403,
      );
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      await service.reveal();

      expect(service.revealed()).toBeNull();
      expect(service.sellerProfileRequired()).toBe(true);
      expect(apiFail.report).not.toHaveBeenCalled();
    });
  });

  describe('clearRevealed()', () => {
    it('is callable and leaves revealed() as null', () => {
      const service = buildService();

      service.clearRevealed();

      expect(service.revealed()).toBeNull();
    });

    it('resets a previously revealed number back to null', async () => {
      stubRoute('POST', '/api/seller/payout-account/reveal', { accountNumber: '1234567890', promptPayId: null });
      const service = buildService();
      await service.reveal();

      service.clearRevealed();

      expect(service.revealed()).toBeNull();
    });
  });
});
