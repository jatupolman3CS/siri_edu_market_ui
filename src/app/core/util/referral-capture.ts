export const REFERRAL_HINT_STORAGE_KEY = 'siriedu.referral-code-hint';

/**
 * referral-program v1 §4: captures `?ref=` query param from the current URL
 * and saves it into localStorage (`siriedu.referral-code-hint`).
 * Guards for SSR / missing localStorage / DOM exceptions.
 */
export function captureReferralCode(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get('ref') || params.get('aff'))?.trim();
    if (ref) {
      localStorage.setItem(REFERRAL_HINT_STORAGE_KEY, ref.toUpperCase());
    }
  } catch {
    // Ignore storage / security errors in sandbox environments
  }
}

/**
 * Reads any saved referral code hint from localStorage.
 */
export function getReferralCodeHint(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(REFERRAL_HINT_STORAGE_KEY);
  } catch {
    return null;
  }
}
