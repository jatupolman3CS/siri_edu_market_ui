import { APP_INITIALIZER, inject, makeEnvironmentProviders } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { setAuthTokenGetter, setTokenRefresher, setUnauthorizedHandler } from '../api-runtime';

/**
 * Wires `AuthService.accessToken` into the Hey API custom fetch so every
 * SDK call sends `Authorization: Bearer <token>` when a JWT is present.
 * Also registers a 401 handler so SDK calls redirect to /auth/login immediately,
 * and a token refresher (BUG-04) so a 401 from an expired access token is
 * recovered via `AuthService.refreshSession()` and the request replayed instead
 * of ending the session outright.
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
        setTokenRefresher(() => auth.refreshSession());
        return () => Promise.resolve();
      },
    },
  ]);
}
