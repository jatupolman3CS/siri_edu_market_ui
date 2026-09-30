import { test } from '@playwright/test';
import { watchPage, assertPageHealthy, reportIssues, fetchBearerToken, API_BASE } from './helpers';

const STATIC_ROUTES = ['/wishlist', '/become-seller', '/library', '/account', '/checkout', '/orders'];

for (const route of STATIC_ROUTES) {
  test(`buyer: ${route} loads without errors`, async ({ page }) => {
    const issues = watchPage(page);
    await page.goto(route);
    await assertPageHealthy(page, issues, route);
    reportIssues(route, issues);
  });
}

test('buyer: order detail page renders a real order, if one exists', async ({ page, request }) => {
  const token = await fetchBearerToken(request, 'buyer');
  const res = await request.get(`${API_BASE}/api/orders?PageSize=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({ items: [] }));
  const orderId = body.items?.[0]?.id;
  test.skip(!orderId, 'the E2E buyer has no orders yet (no free/completed checkout was scripted) — coverage gap, not a confirmed bug');

  const issues = watchPage(page);
  await page.goto(`/orders/${orderId}`);
  await assertPageHealthy(page, issues, `/orders/${orderId}`);
  reportIssues(`/orders/${orderId}`, issues);
});
