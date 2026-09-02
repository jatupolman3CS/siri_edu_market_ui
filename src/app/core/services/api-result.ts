/**
 * Shape returned by `@hey-api/client-fetch`. `request`/`response` are optional because the
 * client omits them when fetch throws before a response exists — the unwrapper already
 * guards for that with optional chaining.
 */
export type SdkResult<T> = {
  data: T | undefined;
  error: unknown;
  request?: Request;
  response?: Response;
};

/**
 * Unwrap a `@hey-api/client-fetch` result.
 *
 * AUD-013 follow-up: when the SDK returns `{ data: undefined, error: undefined }`
 * (e.g. fetch threw before the JSON was decoded), build a synthetic error that
 * still carries the HTTP status so {@link ApiFailureReporter.formatDetail}
 * can show something more helpful than "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ".
 */
export function unwrapSdkResult<T>(result: SdkResult<T>): T {
  if (result.data === undefined) {
    if (result.error !== undefined) throw result.error;
    const status = result.response?.status;
    const statusText = result.response?.statusText;
    throw {
      status,
      statusCode: status,
      title: statusText || 'Request failed',
      detail: statusText || `HTTP ${status ?? '???'}`,
    };
  }
  return result.data;
}
