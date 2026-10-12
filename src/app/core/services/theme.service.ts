import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export type AppTheme = 'light' | 'dark';

/** localStorage key — 'light' | 'dark'. Absent/unreadable = follow the OS (`prefers-color-scheme`). */
export const THEME_STORAGE_KEY = 'siriedu_theme';

/** `<meta name="theme-color">` per theme — the browser UI (Android address bar, iOS status bar) follows the page. */
const META_THEME_COLOR: Record<AppTheme, string> = { light: '#db2777', dark: '#160b12' };

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Light / dark theme. The choice lives on `<html data-theme="…">`; every colour in the app is a CSS variable that
 * `tailwind.theme.js` redefines under `:root[data-theme="dark"]`, so no component has to know about the theme.
 *
 * Resolution order: the reader's saved choice → the OS preference → light. Only an explicit choice (the toggle)
 * is saved; until then the page keeps following the OS if it flips while the tab is open. `index.html` runs the
 * same resolution inline before first paint so a dark reader never sees a white flash — this service takes over
 * from there. Storage and `matchMedia` can throw or be missing (private windows, jsdom): all of it fails soft.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  readonly theme = signal<AppTheme>('light');
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    this.theme.set(this.readStored() ?? (this.systemPrefersDark() ? 'dark' : 'light'));
    this.apply(this.theme());
    effect(() => this.apply(this.theme()));
    this.followSystemWhileUnset();
  }

  /** Explicit choice from the reader — saved, so it beats the OS from now on. */
  set(theme: AppTheme): void {
    this.theme.set(theme);
    this.store(theme);
  }

  toggle(): void {
    this.set(this.isDark() ? 'light' : 'dark');
  }

  private apply(theme: AppTheme): void {
    const root = this.document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_THEME_COLOR[theme]);
  }

  private followSystemWhileUnset(): void {
    const query = this.mediaQuery();
    if (!query?.addEventListener) return;
    const onChange = (event: MediaQueryListEvent): void => {
      if (this.readStored() === null) this.theme.set(event.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }

  private mediaQuery(): MediaQueryList | null {
    const win = this.document.defaultView;
    return typeof win?.matchMedia === 'function' ? win.matchMedia(DARK_QUERY) : null;
  }

  private systemPrefersDark(): boolean {
    return this.mediaQuery()?.matches === true;
  }

  private readStored(): AppTheme | null {
    try {
      const value = this.document.defaultView?.localStorage.getItem(THEME_STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }

  private store(theme: AppTheme): void {
    try {
      this.document.defaultView?.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* private window / storage disabled — the choice still applies for this visit */
    }
  }
}
