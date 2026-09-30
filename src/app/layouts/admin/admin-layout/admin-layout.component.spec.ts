import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminLayoutComponent } from './admin-layout.component';
import { AdminService, AuthService, MeService } from '../../../core/services';
import { LayoutChromeService, ViewportService } from '../../../core/layout';
import { NotificationBellComponent } from '../../../shared/components/notification-bell/notification-bell.component';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class StubBellComponent {}

/**
 * responsive-ui v1 §4.4 (U4): admin phone bottom tab bar (dark, 5 items, อนุมัติ badge =
 * `pendingCount()` hidden at 0, เมนู opens the drawer), 88px rail for 744–1279, 288px sidebar >=1280.
 */
function render(pending: number) {
  const auth = {
    user: signal<{ name: string; avatar?: string } | null>({ name: 'Admin One' }),
    isAuthenticated: signal(true),
    signOut: vi.fn(),
  };
  const me = { profile: signal(null), loadProfile: vi.fn(() => of(null)) };
  const pendingBadgeCount = signal<number | null>(pending);
  const admin = {
    pendingBadgeCount,
    refreshPendingBadgeCount: vi.fn(() => Promise.resolve()),
    countNewFeedback: vi.fn(() => Promise.resolve(0)),
  };
  const viewport = {
    tier: signal('phone'),
    isPhone: signal(true),
    isTabletUp: signal(false),
    isLaptopUp: signal(false),
    isDesktop: signal(false),
  };

  TestBed.configureTestingModule({
    imports: [AdminLayoutComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: MeService, useValue: me },
      { provide: AdminService, useValue: admin },
      { provide: NzMessageService, useValue: { info: vi.fn() } },
      { provide: ViewportService, useValue: viewport },
    ],
  }).overrideComponent(AdminLayoutComponent, {
    remove: { imports: [NotificationBellComponent] },
    add: { imports: [StubBellComponent] },
  });

  const fixture = TestBed.createComponent(AdminLayoutComponent);
  fixture.detectChanges();
  return { fixture, admin, viewport };
}

afterEach(() => TestBed.resetTestingModule());

