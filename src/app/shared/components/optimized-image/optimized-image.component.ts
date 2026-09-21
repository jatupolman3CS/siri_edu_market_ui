import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ImgFallbackDirective } from '../../directives/img-fallback.directive';
import { LightboxService } from '../../services/lightbox.service';

/**
 * image-upload-optimization v2 §4: reusable image renderer — picks `thumbSrc` when given
 * (falling back to `src`) for the visible `<img>`, and only fetches `fullSrc` (falling back to
 * `src`) when the caller opts into `lightbox` and the image is actually clicked. Wraps
 * `ImgFallbackDirective` rather than duplicating its broken-image handling.
 */
@Component({
  selector: 'app-optimized-image',
  standalone: true,
  imports: [ImgFallbackDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './optimized-image.component.html',
  styleUrl: './optimized-image.component.scss',
})
export class OptimizedImageComponent {
  private readonly lightboxService = inject(LightboxService);

  readonly src = input.required<string>();
  readonly thumbSrc = input<string | null>(null);
  readonly fullSrc = input<string | null>(null);
  readonly alt = input<string>('');
  /** Extra classes forwarded to the inner `<img>` — lets callers keep their existing utility classes. */
  readonly imgClass = input<string>('');
  /** `true` skips `loading="lazy"` — for images already in the first viewport. */
  readonly eager = input<boolean>(false);
  /** `true` opens `LightboxService` with `fullSrc()` on click. */
  readonly lightbox = input<boolean>(false);

  displaySrc(): string {
    return this.thumbSrc() ?? this.src();
  }

  onImageClick(): void {
    if (!this.lightbox()) return;
    this.lightboxService.open(this.fullSrc() ?? this.src(), this.alt());
  }
}
