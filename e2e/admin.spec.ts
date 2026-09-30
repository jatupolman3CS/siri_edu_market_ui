import { test } from '@playwright/test';
import { watchPage, assertPageHealthy, reportIssues, fetchBearerToken, API_BASE } from './helpers';

const STATIC_ROUTES = [
  '/admin',
  '/admin/documents',
  '/admin/approval',
  '/admin/transactions',
  '/admin/sellers',
  '/admin/audit',
  '/admin/reports',
  '/admin/payouts',
  '/admin/seller-applications',
  '/admin/categories',
  '/admin/settings',
];

for (const route of STATIC_ROUTES) {
  test(`admin: ${route} loads without errors`, async ({ page }) => {
    const issues = watchPage(page);
    await page.goto(route);
    await assertPageHealthy(page, issues, route);
    reportIssues(route, issues);
  });
}

test('admin: document detail page renders a real document', async ({ page, request }) => {
  const token = await fetchBearerToken(request, 'admin');
  const res = await request.get(`${API_BASE}/api/admin/documents?PageSize=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  const docId = body.items?.[0]?.id;
  test.skip(!docId, 'no documents returned by GET /api/admin/documents to test with');

  const issues = watchPage(page);
  await page.goto(`/admin/documents/${docId}`);
  await assertPageHealthy(page, issues, `/admin/documents/${docId}`);
  reportIssues(`/admin/documents/${docId}`, issues);
});

/**
 * Names (store name and/or display name) under which the E2E seller's approved application appears,
 * comma-separated — e.g. `E2E_SELLER_APPLICATION_NAMES='My Test Studio,My Test Seller'`. Read from
 * the environment like the sign-in accounts (e2e/auth-accounts.ts); never hardcode real accounts.
 */
function expectedApplicationNames(): string[] {
  const raw = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env['E2E_SELLER_APPLICATION_NAMES'];
  return (raw ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

test('admin: seller-applications page shows the E2E seller application', async ({ page }) => {
  const names = expectedApplicationNames();
  test.skip(names.length === 0, 'E2E_SELLER_APPLICATION_NAMES not set — export the E2E seller application name(s) to run this check');

  const issues = watchPage(page);
  await page.goto('/admin/seller-applications');
  const bodyText = await assertPageHealthy(page, issues, '/admin/seller-applications');
  // The E2E seller applied and was approved beforehand — the page should reflect it somewhere
  // (default view may filter to "pending" only, which is fine, just documenting).
  if (!names.some((name) => bodyText.includes(name))) {
    issues.push({
      kind: 'content',
      detail: `a known approved application (${names.map((n) => `"${n}"`).join(' / ')}) is not visible anywhere on this page — may just be filtered to pending-only by default, verify manually`,
    });
  }
  reportIssues('/admin/seller-applications', issues);
});
