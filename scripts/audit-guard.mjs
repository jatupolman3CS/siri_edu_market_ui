#!/usr/bin/env node
/**
 * audit-guard.mjs
 *
 * Lightweight guard that protects architectural boundaries without requiring
 * a full ESLint setup. Run as part of CI; exits non-zero on violations.
 *
 * Rules enforced (this list is the real one — every entry below exists in RULES):
 *   1. `features/**` must NOT reach the generated SDK at runtime, by any of its three
 *      entry points: `core/api/sdk.gen`, `core/api/client.gen`, or the `core/api`
 *      barrel that re-exports both. Calls go through a service in `core/services/`.
 *   2. Templates must NOT interpolate a raw date field (B-04 / S-09).
 *   3. Templates must NOT put a `.safe-*` safe-area helper next to a padding utility on the same
 *      side (responsive-ui v1) — the helper replaces that padding with the bare inset.
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * B-04 (S-09): `{{ s.joinedAt }}` shipped `เข้าร่วม 2026-08-20T10:00:00.000Z` to users.
 * The contract types every date as `string` — the backend hands them over as `.ToString("O")` —
 * so TypeScript cannot see the difference between a date and any other string, and nothing
 * caught it. This rule does.
 *
 * An interpolation is fine when it pipes the value (`| date`, `| timeAgo`) or when it calls
 * something (`{{ joinedYear() }}`), which is a formatter by definition.
 */
