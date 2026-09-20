import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { LanguageSwitcherComponent } from './language-switcher.component';
import { TranslationService } from '../../../core/i18n/translation.service';

describe('LanguageSwitcherComponent', () => {
  let component: LanguageSwitcherComponent;
  let fixture: ComponentFixture<LanguageSwitcherComponent>;
  let translation: TranslationService;

  beforeEach(async () => {
    try { window?.localStorage?.clear?.(); } catch {}
    await TestBed.configureTestingModule({
      imports: [LanguageSwitcherComponent],
      providers: [TranslationService, provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(LanguageSwitcherComponent);
    component = fixture.componentInstance;
    translation = TestBed.inject(TranslationService);
    translation.setLanguage('th');
    fixture.detectChanges();
  });

  afterEach(() => {
    try { window?.localStorage?.clear?.(); } catch {}
  });

  it('renders language dropdown trigger button showing TH when current language is th', () => {
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('TH');
  });

  it('displays EN when language is switched to en', () => {
    translation.setLanguage('en');
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.textContent).toContain('EN');
  });

  it('switches language when setLanguage is called', () => {
    component.setLanguage('en');
    fixture.detectChanges();
    expect(translation.currentLang()).toBe('en');

    component.setLanguage('th');
    fixture.detectChanges();
    expect(translation.currentLang()).toBe('th');
  });

  it('toggles language between th and en', () => {
    translation.setLanguage('th');
    component.toggle();
    fixture.detectChanges();
    expect(translation.currentLang()).toBe('en');

    component.toggle();
    fixture.detectChanges();
    expect(translation.currentLang()).toBe('th');
  });

  it('supports switching directly between th and en', () => {
    component.setLanguage('en');
    fixture.detectChanges();
    expect(translation.currentLang()).toBe('en');

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(button?.textContent).toContain('EN');

    component.setLanguage('th');
    fixture.detectChanges();
    expect(translation.currentLang()).toBe('th');
    expect(button?.textContent).toContain('TH');
  });
});
