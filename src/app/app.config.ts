import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  importProvidersFrom,
  LOCALE_ID,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { unauthorizedInterceptor } from './core/interceptors/unauthorized.interceptor';
import { provideSdkAuthBridge } from './core/api/sdk-auth-bridge';
import { provideDevAuthBypass } from './core/dev/dev-auth-bypass.provider';
import { registerLocaleData } from '@angular/common';
import en from '@angular/common/locales/en';
import th from '@angular/common/locales/th';
import { th_TH, provideNzI18n } from 'ng-zorro-antd/i18n';
import { provideNzConfig } from 'ng-zorro-antd/core/config';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { FormsModule } from '@angular/forms';

import { routes } from './app.routes';

registerLocaleData(en);
registerLocaleData(th);



export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled',
      }),
    ),
    provideAnimations(),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor, loadingInterceptor, unauthorizedInterceptor]),
    ),
    provideSdkAuthBridge(),
    // DEV-BYPASS: enters the app as a seeded account while sign-in is unfinished. Inert in production.
    provideDevAuthBypass(),
    provideNzI18n(th_TH),
    provideNzConfig({
      message: {
        nzTop: 24,
        nzDuration: 3200,
        nzMaxStack: 4,
        nzPauseOnHover: true,
      },
      notification: {
        nzTop: 24,
        nzDuration: 4000,
        nzPlacement: 'topRight',
        nzPauseOnHover: true,
      },
      modal: {
        nzMaskClosable: true,
      },
    }),
    { provide: LOCALE_ID, useValue: 'th-TH' },
    importProvidersFrom(FormsModule, NzIconModule, NzModalModule),
  ],
};

