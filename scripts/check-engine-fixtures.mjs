#!/usr/bin/env node
// Drain 2026-10-27-0710 §4 — fails (exit 1) when a pinned engine fixture is stale, and says WHICH and the ONE command that fixes it. Run by the drain matrix right after the engine sync.
//   node scripts/check-engine-fixtures.mjs [--client <dir>]        (default: this client)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineBundleDigest } from './engine-recording.mjs';
import { FIXTURE_DIR, RERECORD_COMMAND, fixtureProblems } from './engine-fixtures-core.mjs';

const argv = process.argv.slice(2);
const i = argv.indexOf('--client');
const client = i >= 0 ? path.resolve(argv[i + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (name) => JSON.parse(fs.readFileSync(path.join(client, FIXTURE_DIR, name), 'utf8'));
const problems = fixtureProblems({ shipped: load('shipped-notes.json'), comparison: load('rederive-comparison.json'), bundledDigest: engineBundleDigest(path.join(client, 'assets', 'engine', 'forge')) });
if (problems.length === 0) { console.log('check-engine-fixtures: ok (shipped-notes.json and rederive-comparison.json match the bundled engine)'); process.exit(0); }
for (const p of problems) console.error(`STALE: ${p.fixture}: ${p.why}`);
console.error(`check-engine-fixtures: ${problems.length} pinned engine fixture(s) stale. Fix: ${RERECORD_COMMAND}  (then commit test/fixtures/engine-transpile/)`);
process.exit(1);
