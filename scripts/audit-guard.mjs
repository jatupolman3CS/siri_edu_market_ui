#!/usr/bin/env node
/**
 * audit-guard.mjs
 *
 * Lightweight guard that protects architectural boundaries without requiring
 * a full ESLint setup. Run as part of CI; exits non-zero on violations.
 *
 * Rules enforced (this list is the real one — every entry below exists in RULES):
 *   1. `features/**` must NOT import from `core/api/sdk.gen` directly — it has
 *      to go through a service in `core/services/`.
 *   2. `features/**` must NOT import from `core/api/client.gen` directly.
 *   3. Templates must NOT interpolate a raw date field (B-04 / S-09).
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

const RULES = [
  {
    id: 'no-sdk-gen-in-features',
    pattern: 'src/app/features/**/*.ts',
    re: /from\s+['"][^'"]*core\/api\/sdk\.gen['"]/,
    message:
      'features/** must NOT import sdk.gen.ts directly. Wrap the SDK call in a service inside core/services/.',
  },
  {
    id: 'no-client-gen-in-features',
    pattern: 'src/app/features/**/*.ts',
    re: /from\s+['"][^'"]*core\/api\/client\.gen['"]/,
    message:
      'features/** must NOT import client.gen.ts directly. Use a generated SDK helper inside a service.',
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
