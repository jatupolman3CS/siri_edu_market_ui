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
