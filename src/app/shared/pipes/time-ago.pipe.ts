import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from '../../core/i18n';

@Pipe({
  name: 'timeAgo',
  standalone: true,
  pure: false,
})
export class TimeAgoPipe implements PipeTransform {
  private readonly translation = inject(TranslationService, { optional: true });

  transform(value: string | Date | null | undefined): string {
    if (!value) return '-';
    const d = typeof value === 'string' ? new Date(value) : value;
    const diff = Date.now() - d.getTime();
    const sec = Math.round(diff / 1000);
    const t = (key: string, n?: number) =>
      this.translation?.t(key, n !== undefined ? { n } : undefined) ?? key;

    if (sec < 60) return t('timeAgo.justNow');
    const min = Math.round(sec / 60);
    if (min < 60) return t('timeAgo.minAgo', min);
    const hr = Math.round(min / 60);
    if (hr < 24) return t('timeAgo.hrAgo', hr);
    const day = Math.round(hr / 24);
    if (day < 7) return t('timeAgo.dayAgo', day);
    const wk = Math.round(day / 7);
    if (day < 30) return t('timeAgo.wkAgo', wk);
    const mo = Math.round(day / 30);
    if (day < 365) return t('timeAgo.moAgo', mo);
    const yr = Math.round(day / 365);
    return t('timeAgo.yrAgo', yr);
  }
}
