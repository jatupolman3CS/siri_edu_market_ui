import { DestroyRef, Directive, inject } from '@angular/core';
import { Location } from '@angular/common';
import type { OverlayRef } from '@angular/cdk/overlay';
import { NzDropdownDirective } from 'ng-zorro-antd/dropdown';

/**
 * Work-around for an ng-zorro-antd 21.3.3 bug: an `nz-dropdown` trigger goes dead after the
 * browser / Android back gesture closes its open menu.
 *
 * `NzDropdownDirective` creates its OverlayRef with `disposeOnNavigation: true`, so CDK disposes
 * it on any `Location` popstate. The directive only nulls its `overlayRef` field in `onDestroy`
 * and in the menu leave-animation callback — which never fires for a disposed overlay — so every
 * later open calls `attach()` on the disposed ref, which CDK silently ignores
 * (node_modules/ng-zorro-antd/fesm2022/ng-zorro-antd-dropdown.mjs, `overlayRef` handling around
 * `createOverlayRef` / `animationStateChange$`). The bell, avatar menus and language switchers then
 * never open again until their layout is destroyed.
 *
 * This directive rides on every `[nz-dropdown]` host of the components that import it and, after
 * each popstate, drops the directive's reference to an overlay CDK has already disposed, so the
 * next tap builds a fresh one. Remove it once ng-zorro fixes the directive.
 */
@Directive({
  selector: '[nz-dropdown]',
  standalone: true,
})
export class DropdownBackResetDirective {
  private readonly dropdown = inject(NzDropdownDirective, { self: true, optional: true });

  constructor() {
    const location = inject(Location, { optional: true });
    if (!location || !this.dropdown) return;
    const sub = location.subscribe(() => {
      // This subscription is registered before the overlay's own (CDK subscribes on first
      // attach), so wait for CDK's dispose to have run before checking.
      queueMicrotask(() => this.dropDisposedOverlay());
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  /** Visible for tests: null the dropdown's overlay reference when CDK has disposed it. */
  dropDisposedOverlay(): void {
    // `overlayRef` is `private` in the ng-zorro typings (public at runtime) — see class comment.
    const dd = this.dropdown as unknown as { overlayRef: OverlayRef | null } | null;
    if (dd?.overlayRef && !dd.overlayRef.hostElement) {
      dd.overlayRef = null;
    }
  }
}
