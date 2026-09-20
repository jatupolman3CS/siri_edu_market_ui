import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { StoreReadinessItem } from '../../../core/models';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-store-readiness-bar',
  standalone: true,
  imports: [RouterLink, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './store-readiness-bar.component.html',
  styleUrl: './store-readiness-bar.component.scss',
})
export class StoreReadinessBarComponent {
  readonly percentComplete = input.required<number>();
  readonly isComplete = input.required<boolean>();
  readonly items = input.required<StoreReadinessItem[]>();
  readonly nextActionItemKey = input.required<string | null>();

  hasCount(item: StoreReadinessItem): boolean {
    return item.currentCount !== undefined && item.targetCount !== undefined;
  }
}
