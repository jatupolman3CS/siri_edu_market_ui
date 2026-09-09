import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DevRoleSwitcherComponent } from './core/dev/dev-role-switcher.component';
import { NavigationSourceService } from './core/services';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DevRoleSwitcherComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><app-dev-role-switcher />`,
})
export class App {
  // seller-analytics-insights v1 §4: NavigationSourceService must start listening to
  // NavigationEnd before the first route activates. `providedIn: 'root'` services aren't
  // instantiated until something injects them, so this injection (its return value is
  // intentionally unused) is what makes that happen at app startup.
  private readonly navSource = inject(NavigationSourceService);
}
