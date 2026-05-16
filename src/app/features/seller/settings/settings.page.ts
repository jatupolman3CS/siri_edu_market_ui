import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { firstValueFrom } from 'rxjs';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { MeService, NotificationService, SellerService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-seller-settings',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SellerSettingsPage {
  private readonly me = inject(MeService);
  private readonly seller = inject(SellerService);
  readonly notifications = inject(NotificationService);
  private readonly message = inject(NzMessageService);

  displayName = '';
  studioLabel = '';
  avatarUrl = '';
  readonly saving = signal(false);
  readonly avatarUploading = signal(false);

  readonly avatarSrc = () =>
    resolvePublicUrl(this.avatarUrl) ||
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face';

  constructor() {
    this.me.loadProfile().subscribe({
      next: (p) => {
        this.displayName = p.name ?? '';
        this.studioLabel = p.sellerProfile?.studioName ?? '';
        this.avatarUrl = p.avatarUrl ?? '';
      },
      error: () => {
        /* guest / API down */
      },
    });
    this.notifications.loadSettings();
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
      const data = await this.seller.uploadFile(file);
      this.avatarUrl = data.publicUrl;
      await firstValueFrom(
        this.me.updateProfile({ name: this.displayName, avatarUrl: data.publicUrl }),
      );
      this.message.success('อัปโหลดรูปโปรไฟล์ขึ้น R2 และบันทึกแล้ว');
    } catch {
      /* SellerService / MeService แจ้งผ่าน ApiFailureReporter แล้ว */
    } finally {
      this.avatarUploading.set(false);
    }
  }

  saveProfile(): void {
    this.saving.set(true);
    this.me.updateProfile({ name: this.displayName }).subscribe({
      next: () => {
        this.saving.set(false);
        this.message.success('บันทึกโปรไฟล์แล้ว');
      },
      error: () => {
        this.saving.set(false);
        /* MeService แจ้งผ่าน ApiFailureReporter แล้ว */
      },
    });
  }

  toggleNotification(key: string | undefined, enabled: boolean): void {
    if (!key) return;
    const map: Record<string, boolean> = {};
    for (const s of this.notifications.settings()) {
      const k = s.key ?? '';
      if (!k) continue;
      map[k] = k === key ? enabled : !!s.isEnabled;
    }
    this.notifications.updateSettings({ settings: map }).subscribe({
      next: () => this.message.success('อัปเดตการแจ้งเตือนแล้ว'),
      error: () => {
        /* NotificationService แจ้งผ่าน ApiFailureReporter แล้ว */
      },
    });
  }
}
