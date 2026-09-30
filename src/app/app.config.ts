import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  importProvidersFrom,
  inject,
  LOCALE_ID,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling, TitleStrategy } from '@angular/router';
import { I18nTitleStrategy } from './core/i18n';
import { ModalA11yService, ScrollRestorationService } from './core/layout';
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

/**
 * nz-select dropdowns are a fixed-size virtual scroll: the option height the CSS renders must match
 * `nzOptionHeightPx`. styles.scss makes options 44px under `(pointer: coarse)` (touch target), so
 * the config follows the same media query (read once at bootstrap).
 */
const SELECT_OPTION_HEIGHT_PX =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    ? 44
    : 32;



export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      // Position restoration is done by ScrollRestorationService (below): 'top' also sent back /
      // forward navigations to the top, and 'enabled' restores before async lists have loaded.
      withInMemoryScrolling({
        scrollPositionRestoration: 'disabled',
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
      select: {
        nzOptionHeightPx: SELECT_OPTION_HEIGHT_PX,
      },
    }),
    { provide: LOCALE_ID, useValue: 'th-TH' },
    { provide: TitleStrategy, useClass: I18nTitleStrategy },
    importProvidersFrom(FormsModule, NzIconModule, NzModalModule),
    // App-wide layout behaviour with no component of its own: back/forward scroll restoration and
    // dialog semantics (aria-modal + accessible name) for every nz-modal.
    provideAppInitializer(() => {
      inject(ScrollRestorationService);
      inject(ModalA11yService);
    }),
  ],
};

