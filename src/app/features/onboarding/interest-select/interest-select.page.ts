import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService, CatalogService, OnboardingService } from '../../../core/services';

/**
 * registration-onboarding v1 §4.2: interest selection screen.
 * Displays category pills, allowing multi-select toggle, skip, or save.
 */
@Component({
  selector: 'app-interest-select',
  standalone: true,
  imports: [],
  templateUrl: './interest-select.page.html',
  styleUrls: ['./interest-select.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InterestSelectPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly onboardingService = inject(OnboardingService);
  private readonly message = inject(NzMessageService);

  readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
  readonly categories = this.catalog.categories;
  readonly categoriesState = this.catalog.categoriesState;

  readonly selectedCategoryIds = signal<string[]>([]);
  readonly submitting = signal<boolean>(false);

  constructor() {
    this.catalog.ensureCategories();
  }

  toggleCategory(id: string): void {
    this.selectedCategoryIds.update((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  isSelected(id: string): boolean {
    return this.selectedCategoryIds().includes(id);
  }

  async onSave(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    try {
      const res = await this.onboardingService.updateInterests(this.selectedCategoryIds());
      if (!res.ok) {
        this.message.error(res.error ?? 'บันทึกความสนใจไม่สำเร็จ');
        return;
      }
      const redirect = this.auth.resolvePostAuthRedirect(this.returnUrl);
      await this.router.navigateByUrl(redirect);
    } finally {
      this.submitting.set(false);
    }
  }

  async onSkip(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    try {
      const res = await this.onboardingService.skip();
      if (!res.ok) {
        this.message.error(res.error ?? 'ข้ามขั้นตอนไม่สำเร็จ');
        return;
      }
      const redirect = this.auth.resolvePostAuthRedirect(this.returnUrl);
      await this.router.navigateByUrl(redirect);
    } finally {
      this.submitting.set(false);
    }
  }
}
