import { Injectable, signal } from '@angular/core';

export interface LightboxItem {
  readonly src: string;
  readonly alt: string;
}

/**
 * image-upload-optimization v2 §4: backs a single app-wide lightbox (mounted once via
 * `LightboxComponent` at the root, same pattern as `announcement-popup`/`cart-drawer`).
 * `OptimizedImageComponent` calls `open()` with the full-resolution URL only on click — the full
 * image is never requested/rendered before that (AC-27).
 */
@Injectable({ providedIn: 'root' })
export class LightboxService {
  readonly current = signal<LightboxItem | null>(null);

  open(src: string, alt: string): void {
    this.current.set({ src, alt });
  }

  close(): void {
    this.current.set(null);
  }
}
