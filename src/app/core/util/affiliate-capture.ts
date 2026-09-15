import type { AffiliateClickResult } from '../models';
import { mapAffiliateClickResult } from '../api-mappers/mappers';
import { unwrapSdkResult } from '../services/api-result';
import { postApiAffiliateClick } from '../api';

export const AFFILIATE_STORAGE_KEY = 'siriedu.affiliate-click';

interface StoredAffiliateClick {
  code: string;
  clickToken: string;
  expiresAt: string;
}

/**
 * referral-program v2 §3.8 / §4.1: `POST /api/affiliate/click` (anonymous — no auth header
 * needed/sent). `404` (unknown/inactive code) and any other failure both resolve to `null` so
 * the caller silently gives up capturing the click, exactly like an invalid `?aff=` code should.
 */
async function defaultPostAffiliateClick(code: string): Promise<AffiliateClickResult | null> {
  try {
    const result = await postApiAffiliateClick({ body: { code } });
    const data = unwrapSdkResult(result);
    return data ? mapAffiliateClickResult(data) : null;
  } catch {
    return null;
  }
}

/**
 * referral-program v2 §4.1:
 * Captures `?aff=` query param from current URL on bootstrap.
 * If a valid, unexpired token already exists in localStorage, skips calling API.
 * If absent or expired, calls POST /api/affiliate/click (via stub) and saves { code, clickToken, expiresAt }.
 * Guards typeof window/localStorage === 'undefined', try/catch on every branch.
 */
export async function captureAffiliateClick(
  clickApi: (code: string) => Promise<AffiliateClickResult | null> = defaultPostAffiliateClick,
): Promise<void> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;

  try {
    const params = new URLSearchParams(window.location.search);
    const aff = params.get('aff')?.trim();
    if (!aff) return;

    // Check if existing token is still valid
    const existingToken = getAffiliateClickToken();
    if (existingToken) {
      return;
    }

    const result = await clickApi(aff);
    if (result?.clickToken) {
      const payload: StoredAffiliateClick = {
        code: aff,
        clickToken: result.clickToken,
        expiresAt: result.expiresAt,
      };
      localStorage.setItem(AFFILIATE_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // Ignore storage / security errors in sandbox environments
  }
}

/**
 * referral-program v2 §4.1:
 * Reads and returns the active affiliate clickToken if still valid.
 * Checks expiresAt against current time; if expired, removes the item and returns null.
 */
export function getAffiliateClickToken(): string | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(AFFILIATE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredAffiliateClick>;
    if (!parsed?.clickToken || !parsed?.expiresAt) {
      localStorage.removeItem(AFFILIATE_STORAGE_KEY);
      return null;
    }

    const expiresTime = new Date(parsed.expiresAt).getTime();
    if (Number.isNaN(expiresTime) || expiresTime <= Date.now()) {
      localStorage.removeItem(AFFILIATE_STORAGE_KEY);
      return null;
    }

    return parsed.clickToken;
  } catch {
    return null;
  }
}
