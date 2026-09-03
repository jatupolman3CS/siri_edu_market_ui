import type { SavedPaymentMethod } from '../models';

/**
 * saved-credit-cards v1 §4 step 5: "บัตรหมดอายุ" is computed client-side only — the backend never
 * sends an `isExpired` field. Shared by `saved-cards.component.ts` (badge + disabling the radio)
 * and `checkout.page.ts` (skipping an expired card when preselecting the default).
 */
export function isSavedCardExpired(
  expMonth: number,
  expYear: number,
  now: Date = new Date(),
): boolean {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return expYear < currentYear || (expYear === currentYear && expMonth < currentMonth);
}

export function isSavedCardEntryExpired(card: SavedPaymentMethod, now?: Date): boolean {
  return isSavedCardExpired(card.expMonth, card.expYear, now);
}
