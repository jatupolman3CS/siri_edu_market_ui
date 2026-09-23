import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DevRoleSwitcherComponent } from './core/dev/dev-role-switcher.component';
import { NavigationSourceService, NotificationStreamService, NotificationToastService } from './core/services';
import { LightboxComponent } from './shared/components/lightbox/lightbox.component';

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
}
