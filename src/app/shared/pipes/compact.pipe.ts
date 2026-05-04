import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'compact', standalone: true })
export class CompactPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null) return '0';
    if (value < 1000) return String(value);
    if (value < 1_000_000) return (value / 1000).toFixed(value < 10_000 ? 1 : 0) + 'k';
    return (value / 1_000_000).toFixed(1) + 'M';
  }
}
