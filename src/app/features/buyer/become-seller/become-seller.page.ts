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
  /** responsive-ui v1.4 R-17 (F88): the application lookup failed (network / 5xx), not "none". */
  readonly loadFailed = signal<boolean>(false);

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

  /** R-17: the error state's retry re-issues the same GET. */
  retry(): void {
    void this.load();
  }

  /**
   * `resolveAccessStatus({ force: true })` makes the same single `GET /api/me/seller-application`
   * as `loadMine()` did, but tells a failed lookup (`'unavailable'`) apart from "never applied" —
   * `loadMine()` resolves `null` for both, which is how an outage used to show a fresh form.
   */
  private async load(): Promise<void> {
    this.loadFailed.set(false);
    const status = await this.applications.resolveAccessStatus({ force: true });
    if (status === 'unavailable') {
      this.loadFailed.set(true);
      return;
    }
    const existing = this.applications.mine();
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
