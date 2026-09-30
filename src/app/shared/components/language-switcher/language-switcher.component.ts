import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { TranslationService, AppLanguage } from '../../../core/i18n';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { DropdownBackResetDirective } from '../../directives/dropdown-back-reset.directive';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  imports: [CommonModule, NzDropDownModule, DropdownBackResetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.scss',
})
export class LanguageSwitcherComponent {
  readonly translation = inject(TranslationService);

  /** Presentation variant: defaults to 'dropdown' across all roles */
  readonly variant = input<'compact' | 'pill' | 'dropdown' | 'minimal'>('dropdown');

  /** Dropdown menu placement: defaults to 'bottomRight' */
  readonly placement = input<'bottomRight' | 'bottomLeft' | 'topRight' | 'topLeft'>('bottomRight');

  /** Theme: 'light' (default) or 'dark' (e.g. for admin sidebar) */
  readonly theme = input<'light' | 'dark'>('light');

  setLanguage(lang: AppLanguage): void {
    this.translation.setLanguage(lang);
  }

  toggle(): void {
    this.translation.toggleLanguage();
  }

  private readonly document = inject(DOCUMENT);

  /**
   * The menu renders at the end of <body> (CDK overlay): move focus to the selected option once it
   * is attached so a keyboard user lands in it (the dropdown emits before attaching).
   */
  onMenuVisible(visible: boolean): void {
    if (!visible) return;
    setTimeout(() => {
      const menus = this.document.querySelectorAll<HTMLElement>('[data-testid="language-menu"]');
      const menu = menus[menus.length - 1];
      const target =
        menu?.querySelector<HTMLElement>('button[aria-pressed="true"]') ?? menu?.querySelector<HTMLElement>('button');
      target?.focus();
    });
  }
}
