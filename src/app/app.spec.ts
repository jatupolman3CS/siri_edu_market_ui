import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { App } from './app';
import {
  AuthService,
  NotificationContextService,
  NotificationFeedService,
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
          useValue: { fetchRecentForToast: () => Promise.resolve([]), markRead: () => ({ subscribe: () => {} }) },
        },
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
});
