import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { DevRoleSwitcherComponent } from './core/dev/dev-role-switcher.component';
import { revealFocusedChip } from './core/layout/chip-row-focus';
import { NavigationSourceService, NotificationStreamService, NotificationToastService } from './core/services';
import { LightboxComponent } from './shared/components/lightbox/lightbox.component';

/**
 * responsive-ui v1.4 R-22 (F154): a wheel over a focused `<input type="number">` must scroll the
 * page, not step the value (Chrome/Edge change the value and swallow the scroll). Blurring the
 * input in the capture phase — before the browser runs the wheel's default action — leaves the
 * value alone and lets the same wheel scroll the page. Only a wheel over the focused input
 * itself blurs it; wheeling elsewhere keeps focus where it is.
 */
export function blurNumberInputOnWheel(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'number') return;
  if (target.ownerDocument.activeElement === target) target.blur();
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DevRoleSwitcherComponent, LightboxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><app-dev-role-switcher /><app-lightbox />`,
})
export class App {
  // seller-analytics-insights v1 §4: NavigationSourceService must start listening to
  // NavigationEnd before the first route activates. `providedIn: 'root'` services aren't
  // instantiated until something injects them, so this injection (its return value is
  // intentionally unused) is what makes that happen at app startup.
  private readonly navSource = inject(NavigationSourceService);

  // Global "new notification" toast (top-right corner popup) — same force-instantiation trick
  // as `navSource` above, so it starts polling once at app startup instead of being duplicated
  // per layout (buyer/seller/admin all share this one root component).
  private readonly notificationToast = inject(NotificationToastService);

  // kafka-redis-notifications v1 §4: the SSE stream + the single notification poll timer
  // follow the signed-in user from here, once for the whole app.
  private readonly notificationStream = inject(NotificationStreamService);

  constructor() {
    // responsive-ui v1.4 R-22: one global passive capture listener (see blurNumberInputOnWheel).
    const document = inject(DOCUMENT);
    const options: AddEventListenerOptions = { capture: true, passive: true };
    document.addEventListener('wheel', blurNumberInputOnWheel, options);
    // responsive-ui v1.4 R-12 (G-22a): keyboard focus inside a `.chip-row` scrolls the chip into the row.
    document.addEventListener('focusin', revealFocusedChip);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('wheel', blurNumberInputOnWheel, options);
      document.removeEventListener('focusin', revealFocusedChip);
    });
  }
}
