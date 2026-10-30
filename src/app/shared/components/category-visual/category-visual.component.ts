import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * Category ids (== slugs) that have a bundled illustration under
 * `public/images/categories/<id>.svg`. Anything else falls back to the emoji icon.
 */
export const CATEGORY_ILLUSTRATION_IDS: ReadonlySet<string> = new Set([
  'kindergarten',
  'primary-lower',
  'primary-upper',
  'secondary-lower',
  'secondary-upper',
  'university-entrance',
  'competitions',
  'languages',
  'civil-service',
  'teaching-materials',
]);

export function categoryIllustrationUrl(...keys: (string | null | undefined)[]): string | null {
  for (const key of keys) {
    const k = key?.trim().toLowerCase();
    if (k && CATEGORY_ILLUSTRATION_IDS.has(k)) return `/images/categories/${k}.svg`;
  }
  return null;
}

/**
 * Renders a category's illustration (SVG via <img>) when one exists for its id/slug,
 * otherwise the category's emoji icon (inherits the parent font-size).
 */
@Component({
  selector: 'app-category-visual',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './category-visual.component.html',
  styleUrl: './category-visual.component.scss',
  host: { '[class.category-visual--fill]': 'size() === null' },
})
export class CategoryVisualComponent {
  readonly categoryId = input<string | null | undefined>();
  readonly slug = input<string | null | undefined>();
  readonly icon = input<string | null | undefined>();
  /** Square edge in px; omit (null) to fill the parent box (for responsive containers). */
  readonly size = input<number | null>(null);
  readonly fallbackIcon = input<string>('📄');

  /** Set when the <img> fails to load so we drop back to the emoji. */
  private readonly broken = signal<string | null>(null);

  readonly src = computed(() => {
    const url = categoryIllustrationUrl(this.categoryId(), this.slug());
    return url && url !== this.broken() ? url : null;
  });

  readonly emoji = computed(() => this.icon()?.trim() || this.fallbackIcon());

  onError(): void {
    this.broken.set(this.src());
  }
}
