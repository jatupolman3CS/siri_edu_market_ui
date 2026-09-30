/**
 * Page scroll lock shared by the custom overlays (app-bottom-sheet, app-lightbox) —
 * docs/contracts/responsive-ui.md §4.3: `overflow:hidden` on `<html>` while at least one overlay
 * is open, restored when the last one closes. Reference-counted, so stacked overlays are fine.
 *
 * Why `<body>` is touched too: the ng-zorro reset gives `html, body { height: 100% }` and
 * styles.scss sets `body { overflow-x: hidden }` (which computes `overflow-y: auto`). While
 * `<html>` is `visible`, body's overflow is what propagates to the viewport and the document
 * scrolls normally. The moment `<html>` becomes `hidden`, html's value propagates instead and
 * `<body>` turns into its own 100%-high scroll box: the document collapses to the viewport and
 * `window.scrollY` is clamped to 0 — the page jumped to the top under every sheet and stayed
 * there after closing. Pinning body to `visible` BEFORE hiding html keeps body from becoming a
 * scroller, so the page keeps its position under the overlay. Order matters on the way back too:
 * html first, then body.
 */
let lockCount = 0;
let savedHtmlOverflow = '';
let savedBodyOverflow = '';

export function acquirePageScrollLock(doc: Document | null | undefined): void {
  const html = doc?.documentElement;
  if (!html) return;
  if (lockCount === 0) {
    const body = doc.body;
    savedHtmlOverflow = html.style.overflow;
    savedBodyOverflow = body ? body.style.overflow : '';
    if (body) body.style.overflow = 'visible';
    html.style.overflow = 'hidden';
  }
  lockCount++;
}

/** Balanced with {@link acquirePageScrollLock}; an extra call is a no-op (never goes negative). */
export function releasePageScrollLock(doc: Document | null | undefined): void {
  const html = doc?.documentElement;
  if (!html || lockCount === 0) return;
  lockCount--;
  if (lockCount === 0) {
    html.style.overflow = savedHtmlOverflow;
    if (doc.body) doc.body.style.overflow = savedBodyOverflow;
  }
}

/** Number of overlays currently holding the lock (tests / diagnostics). */
export function pageScrollLockCount(): number {
  return lockCount;
}
