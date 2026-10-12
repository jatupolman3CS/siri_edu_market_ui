import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../../../core/services/theme.service';
import { TranslatePipe } from '../../../core/i18n';
import { IconComponent } from '../icon/icon.component';

/** Light / dark switch. `tone="on-dark"` is for the always-dark admin chrome (same idea as the language switcher's `theme`). */
@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);

  readonly tone = input<'default' | 'on-dark'>('default');

  /** The label names the action (what a click does), so it never needs aria-pressed on top. */
  readonly labelKey = computed(() => (this.theme.isDark() ? 'header.themeToLight' : 'header.themeToDark'));

  readonly classes = computed(() =>
    this.tone() === 'on-dark'
      ? 'bg-white/10 text-brand-100 border-white/10 hover:bg-white/20'
      : 'bg-surface text-ink-soft border-line hover:border-brand-300 hover:text-brand-600',
  );
}
