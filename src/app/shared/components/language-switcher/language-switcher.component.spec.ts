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

  it('renders language switch buttons in compact mode', () => {
    const el: HTMLElement = fixture.nativeElement;
    const buttons = el.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('TH');
    expect(buttons[1].textContent).toContain('EN');
  });

  it('switches language to en when EN button is clicked', () => {
    const el: HTMLElement = fixture.nativeElement;
    const buttons = el.querySelectorAll('button');
    buttons[1].click();
    fixture.detectChanges();

    expect(translation.currentLang()).toBe('en');
  });

  it('switches back to th when TH button is clicked', () => {
    translation.setLanguage('en');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const buttons = el.querySelectorAll('button');
    buttons[0].click();
    fixture.detectChanges();

    expect(translation.currentLang()).toBe('th');
  });

  it('toggles language in minimal mode', () => {
    fixture.componentRef.setInput('variant', 'minimal');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector('button');
    expect(button?.textContent).toContain('TH');

    button?.click();
    fixture.detectChanges();
    expect(translation.currentLang()).toBe('en');
  });
});
