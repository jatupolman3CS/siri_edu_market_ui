import {
  downloadFileFromUrl,
  ensureFilenameExtension,
  extensionOf,
  filenameFromContentDisposition,
  filenameFromUrl,
  openFileFromUrl,
  sanitizeFilename,
} from './file-download';

/**
 * Regression guard for the defect this helper exists to kill: every download in the app was
 * built on `window.open('', '_blank')` + `win.location.href = url`, so a blocked popup made the
 * button do *nothing* — no file, no error, no message. The helper must therefore
 *  - never touch `window.open` on the download path,
 *  - answer `false` (never throw) on every failure mode, so the caller can speak up,
 *  - and free the object URL it created.
 */
describe('downloadFileFromUrl', () => {
  let realFetch: typeof globalThis.fetch;
  let realCreateObjectURL: typeof URL.createObjectURL;
  let realRevokeObjectURL: typeof URL.revokeObjectURL;
  let realCreateElement: typeof document.createElement;
  let realOpen: typeof window.open;

  let fetchMock: ReturnType<typeof vi.fn>;
  let createdUrls: Blob[];
  let revoked: string[];
  let anchors: HTMLAnchorElement[];
  let clicks: number;
  let openMock: ReturnType<typeof vi.fn>;

  function respond(init: {
    ok?: boolean;
    status?: number;
    contentDisposition?: string | null;
    body?: string;
    type?: string;
  }): Response {
    const headers = new Headers();
    if (init.contentDisposition) headers.set('content-disposition', init.contentDisposition);
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      headers,
      blob: async () => new Blob([init.body ?? 'bytes'], { type: init.type ?? 'application/pdf' }),
    } as unknown as Response;
  }

  /** The anchor click is stubbed: jsdom would otherwise try to navigate to the blob: URL. */
  beforeEach(() => {
    realFetch = globalThis.fetch;
    fetchMock = vi.fn(async () => respond({}));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    createdUrls = [];
    revoked = [];
    realCreateObjectURL = URL.createObjectURL;
    realRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      createdUrls.push(blob);
      return `blob:mock/${createdUrls.length}`;
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    }) as unknown as typeof URL.revokeObjectURL;

    anchors = [];
    clicks = 0;
    realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        const anchor = el as HTMLAnchorElement;
        anchor.click = () => {
          clicks += 1;
        };
        anchors.push(anchor);
      }
      return el;
    }) as typeof document.createElement);

    realOpen = window.open;
    openMock = vi.fn(() => null);
    window.open = openMock as unknown as typeof window.open;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
    vi.restoreAllMocks();
    window.open = realOpen;
  });

  /** Lets the `setTimeout(..., 0)` that revokes the object URL run. */
  async function flushRevoke(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  it('fetches once, clicks a hidden anchor with the download attribute, and revokes the object URL', async () => {
    const ok = await downloadFileFromUrl('http://localhost:5282/api/files/download/docs/a.pdf?token=t');

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createdUrls).toHaveLength(1);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute('download')).toBe('a.pdf');
    expect(anchors[0].getAttribute('href')).toBe('blob:mock/1');
    expect(clicks).toBe(1);
    // The anchor must not be left behind in the document.
    expect(anchors[0].isConnected).toBe(false);

    await flushRevoke();
    expect(revoked).toEqual(['blob:mock/1']);
  });

  it('never opens a popup — that is the whole point of the helper', async () => {
    await downloadFileFromUrl('/api/files/download/docs/a.pdf');
    expect(openMock).not.toHaveBeenCalled();
  });

  it('prefers the filename from Content-Disposition over both fallbacks', async () => {
    // What the API actually sends for a Thai title: an ASCII-safe `filename` plus the RFC 5987
    // `filename*` (an HTTP header cannot carry the Thai bytes directly).
    fetchMock.mockResolvedValue(
      respond({
        contentDisposition:
          "attachment; filename=\"doc.pdf\"; filename*=UTF-8''%E0%B9%83%E0%B8%9A%E0%B8%87%E0%B8%B2%E0%B8%99.pdf",
      }),
    );

    await downloadFileFromUrl('/api/files/download/docs/a.pdf', 'fallback.pdf');

    expect(anchors[0].getAttribute('download')).toBe('ใบงาน.pdf');
  });

  it('uses the supplied fallback filename when the header is unreadable', async () => {
    fetchMock.mockResolvedValue(respond({ contentDisposition: null }));

    await downloadFileFromUrl('/api/files/download/docs/a.pdf', 'My listing');

    // The name is the caller's, the `.pdf` is added because the caller's name had no extension.
    expect(anchors[0].getAttribute('download')).toBe('My listing.pdf');
  });

  it('falls back to the last path segment when there is no header and no fallback', async () => {
    fetchMock.mockResolvedValue(respond({ contentDisposition: null }));

    await downloadFileFromUrl('/api/files/download/docs/report%20final.pdf?token=t');

    expect(anchors[0].getAttribute('download')).toBe('report final.pdf');
  });

  it('returns false on a non-ok response and downloads nothing', async () => {
    fetchMock.mockResolvedValue(respond({ ok: false, status: 404 }));

    const ok = await downloadFileFromUrl('/api/files/download/it/stale.pdf');

    expect(ok).toBe(false);
    expect(createdUrls).toHaveLength(0);
    expect(clicks).toBe(0);
  });

  it('returns false (never throws) when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));

    await expect(downloadFileFromUrl('/api/files/download/docs/a.pdf')).resolves.toBe(false);
    expect(clicks).toBe(0);
  });

  it('returns false for an empty URL without calling fetch', async () => {
    const ok = await downloadFileFromUrl('   ');

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * Second defect, reproduced live on `/seller/documents`: the fetch and the anchor click were
   * both correct, but the file landed on disk as `คณิตคิดเร็วมาก` — the *document title*, with no
   * extension, so nothing would open it. `Content-Disposition` is not CORS-safelisted, so across
   * the dev split origin (`:4200` -> `:5282`) the header reads back as `null` and the caller's
   * fallback (a title) is what gets used. The fallback path has to produce a real filename.
   */
  describe('filename hardening', () => {
    it('takes the extension from the URL when the fallback name has none', async () => {
      // `application/octet-stream` maps to nothing, so only the URL can supply the extension.
      fetchMock.mockResolvedValue(respond({ contentDisposition: null, type: 'application/octet-stream' }));

      await downloadFileFromUrl(
        'http://localhost:5282/api/files/download/seller/Math6-2564(1).pdf?token=t',
        'คณิตคิดเร็วมาก',
      );

      expect(anchors[0].getAttribute('download')).toBe('คณิตคิดเร็วมาก.pdf');
    });

    it.each([
      ['application/pdf', 'pdf'],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
      ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
      ['application/zip', 'zip'],
      ['image/jpeg', 'jpg'],
      ['image/png', 'png'],
    ])('takes the extension from the blob MIME type %s when the URL has none either', async (type, extension) => {
      fetchMock.mockResolvedValue(respond({ contentDisposition: null, type }));

      await downloadFileFromUrl('/api/files/download/seller/9f2c1a44-object', 'คณิตคิดเร็วมาก');

      expect(anchors[0].getAttribute('download')).toBe(`คณิตคิดเร็วมาก.${extension}`);
    });

    it('lets a readable Content-Disposition win over both the fallback and the URL', async () => {
      // Production is same-origin behind nginx, so this is the common path once the header is
      // exposed: the server's own name must not be second-guessed.
      fetchMock.mockResolvedValue(
        respond({ contentDisposition: 'attachment; filename="Math6-2564.docx"', type: 'application/pdf' }),
      );

      await downloadFileFromUrl('/api/files/download/seller/other.pdf?token=t', 'คณิตคิดเร็วมาก.zip');

      expect(anchors[0].getAttribute('download')).toBe('Math6-2564.docx');
    });

    it('strips path separators and the characters Windows rejects', async () => {
      fetchMock.mockResolvedValue(respond({ contentDisposition: null }));

      await downloadFileFromUrl('/api/files/download/seller/a.pdf', 'docs/2564: "สรุป" <คณิต>|ป.6*?.pdf');

      const saved = anchors[0].getAttribute('download') ?? '';
      expect(saved).toBe('2564 สรุป คณิต ป.6.pdf');
      expect(saved).not.toMatch(/[\\/:*?"<>|]/);
    });

    it('keeps Thai characters intact', async () => {
      fetchMock.mockResolvedValue(respond({ contentDisposition: null, type: 'application/pdf' }));

      // `ป.6` must not be read as an extension — `6` is not one, so `.pdf` is still appended.
      await downloadFileFromUrl('/api/files/download/seller/9f2c1a44-object', 'ใบงานคณิตศาสตร์ ป.6');

      expect(anchors[0].getAttribute('download')).toBe('ใบงานคณิตศาสตร์ ป.6.pdf');
    });

    it('invents no extension when neither the URL nor the MIME type knows one', async () => {
      fetchMock.mockResolvedValue(respond({ contentDisposition: null, type: 'application/octet-stream' }));

      await downloadFileFromUrl('/api/files/download/seller/9f2c1a44-object', 'คณิตคิดเร็วมาก');

      expect(anchors[0].getAttribute('download')).toBe('คณิตคิดเร็วมาก');
    });

    it('caps the length of an absurd title but keeps its extension', async () => {
      fetchMock.mockResolvedValue(respond({ contentDisposition: null, type: 'application/pdf' }));

      await downloadFileFromUrl('/api/files/download/seller/9f2c1a44-object', 'ก'.repeat(400));

      const saved = anchors[0].getAttribute('download') ?? '';
      expect(saved.length).toBeLessThanOrEqual(150);
      expect(saved.endsWith('.pdf')).toBe(true);
    });
  });
});

describe('openFileFromUrl', () => {
  let realFetch: typeof globalThis.fetch;
  let realCreateObjectURL: typeof URL.createObjectURL;
  let realRevokeObjectURL: typeof URL.revokeObjectURL;
  let realCreateElement: typeof document.createElement;
  let realOpen: typeof window.open;
  let fetchMock: ReturnType<typeof vi.fn>;
  let clicks: number;
  let openMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    realFetch = globalThis.fetch;
    fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: new Headers(),
          blob: async () => new Blob(['bytes'], { type: 'application/pdf' }),
        }) as unknown as Response,
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    realCreateObjectURL = URL.createObjectURL;
    realRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock/inline') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    clicks = 0;
    realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = () => {
          clicks += 1;
        };
      }
      return el;
    }) as typeof document.createElement);

    realOpen = window.open;
    openMock = vi.fn(() => null);
    window.open = openMock as unknown as typeof window.open;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
    vi.restoreAllMocks();
    window.open = realOpen;
  });

  it('opens the object URL in a new tab and reports "opened"', async () => {
    openMock.mockReturnValue({} as Window);

    const outcome = await openFileFromUrl('/api/files/download/docs/a.pdf?inline=true');

    expect(outcome).toBe('opened');
    expect(openMock).toHaveBeenCalledWith('blob:mock/inline', '_blank');
    expect(clicks).toBe(0);
  });

  it('falls back to saving the file when the popup is blocked, and says so', async () => {
    openMock.mockReturnValue(null);

    const outcome = await openFileFromUrl('/api/files/download/docs/a.pdf?inline=true');

    expect(outcome).toBe('downloaded');
    expect(clicks).toBe(1);
  });

  it('reports "failed" when the file cannot be fetched at all', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, headers: new Headers() } as unknown as Response);

    await expect(openFileFromUrl('/api/files/download/it/stale.pdf')).resolves.toBe('failed');
    expect(openMock).not.toHaveBeenCalled();
  });
});

