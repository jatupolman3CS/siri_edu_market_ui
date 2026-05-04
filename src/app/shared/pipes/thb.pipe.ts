import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'thb', standalone: true })
export class ThbPipe implements PipeTransform {
  transform(value: number | null | undefined, withSymbol = true): string {
    if (value == null || isNaN(value)) return withSymbol ? '฿0' : '0';
    const formatted = new Intl.NumberFormat('th-TH', {
      maximumFractionDigits: 0,
    }).format(value);
    return withSymbol ? `฿${formatted}` : formatted;
  }
}
