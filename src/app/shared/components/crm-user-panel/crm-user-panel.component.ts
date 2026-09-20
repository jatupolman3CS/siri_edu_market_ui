import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { CrmService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { CrmFacetType } from '../../../core/models';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

/**
 * crm-core v1 §3.6, §4.3, §4.4 (`docs/contracts/crm-core.md`) — one buyer's CRM breakdown
 */
@Component({
  selector: 'app-crm-user-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './crm-user-panel.component.html',
})
export class CrmUserPanelComponent {
  readonly userId = input.required<string>();

  readonly crm = inject(CrmService);
  private readonly apiFail = inject(ApiFailureReporter);
  readonly translation = inject(TranslationService);

  constructor() {
    effect(() => {
      const id = this.userId();
      if (!id) return;
      void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    try {
      await this.crm.loadUserDetail(id);
    } catch (e) {
      this.apiFail.report(this.translation.t('systemContent.loadCrmProfile'), e);
    }
  }

  facetTypeLabel(facetType: CrmFacetType): string {
    const key = `shared.crmPanel.facetTypes.${facetType}`;
    const translated = this.translation.t(key);
    return translated !== key ? translated : facetType;
  }

  topSignalLabel(topSignal: string): string {
    const key = `shared.crmPanel.signals.${topSignal}`;
    const translated = this.translation.t(key);
    return translated !== key ? translated : topSignal;
  }
}
