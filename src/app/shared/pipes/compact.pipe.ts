import { Pipe, PipeTransform } from '@angular/core';
import { formatSmartDecimal } from './smart-decimal.pipe';

@Pipe({ name: 'compact', standalone: true })
export class CompactPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null) return '0';
    if (value < 1000) return formatSmartDecimal(value);
    if (value < 1_000_000) return `${formatSmartDecimal(value / 1000)}k`;
    return `${formatSmartDecimal(value / 1_000_000)}M`;
  }
}
