import { test as base, expect, type Page, type Browser, type TestInfo } from '@playwright/test';
import { accountFor, loginAndSaveState, missingCredentialsMessage, type E2eAccount, type E2eRole } from './auth-accounts';

/**
 * Responsive harness — docs/contracts/responsive-ui.md §1.4 G-6 and §4.9 (U1).
 *
 * For every viewport in §1 (landscape included) × every route of a role: navigate, wait for the
 * page to settle, and assert there is no horizontal overflow
 * (`document.documentElement.scrollWidth <= window.innerWidth`, tolerance 0), plus the extra
 * per-route checks listed in §4.9.
 *
 * Projects (playwright.config.ts): responsive-guest / -buyer / -seller / -admin, each filtered by
 * the @guest / @buyer / @seller / @admin tag in the describe titles below. Run one role with:
 *   npx playwright test --project=responsive-buyer
 * Needs ng serve on :4200 + backend on :5282 + devAuth.bypass=false (see playwright.config.ts).
 *
 * Sign-in (buyer / seller / admin): credentials from E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD
 * (e2e/auth-accounts.ts); a role without them is skipped, never run against a default account.
 * Every worker signs in on its own (its own storage file → its own refresh token, never shared
 * across parallel workers) and signs in again once its session is AUTH_MAX_AGE_MS old: the access
 * token lives 30 minutes, a full role run takes longer than that, and letting the app refresh
 * would rotate the refresh token that every later test's storage file still carries. Each
 * authenticated test also asserts it did not land on /auth/login, so a lost session fails loudly
 * instead of passing the layout checks on the login page.
 *
 * No DB side effects: every non-GET API call is intercepted (see guardMutations) — `POST
 * /api/orders`, which /checkout fires on load when the cart has items, gets a 503 mock; view /
 * ad-impression tracking and anything else get a 204. Only session upkeep and the admin
 * approval queue's read-only POST search pass through. Blocked calls are listed as
 * `blocked-mutation` annotations in the report.
 *
 * (v1.4) Viewports run down to 320×568 and 344×882 (Galaxy Z Fold cover screen). The @buyer
 * non-empty-cart suite (F3) answers `GET /api/cart` with a fixed three-item cart — a read, so the
 * account's real cart is never touched — and checks the phone header row still fits.
 */

/** Re-sign-in threshold — comfortably inside the API's 30-minute access-token lifetime. */
const AUTH_MAX_AGE_MS = 20 * 60_000;

/** Non-GET calls let through to the backend: session upkeep and reads that happen to be POSTs. */
const PASS_THROUGH_MUTATIONS: readonly RegExp[] = [
  /^\/api\/auth\/refresh(?:-token)?$/,
  /^\/api\/admin\/documents\/pending\/search$/,
];

/**
 * Keeps the harness read-only against the shared DB. /checkout calls `startPayment()` on load
 * (cart not empty, card payment selected), which used to create a real pending order on every
 * visit; /document/:id and the ad rails post view / impression counters.
 */
async function guardMutations(page: Page, testInfo?: TestInfo): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return route.fallback();

    const path = new URL(request.url()).pathname;
    if (PASS_THROUGH_MUTATIONS.some((re) => re.test(path))) return route.fallback();

    testInfo?.annotations.push({ type: 'blocked-mutation', description: `${method} ${path}` });
    if (method === 'POST' && path === '/api/orders') {
      // A failure the checkout page already handles (toast, button re-enabled, stays on /checkout).
      return route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 503, title: 'Blocked by the responsive harness — no order is created.' }),
      });
    }
    return route.fulfill({ status: 204 });
  });
}

interface RoleAuth {
  readonly role: E2eRole;
  readonly account: E2eAccount | null;
  /** This worker's storage file, signed in again first if the session is too old. */
  fresh(): Promise<string>;
}

