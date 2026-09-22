import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { firstValueFrom } from 'rxjs';
import { resolveAvatarUrl } from '../../../core/brand-assets';
import { downloadUrlForStorageKey } from '../../../core/api-runtime';
import { MeService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';
import { OptimizedImageComponent } from '../optimized-image/optimized-image.component';

/**
 * F-07: display name plus avatar, shared by /account and /seller/settings.
 */
@Component({
  selector: 'app-profile-editor',
  standalone: true,
  imports: [FormsModule, IconComponent, OptimizedImageComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-editor.component.html',
  styles: [':host { display: block; }'],
})
export class ProfileEditorComponent {
  private readonly me = inject(MeService);
  private readonly message = inject(NzMessageService);
  readonly translation = inject(TranslationService);

  /** Shown read-only beside the name. Sellers pass their studio name; buyers pass nothing. */
  readonly secondaryLabel = input<string>('');
  readonly secondaryLabelText = input<string>('');

  readonly displayName = signal('');
  readonly avatarUrl = signal('');
  readonly avatarStorageKey = signal('');

  readonly saving = signal(false);
  readonly avatarUploading = signal(false);
  readonly loaded = signal(false);

  readonly avatarSrc = computed(() => resolveAvatarUrl(this.avatarUrl()));

  private static avatarDisplayUrlFromUpload(
    storageKey: string,
    displayUrl: string | null | undefined,
  ): string {
    return storageKey ? downloadUrlForStorageKey(storageKey) : (displayUrl ?? '');
  }

  constructor() {
    this.me.loadProfile().subscribe({
      next: (p) => {
        this.displayName.set(p.name ?? '');
        this.avatarUrl.set(p.avatarUrl ?? '');
        this.avatarStorageKey.set(p.avatarStorageKey ?? '');
        this.loaded.set(true);
      },
      error: () => {
        this.loaded.set(true);
      },
    });
  }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.message.warning(this.translation.t('shared.profileEditor.invalidImageType'));
      return;
    }

    this.avatarUploading.set(true);
    try {
      const data = await this.me.uploadAvatar(file);
      const avatarStorageKey = data.optimizedKey ?? data.key;
      this.avatarStorageKey.set(avatarStorageKey);
      this.avatarUrl.set(
        ProfileEditorComponent.avatarDisplayUrlFromUpload(
          avatarStorageKey,
          data.optimizedUrl ?? data.publicUrl,
        ),
      );
      const saved = await firstValueFrom(
        this.me.updateProfile({
          name: this.displayName(),
          avatarStorageKey,
        }),
      );
      this.avatarUrl.set(saved.avatarUrl ?? this.avatarUrl());
      this.avatarStorageKey.set(saved.avatarStorageKey ?? avatarStorageKey);
      this.message.success(this.translation.t('shared.profileEditor.uploadSuccess'));
    } catch {
      /* reported by MeService through ApiFailureReporter */
    } finally {
      this.avatarUploading.set(false);
    }
  }

  save(): void {
    this.saving.set(true);
    this.me
      .updateProfile({ name: this.displayName(), avatarStorageKey: this.avatarStorageKey() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.message.success(this.translation.t('shared.profileEditor.saveSuccess'));
        },
        error: () => {
          this.saving.set(false);
        },
      });
  }
}
