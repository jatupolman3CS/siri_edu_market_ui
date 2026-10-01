import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from '../../core/i18n';

/** `'full'` = every digit (default). `'compact'` = full digits below 1,000,000, then ฿1.23M / ฿1.2B. */
export type ThbFormat = 'full' | 'compact';

@Pipe({
  name: 'thb',
  standalone: true,
  pure: false,
})
export class ThbPipe implements PipeTransform {
  private readonly translation = inject(TranslationService, { optional: true });

  /**
   * `{{ amount | thb }}` → ฿1,234,568 · `{{ amount | thb: true : 'compact' }}` → ฿1.23M.
   * Use `'compact'` where the amount sits in a narrow tile (stat cards, responsive-ui.md §4.6 E:
   * numbers never wrap mid-number) and put the full amount in a tooltip.
   */
  transform(value: number | null | undefined, withSymbol = true, format: ThbFormat = 'full'): string {
    if (value == null || isNaN(value)) return withSymbol ? '฿0' : '0';
    const isEn = this.translation?.currentLang() === 'en';
    const locale = isEn ? 'en-US' : 'th-TH';
    const formatted = format === 'compact' ? compactAmount(value, locale) : fullAmount(value, locale);
    return withSymbol ? `฿${formatted}` : formatted;
  }
}

function fullAmount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function compactAmount(value: number, locale: string): string {
  const abs = Math.abs(value);
  if (abs < 1_000_000) return fullAmount(value, locale);
  const [divisor, suffix] = abs >= 1_000_000_000 ? [1_000_000_000, 'B'] : [1_000_000, 'M'];
  const scaled = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / divisor);
  return `${scaled}${suffix}`;
}
