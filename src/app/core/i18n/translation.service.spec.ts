import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { TranslationService } from './translation.service';

describe('TranslationService', () => {
  let service: TranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TranslationService],
    });
    service = TestBed.inject(TranslationService);
  });

  it('translates auth.resendOtpIn with {seconds} parameter in Thai', () => {
    service.setLanguage('th');
    const result = service.t('auth.resendOtpIn', { seconds: 45 });
    expect(result).toBe('ขอรหัสใหม่ใน 45s');
  });

  it('translates auth.resendOtpIn with {s} parameter alias in Thai', () => {
    service.setLanguage('th');
    const result = service.t('auth.resendOtpIn', { s: 45 });
    expect(result).toBe('ขอรหัสใหม่ใน 45s');
  });

  it('translates auth.resendOtpIn in English', () => {
    service.setLanguage('en');
    const resultWithSeconds = service.t('auth.resendOtpIn', { seconds: 30 });
    expect(resultWithSeconds).toBe('Request new code in 30s');

    const resultWithS = service.t('auth.resendOtpIn', { s: 30 });
    expect(resultWithS).toBe('Request new code in 30s');
  });
});
