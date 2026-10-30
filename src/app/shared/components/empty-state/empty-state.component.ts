import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Bundled empty-state illustrations under `public/images/empty/<name>.svg`. */
export type EmptyStateIllustration = 'search' | 'cart' | 'library' | 'documents' | 'generic';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  readonly emoji = input<string>('📭');
  /** Optional illustration; when set it replaces the emoji box. The emoji stays the fallback. */
  readonly illustration = input<EmptyStateIllustration | null | undefined>();
  readonly title = input.required<string>();
  readonly description = input<string>();

  readonly illustrationSrc = computed(() => {
    const name = this.illustration();
    return name ? `/images/empty/${name}.svg` : null;
  });
}
