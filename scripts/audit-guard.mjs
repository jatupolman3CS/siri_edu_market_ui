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

const RULES = [
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
