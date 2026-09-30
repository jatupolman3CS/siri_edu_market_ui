import { TestBed } from '@angular/core/testing';
import { ViewportScroller } from '@angular/common';
import { Event as RouterEvent, NavigationEnd, Router, Scroll } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { ScrollRestorationService } from './scroll-restoration.service';
import { finishLoading, inFlightCount, startLoading } from '../services/loading';

function setup() {
  const events = new Subject<RouterEvent>();
  const scroller = {
    setHistoryScrollRestoration: vi.fn(),
    scrollToPosition: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { events } },
      { provide: ViewportScroller, useValue: scroller },
    ],
  });
  TestBed.inject(ScrollRestorationService);
  const end = new NavigationEnd(2, '/orders', '/orders');
  return { events, scroller, end };
}

describe('ScrollRestorationService', () => {
  const html = document.documentElement;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    // The in-flight counter is module state shared with every other spec in the same worker; a
    // request left pending by an earlier file would keep it above 0 and this suite would never see
    // "settled". Start each case from an idle counter.
    while (inFlightCount() > 0) finishLoading();
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(html, 'scrollHeight', { configurable: true, value: 0 });
  });

  it('takes history scroll restoration over from the browser', () => {
    const { scroller } = setup();
    expect(scroller.setHistoryScrollRestoration).toHaveBeenCalledWith('manual');
  });

  it('sends a forward navigation to the top of the page', () => {
    const { events, scroller, end } = setup();
    events.next(new Scroll(end, null, null));
    expect(scroller.scrollToPosition).toHaveBeenCalledWith([0, 0], { behavior: 'instant' });
  });

  it('leaves #anchor navigations to the router', () => {
    const { events, scroller, end } = setup();
    events.next(new Scroll(end, null, 'faq'));
    expect(scroller.scrollToPosition).not.toHaveBeenCalled();
  });

  it('restores a back/forward position once the list has loaded and the page is tall enough', () => {
    const { events, scroller, end } = setup();
    Object.defineProperty(html, 'scrollHeight', { configurable: true, value: 300 });
    startLoading();

    events.next(new Scroll(end, [0, 900], null));
    // The list is still loading: nothing yet, a frame is queued.
    expect(scroller.scrollToPosition).not.toHaveBeenCalled();
    expect(frames.length).toBe(1);

    // Tall enough (e.g. a skeleton) but the request is still in flight → keep waiting.
    Object.defineProperty(html, 'scrollHeight', { configurable: true, value: 900 + window.innerHeight });
    frames.shift()?.(0);
    expect(scroller.scrollToPosition).not.toHaveBeenCalled();

    finishLoading();
    frames.shift()?.(0);
    expect(scroller.scrollToPosition).not.toHaveBeenCalled();
    frames.shift()?.(0);
    expect(scroller.scrollToPosition).toHaveBeenCalledWith([0, 900], { behavior: 'instant' });
  });

  it('gives up waiting after the timeout and restores anyway', () => {
    const { events, scroller, end } = setup();
    Object.defineProperty(html, 'scrollHeight', { configurable: true, value: 300 });
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    events.next(new Scroll(end, [0, 900], null));
    now += 5000;
    frames.shift()?.(0);
    expect(scroller.scrollToPosition).toHaveBeenCalledWith([0, 900], { behavior: 'instant' });
  });

  it('skips navigations that asked for manual scrolling', () => {
    const { events, scroller, end } = setup();
    events.next(new Scroll(end, null, null, 'manual'));
    expect(scroller.scrollToPosition).not.toHaveBeenCalled();
  });
});
