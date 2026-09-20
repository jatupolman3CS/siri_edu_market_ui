import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import { TranslationService } from '../../../core/i18n';

@Component({
  selector: 'app-section-header',
  standalone: true,
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './section-header.component.html',
  styleUrl: './section-header.component.scss',
})
export class SectionHeaderComponent {
  private readonly translation = inject(TranslationService);

  readonly eyebrow = input<string>('');
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly link = input<string | null>(null);
  readonly linkLabel = input<string>('');
  readonly resolvedLinkLabel = computed(
    () => this.linkLabel() || this.translation.t('common.viewAll'),
  );
}
