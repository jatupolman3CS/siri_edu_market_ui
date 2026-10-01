import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from '../../core/i18n';

export function formatSmartDecimal(
  value: number | string | null | undefined,
  locale = 'th-TH',
): string {
  if (value == null) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatSignedSmartDecimal(
  value: number | string | null | undefined,
  suffix = '',
  locale = 'th-TH',
): string {
  const formatted = formatSmartDecimal(value, locale);
  if (formatted === '') return '';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${formatted}${suffix}`;
}

@Pipe({
  name: 'smartDecimal',
  standalone: true,
  pure: false,
})
export class SmartDecimalPipe implements PipeTransform {
  private readonly translation = inject(TranslationService, { optional: true });

  transform(value: number | string | null | undefined): string {
    const locale = this.translation?.currentLang() === 'en' ? 'en-US' : 'th-TH';
    return formatSmartDecimal(value, locale);
  }
}
