import { test } from '@playwright/test';
import { watchPage, assertPageHealthy, reportIssues } from './helpers';

const STATIC_ROUTES = [
  '/seller',
  '/seller/documents',
  '/seller/upload',
  '/seller/pdf-preview',
  '/seller/qna',
  '/seller/store-sections',
  '/seller/bundles',
  '/seller/earnings',
  '/seller/reviews',
  '/seller/settings',
];

for (const route of STATIC_ROUTES) {
  test(`seller: ${route} loads without errors`, async ({ page }) => {
    const issues = watchPage(page);
    await page.goto(route);
    await assertPageHealthy(page, issues, route);
    reportIssues(route, issues);
  });
}
