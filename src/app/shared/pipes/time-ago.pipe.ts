import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'timeAgo', standalone: true })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) return '-';
    const d = typeof value === 'string' ? new Date(value) : value;
    const diff = Date.now() - d.getTime();
    const sec = Math.round(diff / 1000);
    if (sec < 60) return 'เมื่อสักครู่';
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} นาทีที่แล้ว`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
    const day = Math.round(hr / 24);
    if (day < 7) return `${day} วันที่แล้ว`;
    if (day < 30) return `${Math.round(day / 7)} สัปดาห์ที่แล้ว`;
    if (day < 365) return `${Math.round(day / 30)} เดือนที่แล้ว`;
    return `${Math.round(day / 365)} ปีที่แล้ว`;
  }
}
