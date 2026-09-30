import { test as setup } from '@playwright/test';
import { accountFor, loginAndSaveState, missingCredentialsMessage, type E2eRole } from './auth-accounts';

/**
 * Sign-in setup for the buyer / seller / admin sweep projects (playwright.config.ts).
 * Credentials come from E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD — see e2e/auth-accounts.ts.
 * A role without credentials is skipped (with the variable names in the skip reason).
 *
 * The responsive-* projects do NOT use this file: e2e/responsive.spec.ts signs in per worker and
 * re-signs in before the 30-minute access token runs out, so a long run never replays one stale
 * refresh token.
 */
const ACCOUNTS: readonly { role: E2eRole; file: string }[] = [
  { role: 'buyer', file: 'e2e/.auth/buyer.json' },
  { role: 'seller', file: 'e2e/.auth/seller.json' },
  { role: 'admin', file: 'e2e/.auth/admin.json' },
];

for (const { role, file } of ACCOUNTS) {
  setup(`authenticate as ${role}`, async ({ browser, baseURL }) => {
    const account = accountFor(role);
    setup.skip(!account, missingCredentialsMessage(role));
    await loginAndSaveState(browser, account!, file, baseURL ?? 'http://localhost:4200');
  });
}
