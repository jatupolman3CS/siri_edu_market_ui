import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Served by the `src/assets` glob in `angular.json` (see `angular.json` build → assets),
 * this is the last line of defense when a dynamic image cannot be shown — a broken cover,
 * avatar, or banner should never leave a broken-image icon or a blank box in the UI.
 */
export const DEFAULT_LOGO_ASSET_PATH = '/assets/images/default-logo.svg';

/**
 * Add `appImgFallback` to any `<img [src]="…">` that renders a URL coming from data
 * (backend cover/avatar/banner, user-provided link, etc.) — NOT to inline/static `<img>`
 * tags that never fail. The directive shadows the native `src` property binding so it can:
 *  - swap in the shipped default logo the moment `src` is empty/null/undefined, and
 *  - swap in the default logo on the image's `(error)` event (broken URL, network failure, 404).
 *
 * A guard flag stops the swap from firing twice in a row so that if the default logo asset
 * itself ever fails to load, the browser does not loop forever re-requesting it.
 */
@Directive({
  selector: 'img[appImgFallback]',
  standalone: true,
  host: {
    '(error)': 'onError()',
  },
})
export class ImgFallbackDirective {
  private readonly elementRef = inject(ElementRef<HTMLImageElement>);
  private usingFallback = false;

  /** Shadows the native `src` property so the directive controls every assignment to it. */
  readonly src = input<string | null | undefined>();

  constructor() {
    effect(() => {
      const value = this.src();
      this.applySrc(value && value.trim().length > 0 ? value : DEFAULT_LOGO_ASSET_PATH);
    });
  }

  onError(): void {
    if (this.usingFallback) return;
    this.applySrc(DEFAULT_LOGO_ASSET_PATH);
  }

  private applySrc(value: string): void {
    this.usingFallback = value === DEFAULT_LOGO_ASSET_PATH;
    this.elementRef.nativeElement.src = value;
  }
}
