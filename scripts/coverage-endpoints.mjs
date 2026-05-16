#!/usr/bin/env node
/**
 * coverage-endpoints.mjs
 *
 * Cross-check controllers (.cs) against TypeScript SDK usage to surface:
 *   - orphan-backend  : endpoint exists on the API but no UI service calls it
 *   - orphan-frontend : UI imports an SDK helper that the API does not expose
 *
 * Output: machine-readable summary on stdout; writes detailed report to
 * `coverage.md` next to this script (one level up).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(UI_ROOT, '..');
const BACKEND_CONTROLLERS = resolve(
  REPO_ROOT,
  'siri_edu_market_backend/src/SIRIEDUMARKET.Api/Controllers',
);
const SDK_GEN = resolve(UI_ROOT, 'src/app/app/core/api/sdk.gen.ts');
const SDK_GEN_FALLBACK = resolve(UI_ROOT, 'src/app/core/api/sdk.gen.ts');
const FEATURES_GLOB = 'src/app/**/*.ts';
const REPORT_PATH = resolve(UI_ROOT, 'coverage.md');

/** ------------------------------------------------------------------ */
/** Backend parsing                                                      */
/** ------------------------------------------------------------------ */

const HTTP_RE = /\[Http(Get|Post|Put|Delete|Patch)(?:\(\s*"([^"]*)"\s*\))?\]/g;
const ROUTE_RE = /\[Route\("([^"]*)"\)\]/;

function combinePath(base, rel) {
  if (!rel) return base;
  if (!base) return rel;
  return `${base.replace(/\/$/, '')}/${rel.replace(/^\//, '')}`;
}

async function parseControllers() {
  const endpoints = [];
  for await (const file of glob('*.cs', { cwd: BACKEND_CONTROLLERS })) {
    const abs = resolve(BACKEND_CONTROLLERS, file);
    const text = await readFile(abs, 'utf8');
    const baseRoute = (text.match(ROUTE_RE)?.[1] ?? '').trim();
    let m;
    while ((m = HTTP_RE.exec(text)) !== null) {
      const verb = m[1].toUpperCase();
      const route = m[2] ?? '';
      const fullRoute = combinePath(baseRoute, route);
      endpoints.push({ verb, route: fullRoute, controller: file });
    }
    HTTP_RE.lastIndex = 0;
  }
  return endpoints;
}

/** ------------------------------------------------------------------ */
/** Frontend parsing                                                    */
/** ------------------------------------------------------------------ */

const SDK_FN_RE = /^export const ((?:get|post|put|delete|patch)Api[A-Za-z0-9]+)\s*=/gm;
const URL_LITERAL_RE = /url:\s*'([^']+)'/;

async function readSdkGen() {
  for (const candidate of [SDK_GEN, SDK_GEN_FALLBACK]) {
    try {
      return { text: await readFile(candidate, 'utf8'), path: candidate };
    } catch {
      continue;
    }
  }
  throw new Error(`could not locate sdk.gen.ts (looked in ${SDK_GEN} and ${SDK_GEN_FALLBACK})`);
}

async function parseSdk() {
  const { text } = await readSdkGen();
  const fns = new Map();
  let m;
  while ((m = SDK_FN_RE.exec(text)) !== null) {
    const name = m[1];
    const tail = text.slice(m.index, m.index + 800);
    const url = tail.match(URL_LITERAL_RE)?.[1] ?? null;
    const verb = name.match(/^(get|post|put|delete|patch)/)?.[1]?.toUpperCase() ?? null;
    fns.set(name, { verb, url });
  }
  SDK_FN_RE.lastIndex = 0;
  return fns;
}

async function findSdkUsage(sdkFns) {
  const used = new Set();
  for await (const file of glob(FEATURES_GLOB, { cwd: UI_ROOT })) {
    const abs = resolve(UI_ROOT, file);
    if (abs.includes('node_modules') || abs.includes('dist')) continue;
    if (abs.endsWith('sdk.gen.ts')) continue;
    const text = await readFile(abs, 'utf8');
    for (const name of sdkFns.keys()) {
      const re = new RegExp(`\\b${name}\\b`);
      if (re.test(text)) used.add(name);
    }
  }
  return used;
}

/** ------------------------------------------------------------------ */
/** Matching                                                            */
/** ------------------------------------------------------------------ */

function normalizeRoute(route) {
  return (route ?? '')
    .replace(/^\/?SIRIEDUMARKET\.Api\//i, '')
    .replace(/^\/+/, '/')
    .replace(/\{[^}]+\}/g, '{}')
    .toLowerCase();
}

function buildBackendIndex(endpoints) {
  const byKey = new Map();
  for (const ep of endpoints) {
    const key = `${ep.verb} ${normalizeRoute('/' + ep.route.replace(/^\//, ''))}`;
    byKey.set(key, ep);
  }
  return byKey;
}

function sdkKey(verb, url) {
  if (!verb || !url) return null;
  return `${verb} ${normalizeRoute(url)}`;
}

/** ------------------------------------------------------------------ */
/** Main                                                                */
/** ------------------------------------------------------------------ */

async function main() {
  const endpoints = await parseControllers();
  const sdkFns = await parseSdk();
  const used = await findSdkUsage(sdkFns);
  const backendIndex = buildBackendIndex(endpoints);

  const orphanFrontend = [];
  for (const [name, info] of sdkFns) {
    const key = sdkKey(info.verb, info.url);
    if (!key || !backendIndex.has(key)) {
      orphanFrontend.push({ name, ...info });
    }
  }

  const sdkKeysUsed = new Set();
  for (const name of used) {
    const info = sdkFns.get(name);
    const key = sdkKey(info?.verb, info?.url);
    if (key) sdkKeysUsed.add(key);
  }

  const orphanBackend = [];
  for (const [key, ep] of backendIndex) {
    if (!sdkKeysUsed.has(key)) orphanBackend.push({ key, ...ep });
  }

  const unused = [...sdkFns.keys()].filter((n) => !used.has(n));

  const lines = [
    '# Endpoint coverage report',
    '',
    `- backend endpoints parsed: **${endpoints.length}**`,
    `- SDK functions exported: **${sdkFns.size}**`,
    `- SDK functions imported by app code: **${used.size}**`,
    `- orphan frontend (SDK -> no backend route match): **${orphanFrontend.length}**`,
    `- orphan backend (route -> no SDK call): **${orphanBackend.length}**`,
    `- unused SDK exports (defined but never imported): **${unused.length}**`,
    '',
    '## Orphan frontend',
    '',
    orphanFrontend.length === 0
      ? '_none_'
      : orphanFrontend
          .map((o) => `- \`${o.name}\` -> ${o.verb ?? '?'} ${o.url ?? '?'}`)
          .join('\n'),
    '',
    '## Orphan backend',
    '',
    orphanBackend.length === 0
      ? '_none_'
      : orphanBackend.map((o) => `- ${o.verb} \`${o.route}\` (${o.controller})`).join('\n'),
    '',
    '## Unused SDK exports',
    '',
    unused.length === 0 ? '_none_' : unused.map((n) => `- \`${n}\``).join('\n'),
    '',
  ];

  await writeFile(REPORT_PATH, lines.join('\n'));

  const summary = {
    backend: endpoints.length,
    sdk: sdkFns.size,
    used: used.size,
    orphanFrontend: orphanFrontend.length,
    orphanBackend: orphanBackend.length,
    unused: unused.length,
    reportPath: relative(REPO_ROOT, REPORT_PATH),
  };

  console.log(JSON.stringify(summary, null, 2));
  if (orphanFrontend.length > 0) {
    process.exit(1);
  }
}

await main();
