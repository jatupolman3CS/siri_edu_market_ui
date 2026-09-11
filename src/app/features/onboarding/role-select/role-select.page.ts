import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OnboardingService } from '../../../core/services/onboarding.service';

/**
 * registration-onboarding v1 §4.1: initial role selection screen.
 * Buyer path leads to category interest selection; seller path skips onboarding
 * and redirects to become-seller application page.
 */
@Component({
  selector: 'app-role-select',
  standalone: true,
  imports: [],
  templateUrl: './role-select.page.html',
  styleUrls: ['./role-select.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleSelectPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly onboardingService = inject(OnboardingService);

  readonly loading = signal<boolean>(false);
  readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';

  onSelectBuyer(): void {
    this.router.navigate(['/onboarding/interests'], {
      queryParams: this.returnUrl !== '/' ? { returnUrl: this.returnUrl } : undefined,
    });
  }

  async onSelectSeller(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      await this.onboardingService.skip();
      this.router.navigate(['/become-seller']);
    } finally {
      this.loading.set(false);
    }
  }
}
