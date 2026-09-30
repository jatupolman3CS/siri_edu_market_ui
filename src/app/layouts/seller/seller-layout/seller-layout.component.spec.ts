import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerLayoutComponent } from './seller-layout.component';
import { AuthService, MeService } from '../../../core/services';
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
 * responsive-ui v1 §4.4 (U3): seller phone bottom tab bar (5 items, center อัปโหลด raised,
 * เมนู opens the drawer), 88px rail for 744–1279, 288px sidebar >=1280 (`xl:flex`).
 */
function render() {
  const auth = {
    user: signal<{ name: string; avatar?: string } | null>({ name: 'Seller One' }),
    isAuthenticated: signal(true),
    signOut: vi.fn(),
  };
  const me = { profile: signal(null), loadProfile: vi.fn(() => of(null)) };
  const viewport = {
    tier: signal('phone'),
    isPhone: signal(true),
    isTabletUp: signal(false),
    isLaptopUp: signal(false),
    isDesktop: signal(false),
  };

  TestBed.configureTestingModule({
    imports: [SellerLayoutComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: MeService, useValue: me },
      { provide: NzMessageService, useValue: { info: vi.fn() } },
      { provide: ViewportService, useValue: viewport },
    ],
  }).overrideComponent(SellerLayoutComponent, {
    remove: { imports: [NotificationBellComponent] },
    add: { imports: [StubBellComponent] },
  });

  const fixture = TestBed.createComponent(SellerLayoutComponent);
  fixture.detectChanges();
  return { fixture, auth, viewport };
}

afterEach(() => TestBed.resetTestingModule());

describe('SellerLayoutComponent — responsive chrome (responsive-ui v1 §4.4)', () => {
  it('exposes exactly 5 tab items with the spec order, hrefs and icons', () => {
    const { fixture } = render();
    const items = fixture.componentInstance.tabItems;

    expect(items.length).toBe(5);
    expect(items.map((i) => i.href ?? i.action)).toEqual([
      '/seller',
      '/seller/documents',
      '/seller/upload',
      '/seller/earnings',
      'menu',
    ]);
    expect(items.map((i) => i.icon)).toEqual(['dashboard', 'doc', 'upload', 'wallet', 'menu']);
    expect(items[0].exact).toBe(true);
  });

  it('marks only the center อัปโหลด item as raised', () => {
    const { fixture } = render();
    const raised = fixture.componentInstance.tabItems.filter((i) => i.raised);
    expect(raised.length).toBe(1);
    expect(raised[0].href).toBe('/seller/upload');
    expect(fixture.componentInstance.tabItems[2].raised).toBe(true);
  });

  it('renders the bottom tab bar with 5 slots, the center one raised', () => {
    const { fixture } = render();
    const root = fixture.nativeElement as HTMLElement;
    const nav = root.querySelector('app-bottom-tab-bar nav');
    expect(nav).not.toBeNull();
    const slots = root.querySelectorAll('app-bottom-tab-bar .tab-bar__item');
    expect(slots.length).toBe(5);
    expect(slots[2].classList.contains('tab-bar__item--raised')).toBe(true);
  });

  it('เมนู tab opens the drawer with every navItems entry', () => {
    const { fixture } = render();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="seller-drawer"]')).toBeNull();

    const menuButton = root.querySelector('app-bottom-tab-bar button.tab-bar__item') as HTMLButtonElement;
    menuButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.sidebarOpen()).toBe(true);
    const drawer = root.querySelector('[data-testid="seller-drawer"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.querySelectorAll('[data-testid="seller-drawer-item"]').length).toBe(
      fixture.componentInstance.navItems().length,
    );
  });

  it('hides the tab bar and drops pb-bottom-nav while a sticky action bar is active', () => {
    const { fixture } = render();
    const root = fixture.nativeElement as HTMLElement;
    const main = root.querySelector('main') as HTMLElement;
    expect(main.classList.contains('pb-bottom-nav')).toBe(true);

    TestBed.inject(LayoutChromeService).registerActionBar();
    fixture.detectChanges();

    expect(main.classList.contains('pb-bottom-nav')).toBe(false);
    expect(root.querySelector('app-bottom-tab-bar nav')).toBeNull();
  });

  it('renders the 88px rail (744–1279) and keeps the sidebar at >=1280 only', () => {
    const { fixture } = render();
    const root = fixture.nativeElement as HTMLElement;

    const rail = root.querySelector('[data-testid="seller-rail"]') as HTMLElement;
    expect(rail.className).toContain('w-[calc(88px+var(--safe-left))]');
    expect(rail.className).toContain('md:flex');
    expect(rail.className).toContain('xl:hidden');
    expect(rail.querySelectorAll('[data-testid="seller-rail-item"]').length).toBe(
      fixture.componentInstance.navItems().length,
    );

    const sidebar = root.querySelector('[data-testid="seller-sidebar"]') as HTMLElement;
    expect(sidebar.className).toContain('xl:flex');
    expect(sidebar.className).not.toContain('lg:flex');
  });

  it('removes the old phone chip nav (no horizontally scrolling nav in the phone top bar)', () => {
    const { fixture } = render();
    const topbar = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="seller-phone-topbar"]');
    expect(topbar).not.toBeNull();
    expect(topbar?.querySelector('nav')).toBeNull();
  });

  it('drawer is a named dialog that closes on Escape and locks page scroll while open (F82/F50)', () => {
    const { fixture } = render();
    const root = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.openSidebar();
    fixture.detectChanges();
    const drawer = root.querySelector('[data-testid="seller-drawer"]') as HTMLElement;
    expect(drawer.getAttribute('aria-label')).toBeTruthy();
    expect(document.documentElement.style.overflow).toBe('hidden');

    drawer.querySelector('aside')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="seller-drawer"]')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('closes the drawer when the viewport grows past the phone tier (F43)', () => {
    const { fixture, viewport } = render();
    fixture.componentInstance.openSidebar();
    fixture.detectChanges();
    viewport.isTabletUp.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.sidebarOpen()).toBe(false);
  });

  it('rail items never shrink below their content (F97)', () => {
    const { fixture } = render();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="seller-rail-item"]');
    expect(items.length).toBeGreaterThan(0);
    items.forEach((a) => expect(a.classList.contains('shrink-0')).toBe(true));
  });

  it('wraps the router-outlet in exactly one page frame capped at 1920px (v1.5 R-26)', () => {
    const { fixture } = render();
    const frames = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="seller-page-frame"]');
    expect(frames.length).toBe(1);
    const frame = frames[0] as HTMLElement;
    expect(frame.querySelector('router-outlet')).not.toBeNull();
    for (const cls of ['mx-auto', 'w-full', 'min-w-0', 'max-w-[1920px]']) {
      expect(frame.classList.contains(cls)).toBe(true);
    }
  });
});
