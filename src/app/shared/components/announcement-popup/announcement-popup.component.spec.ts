import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AnnouncementPopupComponent } from './announcement-popup.component';
import { AnnouncementPopupService } from '../../../core/services/announcement-popup.service';
import type { AnnouncementImage, AnnouncementPopup } from '../../../core/models';

/**
 * announcement-popup v4 §0.2/§1.10/§1.11/§1.12/§4 (`docs/contracts/announcement-popup.md`) —
 * AC-19 to AC-25, AC-28 to AC-32.
 *
 * [v3] `nz-carousel` is gone — the image slider is a plain `signal<number>` index, and the
 * "ไม่ต้องแสดงอีก" button is now a checkbox that only takes effect through `closeCurrent()` when
 * the popup is actually closed (§1.11).
 *
 * [v4] `[nzVisible]` is now driven by `isModalVisible()`, not `!!popup.current()` directly, and
 * always cycles `true→false→true` through `(nzAfterClose)` when the announcement changes (§1.12)
 * — this is what actually fixes AC-31 (closing a non-last announcement in the queue used to hang
 * forever, §0.2). Note that `fixture.detectChanges()`/TestBed here forces *synchronous* change
 * detection and `nz-modal`'s real leave animation never plays in these specs, so tests that
 * simulate "close, then the next announcement opens" call `component.onModalAfterClose()`
 * directly instead of waiting on a real animation timer (per §4's note on this file) — the
 * genuinely browser-dependent regression (AC-20/AC-30/AC-31 against a real `nz-modal`) is verified
 * separately against a real browser per §4, not here.
 *
 * `AnnouncementPopupService.fetchActive()` is a private method wired to the real
 * `GET /api/announcements/active` in production. These specs grab the real singleton via
 * `TestBed.inject` *before* creating the component (whose constructor calls `initialize()`), and
 * monkey-patch `fetchActive` on it — same technique as `announcement-popup.service.spec.ts` — so
 * the component is exercised against the real production service logic end to end, not a
 * hand-rolled fake.
 */
type ServiceWithFetchActive = { fetchActive(): Promise<AnnouncementPopup[]> };

function stubFetchActive(service: AnnouncementPopupService, items: AnnouncementPopup[]): void {
  (service as unknown as ServiceWithFetchActive).fetchActive = vi.fn().mockResolvedValue(items);
}

function image(id: string, overrides: Partial<AnnouncementImage> = {}): AnnouncementImage {
  return {
    id,
    imageUrl: `https://cdn.example.com/${id}.jpg`,
    linkUrl: null,
    altText: null,
    sortOrder: 0,
    ...overrides,
  };
}

function announcement(id: string, images: AnnouncementImage[]): AnnouncementPopup {
  return { id, title: `ประกาศ ${id}`, images };
}

const DISMISSED_STORAGE_KEY = 'siriedu.announcementsDismissed';

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

let navigateByUrl: ReturnType<typeof vi.fn>;

function renderPopup(): {
  service: AnnouncementPopupService;
  createFixture: () => ReturnType<typeof TestBed.createComponent<AnnouncementPopupComponent>>;
} {
  navigateByUrl = vi.fn();
  TestBed.configureTestingModule({
    imports: [AnnouncementPopupComponent],
    providers: [{ provide: Router, useValue: { navigateByUrl } }],
  });

  const service = TestBed.inject(AnnouncementPopupService);
  return {
    service,
    createFixture: () => TestBed.createComponent(AnnouncementPopupComponent),
  };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  TestBed.resetTestingModule();
});

