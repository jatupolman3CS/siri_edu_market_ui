import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ThemeToggleComponent } from './theme-toggle.component';
import { ThemeService } from '../../../core/services/theme.service';
import { TranslationService } from '../../../core/i18n/translation.service';

describe('ThemeToggleComponent', () => {
  let fixture: ComponentFixture<ThemeToggleComponent>;
  let theme: ThemeService;

  const button = (): HTMLButtonElement =>
    (fixture.nativeElement as HTMLElement).querySelector('[data-testid="theme-toggle"]') as HTMLButtonElement;

  beforeEach(async () => {
    try { window?.localStorage?.clear?.(); } catch {}
    await TestBed.configureTestingModule({ imports: [ThemeToggleComponent] }).compileComponents();
    TestBed.inject(TranslationService).setLanguage('en');
    fixture = TestBed.createComponent(ThemeToggleComponent);
    theme = TestBed.inject(ThemeService);
    theme.theme.set('light');
    fixture.detectChanges();
  });

  afterEach(() => {
    try { window?.localStorage?.clear?.(); } catch {}
    document.documentElement.removeAttribute('data-theme');
    TestBed.inject(TranslationService).setLanguage('th');
  });

  it('names the action a click will perform, in the current language', () => {
    expect(button().getAttribute('aria-label')).toBe('Switch to dark mode');

    theme.theme.set('dark');
    fixture.detectChanges();

    expect(button().getAttribute('aria-label')).toBe('Switch to light mode');
  });

  it('shows the moon in light mode and the sun in dark mode', () => {
    const iconName = (): string | null => (fixture.nativeElement as HTMLElement).querySelector('app-icon svg path')?.getAttribute('d') ?? null;
    const moon = iconName();

    theme.theme.set('dark');
    fixture.detectChanges();

    expect(iconName()).not.toBe(moon);
  });

  it('clicking toggles the theme', () => {
    button().click();
    fixture.detectChanges();

    expect(theme.theme()).toBe('dark');

    button().click();
    fixture.detectChanges();

    expect(theme.theme()).toBe('light');
  });

  it('uses the white-on-dark look for the admin chrome', () => {
    fixture.componentRef.setInput('tone', 'on-dark');
    fixture.detectChanges();

    expect(button().classList).toContain('bg-white/10');
    expect(button().classList).not.toContain('bg-surface');
  });
});
