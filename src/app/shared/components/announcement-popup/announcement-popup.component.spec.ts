import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AnnouncementPopupComponent } from './announcement-popup.component';
import { AnnouncementPopupService } from '../../../core/services/announcement-popup.service';
import type { AnnouncementImage, AnnouncementPopup } from '../../../core/models';

/**
 * announcement-popup v1 §1/§4 (`docs/contracts/announcement-popup.md`) — AC-19 to AC-25.
 *
 * `AnnouncementPopupService.fetchActive()` is a private, hardcoded round-1 stub (§4 "การแบ่งงาน" —
 * wiring to the real `GET /api/announcements/active` is round 2). These specs grab the real
 * singleton via `TestBed.inject` *before* creating the component (whose constructor calls
 * `initialize()`), and monkey-patch `fetchActive` on it — same technique as
 * `announcement-popup.service.spec.ts` — so the component is exercised against the real
 * production service logic end to end, not a hand-rolled fake.
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

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('AnnouncementPopupComponent (announcement-popup v1 §1/§4)', () => {
  it('AC-19: shows the first announcement automatically once initialize() resolves', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [announcement('ann-1', [image('img-1'), image('img-2')])]);

    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    expect(fixture.componentInstance.popup.current()?.id).toBe('ann-1');
    expect(fixture.componentInstance.popup.current()?.images.length).toBe(2);
  });

  it('AC-22: two active announcements — the second appears immediately after the first closes, same page load', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [
      announcement('ann-1', [image('img-1')]),
      announcement('ann-2', [image('img-2')]),
    ]);

    const fixture = createFixture();
    fixture.detectChanges();
    await settle();
    expect(fixture.componentInstance.popup.current()?.id).toBe('ann-1');

    fixture.componentInstance.popup.close();

    expect(fixture.componentInstance.popup.current()?.id).toBe('ann-2');
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

  it('AC-23: clicking an image with an internal link closes the popup and navigates through the Router', async () => {
    const { service, createFixture } = renderPopup();
    stubFetchActive(service, [announcement('ann-1', [image('img-1', { linkUrl: '/marketplace' })])]);
    const fixture = createFixture();
    fixture.detectChanges();
    await settle();

    const page = fixture.componentInstance;
    page.onImageClick(page.popup.current()!.images[0]);

    expect(navigateByUrl).toHaveBeenCalledWith('/marketplace');
    expect(page.popup.current()).toBeNull();
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
});
