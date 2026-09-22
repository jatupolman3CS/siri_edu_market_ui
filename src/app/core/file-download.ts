/**
 * Popup-free file delivery.
 *
 * Every download in the app used to be built on the same pattern:
 *
 *     const win = window.open('', '_blank');   // synchronous, inside the click gesture
 *     ...await the presigned-URL call...
 *     if (win) win.location.href = url;
 *
 * That pattern is only as reliable as the browser's popup heuristics. When `window.open`
 * returns `null` — which it does in Chromium whenever the blank tab is judged unrequested,
 * and always under an automated browser — the handler silently did *nothing*: no tab, no
 * file, no message. Reproduced live on `/seller/documents` and `/admin/approval`: the
 * presigned-URL call answered `200`, the file answered `200`, and the seller/admin got
 * nothing at all.
 *
 * The replacement never opens a popup to download: it fetches the bytes itself and hands the
 * blob to a hidden `<a download>`, which is a same-tab navigation no blocker interferes with.
 * The fetch doubles as the liveness probe the call sites used to run separately (the presigned
 * URL resolves even when the storage object is gone — that answers `404` here and returns
 * `false` — so nobody has to fetch the file twice anymore).
 */

/** Blob URLs are revoked on a macrotask so the download has certainly been queued. */
const DOWNLOAD_REVOKE_DELAY_MS = 0;

/**
 * An inline tab keeps rendering from the blob URL after `window.open` returns, so its URL must
 * outlive this call by a good margin — a revoked URL turns the tab into an error page.
 */
const INLINE_REVOKE_DELAY_MS = 60_000;

const FALLBACK_FILENAME = 'download';

/**
 * Long enough for a Thai document title, short enough that no filesystem rejects it
 * (Windows caps a single path component at 255 UTF-16 units).
 */
const MAX_FILENAME_LENGTH = 150;

/**
 * An extension has to start with an ASCII letter: that is what keeps a Thai title such as
 * `แบบฝึกหัด ป.6` from being read as "base `แบบฝึกหัด ป` + extension `6`".
 */
const EXTENSION_PATTERN = /\.([A-Za-z][A-Za-z0-9]{0,7})$/;

/**
 * Only the types this marketplace actually serves. Anything else (notably the
 * `application/octet-stream` a storage backend sends when it does not know either) deliberately
 * yields nothing: an extensionless name is recoverable, a wrong extension is not.
 */
