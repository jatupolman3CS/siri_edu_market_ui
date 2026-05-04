import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { AuthProvider } from '../../../core/services';

@Component({
  selector: 'app-social-buttons',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './social-buttons.component.html',
  styleUrl: './social-buttons.component.scss',
})
export class SocialButtonsComponent {
  readonly select = output<AuthProvider>();
}
