import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslationService } from './translation.service';

@Injectable({ providedIn: 'root' })
export class I18nTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly translation = inject(TranslationService);
  private currentSnapshot: RouterStateSnapshot | null = null;

  constructor() {
    super();
    effect(() => {
      // Re-evaluate title reactively when currentLang changes
      this.translation.currentLang();
      if (this.currentSnapshot) {
        this.updateTitle(this.currentSnapshot);
      }
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.currentSnapshot = snapshot;
    const titleKey = this.buildTitle(snapshot);
    if (!titleKey) {
      this.title.setTitle('SIRIEDUMARKET');
      return;
    }

    const translated = this.translation.t(titleKey);
    this.title.setTitle(translated && translated !== titleKey ? translated : titleKey);
  }
}
