import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';

/**
 * QA bug #7: the `**` (not-found) route had no `title`, so Angular's TitleStrategy left
 * `document.title` stuck on whatever the previous route set (e.g. visiting `/cart`, which isn't
 * a real route — cart is a drawer, not a page) instead of reflecting the 404 state.
 */
describe('app.routes — 404 route title (bug #7)', () => {
  it('sets a title on the wildcard route so it never inherits the previous page\'s title', () => {
    const wildcard = routes.find((r) => r.path === '**');

    expect(wildcard).toBeTruthy();
    expect(wildcard?.title).toBe('routes.notFound');
  });
});

/**
 * docs/contracts/anonymous-cart-wishlist-scoping.md AC-16: `/wishlist` must be guest-accessible
 * (backend now scopes anonymous visitors via a cookie-backed session) — the route must not carry
 * `authGuard` so anonymous visitors are not redirected to `/auth/login`.
 */
describe('app.routes — /wishlist is guest-accessible (anonymous-cart-wishlist-scoping AC-16)', () => {
  it('does not gate the wishlist route behind authGuard', () => {
    const buyerRoot = routes.find((r) => r.children?.some((c) => c.path === 'wishlist'));
    const wishlist = buyerRoot?.children?.find((c) => c.path === 'wishlist');

    expect(wishlist).toBeTruthy();
    expect(wishlist?.canActivate).toBeUndefined();
  });
});

describe('app.routes — /seller/dashboard compatibility alias', () => {
  it('redirects the linked seller dashboard URL to the canonical seller dashboard route', () => {
    const sellerRoot = routes.find((r) => r.path === 'seller');
    const dashboardAlias = sellerRoot?.children?.find((c) => c.path === 'dashboard');

    expect(dashboardAlias).toBeTruthy();
    expect(dashboardAlias?.redirectTo).toBe('/seller');
    expect(dashboardAlias?.pathMatch).toBe('full');
  });
});

/**
 * Seller / admin pages without a `title` fell back to the generic 'SIRIEDUMARKET', so a route change
 * inside Siri Studio or the admin panel was never announced. Every page route (not redirects) under
 * /seller and /admin carries a `routes.*` key that exists in both dictionaries.
 */
describe('app.routes — every seller/admin page has a translated title', () => {
  it.each(['seller', 'admin'])('/%s children', async (root) => {
    const { th } = await import('./core/i18n/translations/th');
    const { en } = await import('./core/i18n/translations/en');
    const titles: Record<string, string> = th.routes;
    const titlesEn: Record<string, string> = en.routes;
    const children = routes.find((r) => r.path === root)?.children ?? [];
    const pages = children.filter((c) => !c.redirectTo);

    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(typeof page.title, `/${root}/${page.path}`).toBe('string');
      const key = String(page.title).replace(/^routes\./, '');
      expect(titles[key], `th routes.${key}`).toBeTruthy();
      expect(titlesEn[key], `en routes.${key}`).toBeTruthy();
    }
  });
});

/**
 * responsive-ui G-30d: `/bundle/:id` and `/store/:id` had no `title`, so their tab title was the
 * bare 'SIRIEDUMARKET' — for a bundle always, and for a store whenever its profile failed to load
 * (the store name only arrives through SeoMetaService after a successful load).
 */
describe('app.routes — buyer detail routes have a translated fallback title', () => {
  it.each([
    ['bundle/:id', 'routes.bundleDetail'],
    ['store/:id', 'routes.store'],
  ])('%s → %s', async (path, key) => {
    const { th } = await import('./core/i18n/translations/th');
    const { en } = await import('./core/i18n/translations/en');
    const buyerRoot = routes.find((r) => r.path === '' && r.children?.some((c) => c.path === path));
    const route = buyerRoot?.children?.find((c) => c.path === path);

    expect(route?.title).toBe(key);
    const leaf = key.replace(/^routes\./, '');
    const titles: Record<string, string> = th.routes;
    const titlesEn: Record<string, string> = en.routes;
    expect(titles[leaf]).toBeTruthy();
    expect(titlesEn[leaf]).toBeTruthy();
    expect(titles[leaf]).not.toBe('SIRIEDUMARKET');
    expect(titlesEn[leaf]).not.toBe('SIRIEDUMARKET');
  });
});
