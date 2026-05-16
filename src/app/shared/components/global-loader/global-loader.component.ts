import {
  ChangeDetectionStrategy,
  Component,
  effect,
  signal,
} from '@angular/core';
import { isLoading } from '../../../core/services/loading';

@Component({
  selector: 'app-global-loader',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div
        class="fixed inset-0 z-[1000] flex items-center justify-center bg-white/40 backdrop-blur-[2px] pointer-events-none"
      >
        <div
          class="w-12 h-12 rounded-full border-4 border-pink-200 border-t-pink-500 animate-spin"
        ></div>
      </div>
    }
  `,
})
export class GlobalLoaderComponent {
  readonly visible = signal<boolean>(false);

  constructor() {
    effect((onCleanup) => {
      const loading = isLoading();

      if (!loading) {
        this.visible.set(false);
        return;
      }

      const id = setTimeout(() => {
        if (isLoading()) this.visible.set(true);
      }, 250);

      onCleanup(() => clearTimeout(id));
    });
  }
}

