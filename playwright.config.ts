import { defineConfig, devices } from '@playwright/test';

/**
 * QA sweep config. Points at the already-running local dev servers (ng serve on :4200,
 * dotnet run on :5282) — this does NOT start them; start both before running tests.
 *
 * Prerequisites:
 * 1. `src/environments/environment.development.ts` → `devAuth.bypass` must be `false`.
 *    It defaults to `true` (auto-login as a seeded account), which makes `guestGuard`
 *    redirect every /auth/* page away — the auth.setup.ts login flow needs the real
 *    login form. Flip it back to `true` when done testing.
 * 2. Sign-in accounts come from the environment, never from this repo:
 *    E2E_BUYER_EMAIL/E2E_BUYER_PASSWORD, E2E_SELLER_EMAIL/E2E_SELLER_PASSWORD,
 *    E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD (see e2e/auth-accounts.ts). Each must be a real,
 *    email-verified account in the target DB. A role whose pair is unset is skipped.
 * 3. The responsive-* projects sign in per worker inside e2e/responsive.spec.ts (fresh session,
 *    renewed before the 30-min access token expires) and block every mutating API call, so
 *    they have no `setup` dependency and write nothing to the shared DB.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'guest',
      testMatch: /guest\.spec\.ts/,
    },
    {
      name: 'buyer',
      testMatch: /buyer\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/buyer.json' },
    },
    {
      name: 'seller',
      testMatch: /seller\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/seller.json' },
    },
    {
      name: 'admin',
      testMatch: /admin\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/admin.json' },
    },
    // Responsive harness (docs/contracts/responsive-ui.md §4.9): one project per role, each
    // filtered by its tag in e2e/responsive.spec.ts. Viewports are set per test. The role is read
    // from the project name (responsive-<role>) by the spec's per-worker sign-in fixture — no
    // shared `setup` storageState, whose refresh token would go stale mid-run.
    {
      name: 'responsive-guest',
      testMatch: /responsive\.spec\.ts/,
      grep: /@guest/,
    },
    {
      name: 'responsive-buyer',
      testMatch: /responsive\.spec\.ts/,
      grep: /@buyer/,
    },
    {
      name: 'responsive-seller',
      testMatch: /responsive\.spec\.ts/,
      grep: /@seller/,
    },
    {
      name: 'responsive-admin',
      testMatch: /responsive\.spec\.ts/,
      grep: /@admin/,
    },
  ],
});
