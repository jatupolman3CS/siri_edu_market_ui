#!/usr/bin/env node
/**
 * verify-api-drift.mjs
 *
 * Compare the OpenAPI document served by the running backend against the
 * snapshot committed at `siri_edu_market_ui/openapi.snapshot.json`.
 * Exits non-zero when they differ so CI can fail until the SDK is regenerated.
 *
 * Usage:
 *   node scripts/verify-api-drift.mjs                # diff against snapshot
 *   node scripts/verify-api-drift.mjs --update       # update snapshot
 *   OPENAPI_URL=... node scripts/verify-api-drift.mjs
 *   OPENAPI_FILE=... node scripts/verify-api-drift.mjs   # read a saved document instead
 *
 * OPENAPI_FILE exists for CI, where the document arrives as a build artifact from the
 * backend pipeline rather than from a running server.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, '..', 'openapi.snapshot.json');
const DEFAULT_URL = 'http://localhost:5290/SIRIEDUMARKET.Api/openapi/v1.json';
const url = process.env.OPENAPI_URL ?? DEFAULT_URL;
const localFile = process.env.OPENAPI_FILE;
const updateMode = process.argv.includes('--update');

/**
 * `servers[0].url` carries whatever host and port the document happened to be served from,
 * so it differs between a developer's machine and CI. It is not part of the contract the SDK
 * is generated against, and comparing it turns every pipeline run into a false positive.
 */
function normalise(document) {
  const { servers: _ignored, ...rest } = document ?? {};
  return rest;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const body = keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

async function readSnapshot() {
  try {
    const raw = await readFile(SNAPSHOT_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function fetchLive() {
  if (localFile) {
    return JSON.parse(await readFile(resolve(process.cwd(), localFile), 'utf8'));
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  return await res.json();
}

async function main() {
  let live;
  try {
    live = await fetchLive();
  } catch (err) {
    const source = localFile ? `read ${localFile}` : 'reach backend';
    console.error(`[verify-api-drift] cannot ${source}: ${err.message}`);
    console.error('   set OPENAPI_URL or OPENAPI_FILE, or start the API on http://localhost:5290');
    process.exit(2);
  }

  if (updateMode) {
    await writeFile(SNAPSHOT_PATH, JSON.stringify(live, null, 2) + '\n');
    console.log(`[verify-api-drift] snapshot updated -> ${SNAPSHOT_PATH}`);
    process.exit(0);
  }

  const snapshot = await readSnapshot();
  if (!snapshot) {
    console.error('[verify-api-drift] no snapshot found.');
    console.error('   run with --update once to seed the snapshot.');
    process.exit(3);
  }

  const liveStr = stableStringify(normalise(live));
  const snapStr = stableStringify(normalise(snapshot));
  if (liveStr === snapStr) {
    console.log('[verify-api-drift] OpenAPI matches snapshot.');
    process.exit(0);
  }

  console.error('[verify-api-drift] OpenAPI document drifted from snapshot.');
  console.error('   regenerate the SDK and update the snapshot:');
  console.error('     npm run generate:api');
  console.error('     node scripts/verify-api-drift.mjs --update');
  process.exit(1);
}

await main();