const test = base.extend<{ mutationGuard: void }, { roleAuth: RoleAuth | null }>({
  roleAuth: [
    async ({ browser }, use, workerInfo) => {
      const role = /^responsive-(buyer|seller|admin)$/.exec(workerInfo.project.name)?.[1] as E2eRole | undefined;
      if (!role) {
        await use(null);
        return;
      }
      const account = accountFor(role);
      const file = `e2e/.auth/responsive-${role}.w${workerInfo.parallelIndex}.json`;
      const baseURL = workerInfo.project.use.baseURL ?? 'http://localhost:4200';
      let signedInAt = 0;
      await use({
        role,
        account,
        async fresh() {
          if (!account) throw new Error(missingCredentialsMessage(role));
          if (Date.now() - signedInAt > AUTH_MAX_AGE_MS) {
            await loginAndSaveState(browser, account, file, baseURL);
            signedInAt = Date.now();
          }
          return file;
        },
      });
    },
    { scope: 'worker' },
  ],
  storageState: async ({ roleAuth, storageState }, use, testInfo) => {
    if (!roleAuth) {
      await use(storageState);
      return;
    }
    testInfo.skip(!roleAuth.account, missingCredentialsMessage(roleAuth.role));
    await use(await roleAuth.fresh());
  },
  mutationGuard: [
    async ({ page }, use, testInfo) => {
      await guardMutations(page, testInfo);
      await use();
    },
    { auto: true },
  ],
});

interface Viewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

