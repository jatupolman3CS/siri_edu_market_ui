import { TestBed } from '@angular/core/testing';
import { ACTION_BAR_LIVE_HEIGHT_VAR, LayoutChromeService } from './layout-chrome.service';

describe('LayoutChromeService', () => {
  let service: LayoutChromeService;

  beforeEach(() => {
    service = TestBed.inject(LayoutChromeService);
  });

  it('mirrors the tallest measured bar height to --action-bar-live-h on <html> (scroll-padding)', () => {
    const root = document.documentElement;
    const owner = {};
    service.setActionBarHeight(owner, 88);
    TestBed.tick();
    expect(root.style.getPropertyValue(ACTION_BAR_LIVE_HEIGHT_VAR)).toBe('88px');

    service.setActionBarHeight(owner, null);
    TestBed.tick();
    expect(root.style.getPropertyValue(ACTION_BAR_LIVE_HEIGHT_VAR)).toBe('');
  });

  it('starts with no active action bar', () => {
    expect(service.actionBarActive()).toBe(false);
  });

  it('stays active until every registered bar has unregistered', () => {
    service.registerActionBar();
    service.registerActionBar();
    expect(service.actionBarActive()).toBe(true);

    service.unregisterActionBar();
    expect(service.actionBarActive()).toBe(true);

    service.unregisterActionBar();
    expect(service.actionBarActive()).toBe(false);
  });

  it('never goes negative on extra unregister calls', () => {
    service.unregisterActionBar();
    service.unregisterActionBar();
    expect(service.actionBarActive()).toBe(false);

    // A single register after the extra unregisters must activate immediately.
    service.registerActionBar();
    expect(service.actionBarActive()).toBe(true);
    service.unregisterActionBar();
    expect(service.actionBarActive()).toBe(false);
  });

  it('reports the tallest measured action bar height and forgets bars that clear it', () => {
    const first = {};
    const second = {};
    expect(service.actionBarHeight()).toBeNull();

    service.setActionBarHeight(first, 72);
    expect(service.actionBarHeight()).toBe(72);

    service.setActionBarHeight(second, 85);
    expect(service.actionBarHeight()).toBe(85);

    service.setActionBarHeight(second, null);
    expect(service.actionBarHeight()).toBe(72);

    service.setActionBarHeight(first, 90.5);
    expect(service.actionBarHeight()).toBe(90.5);

    service.setActionBarHeight(first, null);
    expect(service.actionBarHeight()).toBeNull();

    // Clearing an unknown owner is a no-op.
    service.setActionBarHeight({}, null);
    expect(service.actionBarHeight()).toBeNull();
  });
});
