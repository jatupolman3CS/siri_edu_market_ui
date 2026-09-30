import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AppHeaderComponent, isBrowseRoute } from './app-header.component';
import {
  AuthService,
  CartService,
  CatalogService,
  MeService,
  NotificationFeedService,
  WishlistService,
} from '../../../core/services';

/**
 * Mobile-nav-inaccessible fix (QA bug #1): a Playwright sweep across 375-768px found the main
 * nav (`ตลาด`/`หมวดหมู่`/`แพ็กเกจ`/`ฟรี`/`Siri Studio`) and the "เข้าสู่ระบบ" link both `hidden`
 * below `md` with no hamburger/menu-toggle in their place. These specs drive the toggle button
 * + panel that now covers that breakpoint range, guarding against the same links silently
 * disappearing again.
 */
function fakeAuth(overrides: { user?: () => ReturnType<AuthService['user']> } = {}) {
  return {
    user: overrides.user ?? (() => null),
    isAuthenticated: () => (overrides.user ?? (() => null))() !== null,
    isSeller: () => false,
    isAdmin: () => false,
    signOut: vi.fn(),
  };
}

function render(loggedIn = false) {
  const auth = fakeAuth(loggedIn ? { user: () => ({ id: 'u1', name: 'ทดสอบ ผู้ใช้', email: 't@test.dev', avatar: '', role: 'buyer' } as never) } : {});

  TestBed.configureTestingModule({
    imports: [AppHeaderComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: CatalogService, useValue: { resetFilters: vi.fn(), setFilters: vi.fn() } },
      { provide: CartService, useValue: { count: () => 0, toggleDrawer: vi.fn() } },
      { provide: WishlistService, useValue: { count: () => 0 } },
      { provide: MeService, useValue: { profile: signal(null), loadProfile: () => ({ subscribe: () => {} }) } },
      // follow-store-notifications v1: stand in for the bell's service so mounting
      // `AppHeaderComponent`/`NotificationBellComponent` never touches the round-1 stub's
      // real (always-failing) fetch, which would otherwise call `NzMessageService.error`
      // (not mocked here — this file only cares about the mobile-nav/search behaviour).
      {
        provide: NotificationFeedService,
        useValue: {
          items: () => [],
          previewItems: () => [],
          unreadCount: () => 0,
          // notification-master-config v1 §3.4: the bell reads its badge from the
          // per-audience breakdown, not the cross-layout total.
          unreadByAudience: () => ({ buyer: 0, seller: 0, admin: 0 }),
          hasAudienceBreakdown: () => false,
          loading: () => false,
          totalCount: () => 0,
          loadFeed: vi.fn(),
          loadPreview: vi.fn(),
          refreshUnreadCount: vi.fn(),
          markRead: vi.fn(() => ({ subscribe: () => {} })),
          markAllRead: vi.fn(() => ({ subscribe: () => {} })),
        },
      },
      { provide: NzMessageService, useValue: { info: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(AppHeaderComponent);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('AppHeaderComponent — mobile nav toggle (bug #1)', () => {
  it('renders a hamburger toggle (guests: hidden only >=1280), closed by default', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('button[aria-controls="mobile-nav-panel"]') as HTMLButtonElement;

    expect(toggle).toBeTruthy();
    // responsive-ui v1 §4.4: guests keep the menu toggle on tablet/laptop (row 1 = sign-in + menu).
    expect(toggle.className).toContain('xl:hidden');
    expect(toggle.className).not.toContain('md:hidden');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('#mobile-nav-panel')).toBeNull();
  });

  it('opens the panel with nav links + login link, and flips aria-expanded, on toggle click', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('button[aria-controls="mobile-nav-panel"]') as HTMLButtonElement;

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panel = el.querySelector('#mobile-nav-panel') as HTMLElement;
    expect(panel).toBeTruthy();
    const text = panel.textContent ?? '';
    expect(text).toContain('ตลาด');
    expect(text).toContain('หมวดหมู่');
    expect(panel.querySelector('a[routerLink="/bundles"]')).toBeNull();
    expect(panel.querySelector('a[routerLink="/free"]')).toBeNull();
    expect(text).toContain('เข้าสู่ระบบ');
  });

  it('closes the panel again on a second toggle click', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('button[aria-controls="mobile-nav-panel"]') as HTMLButtonElement;

    toggle.click();
    fixture.detectChanges();
    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('#mobile-nav-panel')).toBeNull();
  });

  it('shows account links (not the login link) in the panel when a user is signed in', () => {
    const fixture = render(true);
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('button[aria-controls="mobile-nav-panel"]') as HTMLButtonElement;

    toggle.click();
    fixture.detectChanges();

    const text = (el.querySelector('#mobile-nav-panel') as HTMLElement).textContent ?? '';
    expect(text).toContain('บัญชีของฉัน');
    expect(text).toContain('ออกจากระบบ');
    expect(text).not.toContain('เข้าสู่ระบบ');
  });
});