describe('filename parsing', () => {
  it.each([
    ['attachment; filename="a.pdf"', 'a.pdf'],
    ['attachment; filename=a.pdf', 'a.pdf'],
    ["attachment; filename*=UTF-8''report%20final.pdf", 'report final.pdf'],
    ['inline', null],
    ['', null],
    [null, null],
  ])('parses %s', (header, expected) => {
    expect(filenameFromContentDisposition(header)).toBe(expected);
  });

  it('takes the last path segment of a URL, without query or hash', () => {
    expect(filenameFromUrl('/api/files/download/seller/a.pdf?token=t#x')).toBe('a.pdf');
    expect(filenameFromUrl('/api/files/download/')).toBe('download');
    expect(filenameFromUrl('')).toBeNull();
  });

  it.each([
    ['a.pdf', 'pdf'],
    ['Math6-2564(1).PDF', 'pdf'],
    ['archive.tar.gz', 'gz'],
    // `ป.6` is a Thai grade level, not an extension — an extension starts with an ASCII letter.
    ['ใบงานคณิตศาสตร์ ป.6', null],
    ['คณิตคิดเร็วมาก', null],
    ['', null],
    [null, null],
  ])('reads the extension of %s', (name, expected) => {
    expect(extensionOf(name)).toBe(expected);
  });

  const ensureCases: ReadonlyArray<[string, string, string | null, string]> = [
    // no extension -> the URL path answers first
    ['คณิตคิดเร็วมาก', '/api/files/download/s/Math6-2564(1).pdf?token=t', 'image/png', 'คณิตคิดเร็วมาก.pdf'],
    // no extension anywhere in the URL -> the MIME type answers
    ['คณิตคิดเร็วมาก', '/api/files/download/s/9f2c1a44', 'application/zip', 'คณิตคิดเร็วมาก.zip'],
    // nothing derivable -> leave the name alone rather than guess
    ['คณิตคิดเร็วมาก', '/api/files/download/s/9f2c1a44', 'application/octet-stream', 'คณิตคิดเร็วมาก'],
    ['คณิตคิดเร็วมาก', '/api/files/download/s/9f2c1a44', null, 'คณิตคิดเร็วมาก'],
    // already has one -> untouched, whatever the URL and the MIME type say
    ['สรุป.docx', '/api/files/download/s/a.pdf', 'application/pdf', 'สรุป.docx'],
  ];

  it.each(ensureCases)('ensures %s has an extension', (name, url, mimeType, expected) => {
    expect(ensureFilenameExtension(name, url, mimeType)).toBe(expected);
  });

  it.each([
    ['docs/2564/สรุป.pdf', 'สรุป.pdf'],
    ['C:\\temp\\สรุป.pdf', 'สรุป.pdf'],
    ['a:b*c?d"e<f>g|h.pdf', 'a b c d e f g h.pdf'],
    ['  ใบงาน   คณิต  .pdf ', 'ใบงาน คณิต.pdf'],
    ['ใบงานคณิตศาสตร์ ป.6', 'ใบงานคณิตศาสตร์ ป.6'],
    ['..', ''],
    ['', ''],
  ])('sanitizes %s for the filesystem', (name, expected) => {
    expect(sanitizeFilename(name)).toBe(expected);
  });

  it('caps the length without losing the extension', () => {
    const capped = sanitizeFilename(`${'ก'.repeat(400)}.pdf`);

    expect(capped.length).toBeLessThanOrEqual(150);
    expect(capped.endsWith('.pdf')).toBe(true);
  });
});
