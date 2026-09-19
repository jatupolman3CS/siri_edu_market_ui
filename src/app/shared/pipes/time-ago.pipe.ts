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
    const isEn = this.translation?.currentLang() === 'en';

    if (sec < 60) return isEn ? 'Just now' : 'เมื่อสักครู่';
    const min = Math.round(sec / 60);
    if (min < 60) return isEn ? `${min}m ago` : `${min} นาทีที่แล้ว`;
    const hr = Math.round(min / 60);
    if (hr < 24) return isEn ? `${hr}h ago` : `${hr} ชั่วโมงที่แล้ว`;
    const day = Math.round(hr / 24);
    if (day < 7) return isEn ? `${day}d ago` : `${day} วันที่แล้ว`;
    const wk = Math.round(day / 7);
    if (day < 30) return isEn ? `${wk}w ago` : `${wk} สัปดาห์ที่แล้ว`;
    const mo = Math.round(day / 30);
    if (day < 365) return isEn ? `${mo}mo ago` : `${mo} เดือนที่แล้ว`;
    const yr = Math.round(day / 365);
    return isEn ? `${yr}y ago` : `${yr} ปีที่แล้ว`;
  }
}
