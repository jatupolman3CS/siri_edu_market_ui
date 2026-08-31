import { downloadUrlForStorageKey, resolvePublicUrl } from './api-runtime';

/**
 * Every image the UI shows comes out of R2 through the API, fallbacks included.
 *
 * The placeholders used to be third-party URLs — placehold.co for a missing cover,
 * ui-avatars.com for a user with no picture, an Unsplash photo for the profile editor — which
 * meant a card could only finish rendering if two extra hosts were reachable, and which leaked
 * the viewer's IP (and, for ui-avatars, their display name) to those hosts on every page.
 *
 * The backend's `BrandAssetSeeder` publishes the shipped SVGs to these exact keys on start, so
 * the names below are a contract between the two repos: renaming one here means renaming it there.
 */
export const BRAND_ASSET_KEYS = {
  placeholderCover: 'system/branding/placeholder-cover.svg',
  defaultAvatar: 'system/branding/default-avatar.svg',
  favicon: 'system/branding/favicon.ico',
} as const;

/** Absolute URL of a shipped brand asset, streamed by `GET /api/files/download/{key}`. */
export function brandAssetUrl(key: string): string {
  return downloadUrlForStorageKey(key);
}

export function placeholderCoverUrl(): string {
  return brandAssetUrl(BRAND_ASSET_KEYS.placeholderCover);
}

export function defaultAvatarUrl(): string {
  return brandAssetUrl(BRAND_ASSET_KEYS.defaultAvatar);
}

/** Resolve a backend cover URL, falling back to the R2 placeholder when there is none. */
export function resolveCoverUrl(url: string | null | undefined): string {
  return resolvePublicUrl(url) || placeholderCoverUrl();
}

/** Resolve a backend avatar URL, falling back to the R2 default avatar when there is none. */
export function resolveAvatarUrl(url: string | null | undefined): string {
  return resolvePublicUrl(url) || defaultAvatarUrl();
}

export function faviconUrl(): string {
  return brandAssetUrl(BRAND_ASSET_KEYS.favicon);
}

/**
 * Repoints the browser's tab icon at the R2 copy, so a rebranded icon reaches every tab by
 * republishing the asset rather than by rebuilding and redeploying the UI.
 *
 * `index.html` still ships a `<link rel="icon">` at a local file, which is what the browser uses
 * until the bundle has loaded — without it the tab sits blank for that moment. The href cannot be
 * written into that static file, because the API's base URL is not fixed: it is `localhost:5282`
 * under `ng serve` and a same-origin path base once IIS or nginx is in front. So the markup
 * carries the fallback and this carries the real one.
 *
 * The swap waits for the R2 copy to actually decode. Repointing first and hoping second would
 * throw away a working local icon whenever the API cannot serve the object — which is not
 * hypothetical: an environment whose R2 credentials are still unset answers every download with
 * 501, and the tab would lose its icon for that whole deployment.
 */
export function installFavicon(document: Document): void {
  const href = faviconUrl();
  const probe = new Image();

  probe.addEventListener('load', () => {
    const link =
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]') ??
      document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
    link.type = 'image/x-icon';
    link.href = href;
  });

  // No error handler on purpose: failing to load simply leaves the local icon in place.
  probe.src = href;
}
