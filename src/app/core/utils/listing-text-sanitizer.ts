/**
 * Removes common external contact / profile patterns from listing copy.
 * Platform policy: no direct off-site contact in descriptions.
 */
export function sanitizeListingPlainText(input: string): string {
  let s = input;
  // URLs (http, https, www)
  s = s.replace(/\bhttps?:\/\/[^\s]+/gi, '');
  s = s.replace(/\bwww\.[^\s]+/gi, '');
  // Email
  s = s.replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, '');
  // Thai mobile-style 0xx-xxx-xxxx
  s = s.replace(/\b0[689]\d(?:[-\s]?\d){8}\b/g, '');
  // LINE / social hints
  s = s.replace(/\b(line\s*id|ไลน์|line\s*@)\s*[:@]?\s*\S+/gi, '');
  s = s.replace(/\b(facebook|fb\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com)\b[^\s]*/gi, '');
  // Collapse excessive whitespace left by removals
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/(\n[ \t]*){3,}/g, '\n\n');
  return s.trim();
}
