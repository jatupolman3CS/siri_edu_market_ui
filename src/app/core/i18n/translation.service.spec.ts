import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { TranslatePipe } from './translate.pipe';

describe('TranslationService & TranslatePipe (Bilingual Support)', () => {
  let service: TranslationService;

  beforeEach(() => {
    try { window?.localStorage?.clear?.(); } catch {}
    TestBed.configureTestingModule({
      providers: [TranslationService],
    });
    service = TestBed.inject(TranslationService);
    // Reset to default 'th' for tests
    service.setLanguage('th');
  });

  afterEach(() => {
    try { window?.localStorage?.clear?.(); } catch {}
  });

  it('initializes with default language "th"', () => {
    expect(service.currentLang()).toBe('th');
    expect(service.t('nav.home')).toBe('หน้าแรก');
  });

  it('switches language to "en" and translates nav items to English', () => {
    service.setLanguage('en');
    expect(service.currentLang()).toBe('en');
    expect(service.t('nav.home')).toBe('Home');
    expect(service.t('nav.marketplace')).toBe('Marketplace');
    expect(service.t('common.search')).toBe('Search');
  });

  it('interpolates parameters in translation strings', () => {
    service.setLanguage('th');
    expect(service.t('header.cartCount', { count: 5 })).toBe('ตะกร้าสินค้า 5 รายการ');

    service.setLanguage('en');
    expect(service.t('header.cartCount', { count: 5 })).toBe('Cart (5 items)');
  });

  it('toggles language between th and en', () => {
    service.setLanguage('th');
    service.toggleLanguage();
    expect(service.currentLang()).toBe('en');

    service.toggleLanguage();
    expect(service.currentLang()).toBe('th');
  });

  it('falls back to key if path is unknown', () => {
    expect(service.t('non.existent.key')).toBe('non.existent.key');
  });

  it('translates via TranslatePipe', () => {
    const pipe = new TranslatePipe(service);
    service.setLanguage('th');
    expect(pipe.transform('nav.signIn')).toBe('เข้าสู่ระบบ');

    service.setLanguage('en');
    expect(pipe.transform('nav.signIn')).toBe('Sign In');
  });
});
