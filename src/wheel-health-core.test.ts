// Drain 2026-08-21-2310 — a corrupt wheel must not read as success.
//
// CCQA BRAT smoke step 8 corrupted music21's cached wheel
// (length-preserving). Everything mechanical worked; every claim
// about it lied or whispered:
//   1. the mount stage logged "wheels are hydrated + sha256-verified
//      at onload" — nothing was hashed at that moment; the onload
//      check is byte-length presence (drain 1200's accepted design).
//   2. extraction correctly caught BadZipFile and degraded — but
//      console-only.
//   3. music21 import FAILED and the engine still said `ready`.
//
// Three parts, one defect: dishonest health reporting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { planHydration, type HydrationFs } from './brat-hydration-core.ts';
import {
  wheelMountClaim,
  parseWheelExtractFailures,
  deriveRuntimeHealth,
  wheelExtractPanelEntry,
  corruptWheelCachePath,
} from './wheel-health-core.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

// ---------------------------------------------------------------- (a)

test('(a) a length-preserving corruption passes the onload presence check', async () => {
  // The fixture that made the old claim a lie: file present, right
  // byte count, wrong bytes. planHydration cannot tell — by design.
  const asset = { relpath: 'wheels/music21-8.3.0-py3-none-any.whl', bytes: 100, sha256: 'aa' };
  const hfs: HydrationFs = {
    exists: async () => true,
    size: async () => 100,
    read: async () => new Uint8Array(100),
    write: async () => {},
    remove: async () => {},
    mkdirp: async () => {},
  } as unknown as HydrationFs;
  const plan = await planHydration('0.2.364', hfs, 'plug', { 'music21.whl': asset });
  assert.equal(plan.complete, true, 'the corrupt cache reads as complete — length only');
  assert.equal(
    plan.artifacts[0].state,
    'present-cached',
    'the cached state must not claim verification it did not perform',
  );
});

test('(a) the mount claim states what was checked, and does not say verified', () => {
  const claim = wheelMountClaim({ wheelCount: 11, pluginVersion: '0.2.364' });
  assert.ok(claim.includes('11'));
  assert.ok(claim.includes('0.2.364'));
  assert.ok(
    !/sha256-verified|verified at onload/.test(claim),
    'nothing is hashed at mount time; the message must not claim it is',
  );
  assert.match(
    claim,
    /presence/i,
    'say what was actually checked: presence (byte length)',
  );
});

test('(a) the old overclaiming string is gone from the mount stage', () => {
  const src = fs.readFileSync(path.join(REPO, 'src', 'pyodide-host.ts'), 'utf8');
  assert.ok(
    !src.includes('hydrated + sha256-verified at onload'),
    'the mount stage must not claim onload sha256 verification',
  );
  assert.ok(src.includes('wheelMountClaim'), 'mount stage uses the honest claim');
});

// ---------------------------------------------------------------- (b)

test('(b) extract failures are parsed out of the Python stage, not just printed', () => {
  const failures = parseWheelExtractFailures([
    'music21-8.3.0-py3-none-any.whl: BadZipFile: Bad CRC-32 for file ...',
  ]);
  assert.deepEqual(failures, [
    { wheel: 'music21-8.3.0-py3-none-any.whl', error: 'BadZipFile: Bad CRC-32 for file ...' },
  ]);
});

test('(b) a corrupt wheel produces a panel entry naming it and the recovery', () => {
  const entry = wheelExtractPanelEntry(
    [{ wheel: 'music21-8.3.0-py3-none-any.whl', error: 'BadZipFile: Bad CRC-32' }],
    { deleted: ['music21-8.3.0-py3-none-any.whl'] },
  );
  assert.match(entry.title, /damaged|corrupt/i);
  const body = entry.lines.join('\n');
  assert.ok(body.includes('music21-8.3.0-py3-none-any.whl'), 'names the wheel');
  assert.ok(body.includes('BadZipFile'), 'quotes the real error');
  assert.match(body, /re-download[^.]*next launch/i, 'states the recovery');
  assert.match(body, /restart obsidian/i, 'tells the user what to do');
});

test('(b) the corrupt cached wheel is deleted so hydration refetches it', async () => {
  const p = corruptWheelCachePath('forge-client-obsidian', 'music21-8.3.0-py3-none-any.whl');
  assert.equal(
    p,
    '.obsidian/plugins/forge-client-obsidian/assets/wheels/music21-8.3.0-py3-none-any.whl',
  );
  // And with it gone, the next launch's plan marks it pending —
  // i.e. it will be refetched AND sha256-verified at fetch time.
  const asset = { relpath: 'wheels/music21-8.3.0-py3-none-any.whl', bytes: 100, sha256: 'aa' };
  const hfs = {
    exists: async () => false,
    size: async () => 0,
  } as unknown as HydrationFs;
  const plan = await planHydration('0.2.364', hfs, 'plug', { 'music21.whl': asset });
  assert.equal(plan.pending.length, 1);
  assert.equal(plan.complete, false);
});

test('(b) the extract stage reaches the panel, not console only', () => {
  const src = fs.readFileSync(path.join(REPO, 'src', 'pyodide-host.ts'), 'utf8');
  assert.ok(src.includes('wheelExtractPanelEntry'), 'panel entry is built');
  assert.ok(
    /appendMessage|appendError/.test(src),
    'the entry is written to the Forge Output panel',
  );
});

// ---------------------------------------------------------------- (c)

test('(c) a failed import is never indistinguishable from healthy', () => {
  const healthy = deriveRuntimeHealth({ extractFailures: [], importFailures: [] });
  assert.equal(healthy.status, 'ready');
  assert.deepEqual(healthy.missing, []);

  const degraded = deriveRuntimeHealth({
    extractFailures: [{ wheel: 'music21-8.3.0-py3-none-any.whl', error: 'BadZipFile' }],
    importFailures: ['music21'],
  });
  assert.notEqual(degraded.status, 'ready');
  assert.equal(degraded.status, 'degraded');
  assert.deepEqual(degraded.missing, ['music21']);
  assert.ok(degraded.summary.includes('music21'), 'names the missing capability');
  assert.notEqual(degraded.summary, healthy.summary);
});

test('(c) an extract failure alone still degrades, even if the probe passed', () => {
  const h = deriveRuntimeHealth({
    extractFailures: [{ wheel: 'chardet-5.2.0-py3-none-any.whl', error: 'BadZipFile' }],
    importFailures: [],
  });
  assert.equal(h.status, 'degraded');
  assert.ok(h.summary.includes('chardet-5.2.0-py3-none-any.whl'));
});

test('(c) the engine-ready log reflects health', () => {
  const src = fs.readFileSync(path.join(REPO, 'src', 'pyodide-host.ts'), 'utf8');
  assert.ok(src.includes('deriveRuntimeHealth'), 'readiness is derived, not assumed');
  assert.ok(
    !/console\.log\(`Forge: engine ready in \$\{\(performance/.test(src),
    'the unconditional "engine ready" log must be health-aware',
  );
});
