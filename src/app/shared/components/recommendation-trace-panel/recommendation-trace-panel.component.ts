import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { CrmService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.5/§4.3 — "ทำไมระบบถึง
 * แนะนำแบบนี้" debug panel on `/admin/crm/users/:id` (embedded next to `CrmUserPanelComponent`,
 * §4.1 table). Read-only, no action of any kind — same §8.4 rule `CrmUserPanelComponent` already
 * follows (admin only *reads*, never edits a score by hand).
 *
 * `CrmService.loadRecommendationTrace()` calls the real `GET
 * /api/admin/crm/users/{userId}/recommendation-trace` (round 2 — crm-driven-discovery-fe-wire);
 * a 404 (unknown `userId`) or any other failure is reported here and the panel renders its
 * empty state (`EmptyStateComponent`) since there is nothing useful to fall back to.
 */
@Component({
  selector: 'app-recommendation-trace-panel',
  standalone: true,
  imports: [DecimalPipe, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recommendation-trace-panel.component.html',
})
export class RecommendationTracePanelComponent {
  readonly userId = input.required<string>();

  readonly crm = inject(CrmService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly translation = inject(TranslationService);

  /** documentId of the currently-expanded candidate row (§4.3 "แถวขยายได้"), or null = none expanded. */
  readonly expandedCandidateId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.userId();
      if (!id) return;
      void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    try {
      await this.crm.loadRecommendationTrace(id);
    } catch (e) {
      this.apiFail.report(this.translation.t('systemContent.loadRecommendationTrace'), e);
    }
  }

  toggleCandidate(documentId: string): void {
    this.expandedCandidateId.update((cur) => (cur === documentId ? null : documentId));
  }
}
