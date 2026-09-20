import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslationService } from '../../../core/i18n';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.scss',
})
export class StatCardComponent {
  private readonly translation = inject(TranslationService);

  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input<string>('✨');
  readonly trend = input<string | null>(null);
  readonly trendLabel = input<string>('');
  readonly resolvedTrendLabel = computed(
    () => this.trendLabel() || this.translation.t('seller.vsLastMonth'),
  );
}
