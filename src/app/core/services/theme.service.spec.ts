import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

/** The runner's Node exposes a `localStorage` that is `undefined` without a backing file — bring an in-memory one. */
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

interface FakeMediaQuery {
  matches: boolean;
  fire(matches: boolean): void;
}

/** jsdom has no `matchMedia`; install one whose `(prefers-color-scheme: dark)` answer the test controls. */
function stubSystemTheme(prefersDark: boolean): FakeMediaQuery {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const query: FakeMediaQuery & Record<string, unknown> = {
    matches: prefersDark,
    addEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => listeners.delete(fn),
    fire(matches: boolean) {
      query.matches = matches;
      listeners.forEach((fn) => fn({ matches }));
    },
  };
  Object.defineProperty(window, 'matchMedia', { value: () => query, configurable: true, writable: true });
  return query;
}

describe('ThemeService', () => {
  let storage: Storage;
  let meta: HTMLMetaElement;
  // The Angular unit-test runner shares one global between spec files (isolate: false), so whatever this file
  // installs on `window.localStorage` must be put back — the stub below has no removeItem/clear and would break
  // every later spec in the same worker that cleans up with `localStorage?.removeItem(...)`.
  let originalStorage: PropertyDescriptor | undefined;

  const create = (): ThemeService => TestBed.inject(ThemeService);
  const htmlTheme = (): string | null => document.documentElement.getAttribute('data-theme');

  beforeEach(() => {
    originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
    storage = memoryStorage();
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    document.documentElement.removeAttribute('data-theme');
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#db2777');
    document.head.appendChild(meta);
  });

  afterEach(() => {
    meta.remove();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    Reflect.deleteProperty(window, 'matchMedia');
    if (originalStorage) Object.defineProperty(window, 'localStorage', originalStorage);
    else Reflect.deleteProperty(window, 'localStorage');
  });

  it('follows the OS when nothing is saved: dark', () => {
    stubSystemTheme(true);

    const service = create();

    expect(service.theme()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(htmlTheme()).toBe('dark');
    expect(meta.getAttribute('content')).toBe('#160b12');
  });

  it('follows the OS when nothing is saved: light', () => {
    stubSystemTheme(false);

    const service = create();

    expect(service.theme()).toBe('light');
    expect(htmlTheme()).toBe('light');
    expect(meta.getAttribute('content')).toBe('#db2777');
  });

  it('is light when matchMedia does not exist at all', () => {
    expect(create().theme()).toBe('light');
  });

  it('a saved choice beats the OS preference', () => {
    stubSystemTheme(true);
    storage.setItem(THEME_STORAGE_KEY, 'light');

    const service = create();

    expect(service.theme()).toBe('light');
    expect(htmlTheme()).toBe('light');
  });

  it('ignores a corrupt saved value', () => {
    stubSystemTheme(false);
    storage.setItem(THEME_STORAGE_KEY, 'purple');

    expect(create().theme()).toBe('light');
  });

  it('toggle flips the theme, updates <html>, the browser colour and saves the choice', () => {
    stubSystemTheme(false);
    const service = create();

    service.toggle();
    TestBed.tick();

    expect(service.theme()).toBe('dark');
    expect(htmlTheme()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(meta.getAttribute('content')).toBe('#160b12');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    service.toggle();
    TestBed.tick();

    expect(service.theme()).toBe('light');
    expect(htmlTheme()).toBe('light');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('keeps following the OS while the reader has not chosen, and stops once they have', () => {
    const system = stubSystemTheme(false);
    const service = create();

    system.fire(true);
    expect(service.theme()).toBe('dark');

    service.set('light');
    system.fire(true);
    expect(service.theme()).toBe('light');
  });

  it('still switches when localStorage throws (private window)', () => {
    stubSystemTheme(false);
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    Object.defineProperty(window, 'localStorage', { value: broken, configurable: true });

    const service = create();
    expect(service.theme()).toBe('light');

    service.toggle();
    expect(service.theme()).toBe('dark');
  });
});
