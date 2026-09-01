import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { firstValueFrom } from 'rxjs';
import { resolveAvatarUrl } from '../../../core/brand-assets';
import { MeService } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';
import { ImgFallbackDirective } from '../../directives/img-fallback.directive';

/**
 * F-07: display name plus avatar, shared by /account and /seller/settings.
 *
 * Buyers previously had no way to change either: the only page that called
 * `PUT /api/me/profile` was /seller/settings, which sits behind the seller guard. Rather than
 * copy that page's profile block into a new one, it moved here and both pages use it — so a fix
 * to the upload flow, or to the "save the name alongside the avatar" ordering below, only has
 * to be made once.
 */
@Component({
  selector: 'app-profile-editor',
  standalone: true,
  imports: [FormsModule, IconComponent, ImgFallbackDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-editor.component.html',
})
export class ProfileEditorComponent {
  private readonly me = inject(MeService);
  private readonly message = inject(NzMessageService);

  /** Shown read-only beside the name. Sellers pass their studio name; buyers pass nothing. */
  readonly secondaryLabel = input<string>('');
  readonly secondaryLabelText = input<string>('');

  displayName = '';
  avatarUrl = '';
  /**
   * storage-key-persistence v1 §4.1: the bare object-storage key, kept separate from `avatarUrl`
   * (display-only) — this is what must round-trip back into `updateProfile()`, never the URL.
   */
  avatarStorageKey = '';

  readonly saving = signal(false);
  readonly avatarUploading = signal(false);
  readonly loaded = signal(false);

  readonly avatarSrc = () => resolveAvatarUrl(this.avatarUrl);

  constructor() {
    this.me.loadProfile().subscribe({
      next: (p) => {
        this.displayName = p.name ?? '';
        this.avatarUrl = p.avatarUrl ?? '';
        this.avatarStorageKey = p.avatarStorageKey ?? '';
        this.loaded.set(true);
      },
      error: () => {
        // MeService has already reported through ApiFailureReporter. The form stays editable so
        // a transient failure does not lock the user out of their own profile.
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
      this.message.warning('กรุณาเลือกไฟล์รูปภาพ (JPG/PNG/WebP)');
      return;
    }

    this.avatarUploading.set(true);
    try {
      const data = await this.me.uploadAvatar(file);
      // image-upload-optimization v1 §4: avatar has no separate "original" column to keep, so
      // the optimized URL (when the backend produced one) replaces publicUrl outright — both
      // for what renders here and for what gets persisted.
      this.avatarUrl = data.optimizedUrl ?? data.publicUrl;
      // storage-key-persistence v1 §4.1: persist the bare key from UploadResponse, never a URL.
      this.avatarStorageKey = data.optimizedKey ?? data.key;
      // The name goes up with it: PUT /api/me/profile replaces the profile, so sending the
      // avatar alone would blank a name the user had typed but not yet saved.
      await firstValueFrom(
        this.me.updateProfile({
          name: this.displayName,
          avatarStorageKey: this.avatarStorageKey,
        }),
      );
      this.message.success('อัปโหลดรูปโปรไฟล์และบันทึกแล้ว');
    } catch {
      /* reported by MeService through ApiFailureReporter */
    } finally {
      this.avatarUploading.set(false);
    }
  }

  save(): void {
    this.saving.set(true);
    // storage-key-persistence v1 §4.1 (bug fix): resubmit `avatarStorageKey`, never `avatarUrl` —
    // `avatarUrl` is a resolved display URL and would corrupt the stored key on every edit that
    // doesn't touch the avatar.
    this.me
      .updateProfile({ name: this.displayName, avatarStorageKey: this.avatarStorageKey })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.message.success('บันทึกโปรไฟล์แล้ว');
        },
        error: () => {
          // Left visible rather than swallowed: the user needs to know the name did not save.
          this.saving.set(false);
        },
      });
  }
}
