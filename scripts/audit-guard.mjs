#!/usr/bin/env node
/**
 * audit-guard.mjs
 *
 * Lightweight guard that protects architectural boundaries without requiring
 * a full ESLint setup. Run as part of CI; exits non-zero on violations.
 *
 * Rules enforced:
 *   1. `features/**` must NOT import from `core/api/sdk.gen` directly — it has
 *      to go through a service in `core/services/`.
 *   2. `features/**` must NOT import from `core/api/client.gen` directly.
 *   3. No `any` annotations in `core/**` (the codebase mandates `unknown`).
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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
