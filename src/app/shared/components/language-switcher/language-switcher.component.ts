import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService, AppLanguage } from '../../../core/i18n';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  imports: [CommonModule, NzDropDownModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.scss',
})
export class LanguageSwitcherComponent {
  readonly translation = inject(TranslationService);

  /** Presentation variant: 'compact' (pill buttons), 'dropdown', or 'minimal' */
  readonly variant = input<'compact' | 'pill' | 'dropdown' | 'minimal'>('compact');

  /** Theme: 'light' (default) or 'dark' (e.g. for admin sidebar) */
  readonly theme = input<'light' | 'dark'>('light');

  setLanguage(lang: AppLanguage): void {
    this.translation.setLanguage(lang);
  }

  toggle(): void {
    this.translation.toggleLanguage();
  }
}
