import { APP_INITIALIZER, inject, makeEnvironmentProviders } from '@angular/core';
import { setDevRoleGetter } from '../api-runtime';
import { DevAuthBypassService } from './dev-auth-bypass.service';

/**
 * DEV-BYPASS: registers the `X-Dev-Role` header on the SDK fetch and enters the app as a seeded
 * account before the first route activates, so guarded pages are reachable without a login.
 * Does nothing when `environment.devAuth.bypass` is off — which is every production build.
 */
export function provideDevAuthBypass() {
  return makeEnvironmentProviders([
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => {
        const devAuth = inject(DevAuthBypassService);
        if (!devAuth.enabled) return () => Promise.resolve();

        setDevRoleGetter(() => devAuth.currentRoleHeader());
        // Awaited: guards read the session as soon as the first route activates.
        return () => devAuth.activate();
      },
    },
  ]);
}
