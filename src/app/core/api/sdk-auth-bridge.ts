import { APP_INITIALIZER, inject, makeEnvironmentProviders } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { setAuthTokenGetter, setUnauthorizedHandler } from '../api-runtime';

/**
 * Wires `AuthService.accessToken` into the Hey API custom fetch so every
 * SDK call sends `Authorization: Bearer <token>` when a JWT is present.
 * Also registers a 401 handler so SDK calls redirect to /auth/login immediately.
 */
export function provideSdkAuthBridge() {
  return makeEnvironmentProviders([
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => {
        const auth = inject(AuthService);
        const router = inject(Router);
        setAuthTokenGetter(() => auth.accessToken() ?? null);
        setUnauthorizedHandler(() => {
          auth.redirectToLoginAfterUnauthorized(router.url);
        });
        return () => Promise.resolve();
      },
    },
  ]);
}
