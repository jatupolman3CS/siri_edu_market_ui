import { extractErrorCode, unwrapSdkResult, type SdkResult } from './api-result';

/**
 * Every service in the app funnels its SDK responses through this function, so what it
 * throws decides what the user is told when a call fails. AUD-013 exists because a
 * `{ data: undefined, error: undefined }` result used to surface as a generic connection
 * error even when the server had answered with a status worth showing.
 */
describe('unwrapSdkResult', () => {
  function result<T>(over: Partial<SdkResult<T>>): SdkResult<T> {
    return { data: undefined, error: undefined, ...over };
  }

  it('returns the payload when the call succeeded', () => {
    expect(unwrapSdkResult(result({ data: { id: 'doc-1' } }))).toEqual({ id: 'doc-1' });
  });

  it('throws the server error unchanged so ProblemDetails survives to the reporter', () => {
    const problem = { status: 422, title: 'Validation failed', detail: 'ราคาต้องไม่ติดลบ' };

    expect(() => unwrapSdkResult(result({ error: problem }))).toThrow();
    try {
      unwrapSdkResult(result({ error: problem }));
    } catch (e) {
      // Identity, not equality: the reporter reads fields off the original object.
      expect(e).toBe(problem);
    }
  });

  it('AUD-013: builds an error carrying the HTTP status when both data and error are undefined', () => {
    const response = new Response(null, { status: 503, statusText: 'Service Unavailable' });

    try {
      unwrapSdkResult(result({ response }));
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as { status?: number; statusCode?: number; title?: string; detail?: string };
      expect(err.status).toBe(503);
      // `statusCode` is the alias the error envelope also allows.
      expect(err.statusCode).toBe(503);
      expect(err.title).toBe('Service Unavailable');
      expect(err.detail).toBe('Service Unavailable');
    }
  });

  it('still throws something readable when there is no response at all', () => {
    try {
      unwrapSdkResult(result({}));
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as { status?: number; title?: string; detail?: string };
      expect(err.status).toBeUndefined();
      expect(err.title).toBe('Request failed');
      expect(err.detail).toBe('HTTP ???');
    }
  });

  it('falls back to a generic title when the status has no text', () => {
    const response = new Response(null, { status: 500, statusText: '' });

    try {
      unwrapSdkResult(result({ response }));
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as { title?: string; detail?: string };
      expect(err.title).toBe('Request failed');
      expect(err.detail).toBe('HTTP 500');
    }
  });

  it('treats null as a real payload rather than a missing one', () => {
    // `data: null` is a body the server actually sent; only `undefined` means "nothing came back".
    expect(unwrapSdkResult(result<null>({ data: null }))).toBeNull();
  });

  it('does not mistake a falsy payload for a failure', () => {
    expect(unwrapSdkResult(result<number>({ data: 0 }))).toBe(0);
    expect(unwrapSdkResult(result<string>({ data: '' }))).toBe('');
    expect(unwrapSdkResult(result<boolean>({ data: false }))).toBe(false);
  });
});


/**
 * admin-user-management §4.6 (ง) / AC-18: the same ProblemDetails body arrives in two shapes
 * depending on which HTTP stack made the call — bare from the SDK, wrapped in `error` from
 * Angular's `HttpErrorResponse`. Reading only the bare shape is what made the interceptor's
 * 403 account-restricted branch dead code, so both are covered here on purpose.
 */
describe('extractErrorCode (AC-18)', () => {
  it('reads the code straight off a ProblemDetails payload (SDK path)', () => {
    expect(extractErrorCode({ status: 403, code: 'account_banned', detail: 'ถูกแบน' })).toBe(
      'account_banned',
    );
  });

  it('reads the code out of `error` when it is an HttpErrorResponse (HttpClient path)', () => {
    const httpError = { status: 403, error: { code: 'account_suspended', detail: 'ถูกระงับ' } };

    expect(extractErrorCode(httpError)).toBe('account_suspended');
  });

  it('prefers the top-level code when both levels carry one', () => {
    expect(extractErrorCode({ code: 'outer', error: { code: 'inner' } })).toBe('outer');
  });

  it('returns undefined for anything without a usable code', () => {
    expect(extractErrorCode(null)).toBeUndefined();
    expect(extractErrorCode(undefined)).toBeUndefined();
    expect(extractErrorCode('account_banned')).toBeUndefined();
    expect(extractErrorCode({ status: 403, detail: 'ไม่มีสิทธิ์' })).toBeUndefined();
    expect(extractErrorCode({ error: 'Forbidden' })).toBeUndefined();
    expect(extractErrorCode({ code: 42 })).toBeUndefined();
  });
});
