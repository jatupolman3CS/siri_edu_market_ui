import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LightboxService } from '../../services/lightbox.service';

/**
 * image-upload-optimization v2 §4: mounted once at the app root (same pattern as
 * `announcement-popup`/`cart-drawer`). Renders nothing while `LightboxService.current()` is
 * `null` — the full-resolution `<img>` only enters the DOM once something calls `open()`.
 */
@Component({
  selector: 'app-lightbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lightbox.component.html',
  styleUrl: './lightbox.component.scss',
})
export class LightboxComponent {
  readonly lightbox = inject(LightboxService);

  close(): void {
    this.lightbox.close();
  }

  onBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }
}
