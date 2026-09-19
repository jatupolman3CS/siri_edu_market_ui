import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEn from '@angular/common/locales/en';
import localeTh from '@angular/common/locales/th';
import { NzI18nService, en_US, th_TH } from 'ng-zorro-antd/i18n';
import { th } from './translations/th';
import { en } from './translations/en';

registerLocaleData(localeEn);
registerLocaleData(localeTh);

export type AppLanguage = 'th' | 'en';

const STORAGE_KEY = 'siriedu_lang';

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private readonly nzI18n = inject(NzI18nService, { optional: true });

  readonly currentLang = signal<AppLanguage>(this.getInitialLanguage());

  private readonly dictionaries = {
    th,
    en,
  };

  /** Reactive computed map of current dictionary */
  readonly currentDictionary = computed(() => this.dictionaries[this.currentLang()]);

  constructor() {
    // Reactively update DOM html lang, localStorage, and Ng-Zorro locale
    effect(() => {
      const lang = this.currentLang();
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(STORAGE_KEY, lang);
        }
      } catch {
        // Ignore storage access errors in private/sandboxed modes
      }

      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = lang;
      }

      if (this.nzI18n) {
        this.nzI18n.setLocale(lang === 'th' ? th_TH : en_US);
      }
    });
  }

  private getInitialLanguage(): AppLanguage {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved === 'th' || saved === 'en') {
          return saved;
        }
      }
    } catch {
      // Fallback
    }

    return 'th';
  }

  setLanguage(lang: AppLanguage): void {
    if (this.currentLang() !== lang) {
      this.currentLang.set(lang);
    }
  }

  toggleLanguage(): void {
    this.setLanguage(this.currentLang() === 'th' ? 'en' : 'th');
  }

  /**
   * Translates a dot-notated key (e.g. 'nav.home', 'header.cartCount')
   * Reactively reads `this.currentLang()` so calling this inside template or computed signal
   * automatically triggers change detection on language switch.
   */
  t(path: string, params?: Record<string, string | number>): string {
    const lang = this.currentLang();
    const dict = this.dictionaries[lang] || this.dictionaries.th;
    
    let val = this.resolvePath(dict, path);
    if (!val && lang !== 'th') {
      // Fallback to Thai
      val = this.resolvePath(this.dictionaries.th, path);
    }

    if (!val) {
      return path;
    }

    if (params) {
      Object.keys(params).forEach((paramKey) => {
        val = val.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(params[paramKey]));
      });
    }

    return val;
  }

  private resolvePath(obj: any, path: string): string {
    const segments = path.split('.');
    let current = obj;
    for (const seg of segments) {
      if (current && typeof current === 'object' && seg in current) {
        current = current[seg];
      } else {
        return '';
      }
    }
    return typeof current === 'string' ? current : '';
  }
}
