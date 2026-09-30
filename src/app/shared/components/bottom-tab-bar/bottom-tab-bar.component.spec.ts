import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BottomTabBarComponent, type BottomTabItem } from './bottom-tab-bar.component';
import { LayoutChromeService } from '../../../core/layout';

@Component({ standalone: true, template: '' })
class DummyPageComponent {}

const ITEMS: readonly BottomTabItem[] = [
  { label: 'responsive.tab.home', icon: 'home', href: '/', exact: true },
  { label: 'responsive.tab.marketplace', icon: 'search', href: '/marketplace', badge: 0 },
  { label: 'responsive.tab.orders', icon: 'doc', href: '/orders', badge: 7 },
  { label: 'responsive.admin.tab.approval', icon: 'shield', href: '/admin/approval', badge: 250 },
  { label: 'responsive.tab.menu', icon: 'menu', action: 'menu', badge: null },
];

function setup(items: readonly BottomTabItem[] = ITEMS) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', component: DummyPageComponent },
        { path: '**', component: DummyPageComponent },
      ]),
    ],
  });
  const fixture = TestBed.createComponent(BottomTabBarComponent);
  fixture.componentRef.setInput('items', items);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el };
}

describe('BottomTabBarComponent', () => {
  it('renders a labelled nav with one entry per item', () => {
    const { el } = setup();
    const nav = el.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute('aria-label')).toBe('เมนูหลัก');

    const entries = el.querySelectorAll('.tab-bar__item');
    expect(entries.length).toBe(5);
    const labels = Array.from(el.querySelectorAll('.tab-bar__label')).map((n) => n.textContent?.trim());
    expect(labels).toEqual(['หน้าแรก', 'ตลาด', 'คำสั่งซื้อ', 'อนุมัติ', 'เมนู']);

    const links = el.querySelectorAll('a.tab-bar__item');
    expect(links.length).toBe(4);
    expect(links[1].getAttribute('href')).toBe('/marketplace');
    expect(el.querySelectorAll('button.tab-bar__item').length).toBe(1);
  });

  it('shows badges only for positive counts and caps them at 99+', () => {
    const { el } = setup();
    const badges = Array.from(el.querySelectorAll('[data-testid="tab-badge"]')).map((n) => n.textContent?.trim());
    expect(badges).toEqual(['7', '99+']);
  });

  it('emits (menu) when the menu action item is pressed', () => {
    const { fixture, el } = setup();
    let menuCount = 0;
    fixture.componentInstance.menu.subscribe(() => menuCount++);

    (el.querySelector('button.tab-bar__item') as HTMLButtonElement).click();
    expect(menuCount).toBe(1);
  });

  it('marks the raised item', () => {
    const { el } = setup([
      { label: 'responsive.seller.tab.overview', icon: 'dashboard', href: '/seller', exact: true },
      { label: 'responsive.seller.tab.upload', icon: 'upload', href: '/seller/upload', raised: true },
    ]);
    const raised = el.querySelectorAll('.tab-bar__item--raised');
    expect(raised.length).toBe(1);
    expect(raised[0].getAttribute('href')).toBe('/seller/upload');
  });

  it('is hidden while a sticky action bar is active', () => {
    const { fixture, el } = setup();
    const chrome = TestBed.inject(LayoutChromeService);

    chrome.registerActionBar();
    fixture.detectChanges();
    expect(el.querySelector('nav')).toBeNull();
    expect(el.hasAttribute('hidden')).toBe(true);

    chrome.unregisterActionBar();
    fixture.detectChanges();
    expect(el.querySelector('nav')).not.toBeNull();
    expect(el.hasAttribute('hidden')).toBe(false);
  });

  it('applies the dark theme class on the host', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('theme', 'dark');
    fixture.detectChanges();
    expect(el.classList.contains('bottom-tab-bar--dark')).toBe(true);
  });
});
