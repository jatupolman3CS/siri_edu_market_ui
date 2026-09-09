import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from './translation.service';

@Pipe({
  name: 'trans',
  standalone: true,
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private readonly translation: TranslationService;

  constructor(translationService?: TranslationService) {
    this.translation =
      translationService ??
      inject(TranslationService, { optional: true }) ??
      new TranslationService();
  }

  transform(key: string, params?: Record<string, string | number>): string {
    if (!key) return '';
    return this.translation.t(key, params);
  }
}
