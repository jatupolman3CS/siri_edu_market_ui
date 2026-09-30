import { DestroyRef, Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

const MODAL_WRAP = '.ant-modal-wrap[role="dialog"]';
const MODAL_TITLE = '.ant-modal-title, .ant-modal-confirm-title';

/**
 * Dialog semantics for every nz-modal / NzModalService.confirm. NG-Zorro puts `role="dialog"` on
 * `.ant-modal-wrap` but never `aria-modal`, and never ties the title to the dialog, so every modal
 * was announced with an empty name. Each standalone component gets its own NzModalService, so
 * there is no single `afterOpen` hook — instead this watches the CDK overlay container (where every
 * modal renders) and, for each dialog wrap, sets `aria-modal="true"` and `aria-labelledby` pointing
 * at its title (given a generated id when it has none).
 *
 * Cheap by construction: `<body>` is observed for direct children only (to notice the overlay
 * container once CDK creates it), and only the overlay container's subtree is watched after that.
 * Root service, started once from `provideAppInitializer` in app.config.ts.
 */
@Injectable({ providedIn: 'root' })
export class ModalA11yService {
  private readonly document = inject(DOCUMENT);
  private container: Element | null = null;
  private containerObserver: MutationObserver | null = null;
  private nextId = 0;

  constructor() {
    const body = this.document?.body;
    if (!body || typeof MutationObserver === 'undefined') return;

    const bodyObserver = new MutationObserver(() => this.watchOverlayContainer());
    bodyObserver.observe(body, { childList: true });
    this.watchOverlayContainer();

    inject(DestroyRef).onDestroy(() => {
      bodyObserver.disconnect();
      this.containerObserver?.disconnect();
    });
  }

  /** Adds the missing dialog semantics to every nz-modal wrap under `root`. */
  decorate(root: ParentNode): void {
    for (const wrap of Array.from(root.querySelectorAll<HTMLElement>(MODAL_WRAP))) {
      if (wrap.getAttribute('aria-modal') !== 'true') {
        wrap.setAttribute('aria-modal', 'true');
      }
      if (wrap.hasAttribute('aria-label')) continue;
      const labelledBy = wrap.getAttribute('aria-labelledby');
      // Still valid (the title element it names is in this dialog) → nothing to do.
      if (labelledBy && wrap.querySelector(`[id="${labelledBy}"]`)) continue;
      const title = wrap.querySelector<HTMLElement>(MODAL_TITLE);
      if (!title || !title.textContent?.trim()) continue;
      if (!title.id) {
        title.id = `app-modal-title-${this.nextId++}`;
      }
      wrap.setAttribute('aria-labelledby', title.id);
    }
  }

  private watchOverlayContainer(): void {
    const container = this.document.querySelector('.cdk-overlay-container');
    if (!container || container === this.container) return;
    this.containerObserver?.disconnect();
    this.container = container;
    // childList only: the attributes set in decorate() never re-trigger this observer.
    this.containerObserver = new MutationObserver(() => this.decorate(container));
    this.containerObserver.observe(container, { childList: true, subtree: true });
    this.decorate(container);
  }
}
