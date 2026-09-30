import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterOutlet } from '@angular/router';
import { BuyerLayoutComponent } from './buyer-layout.component';
import { BottomTabBarComponent } from '../../../shared/components/bottom-tab-bar/bottom-tab-bar.component';
import { AuthService } from '../../../core/services';
import { LayoutChromeService } from '../../../core/layout';

/**
 * responsive-ui v1 §4.4 / §1.5 (U2): the buyer layout owns the phone bottom tab bar —
 * 5 items, บัญชี → /auth/login when signed out and /account when signed in — and reserves
 * space for it with `.pb-bottom-nav` unless a sticky action bar is alive.
 *
 * Header/footer/cart/quick-view/announcement are swapped out (NO_ERRORS_SCHEMA) so this spec
 * only exercises the layout's own template + the real tab bar.
 */
function render(signedIn: boolean, actionBarActive = false, actionBarHeight: number | null = null) {
  const authenticated = signal(signedIn);
  const measuredHeight = signal<number | null>(actionBarHeight);
  TestBed.configureTestingModule({
    imports: [BuyerLayoutComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { isAuthenticated: authenticated } },
      {
        provide: LayoutChromeService,
        useValue: {
          actionBarActive: signal(actionBarActive),
          actionBarHeight: measuredHeight,
          registerActionBar: vi.fn(),
          unregisterActionBar: vi.fn(),
          setActionBarHeight: vi.fn(),
        },
      },
    ],
  });
  TestBed.overrideComponent(BuyerLayoutComponent, {
    set: { imports: [RouterOutlet, BottomTabBarComponent], schemas: [NO_ERRORS_SCHEMA] },
  });
  const fixture = TestBed.createComponent(BuyerLayoutComponent);
  fixture.detectChanges();
  return { fixture, authenticated, measuredHeight };
}

afterEach(() => TestBed.resetTestingModule());

function tabLinks(el: HTMLElement): HTMLAnchorElement[] {
  return Array.from(el.querySelectorAll<HTMLAnchorElement>('app-bottom-tab-bar nav a'));
}

describe('BuyerLayoutComponent — bottom tab bar (responsive-ui v1 §4.4)', () => {
  it('renders the tab bar with 5 items in the spec order', () => {
    const { fixture } = render(false);
    const links = tabLinks(fixture.nativeElement as HTMLElement);

    expect(links.length).toBe(5);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/marketplace',
      '/library',
      '/orders',
      '/auth/login',
    ]);
    const labels = links.map((a) => a.textContent?.trim());
    expect(labels).toEqual(['หน้าแรก', 'ตลาด', 'คลังของฉัน', 'คำสั่งซื้อ', 'บัญชี']);
  });

  it('points บัญชี at /auth/login when signed out and /account when signed in', () => {
    const { fixture, authenticated } = render(false);
    const el = fixture.nativeElement as HTMLElement;
    expect(tabLinks(el)[4].getAttribute('href')).toBe('/auth/login');

    authenticated.set(true);
    fixture.detectChanges();
    expect(tabLinks(el)[4].getAttribute('href')).toBe('/account');
  });

  it('marks หน้าแรก as an exact match', () => {
    const { fixture } = render(true);
    expect(fixture.componentInstance.tabItems()[0]).toEqual(
      expect.objectContaining({ href: '/', exact: true, icon: 'home' }),
    );
  });

  it('reserves bottom-nav padding on the layout root', () => {
    const { fixture } = render(true);
    const root = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="buyer-layout-root"]') as HTMLElement;
    expect(root.classList).toContain('pb-bottom-nav');
    expect(root.className).toContain('min-h-dvh');
  });

  it('drops the padding and hides the tab bar while a sticky action bar is active', () => {
    const { fixture } = render(true, true);
    const el = fixture.nativeElement as HTMLElement;
    const root = el.querySelector('[data-testid="buyer-layout-root"]') as HTMLElement;
    expect(root.classList).not.toContain('pb-bottom-nav');
    expect(el.querySelector('app-bottom-tab-bar nav')).toBeNull();
  });

  it('adds no inline padding while no sticky action bar is active', () => {
    const { fixture } = render(true, false, 85);
    const root = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="buyer-layout-root"]') as HTMLElement;
    expect(root.style.paddingBottom).toBe('');
  });

  // G-11: the bar's in-page spacer sits above <app-footer>, so the root reserves the bar again
  // below the footer — the measured height when there is one, the token height otherwise.
  it('reserves the sticky action bar height below the footer while a bar is active', () => {
    const { fixture, measuredHeight } = render(true, true, 85);
    const root = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="buyer-layout-root"]') as HTMLElement;
    expect(root.style.paddingBottom).toBe('85px');

    measuredHeight.set(null);
    fixture.detectChanges();
    expect(root.style.paddingBottom).toBe('calc(var(--action-bar-h) + var(--safe-bottom))');
  });
});