describe('AnnouncementPopupComponent (announcement-popup v3 §1.10/§1.11/§4)', () => {
  it('AC-19: shows the first announcement automatically once initialize() resolves, with an index-based slider (no nz-carousel)', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [announcement('ann-1', [image('img-1'), image('img-2')])]);

    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    const page = fixture.componentInstance;
    expect(page.popup.current()?.id).toBe('ann-1');
    expect(page.popup.current()?.images.length).toBe(2);
    expect(page.currentImageIndex()).toBe(0);

    page.nextImage();
    expect(page.currentImageIndex()).toBe(1);

    // wrap-around (§1.10)
    page.nextImage();
    expect(page.currentImageIndex()).toBe(0);
    page.prevImage();
    expect(page.currentImageIndex()).toBe(1);

    page.goToImage(0);
    expect(page.currentImageIndex()).toBe(0);
  });

  it('AC-21: checking "ไม่ต้องแสดงอีก" then closing via closeCurrent() persists dismiss-forever and survives a simulated reload', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [
      announcement('ann-1', [image('img-1')]),
      announcement('ann-2', [image('img-2')]),
    ]);
    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    const page = fixture.componentInstance;
    page.toggleDontShowAgain(true);
    page.closeCurrent();

    expect(page.popup.current()).toBeNull();
    expect(page.isModalVisible()).toBe(false);
    expect(sessionStorage.getItem(DISMISSED_STORAGE_KEY)).toContain('ann-1');

    // Simulate a same-tab reload: fresh service instance, same (uncleared) sessionStorage.
    TestBed.resetTestingModule();
    const { service: service2, createFixture: createFixture2 } = renderPopup();
    stubFetchActive(service2, [
      announcement('ann-1', [image('img-1')]),
      announcement('ann-2', [image('img-2')]),
    ]);
    const fixture2 = createFixture2();
    fixture2.detectChanges();
    await settle();

    expect(fixture2.componentInstance.popup.current()).toBeNull();
    expect(fixture2.componentInstance.isModalVisible()).toBe(false);
  });

  it('AC-22: closing via closeCurrent() closes the modal completely and stays closed on afterClose', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [
      announcement('ann-1', [image('img-1')]),
      announcement('ann-2', [image('img-2')]),
    ]);

    const fixture = createFixture();
    fixture.detectChanges();
    await settle();
    const page = fixture.componentInstance;
    expect(page.popup.current()?.id).toBe('ann-1');
    expect(page.isModalVisible()).toBe(true);

    page.closeCurrent();
    fixture.detectChanges();
    await settle();

    expect(page.popup.current()).toBeNull();
    expect(page.isModalVisible()).toBe(false);

    page.onModalAfterClose();
    fixture.detectChanges();
    await settle();

    expect(page.isModalVisible()).toBe(false);
  });

  it('AC-31: closing the announcement closes the modal immediately and does not chain-open other announcements', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [
      announcement('ann-1', [image('img-1')]),
      announcement('ann-2', [image('img-2')]),
      announcement('ann-3', [image('img-3')]),
    ]);

    const fixture = createFixture();
    fixture.detectChanges();
    await settle();
    const page = fixture.componentInstance;
    expect(page.popup.current()?.id).toBe('ann-1');
    expect(page.isModalVisible()).toBe(true);

    // Close announcement via X (closeCurrent()).
    page.closeCurrent();
    fixture.detectChanges();
    await settle();
    expect(page.popup.current()).toBeNull();
    expect(page.isModalVisible()).toBe(false);

    page.onModalAfterClose();
    fixture.detectChanges();
    await settle();
    expect(page.isModalVisible()).toBe(false);
  });

  it('fallbackAlt() builds a meaningful alt from the title and 1-based index when altText is blank', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [announcement('ann-1', [image('img-1')])]);
    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    const page = fixture.componentInstance;
    const current = page.popup.current()!;
    expect(page.fallbackAlt(current.images[0], 0)).toBe('ประกาศ ann-1 - รูปที่ 1');
  });

  it('AC-23: clicking an image with an internal link closes the popup (honoring the checkbox) and navigates through the Router', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [announcement('ann-1', [image('img-1', { linkUrl: '/marketplace' })])]);
    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    const page = fixture.componentInstance;
    page.toggleDontShowAgain(true);
    page.onImageClick(page.popup.current()!.images[0]);

    expect(navigateByUrl).toHaveBeenCalledWith('/marketplace');
    expect(page.popup.current()).toBeNull();
    expect(sessionStorage.getItem(DISMISSED_STORAGE_KEY)).toContain('ann-1');
  });

  it('AC-24: clicking an image with an external link closes the popup and opens a new tab, without navigating the current page', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [
      announcement('ann-1', [image('img-1', { linkUrl: 'https://example.com/promo' })]),
    ]);
    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    const page = fixture.componentInstance;
    page.onImageClick(page.popup.current()!.images[0]);

    expect(openSpy).toHaveBeenCalledWith('https://example.com/promo', '_blank', 'noopener');
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(page.popup.current()).toBeNull();
  });

  it('AC-25: clicking an image with no link does nothing and leaves the popup open', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [announcement('ann-1', [image('img-1', { linkUrl: null })])]);
    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    const page = fixture.componentInstance;
    page.onImageClick(page.popup.current()!.images[0]);

    expect(openSpy).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(page.popup.current()?.id).toBe('ann-1');
  });

  it('AC-28: checking "ไม่ต้องแสดงอีก" alone does not close the popup or write sessionStorage yet', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [announcement('ann-1', [image('img-1')])]);
    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    const page = fixture.componentInstance;
    page.toggleDontShowAgain(true);

    expect(page.popup.current()?.id).toBe('ann-1');
    expect(page.dontShowAgainChecked()).toBe(true);
    expect(sessionStorage.getItem(DISMISSED_STORAGE_KEY)).toBeNull();
  });

  it('AC-29: closing without checking "ไม่ต้องแสดงอีก" via closeCurrent() behaves like a plain close — no sessionStorage write', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [
      announcement('ann-1', [image('img-1')]),
      announcement('ann-2', [image('img-2')]),
    ]);
    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    const page = fixture.componentInstance;
    page.closeCurrent();
    expect(page.popup.current()).toBeNull();
    expect(sessionStorage.getItem(DISMISSED_STORAGE_KEY)).toBeNull();
  });

  it('keyboard arrow handlers are safe no-ops when no announcement is showing', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, []);
    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    const page = fixture.componentInstance;
    expect(page.popup.current()).toBeNull();
    expect(() => page.onArrowLeft()).not.toThrow();
    expect(() => page.onArrowRight()).not.toThrow();
  });

  it('keyboard arrow handlers move the slider index the same way prevImage()/nextImage() do', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [announcement('ann-1', [image('img-1'), image('img-2'), image('img-3')])]);
    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    const page = fixture.componentInstance;
    expect(page.currentImageIndex()).toBe(0);
    page.onArrowRight();
    expect(page.currentImageIndex()).toBe(1);
    page.onArrowLeft();
    expect(page.currentImageIndex()).toBe(0);
  });
});
