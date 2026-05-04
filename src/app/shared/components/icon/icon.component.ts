import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type IconName =
  | 'search'
  | 'cart'
  | 'heart'
  | 'heart-fill'
  | 'star'
  | 'user'
  | 'menu'
  | 'close'
  | 'arrow-right'
  | 'arrow-left'
  | 'chevron-down'
  | 'chevron-right'
  | 'download'
  | 'upload'
  | 'plus'
  | 'minus'
  | 'check'
  | 'x'
  | 'eye'
  | 'edit'
  | 'trash'
  | 'filter'
  | 'sort'
  | 'sparkle'
  | 'shield'
  | 'flag'
  | 'tag'
  | 'doc'
  | 'play'
  | 'lock'
  | 'globe'
  | 'bell'
  | 'home'
  | 'dashboard'
  | 'package'
  | 'wallet'
  | 'chart'
  | 'gear'
  | 'logout'
  | 'mail'
  | 'phone'
  | 'qr';

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.scss',
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input<number>(20);
  readonly className = input<string>('inline-block');
}