describe('AppHeaderComponent search submission', () => {
  it('keeps typing local and submits a trimmed marketplace query without old filters', async () => {
    const fixture = render();
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const input = (fixture.nativeElement as HTMLElement).querySelector('input[name="q"]') as HTMLInputElement;
    input.value = '  TOEIC  ';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    const button = input.form?.querySelector('button[type="submit"]') as HTMLButtonElement;
    button.click();
    expect(navigate).toHaveBeenCalledWith(['/marketplace'], {
      queryParams: { q: 'TOEIC' }, onSameUrlNavigation: 'reload',
    });
  });

  it('submits whitespace as the unfiltered marketplace', () => {
    const fixture = render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.query.set('   ');
    fixture.componentInstance.search();
    expect(navigate).toHaveBeenCalledWith(['/marketplace'], {
      queryParams: { q: null }, onSameUrlNavigation: 'reload',
    });
  });

  it('searches with trending keyword when searchTag is called', () => {
    const fixture = render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.searchTag('สรุปชีวะ');
    expect(fixture.componentInstance.query()).toBe('สรุปชีวะ');
    expect(navigate).toHaveBeenCalledWith(['/marketplace'], {
      queryParams: { q: 'สรุปชีวะ' }, onSameUrlNavigation: 'reload',
    });
  });

  it('clears search query on clearQuery', () => {
    const fixture = render();
    fixture.componentInstance.query.set('testing');
    fixture.componentInstance.clearQuery();
    expect(fixture.componentInstance.query()).toBe('');
  });

  it('keeps package and free links out of the header navigation', () => {
    const fixture = render();
    const hrefs = fixture.componentInstance.subnavItems().map((i) => i.href);
    expect(hrefs).not.toContain('/categories');
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/marketplace');
    expect(hrefs).not.toContain('/bundles');
    expect(hrefs).not.toContain('/free');
    expect(fixture.componentInstance.navItems().map((i) => i.href)).not.toContain('/bundles');
    expect(fixture.componentInstance.navItems().map((i) => i.href)).not.toContain('/free');
  });

  it('does not render a dead help center / faq link in the topbar', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[routerLink="/faq"]')).toBeNull();
    expect(el.querySelector('a[href="/faq"]')).toBeNull();
  });
});

describe('AppHeaderComponent — Row 1 Alignment and Responsive Grid', () => {
  it('places logo, search + seller center, and right actions in Row 1, and trending tags in Row 2', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;

    // Logo column
    const logoCol = el.querySelector('app-logo')?.parentElement?.parentElement;
    expect(logoCol?.className).toContain('md:row-start-1');
    expect(logoCol?.className).toContain('md:col-start-1');

    // Search and Seller Center column
    const searchInput = el.querySelector('input[name="q"]');
    const centerCol = searchInput?.closest('.search-container')?.parentElement?.parentElement;
    expect(centerCol?.className).toContain('md:row-start-1');
    expect(centerCol?.className).toContain('md:col-start-2');
    expect(centerCol?.className).toContain('items-center');

    // Seller center button within center column
    const sellerBtn = centerCol?.querySelector('a[routerLink="/become-seller"], a[routerLink="/seller"]');
    expect(sellerBtn).toBeTruthy();
    expect(sellerBtn?.className).not.toContain('self-start');
    expect(sellerBtn?.className).toContain('items-center');

    // Right actions column (Wishlist, Library, Cart, etc.)
    const wishlistLink = el.querySelector('a[routerLink="/wishlist"]');
    const rightCol = wishlistLink?.parentElement;
    expect(rightCol?.className).toContain('md:row-start-1');
    expect(rightCol?.className).toContain('md:col-start-3');
    expect(rightCol?.className).toContain('items-center');

    // Popular / Trending search tags in Row 2
    const chip = el.querySelector('.chip-tag');
    const row2Container = chip?.parentElement;
    expect(row2Container?.className).toContain('md:row-start-2');
    expect(row2Container?.className).toContain('md:col-start-2');
  });

  it('standardizes 44px heights across search container, seller center button, and actions', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;

    const searchContainer = el.querySelector('.search-container');
    expect(searchContainer?.className).toContain('h-11');

    const sellerBtn = el.querySelector('a[routerLink="/become-seller"], a[routerLink="/seller"]');
    expect(sellerBtn?.className).toContain('h-11');

    // responsive-ui v1 §4.4: no more `!w-9 !h-9` shrink — `.btn-icon` is 44x44 in every tier.
    const wishlist = el.querySelector('a[routerLink="/wishlist"]');
    expect(wishlist?.className).toContain('btn-icon');
    expect(wishlist?.className).not.toMatch(/!w-9|!h-9/);

    const cartBtn = el.querySelector('button[aria-label*="ตะกร้า"]');
    expect(cartBtn?.className).toContain('btn-icon');
    expect(cartBtn?.className).not.toMatch(/!w-9|!h-9/);
    expect(el.querySelector('[class*="!w-9"]')).toBeNull();
  });
});

