import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { AdminService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { AdminMlRecommendationOverview } from '../../../core/models';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';

/**
 * ml-embedding-recommendations v1 §3.2/§4.2 (`docs/contracts/ml-embedding-recommendations.md`)
 * — "สถานะระบบแนะนำสินค้า (Bought Together)": a light, single-module, read-only monitoring card
 * (not a full page) that lets an admin see whether the embedding/similarity job has ever run
 * successfully, without digging through logs. No actions — everything here comes straight off
 * `GET /api/admin/ml/recommendations/overview` (§3.2).
 */
@Component({
  selector: 'app-ml-recommendations-admin',
  standalone: true,
  imports: [DatePipe, DecimalPipe, StatCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ml-recommendations-admin.page.html',
})
export class MlRecommendationsAdminPage {
  private readonly admin = inject(AdminService);
  private readonly apiFail = inject(ApiFailureReporter);

  readonly overview = signal<AdminMlRecommendationOverview | null>(null);
  readonly loading = signal(true);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.overview.set(await this.admin.getMlRecommendationOverview());
    } catch (e) {
      this.apiFail.report('โหลดสถานะระบบแนะนำสินค้า', e);
      this.overview.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