const VIEWPORTS: readonly Viewport[] = [
  { name: 'small-phone-320', width: 320, height: 568 },
  { name: 'fold-cover-344', width: 344, height: 882 },
  { name: 'android-360', width: 360, height: 800 },
  { name: 'iphone-se-375', width: 375, height: 667 },
  { name: 'iphone-15-393', width: 393, height: 852 },
  { name: 'iphone-pro-max-440', width: 440, height: 956 },
  { name: 'phone-landscape-667', width: 667, height: 375 },
  { name: 'phone-landscape-852', width: 852, height: 393 },
  { name: 'ipad-mini-744', width: 744, height: 1133 },
  { name: 'ipad-air-820', width: 820, height: 1180 },
  { name: 'ipad-pro-11-834', width: 834, height: 1194 },
  { name: 'ipad-pro-13-1024', width: 1024, height: 1366 },
  { name: 'ipad-landscape-1180', width: 1180, height: 820 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

/** Widths at which the phone bottom tab bar must be visible (§4.9 extra checks; v1.4 adds 320 and 344). */
const TAB_BAR_WIDTHS = new Set([320, 344, 360, 375, 393, 440, 667]);

/** Routes whose layout renders the bottom tab bar (and that have no sticky action bar). */
interface RouteCase {
  readonly path: string;
  /** Route renders inside buyer/seller/admin layout and shows the tab bar on phone. */
  readonly tabBar: boolean;
  /** At 375: every visible text input must compute to >=16px. */
  readonly inputFontCheck?: boolean;
}

const BOTTOM_TAB_BAR = 'app-bottom-tab-bar nav[aria-label]';
const STICKY_ACTION_BAR = 'app-sticky-action-bar [data-testid="sticky-action-bar"]';

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  // Let signals / zoneless change detection render what the last responses filled in.
  await page.waitForTimeout(400);
}

async function gotoAt(page: Page, path: string, viewport: Viewport): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(path);
  await settle(page);
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${label}: scrollWidth ${scrollWidth} > innerWidth ${innerWidth}`).toBeLessThanOrEqual(innerWidth);
}

async function expectTabBarVisibility(page: Page, viewport: Viewport, route: RouteCase, label: string): Promise<void> {
  if (!route.tabBar) return;
  const tabBar = page.locator(BOTTOM_TAB_BAR);
  if (TAB_BAR_WIDTHS.has(viewport.width)) {
    await expect(tabBar, `${label}: bottom tab bar should be visible`).toBeVisible();
  } else if (viewport.width >= 744) {
    await expect(tabBar, `${label}: bottom tab bar should be hidden at >=744`).toBeHidden();
  }
}

async function expectInputsAtLeast16px(page: Page, label: string): Promise<void> {
  const tooSmall = await page.evaluate(() => {
    const offenders: string[] = [];
    document.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=radio]), select, textarea').forEach((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      if (!visible) return;
      const size = parseFloat(style.fontSize);
      if (size < 16) {
        const type = el.getAttribute('type') ?? el.tagName.toLowerCase();
        offenders.push(`${el.tagName.toLowerCase()}[type=${type}]${el.id ? '#' + el.id : ''}=${size}px`);
      }
    });
    return offenders;
  });
  expect(tooSmall, `${label}: inputs below 16px (iOS zoom)`).toEqual([]);
}

/** A lost session lands on /auth/login, where every layout check below would pass vacuously. */
async function expectStillSignedIn(page: Page, label: string): Promise<void> {
  const { pathname } = new URL(page.url());
  expect(pathname, `${label}: redirected to ${pathname} — the session is gone (expired or revoked)`).not.toMatch(/^\/auth\/login/);
}

function defineRoleSuite(tag: string, routes: readonly RouteCase[]): void {
  const authenticated = tag !== '@guest';
  test.describe(`responsive ${tag}`, () => {
    for (const route of routes) {
      for (const viewport of VIEWPORTS) {
        const label = `${route.path} @ ${viewport.width}x${viewport.height}`;
        test(`${label} (${viewport.name})`, async ({ page }) => {
          await gotoAt(page, route.path, viewport);
          if (authenticated) await expectStillSignedIn(page, label);
          await expectNoHorizontalOverflow(page, label);
          await expectTabBarVisibility(page, viewport, route, label);
          if (route.inputFontCheck && viewport.width === 375) {
            await expectInputsAtLeast16px(page, label);
          }
        });
      }
    }
  });
}

// ---------------------------------------------------------------- @guest
defineRoleSuite('@guest', [
  { path: '/', tabBar: true },
  { path: '/marketplace', tabBar: true },
  { path: '/bundles', tabBar: true },
  { path: '/auth/login', tabBar: false, inputFontCheck: true },
  { path: '/auth/register', tabBar: false },
  { path: '/does-not-exist', tabBar: false },
]);

test.describe('responsive @guest extras', () => {
  test.describe('document detail', () => {
    let documentPath: string | null = null;

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      const page = await browser.newPage();
      try {
        // Not a test-scoped page, so the auto mutationGuard fixture does not cover it.
        await guardMutations(page);
        await page.goto('/marketplace');
        await settle(page);
        const href = await page.locator('a[href^="/document/"]').first().getAttribute('href', { timeout: 10_000 });
        documentPath = href ? href.split(/[?#]/)[0] : null;
      } finally {
        await page.close();
      }
    });

    for (const viewport of VIEWPORTS) {
      const label = `/document/:id @ ${viewport.width}x${viewport.height}`;
      test(`${label} (${viewport.name})`, async ({ page }) => {
        expect(documentPath, 'no document card found on /marketplace to resolve /document/:id').toBeTruthy();
        await gotoAt(page, documentPath!, viewport);
        await expectNoHorizontalOverflow(page, label);
        if (viewport.width < 744) {
          await expect(page.locator(STICKY_ACTION_BAR), `${label}: sticky action bar should be visible`).toBeVisible();
          await expect(page.locator(BOTTOM_TAB_BAR), `${label}: tab bar must yield to the action bar`).toBeHidden();
        }
      });
    }
  });

  test('/auth/login fits 375x667 without vertical scroll', async ({ page }) => {
    await gotoAt(page, '/auth/login', { name: 'iphone-se-375', width: 375, height: 667 });
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(scrollHeight, `scrollHeight ${scrollHeight} > innerHeight ${innerHeight}`).toBeLessThanOrEqual(innerHeight);
  });

  test('/auth/login primary button uses the AA primary colour', async ({ page }) => {
    await gotoAt(page, '/auth/login', { name: 'iphone-se-375', width: 375, height: 667 });
    const button = page.locator('.btn-pink, .ant-btn-primary').first();
    await expect(button).toBeVisible();
    const background = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).toBe('rgb(184, 56, 100)');
  });
});

test.describe('responsive @guest language switcher (touch)', () => {
  // §2 / §4.4: on phones the ☰ drawer switcher is the only language control — trigger and both
  // options must meet the 44px touch minimum on a coarse pointer (responsive fix F8).
  test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });

  test('☰ drawer language switcher and its options are >=44px tall on touch', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await page.locator('[data-testid="header-menu-toggle"]').click();
    const trigger = page.locator('#mobile-nav-panel app-language-switcher > button');
    await expect(trigger).toBeVisible();
    // offsetHeight: layout size, unaffected by the menu's scale-in open animation.
    const triggerHeight = await trigger.evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(triggerHeight, 'language switcher trigger height').toBeGreaterThanOrEqual(44);

    await trigger.click();
    const options = page.locator('.ant-dropdown:not(.ant-dropdown-hidden) li.ant-dropdown-menu-item');
    await expect(options).toHaveCount(2);
    const heights = await options.evaluateAll((els) => els.map((el) => (el as HTMLElement).offsetHeight));
    for (const height of heights) {
      expect(height, 'language option height').toBeGreaterThanOrEqual(44);
    }
  });
});

// ---------------------------------------------------------------- @buyer
defineRoleSuite('@buyer', [
  { path: '/library', tabBar: true },
  { path: '/orders', tabBar: true },
  // Checkout carries a sticky action bar on phone → no tab bar there.
  { path: '/checkout', tabBar: false, inputFontCheck: true },
  { path: '/account', tabBar: true },
  { path: '/wallet', tabBar: true },
  { path: '/notifications', tabBar: true },
]);

/**
 * (v1.4, F3) Signed-in buyer with items in the cart: the phone header row 1 (☰, logo, bell, cart
 * with its count badge) must still fit, down to 320. The cart comes from a mocked `GET /api/cart`
 * (read-only; the mutation guard still covers everything else), so the check does not depend on
 * what the test account happens to have in its cart.
 */
const NON_EMPTY_CART = {
  items: [1, 2, 3].map((n) => ({
    documentId: `00000000-0000-4000-8000-00000000000${n}`,
    title: `Responsive harness cart item ${n}`,
    sellerName: 'Responsive harness',
    price: 99 * n,
    coverUrl: null,
  })),
  subtotal: 594,
  serviceFee: 0,
  vatIncluded: 0,
  total: 594,
};

test.describe('responsive @buyer with a non-empty cart (F3)', () => {
  test.beforeEach(async ({ page }) => {
    // Registered after the auto mutationGuard, so it runs first for GET /api/cart; any other
    // method falls back to the guard.
    await page.route(/\/api\/cart(?:\?.*)?$/, (route) =>
      route.request().method() === 'GET' ? route.fulfill({ json: NON_EMPTY_CART }) : route.fallback(),
    );
  });

  const paths = ['/', '/marketplace', '/library', '/orders', '/account', '/wallet', '/notifications'];
  for (const viewport of VIEWPORTS.filter((v) => v.width < 744)) {
    for (const path of paths) {
      const label = `${path} (cart ${NON_EMPTY_CART.items.length}) @ ${viewport.width}x${viewport.height}`;
      test(`${label} (${viewport.name})`, async ({ page }) => {
        await gotoAt(page, path, viewport);
        await expectStillSignedIn(page, label);
        await expect(page.locator('[data-testid="header-cart"]'), `${label}: cart badge`).toContainText(
          String(NON_EMPTY_CART.items.length),
        );
        await expectNoHorizontalOverflow(page, label);
      });
    }
  }
});

// ---------------------------------------------------------------- @seller
defineRoleSuite('@seller', [
  { path: '/seller', tabBar: true },
  { path: '/seller/documents', tabBar: true },
  // Upload carries a sticky action bar on phone → no tab bar there.
  { path: '/seller/upload', tabBar: false, inputFontCheck: true },
  { path: '/seller/earnings', tabBar: true },
  { path: '/seller/watermark', tabBar: true },
]);

// ---------------------------------------------------------------- @admin
defineRoleSuite('@admin', [
  { path: '/admin', tabBar: true },
  { path: '/admin/users', tabBar: true },
  { path: '/admin/transactions', tabBar: true },
  { path: '/admin/documents', tabBar: true },
  { path: '/admin/approval', tabBar: true },
  { path: '/admin/settings', tabBar: true },
  { path: '/admin/crm', tabBar: true },
]);
