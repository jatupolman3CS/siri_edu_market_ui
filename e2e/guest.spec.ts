import { test, expect } from '@playwright/test';
import { watchPage, assertPageHealthy, reportIssues, apiGet } from './helpers';

/** Routes that need no dynamic id — visited as an anonymous guest. */
const STATIC_ROUTES = [
  '/',
  '/marketplace',
  '/categories',
  '/bundles',
  '/free',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/verify-email',
  '/auth/verify-email?token=invalid-garbage-token',
  '/auth/reset-password',
  '/auth/reset-password?token=invalid-garbage-token',
  '/this-page-does-not-exist-xyz',
];

for (const route of STATIC_ROUTES) {
  test(`guest: ${route} loads without errors`, async ({ page }) => {
    const issues = watchPage(page);
    await page.goto(route);
    await assertPageHealthy(page, issues, route);
    reportIssues(route, issues);
  });
}

test('guest: category detail page shows documents that belong to that category', async ({ page, request }) => {
  const categoriesRes = await request.get('http://localhost:5282/api/marketplace/categories');
  const categories = await categoriesRes.json();

  // Regression check for a known bug: the category list is served with every category
  // duplicated (same name, different slug/id), which breaks browsing by category.
  const names = categories.map((c: { name: string }) => c.name);
  const uniqueNames = new Set(names);
  expect
    .soft(uniqueNames.size, `expected ${uniqueNames.size} unique category names but got ${names.length} category rows (duplicates present) — see GET /api/marketplace/categories`)
    .toBe(names.length);

  const first = categories[0];
  const issues = watchPage(page);
  await page.goto(`/category/${first.slug}`);
  await assertPageHealthy(page, issues, `/category/${first.slug}`);
  reportIssues(`/category/${first.slug}`, issues);

  const searchRes = await apiGet(page, `/api/marketplace/search?CategoryId=${first.id}&PageSize=25`);
  const searchBody = await searchRes.json();
  const items: Array<{ categoryIds: string[] }> = searchBody.items ?? [];
  if (items.length > 0) {
    const mismatched = items.filter((doc) => !doc.categoryIds?.includes(first.id));
    expect
      .soft(mismatched.length, `category "${first.name}" (${first.id}) returned ${mismatched.length}/${items.length} documents that don't actually belong to it — category filtering is broken`)
      .toBe(0);
  }
});

test('guest: document detail page renders a real document', async ({ page, request }) => {
  const res = await request.get('http://localhost:5282/api/marketplace/search?PageSize=5');
  const body = await res.json();
  const doc = body.items.find((d: { price: number }) => d.price > 0) ?? body.items[0];

  const issues = watchPage(page);
  await page.goto(`/document/${doc.id}`);
  const bodyText = await assertPageHealthy(page, issues, `/document/${doc.id}`);

  // Regression check: discounted documents should show a percentage, not a blank "ประหยัด %".
  if (/ประหยัด\s*%/.test(bodyText)) {
    issues.push({ kind: 'content', detail: 'discount badge shows "ประหยัด %" with no percentage number' });
  }
  reportIssues(`/document/${doc.id}`, issues);
});

test('guest: bundle detail page lists the documents included in the bundle', async ({ page, request }) => {
  const listRes = await request.get('http://localhost:5282/api/marketplace/bundles?PageSize=5');
  const listBody = await listRes.json();
  const bundle = listBody.items.find((b: { documentCount: number }) => b.documentCount > 0) ?? listBody.items[0];

  // Confirms the backend actually has the data — isolates a page bug from a data bug.
  const detailRes = await request.get(`http://localhost:5282/api/marketplace/bundles/${bundle.id}`);
  const detailBody = await detailRes.json();
  expect(detailBody.documents?.length ?? 0, 'sanity check: backend bundle-detail endpoint should list documents').toBeGreaterThan(0);

  const issues = watchPage(page);
  await page.goto(`/bundle/${bundle.id}`);
  await assertPageHealthy(page, issues, `/bundle/${bundle.id}`);

  const bodyText = await page.locator('body').innerText();
  const hasZeroBadge = /0 เอกสารในแพ็กเกจ/.test(bodyText);
  if (hasZeroBadge && detailBody.documents.length > 0) {
    issues.push({
      kind: 'content',
      detail: `bundle detail page shows "0 เอกสารในแพ็กเกจ" even though the bundle actually has ${detailBody.documents.length} documents (GET /api/marketplace/bundles/${bundle.id} confirms this) — the page is not rendering the documents list it was given, or not calling the per-bundle detail endpoint`,
    });
  }
  reportIssues(`/bundle/${bundle.id}`, issues);
});

test('guest: storefront page renders a real seller', async ({ page, request }) => {
  const res = await request.get('http://localhost:5282/api/marketplace/bundles?PageSize=1');
  const body = await res.json();
  const sellerId = body.items[0]?.sellerId;
  test.skip(!sellerId, 'no seller id available from seed data to test with');

  const issues = watchPage(page);
  await page.goto(`/store/${sellerId}`);
  await assertPageHealthy(page, issues, `/store/${sellerId}`);
  reportIssues(`/store/${sellerId}`, issues);
});

test('guest: login rejects wrong credentials with a friendly message', async ({ page }) => {
  const issues = watchPage(page);
  await page.goto('/auth/login');
  await page.getByPlaceholder('you@example.com').fill('wrongxyz@nowhere.test');
  await page.locator('input[name="password"]').fill('wrongpassword123');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await page.waitForTimeout(1500);
  const bodyText = await page.locator('body').innerText();
  expect
    .soft(/exception|stack trace|Unhandled/i.test(bodyText), 'login error should never leak a raw exception/stack trace')
    .toBe(false);
  reportIssues('/auth/login (bad credentials)', issues);
});
