import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { App } from './app';
import { revealFocusedChip } from './core/layout/chip-row-focus';
import {
  AuthService,
  NotificationContextService,
  NotificationFeedService,
  NotificationStreamService,
} from './core/services';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        // seller-analytics-insights v1 §4: App injects NavigationSourceService (root-provided,
        // depends on Router) at startup — needs a Router in the injector even with no real routes.
        provideRouter([]),
        // Feature request "popup แจ้งเตือนมุมขวา": App also force-instantiates
        // `NotificationToastService` at startup (same trick as NavigationSourceService above).
        // Its own dependency chain (`AuthService`, `NotificationFeedService`,
        // `NotificationContextService`, `NzNotificationService`) is stubbed here so this spec
        // only exercises `App` itself, not the real auth/feed services (which pull in
        // HttpClient/localStorage/OAuth wiring `App`'s own tests never cared about before).
        { provide: AuthService, useValue: { isAuthenticated: () => false, user: () => null } },
        { provide: NotificationContextService, useValue: { context: signal('buyer') } },
        {
          provide: NotificationFeedService,
          useValue: {
            fetchRecentForToast: () => Promise.resolve([]),
            markRead: () => ({ subscribe: () => {} }),
            addPollListener: () => () => {},
          },
        },
        // kafka-redis-notifications v1 §4: App also force-instantiates the SSE stream service;
        // stubbed so this spec never opens a stream or starts the poll timer.
        { provide: NotificationStreamService, useValue: { connected: signal(false) } },
        { provide: NzNotificationService, useValue: { create: () => ({ onClick: { subscribe: () => {} } }), info: () => ({ onClick: { subscribe: () => {} } }) } },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  describe('number-input wheel guard (responsive-ui v1.4 R-22, F154)', () => {
    let host: HTMLDivElement;

    function addInput(type: string): HTMLInputElement {
      const input = document.createElement('input');
      input.type = type;
      host.appendChild(input);
      return input;
    }

    function wheelOver(el: Element): void {
      el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }));
    }

    beforeEach(() => {
      host = document.createElement('div');
      document.body.appendChild(host);
    });

    afterEach(() => host.remove());

    it('blurs a focused number input when the wheel turns over it, so the page scrolls instead of the value stepping', () => {
      TestBed.createComponent(App);
      const input = addInput('number');
      input.value = '500';
      input.focus();
      expect(document.activeElement).toBe(input);

      wheelOver(input);

      expect(document.activeElement).not.toBe(input);
      expect(input.value).toBe('500');
    });

    it('leaves focus alone for other inputs and for a wheel that is not over the focused number input', () => {
      TestBed.createComponent(App);
      const text = addInput('text');
      text.focus();
      wheelOver(text);
      expect(document.activeElement).toBe(text);

      const focusedNumber = addInput('number');
      const otherNumber = addInput('number');
      focusedNumber.focus();
      wheelOver(otherNumber);
      wheelOver(host);
      expect(document.activeElement).toBe(focusedNumber);
    });

    it('registers one passive capture listener and removes it when the app is destroyed', () => {
      const add = vi.spyOn(document, 'addEventListener');
      const remove = vi.spyOn(document, 'removeEventListener');
      const fixture = TestBed.createComponent(App);

      const wheelAdds = add.mock.calls.filter(([type]) => type === 'wheel');
      expect(wheelAdds).toHaveLength(1);
      expect(wheelAdds[0][2]).toEqual({ capture: true, passive: true });

      fixture.destroy();
      expect(remove.mock.calls.some(([type, listener]) => type === 'wheel' && listener === wheelAdds[0][1])).toBe(true);

      const input = addInput('number');
      input.focus();
      wheelOver(input);
      expect(document.activeElement).toBe(input);

      add.mockRestore();
      remove.mockRestore();
    });
  });

  describe('chip-row keyboard focus (responsive-ui v1.4 R-12, G-22a)', () => {
    it('registers revealFocusedChip once on document focusin and removes it when the app is destroyed', () => {
      const add = vi.spyOn(document, 'addEventListener');
      const remove = vi.spyOn(document, 'removeEventListener');
      const fixture = TestBed.createComponent(App);

      const adds = add.mock.calls.filter(([type, listener]) => type === 'focusin' && listener === revealFocusedChip);
      expect(adds).toHaveLength(1);

      fixture.destroy();
      expect(remove.mock.calls.some(([type, listener]) => type === 'focusin' && listener === revealFocusedChip)).toBe(true);

      add.mockRestore();
      remove.mockRestore();
    });

    it('scrolls a keyboard-focused chip into its row', () => {
      const fixture = TestBed.createComponent(App);
      const row = document.createElement('div');
      row.className = 'chip-row';
      const chip = document.createElement('button');
      row.appendChild(chip);
      document.body.appendChild(row);
      const scroll = vi.fn();
      Object.defineProperty(chip, 'scrollIntoView', { value: scroll, configurable: true });
      vi.spyOn(chip, 'matches').mockImplementation((selector: string) => selector === ':focus-visible');

      chip.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
      row.remove();
      fixture.destroy();
    });
  });
});