describe('AppHeaderComponent — responsive tiers (responsive-ui v1 §4.4)', () => {
  it('signed-in users only get the menu toggle below 744 (the avatar menu covers tablet/laptop)', () => {
    const el = render(true).nativeElement as HTMLElement;
    const toggle = el.querySelector('[data-testid="header-menu-toggle"]') as HTMLElement;
    expect(toggle.className).toContain('md:hidden');
    expect(toggle.className).not.toContain('xl:hidden');
    expect(el.querySelector('[data-testid="header-avatar"]')?.className).toContain('hidden md:flex');
  });

  it('shows the compact bell (phone + tablet) only when signed in, and hides it on desktop', () => {
    expect((render(false).nativeElement as HTMLElement).querySelector('[data-testid="header-compact-bell"]')).toBeNull();
    TestBed.resetTestingModule();
    const bell = (render(true).nativeElement as HTMLElement).querySelector('[data-testid="header-compact-bell"]');
    expect(bell?.className).toContain('xl:hidden');
  });

  it('keeps the desktop-only chrome behind xl: utility bar, quick links, seller center, sub-nav', () => {
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="header-utility-bar"]')?.className).toContain('hidden xl:block');
    expect(el.querySelector('[data-testid="header-desktop-nav"]')?.className).toContain('hidden xl:block');
    expect(el.querySelector('.chip-tag')?.parentElement?.className).toContain('hidden xl:flex');
    expect(el.querySelector('a[routerLink="/become-seller"]')?.className).toContain('hidden xl:flex');
  });

  it('renders the 744–1279 nav row as a single-line chip-row', () => {
    const el = render().nativeElement as HTMLElement;
    const row = el.querySelector('[data-testid="header-tablet-nav"]') as HTMLElement;
    expect(row.className).toContain('hidden md:block xl:hidden');
    const nav = row.querySelector('nav') as HTMLElement;
    expect(nav.className).toContain('chip-row');
    expect(nav.querySelectorAll('a').length).toBe(3);
  });

  it('shows the phone search row on browse routes only', async () => {
    const fixture = render();
    const router = TestBed.inject(Router);
    router.resetConfig([
      { path: '', children: [] },
      { path: 'marketplace', children: [] },
      { path: 'orders', children: [] },
    ]);
    await router.navigateByUrl('/marketplace?q=abc');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="header-phone-search"]')).toBeTruthy();

    await router.navigateByUrl('/orders');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="header-phone-search"]')).toBeNull();
  });

  it('renders the menu drawer outside <header> (backdrop-filter would clip a fixed child) and closes on backdrop click', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="header-menu-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const panel = el.querySelector('#mobile-nav-panel') as HTMLElement;
    expect(panel.closest('header')).toBeNull();
    expect(panel.className).toContain('header-drawer');

    (el.querySelector('[data-testid="header-drawer-backdrop"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('#mobile-nav-panel')).toBeNull();
  });
});

