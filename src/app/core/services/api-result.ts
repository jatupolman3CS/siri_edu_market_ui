import type { UploadResponse } from '../api/types.gen';

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

/**
 * Best-effort HTTP status out of a thrown SDK/ProblemDetails error — a caller-facing sibling to
 * {@link unwrapSdkResult} for the (less common) case where a service branches on the status
 * instead of just reporting it, e.g. distinguishing an expected 403 from a generic failure.
 */
export function extractErrorStatus(error: unknown): number | undefined {
  if (error == null || typeof error !== 'object') return undefined;
  const o = error as Record<string, unknown>;
  if (typeof o['status'] === 'number') return o['status'] as number;
  if (typeof o['statusCode'] === 'number') return o['statusCode'] as number;
  const r = o['response'] as Record<string, unknown> | undefined;
  if (r && typeof r['status'] === 'number') return r['status'] as number;
  return undefined;
}

/**
 * Best-effort machine-readable error code out of a ProblemDetails error (e.g.
 * `seller_profile_required`) — ASP.NET Core's ProblemDetails carries this as `code`.
 *
 * admin-user-management v2 §4.6 (ง): the SDK throws the ProblemDetails payload itself, but
 * Angular's `HttpClient` wraps it: the same body arrives as `HttpErrorResponse.error`. Reading
 * only the top level made every caller on the `HttpClient` side silently dead code (that is
 * exactly how the interceptor's 403 branch shipped), so fall back one level into `error` —
 * the same shape-tolerant lookup {@link extractErrorStatus} already does with `response.status`.
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (error == null || typeof error !== 'object') return undefined;
  const o = error as Record<string, unknown>;
  if (typeof o['code'] === 'string') return o['code'] as string;
  const inner = o['error'];
  if (inner && typeof inner === 'object') {
    const code = (inner as Record<string, unknown>)['code'];
    if (typeof code === 'string') return code;
  }
  return undefined;
}

// TODO(contract v2): remove this shim once thumbnailKey/thumbnailUrl/fullKey/fullUrl actually
// exist on the SDK-generated `UploadResponse` (after the backend ships them + `npm run
// generate:api` runs against the deployed OpenAPI spec). See
// docs/contracts/image-upload-optimization.md v2 §4 — same pattern v1 used for
// optimizedKey/optimizedUrl before its own regen.
export type UploadResponseWithVariants = UploadResponse & {
  thumbnailKey?: string | null;
  thumbnailUrl?: string | null;
  fullKey?: string | null;
  fullUrl?: string | null;
};
