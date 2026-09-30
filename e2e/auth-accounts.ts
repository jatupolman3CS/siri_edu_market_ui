import { expect, type Browser } from '@playwright/test';

/**
 * E2E sign-in accounts — read from the environment, never hardcoded (and never committed).
 *
 *   E2E_BUYER_EMAIL   / E2E_BUYER_PASSWORD    buyer account
 *   E2E_SELLER_EMAIL  / E2E_SELLER_PASSWORD   seller account
 *   E2E_ADMIN_EMAIL   / E2E_ADMIN_PASSWORD    admin account
 *
 *   E2E_SELLER_APPLICATION_NAMES              optional, comma-separated store/display name(s) of
 *                                             the E2E seller's approved application (admin.spec.ts)
 *
 * Each account must already exist and be email-verified in the DB the backend on :5282 points at.
 * A role whose pair is unset is skipped with a message naming the missing variables — it does not
 * fail, and it does not fall back to some default account.
 *
 * PowerShell:  $env:E2E_BUYER_EMAIL = '…'; $env:E2E_BUYER_PASSWORD = '…'
 * bash:        export E2E_BUYER_EMAIL=… E2E_BUYER_PASSWORD=…
 */
export type E2eRole = 'buyer' | 'seller' | 'admin';

export interface E2eAccount {
  readonly role: E2eRole;
  readonly email: string;
  readonly password: string;
}

function envNames(role: E2eRole): { email: string; password: string } {
  const prefix = `E2E_${role.toUpperCase()}`;
  return { email: `${prefix}_EMAIL`, password: `${prefix}_PASSWORD` };
}

/** `process.env` without depending on @types/node (not installed in this repo). */
function env(name: string): string | undefined {
  return (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[name];
}

/** The account for `role`, or `null` when either of its env vars is unset/blank. */
export function accountFor(role: E2eRole): E2eAccount | null {
  const names = envNames(role);
  const email = env(names.email)?.trim();
  const password = env(names.password);
  if (!email || !password) return null;
  return { role, email, password };
}

export function missingCredentialsMessage(role: E2eRole): string {
  const names = envNames(role);
  return `${role} credentials not set — export ${names.email} and ${names.password} (see e2e/auth-accounts.ts) to run the ${role} tests`;
}

/**
 * Signs in through the real login form in a throwaway context and writes that context's storage
 * (the access + refresh tokens live in localStorage) to `file`. Needs `devAuth.bypass: false` in
 * `environment.development.ts` — with the bypass on, `guestGuard` bounces /auth/login away.
 */
export async function loginAndSaveState(browser: Browser, account: E2eAccount, file: string, baseURL: string): Promise<void> {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/auth/login');
    await page.getByPlaceholder('you@example.com').fill(account.email);
    await page.locator('input[name="password"]').fill(account.password);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    // A successful login redirects away from /auth/login (to '/', or a returnUrl).
    await expect(page, `sign-in as ${account.role} (${account.email}) did not leave /auth/login`).not.toHaveURL(/\/auth\/login/, {
      timeout: 15_000,
    });
    await context.storageState({ path: file });
  } finally {
    await context.close();
  }
}