const DATE_FIELD_RE = /(?:^|[.\s(])[A-Za-z_$][\w$]*(?:At|Date)\b|(?:period(?:Start|End)|deadline|expiry|expires)\b/;

function findRawDateInterpolations(text) {
  const hits = [];
  for (const match of text.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const expression = match[1];
    if (expression.includes('|') || expression.includes('(')) continue;
    if (!DATE_FIELD_RE.test(expression)) continue;

    const line = text.slice(0, match.index).split('\n').length;
    hits.push(`${line}: {{${expression.trim()}}}`);
  }
  return hits;
}

/**
 * F-01 (N-08): this rule used to match the literal path `core/api/sdk.gen`. But
 * `core/api/index.ts` re-exports every function in the SDK, so
 * `import { postApiMarketplaceDocumentsByIdQna } from '../../../core/api'` walked straight
 * past it — five pages under `features/` were calling the SDK directly while the guard
 * reported green. A rule that does not actually bind is worse than no rule at all, because
 * it manufactures confidence in a boundary nobody is holding.
 *
 * Type imports stay legal, both `import type { X }` and inline `{ type X }`: they carry no
 * runtime dependency, and the contract types are the shared vocabulary between a page and
 * the service it calls. `core/api-runtime`, `core/api-mappers/*` and the hand-written
 * wrappers such as `core/api/admin-documents.api` are not the generated SDK and are not
 * matched here.
 */
const SDK_ENTRY_RE = /(?:^|\/)core\/api(?:\/(?:sdk|client)\.gen)?$/;

function runtimeSpecifiers(clause) {
  const braced = clause.match(/\{([\s\S]*)\}/);
  // A default or namespace import binds a value no matter what it is used for.
  if (!braced) return [clause.trim()];
  return braced[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^type\s/.test(s));
}

function findSdkImportsInFeatures(text) {
  const hits = [];
  for (const match of text.matchAll(/import\s+(type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const [, typeOnly, clause, specifier] = match;
    if (!SDK_ENTRY_RE.test(specifier)) continue;
    if (typeOnly) continue;

    const runtime = runtimeSpecifiers(clause);
    if (runtime.length === 0) continue;

    const line = text.slice(0, match.index).split(/\r?\n/).length;
    hits.push(`${line}: ${runtime.join(', ')} from '${specifier}'`);
  }
  return hits;
}

/**
 * responsive-ui v1 gate: `.safe-top` / `.safe-bottom` / `.safe-x` (styles.scss) set a padding
 * side to the safe-area inset ALONE. Next to `px-4 sm:px-6 py-8` they zeroed the 404 page's
 * padding (CTA flush against the screen edge at 375px), the LINE modal's `p-4` and the admin
 * rail footer's `py-2` — on every device, because the inset is 0 wherever there is no notch.
 * An element that has its own padding on a side must compose the inset into that padding with
 * an arbitrary value (`pb-[calc(0.5rem+var(--safe-bottom))]`, `pl-[max(1rem,var(--safe-left))]`)
 * instead of adding the helper.
 *
 * Matches one `class="…"` attribute at a time, variants included (`sm:px-6` clashes with
 * `safe-x` just as much as `px-6` does).
 */
const SAFE_AREA_CLASHES = {
  'safe-top': /^(?:p|py|pt)-/,
  'safe-bottom': /^(?:p|py|pb)-/,
  'safe-x': /^(?:p|px|pl|pr|ps|pe)-/,
};

function findSafeAreaPaddingClashes(text) {
  const hits = [];
  for (const match of text.matchAll(/(?:^|\s)class\s*=\s*"([^"]*)"/g)) {
    const tokens = match[1].split(/\s+/).filter(Boolean);
    // `sm:!-pt-2` → `pt-2`: strip variants, the important flag and a negative sign.
    const bare = tokens.map((t) => t.split(':').pop().replace(/^!/, '').replace(/^-/, ''));
    for (const [helper, clashRe] of Object.entries(SAFE_AREA_CLASHES)) {
      if (!bare.includes(helper)) continue;
      const clashing = tokens.filter((t, i) => clashRe.test(bare[i]));
      if (clashing.length === 0) continue;
      const line = text.slice(0, match.index).split(/\r?\n/).length + (match[0].startsWith('\n') ? 1 : 0);
      hits.push(`${line}: ${helper} + ${clashing.join(' ')}`);
    }
  }
  return hits;
}

const RULES = [
  {
    id: 'no-safe-area-padding-clash',
    pattern: 'src/app/**/*.html',
    matches: findSafeAreaPaddingClashes,
    message:
      '.safe-top/.safe-bottom/.safe-x replace that padding side with the bare safe-area inset (0 on most devices), wiping the co-located padding utility. Compose the inset into the padding instead, e.g. pb-[calc(0.5rem+var(--safe-bottom))] or pl-[max(1rem,var(--safe-left))] — see styles.scss "Safe-area helpers".',
  },
  {
    id: 'no-sdk-in-features',
    pattern: 'src/app/features/**/*.ts',
    matches: findSdkImportsInFeatures,
    message:
      'features/** must NOT call the generated SDK directly — not via sdk.gen, not via client.gen, and not via the core/api barrel that re-exports both. Wrap the call in a service inside core/services/. Type-only imports are fine.',
  },
  {
    id: 'no-raw-date-interpolation',
    pattern: 'src/app/**/*.html',
    matches: findRawDateInterpolations,
    message:
      'Date fields must go through a pipe (| date / | timeAgo). Interpolating one raw prints the ISO string the API sent.',
  },
];

async function listFiles(pattern) {
  const matches = [];
  for await (const file of glob(pattern, { cwd: ROOT })) {
    matches.push(file);
  }
  return matches;
}

const violations = [];

for (const rule of RULES) {
  const files = await listFiles(rule.pattern);
  for (const file of files) {
    const abs = resolve(ROOT, file);
    const text = await readFile(abs, 'utf8');

    if (rule.matches) {
      for (const where of rule.matches(text)) {
        violations.push({
          rule: rule.id,
          file: `${relative(ROOT, abs)}:${where}`,
          message: rule.message,
        });
      }
      continue;
    }

    if (rule.re.test(text)) {
      violations.push({ rule: rule.id, file: relative(ROOT, abs), message: rule.message });
    }
  }
}

if (violations.length === 0) {
  console.log('[audit-guard] OK — no architectural violations found.');
  process.exit(0);
}

console.error(`[audit-guard] found ${violations.length} violation(s):`);
for (const v of violations) {
  console.error(`   - [${v.rule}] ${v.file}\n     ${v.message}`);
}
process.exit(1);
