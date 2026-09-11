import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AppHeaderComponent } from './app-header.component';
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
  it('renders a hamburger toggle button hidden above md, closed by default', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('button[aria-controls="mobile-nav-panel"]') as HTMLButtonElement;

    expect(toggle).toBeTruthy();
    expect(toggle.className).toContain('md:hidden');
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
    expect(text).toContain('แพ็กเกจ');
    expect(text).toContain('ฟรี');
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

  it('subnavItems groups /marketplace, /bundles, and /free together next to each other', () => {
    const fixture = render();
    const hrefs = fixture.componentInstance.subnavItems().map((i) => i.href);
    expect(hrefs).not.toContain('/categories');
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/marketplace');
    expect(hrefs).toContain('/bundles');
    expect(hrefs).toContain('/free');
    const marketIndex = hrefs.indexOf('/marketplace');
    expect(hrefs[marketIndex + 1]).toBe('/bundles');
    expect(hrefs[marketIndex + 2]).toBe('/free');
  });

  it('does not render a dead help center / faq link in the topbar', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[routerLink="/faq"]')).toBeNull();
    expect(el.querySelector('a[href="/faq"]')).toBeNull();
  });
});