describe('AdminLayoutComponent — responsive chrome (responsive-ui v1 §4.4)', () => {
  it('exposes exactly 5 tab items with the spec order, hrefs and icons', () => {
    const { fixture } = render(0);
    const items = fixture.componentInstance.tabItems();

    expect(items.length).toBe(5);
    expect(items.map((i) => i.href ?? i.action)).toEqual([
      '/admin',
      '/admin/approval',
      '/admin/users',
      '/admin/transactions',
      'menu',
    ]);
    expect(items.map((i) => i.icon)).toEqual(['dashboard', 'shield', 'user', 'wallet', 'menu']);
    expect(items[0].exact).toBe(true);
  });

  it('renders the dark bottom tab bar with 5 slots', () => {
    const { fixture } = render(0);
    const root = fixture.nativeElement as HTMLElement;
    const bar = root.querySelector('app-bottom-tab-bar') as HTMLElement;
    expect(bar.classList.contains('bottom-tab-bar--dark')).toBe(true);
    expect(bar.querySelectorAll('.tab-bar__item').length).toBe(5);
  });

  it('อนุมัติ badge equals pendingCount()', () => {
    const { fixture } = render(7);
    expect(fixture.componentInstance.pendingCount()).toBe(7);
    expect(fixture.componentInstance.tabItems()[1].badge).toBe(7);

    const root = fixture.nativeElement as HTMLElement;
    const badges = root.querySelectorAll('app-bottom-tab-bar [data-testid="tab-badge"]');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent?.trim()).toBe('7');
  });

  it('hides the อนุมัติ badge when pendingCount() is 0 and follows later changes', () => {
    const { fixture, admin } = render(0);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('app-bottom-tab-bar [data-testid="tab-badge"]').length).toBe(0);

    admin.pendingBadgeCount.set(2);
    fixture.detectChanges();
    const badge = root.querySelector('app-bottom-tab-bar [data-testid="tab-badge"]');
    expect(badge?.textContent?.trim()).toBe('2');
  });

  it('shows the pending badge on the rail approval item too', () => {
    const { fixture } = render(3);
    const rail = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="admin-rail"]') as HTMLElement;
    const badges = rail.querySelectorAll('[data-testid="rail-badge"]');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent?.trim()).toBe('3');
  });

  it('เมนู tab opens the drawer with every navItems entry', () => {
    const { fixture } = render(0);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="admin-drawer"]')).toBeNull();

    const menuButton = root.querySelector('app-bottom-tab-bar button.tab-bar__item') as HTMLButtonElement;
    menuButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.sidebarOpen()).toBe(true);
    const drawer = root.querySelector('[data-testid="admin-drawer"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.querySelectorAll('[data-testid="admin-drawer-item"]').length).toBe(
      fixture.componentInstance.navItems().length,
    );
  });

  it('hides the tab bar and drops pb-bottom-nav while a sticky action bar is active', () => {
    const { fixture } = render(0);
    const root = fixture.nativeElement as HTMLElement;
    const content = root.querySelector('[data-testid="admin-main-content"]') as HTMLElement;
    expect(content.classList.contains('pb-bottom-nav')).toBe(true);

    TestBed.inject(LayoutChromeService).registerActionBar();
    fixture.detectChanges();

    expect(content.classList.contains('pb-bottom-nav')).toBe(false);
    expect(root.querySelector('app-bottom-tab-bar nav')).toBeNull();
  });

  it('renders the 88px rail (744–1279) and keeps the sidebar at >=1280 only', () => {
    const { fixture } = render(0);
    const root = fixture.nativeElement as HTMLElement;

    const rail = root.querySelector('[data-testid="admin-rail"]') as HTMLElement;
    expect(rail.className).toContain('w-[calc(88px+var(--safe-left))]');
    expect(rail.className).toContain('md:flex');
    expect(rail.className).toContain('xl:hidden');
    expect(rail.querySelectorAll('[data-testid="admin-rail-item"]').length).toBe(
      fixture.componentInstance.navItems().length,
    );

    const sidebar = root.querySelector('[data-testid="admin-sidebar"]') as HTMLElement;
    expect(sidebar.className).toContain('xl:flex');
    expect(sidebar.className).not.toContain('lg:flex');
  });

  it('wraps the router-outlet in exactly one page frame inside admin-main-content (R-26, v1.5 §4.4)', () => {
    const { fixture } = render(0);
    const root = fixture.nativeElement as HTMLElement;

    const frames = root.querySelectorAll('[data-testid="admin-page-frame"]');
    expect(frames.length).toBe(1);
    const frame = frames[0] as HTMLElement;

    expect(frame.querySelector('router-outlet')).not.toBeNull();
    expect(frame.parentElement?.getAttribute('data-testid')).toBe('admin-main-content');
    for (const cls of ['mx-auto', 'w-full', 'min-w-0', 'max-w-[1920px]']) {
      expect(frame.classList.contains(cls)).toBe(true);
    }
    // The phone tab-bar spacer stays outside the frame (§4.4).
    const gap = root.querySelector('[data-testid="admin-tabbar-gap"]');
    expect(gap).not.toBeNull();
    expect(frame.contains(gap)).toBe(false);
  });

  it('removes the old phone chip nav from the top bar', () => {
    const { fixture } = render(0);
    const topbar = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="admin-phone-topbar"]');
    expect(topbar).not.toBeNull();
    expect(topbar?.querySelector('nav')).toBeNull();
  });

  it('loads the unfiltered pending total for the badge on any admin page (F87)', () => {
    const { admin, fixture } = render(0);
    expect(admin.refreshPendingBadgeCount).toHaveBeenCalled();
    admin.pendingBadgeCount.set(220);
    fixture.detectChanges();
    const badge = (fixture.nativeElement as HTMLElement).querySelector('app-bottom-tab-bar [data-testid="tab-badge"]');
    expect(badge?.textContent?.trim()).toBe('99+');
  });

  it('caps the rail and sidebar approval badge at "99+" like the tab bar (F87)', () => {
    const { fixture } = render(1234);
    const root = fixture.nativeElement as HTMLElement;
    const rail = root.querySelector('[data-testid="admin-rail"] [data-testid="rail-badge"]');
    expect(rail?.textContent?.trim()).toBe('99+');
    const sidebarBadges = Array.from(root.querySelectorAll('[data-testid="admin-sidebar"] nav .pill')).map((b) => b.textContent?.trim());
    expect(sidebarBadges).toEqual(['99+']);
    expect(root.textContent).not.toContain('1234');

    const approval = fixture.componentInstance.navItems().find((i) => i.href === '/admin/approval')!;
    expect(fixture.componentInstance.badgeFor(approval)).toBe('99+');
  });

  it('shows the exact count up to 99 and nothing at 0', () => {
    const { fixture, admin } = render(99);
    const approval = fixture.componentInstance.navItems().find((i) => i.href === '/admin/approval')!;
    expect(fixture.componentInstance.badgeFor(approval)).toBe('99');
    admin.pendingBadgeCount.set(0);
    expect(fixture.componentInstance.badgeFor(approval)).toBeNull();
  });

  it('lists /admin/crm/document-alerts in the one navItems list the sidebar, rail and drawer share (G-30a)', () => {
    const { fixture } = render(0);
    const hrefs = fixture.componentInstance.navItems().map((i) => i.href);
    expect(hrefs).toContain('/admin/crm/document-alerts');
    expect(hrefs).toContain('/admin/subscriptions');
    const root = fixture.nativeElement as HTMLElement;
    for (const sel of ['[data-testid="admin-sidebar"]', '[data-testid="admin-rail"]']) {
      const links = Array.from(root.querySelectorAll(sel + ' a[href]')).map((a) => a.getAttribute('href'));
      expect(links).toContain('/admin/crm/document-alerts');
    }
  });

  it('gives the phone top-bar ADMIN link a 44px row (G-12)', () => {
    const { fixture } = render(0);
    const link = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="admin-phone-topbar"] a[href="/admin"]') as HTMLElement;
    expect(link.className).toContain('min-h-11');
  });

  it('drawer is a named dialog that closes on Escape and locks page scroll while open (F82/F50)', () => {
    const { fixture } = render(0);
    const root = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.toggleSidebar();
    fixture.detectChanges();
    const drawer = root.querySelector('[data-testid="admin-drawer"]') as HTMLElement;
    expect(drawer.getAttribute('aria-label')).toBeTruthy();
    expect(document.documentElement.style.overflow).toBe('hidden');

    drawer.querySelector('aside')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.sidebarOpen()).toBe(false);
    expect(root.querySelector('[data-testid="admin-drawer"]')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('closes the drawer and account menu when the viewport grows past the phone tier (F43)', () => {
    const { fixture, viewport } = render(0);
    fixture.componentInstance.toggleSidebar();
    fixture.componentInstance.toggleAccountMenu();
    fixture.detectChanges();
    viewport.isTabletUp.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.sidebarOpen()).toBe(false);
    expect(fixture.componentInstance.accountMenuOpen()).toBe(false);
  });

  it('account menu closes on Escape, returns focus to the avatar and lifts the top bar over the tab bar (F128/F59)', () => {
    const { fixture } = render(0);
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('[data-testid="admin-account-button"]') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    const header = root.querySelector('[data-testid="admin-phone-topbar"]') as HTMLElement;
    expect(header.classList.contains('z-50')).toBe(true);
    const menu = root.querySelector('[data-testid="admin-account-menu"]') as HTMLElement;
    menu.querySelector('a')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="admin-account-menu"]')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(header.classList.contains('z-30')).toBe(true);
  });

});
