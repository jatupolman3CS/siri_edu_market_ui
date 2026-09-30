import { TestBed } from '@angular/core/testing';
import { ThbPipe } from './thb.pipe';
import { TranslationService } from '../../core/i18n';

describe('ThbPipe', () => {
  let pipe: ThbPipe;

  beforeEach(() => {
    TestBed.inject(TranslationService).setLanguage('en');
    pipe = TestBed.runInInjectionContext(() => new ThbPipe());
  });

  afterEach(() => {
    TestBed.inject(TranslationService).setLanguage('th');
    window.localStorage?.removeItem('siriedu_lang');
  });

  it('prints every digit by default', () => {
    expect(pipe.transform(1234567.89)).toBe('฿1,234,568');
    expect(pipe.transform(1234567.89, false)).toBe('1,234,568');
    expect(pipe.transform(null)).toBe('฿0');
  });

  it('compact: keeps full digits below one million', () => {
    expect(pipe.transform(123456.7, true, 'compact')).toBe('฿123,457');
    expect(pipe.transform(999999, true, 'compact')).toBe('฿999,999');
  });

  it('compact: shortens millions and billions to at most two decimals', () => {
    expect(pipe.transform(1234567.89, true, 'compact')).toBe('฿1.23M');
    expect(pipe.transform(1_200_000, true, 'compact')).toBe('฿1.2M');
    expect(pipe.transform(-2_500_000, true, 'compact')).toBe('฿-2.5M');
    expect(pipe.transform(3_450_000_000, true, 'compact')).toBe('฿3.45B');
  });
});
