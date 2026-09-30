import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CartDrawerComponent } from './cart-drawer.component';
import { AuthService, CartService } from '../../../core/services';
import { ViewportService } from '../../../core/layout';

/**
 * responsive-ui v1 §4.7 / U2-5: the cart drawer is a 92dvh bottom sheet on phone (<744) and a
 * right drawer min(420px, 90vw) from 744 up — driven by the shared ViewportService instead of
 * the old private window-width signal.
 */
function render(phone: boolean, open = false) {
  const drawerOpen = signal(open);
  const cart = {
    drawerOpen,
    closeDrawer: vi.fn(() => drawerOpen.set(false)),
    count: () => 0,
    items: () => [],
    subtotal: () => 0,
    savings: () => 0,
    vatIncluded: () => 0,
    total: () => 0,
  };
  TestBed.configureTestingModule({
    imports: [CartDrawerComponent],
    providers: [
      provideRouter([]),
      { provide: ViewportService, useValue: { isPhone: signal(phone) } },
      { provide: CartService, useValue: cart },
      { provide: AuthService, useValue: { isAuthenticated: () => true } },
      { provide: NzMessageService, useValue: { warning: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(CartDrawerComponent);
  fixture.detectChanges();
  return Object.assign(fixture.componentInstance, { cartMock: cart, fixture });
}

afterEach(() => TestBed.resetTestingModule());

describe('CartDrawerComponent — responsive placement (responsive-ui v1 §4.7)', () => {
  it('is a 92dvh bottom sheet on phone', () => {
    const cmp = render(true);
    expect(cmp.placement()).toBe('bottom');
    expect(cmp.drawerHeight).toBe('92dvh');
  });

  it('is a right drawer capped at min(420px, 90vw) from 744 up', () => {
    const cmp = render(false);
    expect(cmp.placement()).toBe('right');
    expect(cmp.drawerWidth).toBe('min(420px, 90vw)');
  });

  it('resets CartService when NG-Zorro hides the drawer itself (browser back, F133)', () => {
    const cmp = render(true, true);
    expect(cmp.cartMock.drawerOpen()).toBe(true);
    cmp.onVisibleChange(false);
    expect(cmp.cartMock.closeDrawer).toHaveBeenCalled();
    expect(cmp.cartMock.drawerOpen()).toBe(false);
  });

  it('does not call closeDrawer again when the service already says closed', () => {
    const cmp = render(true, false);
    cmp.onVisibleChange(false);
    expect(cmp.cartMock.closeDrawer).not.toHaveBeenCalled();
  });
});

/**
 * responsive-ui v1.4 §1.5 / §4.7 (F104, F133): the closed drawer's content is inert, focus lands on
 * the close button once it opens (on every open, not only the first), and Tab is trapped inside.
 */
describe('CartDrawerComponent — focus and inert (responsive-ui v1.4 §1.5)', () => {
  const root = () => document.querySelector<HTMLElement>('.cart-drawer__root');
  const closeButton = () => root()?.querySelector<HTMLButtonElement>('header button') ?? null;
  const frames = () => new Promise((resolve) => setTimeout(resolve, 80));

  async function open(cmp: ReturnType<typeof render>): Promise<void> {
    cmp.cartMock.drawerOpen.set(true);
    cmp.fixture.detectChanges();
    await cmp.fixture.whenStable();
    await frames();
  }

  async function close(cmp: ReturnType<typeof render>): Promise<void> {
    cmp.cartMock.drawerOpen.set(false);
    cmp.fixture.detectChanges();
    await cmp.fixture.whenStable();
  }

  it('the root is inert while closed and not while open', async () => {
    const cmp = render(false);
    await open(cmp);
    expect(root()).not.toBeNull();
    expect(root()!.hasAttribute('inert')).toBe(false);

    await close(cmp);
    // NG-Zorro keeps the content rendered through (at least) the slide-out; it must be inert then.
    expect(root()).not.toBeNull();
    expect(root()!.hasAttribute('inert')).toBe(true);
  });

  it('after open, the close button has focus — on the second open too', async () => {
    const cmp = render(true);
    await open(cmp);
    expect(closeButton()).not.toBeNull();
    expect(document.activeElement).toBe(closeButton());

    (document.activeElement as HTMLElement).blur();
    await close(cmp);
    await frames();
    await open(cmp);
    expect(document.activeElement).toBe(closeButton());
  });

  it('traps Tab inside the content while open (cdkTrapFocus anchors enabled only then)', async () => {
    const cmp = render(false);
    await open(cmp);
    const before = root()!.previousElementSibling;
    const after = root()!.nextElementSibling;
    expect(before?.classList.contains('cdk-focus-trap-anchor')).toBe(true);
    expect(after?.classList.contains('cdk-focus-trap-anchor')).toBe(true);
    expect(before?.getAttribute('tabindex')).toBe('0');

    await close(cmp);
    expect(root()!.previousElementSibling?.hasAttribute('tabindex')).toBe(false);
  });
});
