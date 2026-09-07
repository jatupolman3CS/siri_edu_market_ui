import { TestBed } from '@angular/core/testing';
import { AnnouncementPopupService } from './announcement-popup.service';
import type { AnnouncementPopup } from '../models';

/**
 * announcement-popup v1 §4 (`docs/contracts/announcement-popup.md`) — `fetchActive()` is a
 * private method wired to the real `GET /api/announcements/active` (see the dedicated
 * "fetchActive() wiring" describe block at the end of this file for that HTTP-level coverage).
 * The specs below substitute it with a fake in-memory list instead, so the *production*
 * queue/dismiss/sessionStorage logic in `initialize()`/`close()`/`dismissForever()` — the
 * behaviour AC-19 to AC-22 describe — is exercised in isolation from network concerns. That is
 * exactly the seam `fetchActive` exists for.
 */
const DISMISSED_STORAGE_KEY = 'siriedu.announcementsDismissed';

if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

type ServiceWithFetchActive = { fetchActive(): Promise<AnnouncementPopup[]> };

function stubFetchActive(service: AnnouncementPopupService, items: AnnouncementPopup[]) {
  const spy = vi.fn().mockResolvedValue(items);
  (service as unknown as ServiceWithFetchActive).fetchActive = spy;
  return spy;
}

function announcement(id: string, overrides: Partial<AnnouncementPopup> = {}): AnnouncementPopup {
  return {
    id,
    title: `ประกาศ ${id}`,
    images: [
      {
        id: `${id}-img-1`,
        imageUrl: `https://cdn.example.com/${id}-1.jpg`,
        linkUrl: null,
        altText: null,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

function buildService(): AnnouncementPopupService {
  TestBed.configureTestingModule({ providers: [AnnouncementPopupService] });
  return TestBed.inject(AnnouncementPopupService);
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  TestBed.resetTestingModule();
});

describe('AnnouncementPopupService (announcement-popup v1 §4)', () => {
  it('has no current announcement before initialize() resolves anything', () => {
    const service = buildService();
    expect(service.current()).toBeNull();
  });

  it('AC-19: queues every active announcement, head of the queue first', async () => {
    const service = buildService();
    stubFetchActive(service, [announcement('ann-1'), announcement('ann-2')]);

    await service.initialize();

    expect(service.current()?.id).toBe('ann-1');
  });

  it('fetches only once even if initialize() is called again on the same instance', async () => {
    const service = buildService();
    const spy = stubFetchActive(service, [announcement('ann-1')]);

    await service.initialize();
    await service.initialize();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('AC-22: closing the announcement closes the popup for the current session without re-fetch', async () => {
    const service = buildService();
    const spy = stubFetchActive(service, [announcement('ann-1'), announcement('ann-2')]);
    await service.initialize();

    service.close();

    expect(service.current()).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('close() leaves the queue empty and is not an error when called repeatedly', async () => {
    const service = buildService();
    stubFetchActive(service, [announcement('ann-1')]);
    await service.initialize();

    service.close();
    expect(service.current()).toBeNull();

    expect(() => service.close()).not.toThrow();
    expect(service.current()).toBeNull();
  });

  it('AC-20: closing without "ไม่ต้องแสดงอีก" only drops it for this page load — a fresh initialize() (new instance, same sessionStorage) brings it back', async () => {
    const first = buildService();
    stubFetchActive(first, [announcement('ann-1')]);
    await first.initialize();
    first.close();
    expect(first.current()).toBeNull();

    // Simulate a fresh page load: a brand-new root injector (so a brand-new service instance),
    // but sessionStorage is untouched — it is not cleared here.
    TestBed.resetTestingModule();
    const second = buildService();
    stubFetchActive(second, [announcement('ann-1')]);
    await second.initialize();

    expect(second.current()?.id).toBe('ann-1');
  });

  it('AC-21: "ไม่ต้องแสดงอีก" persists to sessionStorage and survives a same-tab reload', async () => {
    const first = buildService();
    stubFetchActive(first, [announcement('ann-1'), announcement('ann-2')]);
    await first.initialize();

    first.dismissForever('ann-1');

    expect(first.current()).toBeNull();
    expect(sessionStorage.getItem(DISMISSED_STORAGE_KEY)).toContain('ann-1');

    // Same-tab reload: new service instance, same (uncleared) sessionStorage.
    TestBed.resetTestingModule();
    const second = buildService();
    stubFetchActive(second, [announcement('ann-1')]);
    await second.initialize();

    expect(second.current()).toBeNull();
  });

  it('dismissing the announcement empties the queue', async () => {
    const service = buildService();
    stubFetchActive(service, [announcement('ann-1')]);
    await service.initialize();

    service.dismissForever('ann-1');

    expect(service.current()).toBeNull();
  });

  it('falls back to an empty dismissed set when sessionStorage.getItem throws (private-browsing style failure)', async () => {
    const service = buildService();
    stubFetchActive(service, [announcement('ann-1')]);
    vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    await expect(service.initialize()).resolves.toBeUndefined();
    expect(service.current()?.id).toBe('ann-1');
  });

  it('dismissForever() never throws even when sessionStorage.setItem throws', async () => {
    const service = buildService();
    stubFetchActive(service, [announcement('ann-1')]);
    await service.initialize();
    vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => service.dismissForever('ann-1')).not.toThrow();
    // The write failed, but the in-memory close() still happened.
    expect(service.current()).toBeNull();
  });

  it('ignores a corrupted (non-JSON) dismissed list instead of throwing', async () => {
    sessionStorage.setItem(DISMISSED_STORAGE_KEY, '{not json');
    const service = buildService();
    stubFetchActive(service, [announcement('ann-1')]);

    await expect(service.initialize()).resolves.toBeUndefined();
    expect(service.current()?.id).toBe('ann-1');
  });
});

/**
 * announcement-popup v1 §3.3/AC-13 — unlike every other test in this file, `fetchActive()` is
 * left untouched here: `globalThis.fetch` is stubbed instead (same technique
 * `admin.service.spec.ts` uses), so this exercises the real generated SDK call
 * (`getApiAnnouncementsActive`) and the `mapAnnouncementPopup` response mapping end to end.
 */
describe('AnnouncementPopupService — fetchActive() wiring (announcement-popup v1 §3.3/AC-13)', () => {
  let realFetch: typeof globalThis.fetch;

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  beforeEach(() => {
    realFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('calls GET /api/announcements/active and maps the response to the domain model', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse([
        {
          id: 'ann-1',
          title: 'ประกาศทดสอบ',
          images: [
            {
              id: 'img-1',
              imageUrl: 'https://cdn.example.com/1.jpg',
              linkUrl: null,
              altText: null,
              sortOrder: 0,
            },
          ],
        },
      ]),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    const service = buildService();

    await service.initialize();

    expect(service.current()).toEqual({
      id: 'ann-1',
      title: 'ประกาศทดสอบ',
      images: [
        {
          id: 'img-1',
          imageUrl: 'https://cdn.example.com/1.jpg',
          linkUrl: null,
          altText: null,
          sortOrder: 0,
        },
      ],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [firstCallInput] = fetchSpy.mock.calls[0];
    const requestUrl =
      firstCallInput instanceof Request ? firstCallInput.url : String(firstCallInput);
    expect(new URL(requestUrl).pathname).toBe('/api/announcements/active');
  });

  it('degrades to an empty (never-throwing) queue when the network call fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof globalThis.fetch;
    const service = buildService();

    await expect(service.initialize()).resolves.toBeUndefined();
    expect(service.current()).toBeNull();
  });
});