const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Every character Windows rejects in a filename, plus the control range. Separators are handled first. */
const ILLEGAL_FILENAME_CHARS = /[:*?"<>|\x00-\x1f]/g;

/**
 * Makes `name` safe to hand to `<a download>` on any OS, without touching Thai characters —
 * the titles in this app are Thai and must survive verbatim.
 */
export function sanitizeFilename(name: string): string {
  // A separator means the rest is a directory path: keep the basename, drop the directories.
  const basename = (name ?? '').split(/[\\/]/).filter((part) => part.trim()).pop() ?? '';

  const cleaned = basename
    .replace(ILLEGAL_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // `.` and `..` are directory entries, and Windows strips trailing dots/spaces silently.
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    // Stripping an illegal character can leave a gap before the extension: `a<b>.pdf` -> `a b .pdf`.
    .replace(/ +(\.[A-Za-z][A-Za-z0-9]{0,7})$/, '$1');
  if (!cleaned) return '';

  if (cleaned.length <= MAX_FILENAME_LENGTH) return cleaned;

  // Truncate the base, never the extension — the extension is the part that makes the file open.
  const extension = EXTENSION_PATTERN.exec(cleaned)?.[1] ?? '';
  const suffix = extension ? `.${extension}` : '';
  return `${cleaned.slice(0, MAX_FILENAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
}

/** The extension of a filename (lowercased, no dot), or `null` when it has none. */
export function extensionOf(name: string | null | undefined): string | null {
  const match = EXTENSION_PATTERN.exec((name ?? '').trim());
  return match ? match[1].toLowerCase() : null;
}

/** The extension carried by the URL's own path — query and hash stripped first. */
function extensionFromUrl(url: string): string | null {
  return extensionOf(filenameFromUrl(url));
}

/** The extension implied by a blob's MIME type, for the handful of types the app serves. */
function extensionFromMimeType(type: string | null | undefined): string | null {
  const normalized = (type ?? '').split(';')[0].trim().toLowerCase();
  return EXTENSION_BY_MIME_TYPE[normalized] ?? null;
}

/**
 * Guarantees the saved file opens.
 *
 * `Content-Disposition` is not a CORS-safelisted response header, so in the split-origin dev
 * setup (SPA on `:4200`, API on `:5282`) it reads back as `null` and the caller's fallback name
 * is used instead — and a caller's fallback is typically a *document title*, not a filename.
 * Reproduced live on `/seller/documents`: the browser saved `คณิตคิดเร็วมาก`, extensionless and
 * unopenable. When the name has no extension we take one from the URL path, then from the blob's
 * MIME type, and if neither knows we leave the name alone rather than guess.
 */
export function ensureFilenameExtension(name: string, url: string, mimeType: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed || extensionOf(trimmed)) return trimmed;

  const extension = extensionFromUrl(url) ?? extensionFromMimeType(mimeType);
  return extension ? `${trimmed}.${extension}` : trimmed;
}

/** Result of `openFileFromUrl`: the tab opened, the popup was blocked and we saved instead, or nothing worked. */
export type OpenFileOutcome = 'opened' | 'downloaded' | 'failed';

function canUseDom(): boolean {
  return typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

/**
 * `Content-Disposition: attachment; filename="a.pdf"` / `filename*=UTF-8''a%20b.pdf`.
 * The header is only readable same-origin (or when CORS exposes it); `null` is normal, not an error.
 */
export function filenameFromContentDisposition(header: string | null | undefined): string | null {
  const raw = (header ?? '').trim();
  if (!raw) return null;

  const extended = /filename\*\s*=\s*([^;]+)/i.exec(raw);
  if (extended) {
    const value = extended[1].trim();
    const quoted = value.replace(/^"|"$/g, '');
    const parts = quoted.split("''");
    const encoded = (parts.length > 1 ? parts.slice(1).join("''") : quoted).trim();
    try {
      const decoded = decodeURIComponent(encoded);
      if (decoded) return decoded;
    } catch {
      if (encoded) return encoded;
    }
  }

  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(raw);
  if (plain) {
    const value = (plain[2] ?? plain[1] ?? '').trim().replace(/^"|"$/g, '');
    if (value) return value;
  }

  return null;
}

/** Last path segment of the URL, query/hash stripped — the "better than nothing" filename. */
export function filenameFromUrl(url: string): string | null {
  const withoutQuery = (url ?? '').split(/[?#]/)[0];
  const segment = withoutQuery.split('/').filter(Boolean).pop();
  if (!segment) return null;
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.trim() || null;
  } catch {
    return segment.trim() || null;
  }
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), DOWNLOAD_REVOKE_DELAY_MS);
}

type FetchedFile = { blob: Blob; filename: string };

/** Fetches the bytes once. Returns `null` for every failure mode — this never throws. */
async function fetchFile(url: string, fallbackFilename?: string | null): Promise<FetchedFile | null> {
  const target = (url ?? '').trim();
  if (!target || !canUseDom()) return null;

  let res: Response;
  try {
    res = await fetch(target);
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let blob: Blob;
  try {
    blob = await res.blob();
  } catch {
    return null;
  }

  const fromHeader = filenameFromContentDisposition(res.headers?.get?.('content-disposition'));

  return { blob, filename: resolveFilename(target, fromHeader, fallbackFilename, blob.type) };
}

/**
 * `Content-Disposition` first (that is the server's own answer, and the common path in production
 * where nginx makes the API same-origin), then the caller's fallback, then the URL's last path
 * segment. Whichever wins is sanitized for the filesystem and given an extension if it has none.
 */
function resolveFilename(
  url: string,
  fromHeader: string | null,
  fallbackFilename: string | null | undefined,
  mimeType: string | null | undefined,
): string {
  const candidates = [fromHeader, fallbackFilename, filenameFromUrl(url), FALLBACK_FILENAME];
  const chosen = candidates.map((candidate) => sanitizeFilename(candidate ?? '')).find((candidate) => !!candidate);
  return sanitizeFilename(ensureFilenameExtension(chosen ?? FALLBACK_FILENAME, url, mimeType));
}

/**
 * Downloads `url` straight to the user's disk. Returns `false` (never throws) when the file
 * could not be fetched — the caller is expected to report that to the user.
 */
export async function downloadFileFromUrl(url: string, fallbackFilename?: string): Promise<boolean> {
  const file = await fetchFile(url, fallbackFilename);
  if (!file) return false;

  saveBlob(file.blob, file.filename);
  return true;
}

/**
 * Opens `url` in a new tab for inline viewing. The popup is opened on an object URL that
 * already holds the bytes, so a blocked popup is recoverable: the file is saved instead and
 * the caller is told (`'downloaded'`) so it can explain what happened.
 */
export async function openFileFromUrl(url: string, fallbackFilename?: string): Promise<OpenFileOutcome> {
  const file = await fetchFile(url, fallbackFilename);
  if (!file) return 'failed';

  const objectUrl = URL.createObjectURL(file.blob);
  let opened: Window | null = null;
  try {
    opened = typeof window !== 'undefined' ? window.open(objectUrl, '_blank') : null;
  } catch {
    opened = null;
  }

  if (opened) {
    setTimeout(() => URL.revokeObjectURL(objectUrl), INLINE_REVOKE_DELAY_MS);
    return 'opened';
  }

  URL.revokeObjectURL(objectUrl);
  saveBlob(file.blob, file.filename);
  return 'downloaded';
}
