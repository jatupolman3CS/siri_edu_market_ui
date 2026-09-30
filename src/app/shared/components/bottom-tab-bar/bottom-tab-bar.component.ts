import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent, type IconName } from '../icon/icon.component';
import { TranslatePipe } from '../../../core/i18n';
import { LayoutChromeService } from '../../../core/layout';

/**
 * One slot of the phone bottom tab bar (docs/contracts/responsive-ui.md §4.3).
 * `label` goes through the `trans` pipe, so pass an i18n key (e.g. `responsive.tab.home`);
 * a plain string that is not a key is rendered as-is.
 */
export interface BottomTabItem {
  label: string;
  icon: IconName;
  /** Router link; routerLinkActive → active style + aria-current="page". */
  href?: string;
  exact?: boolean;
  /** No href: the item is a button that emits `(menu)`. */
  action?: 'menu';
  /** Hidden when null/0; shows "99+" above 99. */
  badge?: number | null;
  /** Center FAB style (seller อัปโหลด). */
  raised?: boolean;
}

/**
 * Fixed phone-only bottom navigation. Hidden at >=744 (CSS) and while a sticky action bar is
 * alive (`LayoutChromeService.actionBarActive()`), z-index 40.
 */
@Component({
  selector: 'app-bottom-tab-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent, TranslatePipe],
  templateUrl: './bottom-tab-bar.component.html',
  styleUrl: './bottom-tab-bar.component.scss',
  host: {
    '[class.bottom-tab-bar--dark]': "theme() === 'dark'",
    '[attr.hidden]': 'chrome.actionBarActive() ? "" : null',
  },
})
export class BottomTabBarComponent {
  protected readonly chrome = inject(LayoutChromeService);

  readonly items = input.required<readonly BottomTabItem[]>();
  readonly theme = input<'light' | 'dark'>('light');
  readonly menu = output<void>();

  protected badgeText(badge: number | null | undefined): string | null {
    if (badge === null || badge === undefined || badge <= 0) return null;
    return badge > 99 ? '99+' : String(badge);
  }

  protected onMenu(): void {
    this.menu.emit();
  }
}
