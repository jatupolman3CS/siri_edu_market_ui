import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { GlobalLoaderComponent } from '../../../shared/components/global-loader/global-loader.component';
import { PlatformStatsService } from '../../../core/services';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { LanguageSwitcherComponent } from '../../../shared/components/language-switcher/language-switcher.component';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterLink, LogoComponent, GlobalLoaderComponent, CompactPipe, DecimalPipe, TranslatePipe, LanguageSwitcherComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-layout.component.html',
  styleUrl: './auth-layout.component.scss',
})
export class AuthLayoutComponent {
  // real-data-stats v1 §4.3: shared across all 5 auth pages (login/register/forgot-password/
  // reset-password/verify-email) — this layout is the single wire point.
  readonly platformStats = inject(PlatformStatsService);
  private readonly translation = inject(TranslationService);

  constructor() {
    // No-op if another page already loaded this (cached in the service itself).
    this.platformStats.loadStats();
  }

  readonly artTitleInput = input<string | null>(null, { alias: 'artTitle' });
  readonly artDescriptionInput = input<string | null>(null, { alias: 'artDescription' });
  readonly artBulletsInput = input<{ icon: string; label: string }[] | null>(null, { alias: 'artBullets' });
  readonly compact = input(false);

  readonly artTitle = computed(() => this.artTitleInput() ?? this.translation.t('auth.defaultArtTitle'));
  readonly artDescription = computed(() => this.artDescriptionInput() ?? this.translation.t('auth.defaultArtDesc'));
  readonly artBullets = computed(() => this.artBulletsInput() ?? [
    { icon: '🎁', label: this.translation.t('auth.bullet1') },
    { icon: '💝', label: this.translation.t('auth.bullet2') },
    { icon: '🛡️', label: this.translation.t('auth.bullet3') },
    { icon: '⚡', label: this.translation.t('auth.bullet4') },
  ]);
}