/**
 * responsive-ui v1.4 closing gate, item G1-2 (G-12 touch targets + the ☰ drawer focus trap).
 * The runtime numbers come from the Playwright probe; these specs pin the markup that produces them.
 */
describe('AppHeaderComponent — G1-2 touch targets and drawer focus trap', () => {
  const COARSE_H = '[@media(pointer:coarse)]:min-h-11';
  const COARSE_W = '[@media(pointer:coarse)]:min-w-11';

  it('makes every 744–1279 nav chip 44px tall on touch while fine pointers keep min-h-9', () => {
    const el = render().nativeElement as HTMLElement;
    const chips = Array.from(el.querySelectorAll<HTMLElement>('[data-testid="header-tablet-nav"] nav a'));
    expect(chips.length).toBe(3);
    for (const chip of chips) {
      expect(chip.className).toContain('min-h-9');
      expect(chip.className).toContain(COARSE_H);
    }
  });

  it('gives the tablet/desktop search box a 44px inner height on touch: input, icon button and submit', () => {
    const el = render().nativeElement as HTMLElement;
    const box = el.querySelector('input[name="q"]')?.closest('.search-container') as HTMLElement;
    // 48px box - 2px border on each side = 44px for the full-height input and icon button.
    expect(box.className).toContain('[@media(pointer:coarse)]:h-12');
    expect(box.className).toContain('border-2');
    expect((el.querySelector('input[name="q"]') as HTMLElement).className).toContain('h-full');

    const [iconBtn, submitBtn] = Array.from(box.querySelectorAll<HTMLButtonElement>('button[type="submit"]'));
    expect(iconBtn.className).toContain('h-full');
    expect(iconBtn.className).toContain(COARSE_W);
    // The 36px pill keeps its 4px margin; .hit-44 stretches its hit area over that margin.
    expect(submitBtn.className).toContain('hit-44');
    expect(submitBtn.className).toContain(COARSE_W);
  });

  it('gives the clear-search button a 44px touch target once a query is typed', () => {
    const fixture = render();
    fixture.componentInstance.query.set('ฟิสิกส์');
    fixture.detectChanges();
    const clear = (fixture.nativeElement as HTMLElement).querySelector('.search-container button[type="button"]') as HTMLElement;
    expect(clear.className).toContain(COARSE_W);
    expect(clear.className).toContain(COARSE_H);
  });

  it('puts role=dialog on a fixed drawer root that also holds the cdkTrapFocus tab anchors', () => {
    const fixture = render(true);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="header-menu-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const root = el.querySelector('[data-testid="header-drawer"]') as HTMLElement;
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-modal')).toBe('true');
    expect(root.getAttribute('aria-label')).toBeTruthy();
    expect(root.className).toContain('header-drawer__root');
    expect(root.className).toContain('xl:hidden');

    const panel = el.querySelector('#mobile-nav-panel') as HTMLElement;
    expect(panel.parentElement).toBe(root);
    expect(panel.getAttribute('role')).toBeNull();
    expect(el.querySelector('[data-testid="header-drawer-backdrop"]')?.parentElement).toBe(root);
    expect(el.querySelectorAll('[role="dialog"]').length).toBe(1);

    // cdkTrapFocus inserts its anchors as siblings of the trapped panel: they must land inside the
    // fixed root, never in the page flow (focusing an in-flow anchor scrolled the page to the top).
    const anchors = Array.from(el.querySelectorAll('.cdk-focus-trap-anchor'));
    expect(anchors.length).toBe(2);
    for (const anchor of anchors) expect(anchor.parentElement).toBe(root);
  });

  it('closes the drawer on Escape from inside the dialog root', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="header-menu-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('#mobile-nav-panel a') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="header-drawer"]')).toBeNull();
  });
});

describe('isBrowseRoute', () => {
  it.each([
    ['/', true],
    ['/marketplace', true],
    ['/marketplace?q=x', true],
    ['/categories', true],
    ['/category/math', true],
    ['/bundles', true],
    ['/free', true],
    ['/store/abc', true],
    ['/tcas', true],
    ['/tgat-tpat', true],
    ['/a-level', true],
    ['/onet', true],
    ['/document/1', false],
    ['/orders', false],
    ['/library', false],
    ['/account', false],
  ])('%s -> %s', (url, expected) => {
    expect(isBrowseRoute(url)).toBe(expected);
  });
});
