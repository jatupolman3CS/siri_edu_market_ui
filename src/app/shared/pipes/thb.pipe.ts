import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from '../../core/i18n';

@Pipe({
  name: 'thb',
  standalone: true,
  pure: false,
})
export class ThbPipe implements PipeTransform {
  private readonly translation = inject(TranslationService, { optional: true });

  transform(value: number | null | undefined, withSymbol = true): string {
    if (value == null || isNaN(value)) return withSymbol ? '฿0' : '0';
    const isEn = this.translation?.currentLang() === 'en';
    const locale = isEn ? 'en-US' : 'th-TH';
    const formatted = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(value);
    return withSymbol ? `฿${formatted}` : formatted;
  }
}
