import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services';
import { SellerApplicationService } from '../../../core/services/seller-application.service';
import { TranslatePipe, TranslationService } from '../../../core/i18n';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';

/**
 * GAP-01: lets a buyer apply to sell. Until this existed the only way to get a seller
 * account was to edit the database directly.
 */
@Component({
  selector: 'app-become-seller',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, PageHeroComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './become-seller.page.html',
})
export class BecomeSellerPage {
  private readonly applications = inject(SellerApplicationService);
  private readonly message = inject(NzMessageService);
  private readonly i18n = inject(TranslationService);
  readonly auth = inject(AuthService);

  readonly studioName = signal<string>('');
  readonly bio = signal<string>('');
  readonly specialtiesText = signal<string>('');
  readonly submitting = signal<boolean>(false);

  readonly application = this.applications.mine;
  readonly loading = this.applications.loading;

  readonly status = computed(() => this.application()?.status ?? null);
  readonly isSeller = computed(() => this.auth.isSeller() || this.auth.isAdmin());

  /** A rejected applicant may fix the details and send it again. */
  readonly canSubmit = computed(() => {
    if (this.isSeller()) return false;
    const status = this.status();
    return status === null || status === 'rejected';
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const existing = await this.applications.loadMine();
    if (existing) {
      this.studioName.set(existing.studioName ?? '');
      this.bio.set(existing.bio ?? '');
      this.specialtiesText.set((existing.specialties ?? []).join(', '));
    }
  }

  async onSubmit(): Promise<void> {
    if (this.submitting()) return;

    const studioName = this.studioName().trim();
    if (!studioName) {
      this.message.warning(this.i18n.t('becomeSeller.studioNameRequired'));
      return;
    }

    this.submitting.set(true);
    try {
      const specialties = this.specialtiesText()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const result = await this.applications.submit({
        studioName,
        bio: this.bio().trim(),
        specialties,
      });

      if (result.ok) {
        this.message.success(this.i18n.t('becomeSeller.submitSuccess'));
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
