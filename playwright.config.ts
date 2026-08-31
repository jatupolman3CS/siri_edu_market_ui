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
 * 2. Three real accounts must exist and be email-verified in the target DB:
 *    qa.buyer@siriedumarket.local (Buyer), qa.seller@siriedumarket.local (Seller),
 *    admin@siriedumarket.local (Admin) — all password P@ssw0rd!.
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
  ],
});
