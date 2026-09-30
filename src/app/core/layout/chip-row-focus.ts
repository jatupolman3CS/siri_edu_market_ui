/**
 * responsive-ui v1.4 R-12 (G-22a): a chip that takes keyboard focus inside a `.chip-row` scroller
 * has to end up fully inside the row. Chrome leaves a partly visible focused element where it is,
 * so tabbing onto the chip that sticks out past the row's edge (the header "ฮิต" tags at 360,
 * the /seller/documents status chips at 360 and 820) left part of the chip — and the focus ring
 * drawn inside it (F131) — cut off by the scroller.
 *
 * Registered once on `document` by the root `App` (focusin bubbles, so one listener covers every
 * row, including rows inside overlays). Only keyboard focus (`:focus-visible`) scrolls: a mouse or
 * touch press already lands on a visible part of the chip, and moving the chip between pointerdown
 * and pointerup could turn the click into a click on the row.
 *
 * The matching `.chip-row:has(:focus-visible)` rule in styles.scss adds `scroll-padding-inline`
 * (room around the chip and its ring) and pauses `scroll-snap-type` while a chip has keyboard focus
 * — otherwise the row's proximity snap pulls the just-revealed chip back out to a chip-start snap
 * position.
 */
export const CHIP_ROW_SELECTOR = '.chip-row';

export function revealFocusedChip(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.closest(CHIP_ROW_SELECTOR)) return;
  if (!hasKeyboardFocus(target)) return;
  if (typeof target.scrollIntoView !== 'function') return;
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function hasKeyboardFocus(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    // An engine without `:focus-visible` support: revealing on every focus is the safe fallback.
    return true;
  }
}
