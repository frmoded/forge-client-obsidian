// Tests for the BRAT Phase 1 hydration core (drain 2026-08-19-0900).
// Everything runs against in-memory stubs and a local fixture manifest —
// no network, per §4-5 ("do NOT hit GitHub in CI").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  assetUrl, planHydration, fetchVerified, hydrate,
  hydrationNotice, progressNotice, offlineNotice, RELEASE_BASE,
  type HydrationFs, type HydrationNet, type Digest,
} from './brat-hydration-core.ts';

const digest: Digest = async (b) => createHash('sha256').update(b).digest('hex');
const bytesOf = (s: string) => new TextEncoder().encode(s);
const sha = (s: string) => createHash('sha256').update(bytesOf(s)).digest('hex');

const WHEEL = 'demo-1.0-py3-none-any.whl';
const WASM = 'pyodide.asm.wasm';
const MANIFEST = {
  [WHEEL]: { relpath: `wheels/${WHEEL}`, sha256: sha('WHEELBYTES'), bytes: 10 },
  [WASM]: { relpath: `pyodide/${WASM}`, sha256: sha('WASM'), bytes: 4 },
};

function memFs(seed: Record<string, string> = {}) {
  const files = new Map<string, Uint8Array>(
    Object.entries(seed).map(([k, v]) => [k, bytesOf(v)]),
  );
  const fs: HydrationFs & { files: Map<string, Uint8Array> } = {
    files,
    async exists(p) { return files.has(p); },
    async size(p) { return files.get(p)?.length ?? -1; },
    async write(p, b) { files.set(p, b); },
    async remove(p) { files.delete(p); },
  };
  return fs;
}

function net(table: Record<string, { status: number; body: string }>): HydrationNet {
  return {
    async get(url) {
      const hit = table[url];
      if (!hit) throw new Error(`ENOTFOUND ${url}`);
      return { status: hit.status, bytes: bytesOf(hit.body) };
    },
  };
}

const DIR = '.obsidian/plugins/forge-client-obsidian';
const urlFor = (n: string) => `${RELEASE_BASE}/v0.2.363/${n}`;

// -- §8: no third-party CDN, never "latest" --------------------------------

test('the URL is this repo, pinned to the running version — no third-party host', async () => {
  const u = assetUrl('0.2.363', WHEEL);
  assert.equal(u, `https://github.com/frmoded/forge-client-obsidian/releases/download/v0.2.363/${WHEEL}`);
  assert.ok(!/jsdelivr|unpkg|pypi|pythonhosted/i.test(u), 'no third-party CDN in the fetch path');
  assert.ok(u.includes('/v0.2.363/'), 'pinned to the running version');
});

test('an empty version is refused rather than silently becoming "latest"', () => {
  assert.throws(() => assetUrl('', WHEEL), /unpinned/);
});

// -- planning --------------------------------------------------------------

test('a BRAT-shaped install (no assets/) plans every artifact as absent', async () => {
  const plan = await planHydration('0.2.363', memFs(), DIR, MANIFEST);
  assert.equal(plan.complete, false);
  assert.equal(plan.pending.length, 2);
  assert.equal(plan.pendingBytes, 14);
  assert.equal(plan.totalBytes, 14);
  assert.deepEqual(plan.artifacts.map((a) => a.state), ['absent', 'absent']);
});

test('a full zip install needs no network at all', async () => {
  const fs = memFs({
    [`${DIR}/assets/wheels/${WHEEL}`]: 'WHEELBYTES',
    [`${DIR}/assets/pyodide/${WASM}`]: 'WASM',
  });
  const plan = await planHydration('0.2.363', fs, DIR, MANIFEST);
  assert.equal(plan.complete, true, 'the zip path must keep working unchanged');
  assert.equal(plan.pendingBytes, 0);
});

test('a truncated artifact from a killed launch is re-planned, not trusted', async () => {
  const fs = memFs({ [`${DIR}/assets/pyodide/${WASM}`]: 'WA' });   // short
  const plan = await planHydration('0.2.363', fs, DIR, MANIFEST);
  assert.equal(plan.pending.some((p) => p.name === WASM), true);
});

// -- verification ----------------------------------------------------------

test('a good artifact verifies and is written', async () => {
  const fs = memFs();
  const plan = await planHydration('0.2.363', fs, DIR, MANIFEST);
  const target = plan.pending.find((p) => p.name === WASM)!;
  const out = await fetchVerified(target, net({ [urlFor(WASM)]: { status: 200, body: 'WASM' } }), fs, digest);
  assert.equal(out.ok, true);
  assert.equal(fs.files.has(`${DIR}/assets/pyodide/${WASM}`), true);
  assert.equal(target.state, 'verified-cached');
});

test('a TAMPERED artifact is never written to disk', async () => {
  const fs = memFs();
  const plan = await planHydration('0.2.363', fs, DIR, MANIFEST);
  const target = plan.pending.find((p) => p.name === WASM)!;
  const out = await fetchVerified(target, net({ [urlFor(WASM)]: { status: 200, body: 'EVIL' } }), fs, digest);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'hash');
  assert.equal(fs.files.has(`${DIR}/assets/pyodide/${WASM}`), false,
    'unverified bytes must never reach disk');
});

test('a tampered artifact also clears any stale file, so the retry starts clean', async () => {
  const dest = `${DIR}/assets/pyodide/${WASM}`;
  const fs = memFs({ [dest]: 'STALE' });
  const plan = await planHydration('0.2.363', fs, DIR, MANIFEST);
  const target = plan.artifacts.find((p) => p.name === WASM)!;
  await fetchVerified(target, net({ [urlFor(WASM)]: { status: 200, body: 'EVIL' } }), fs, digest);
  assert.equal(fs.files.has(dest), false, 'no half-hydrated state left behind');
});

test('a 404 reports http and writes nothing (the Phase 0 failure mode)', async () => {
  const fs = memFs();
  const plan = await planHydration('0.2.363', fs, DIR, MANIFEST);
  const target = plan.pending.find((p) => p.name === WASM)!;
  const out = await fetchVerified(target, net({ [urlFor(WASM)]: { status: 404, body: '' } }), fs, digest);
  assert.equal(out.reason, 'http');
  assert.equal(out.detail, 'HTTP 404');
  assert.equal(fs.files.size, 0);
});

test('an offline launch reports network rather than throwing', async () => {
  const fs = memFs();
  const plan = await planHydration('0.2.363', fs, DIR, MANIFEST);
  const out = await fetchVerified(plan.pending[0], net({}), fs, digest);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'network');
});

// -- the state machine ----------------------------------------------------

test('absent → downloading → verified-cached → ready', async () => {
  const fs = memFs();
  const plan = await planHydration('0.2.363', fs, DIR, MANIFEST);
  const seen: string[] = [];
  const res = await hydrate(plan, net({
    [urlFor(WHEEL)]: { status: 200, body: 'WHEELBYTES' },
    [urlFor(WASM)]: { status: 200, body: 'WASM' },
  }), fs, digest, (p) => seen.push(`${p.done}/${p.total}`));
  assert.equal(res.ok, true);
  assert.equal(res.fetched.length, 2);
  assert.equal(res.bytesFetched, 14);
  assert.deepEqual(seen, ['1/2', '2/2'], 'progress fires per artifact');
  assert.deepEqual(plan.artifacts.map((a) => a.state), ['verified-cached', 'verified-cached']);
});

test('failure stops the run and leaves the good artifacts cached for a clean retry', async () => {
  const fs = memFs();
  const plan = await planHydration('0.2.363', fs, DIR, MANIFEST);
  const res = await hydrate(plan, net({
    [urlFor(WHEEL)]: { status: 200, body: 'WHEELBYTES' },
    [urlFor(WASM)]: { status: 500, body: '' },
  }), fs, digest);
  assert.equal(res.ok, false);
  assert.equal(res.failures.length, 1);
  assert.deepEqual(res.fetched, [WHEEL], 'the good one stays');

  // Retry: only the failed artifact is pending.
  const retry = await planHydration('0.2.363', fs, DIR, MANIFEST);
  assert.deepEqual(retry.pending.map((p) => p.name), [WASM]);
});

test('re-running a completed hydration is a no-op (no re-download)', async () => {
  const fs = memFs();
  const first = await planHydration('0.2.363', fs, DIR, MANIFEST);
  await hydrate(first, net({
    [urlFor(WHEEL)]: { status: 200, body: 'WHEELBYTES' },
    [urlFor(WASM)]: { status: 200, body: 'WASM' },
  }), fs, digest);
  const second = await planHydration('0.2.363', fs, DIR, MANIFEST);
  assert.equal(second.complete, true);
  const res = await hydrate(second, net({}), fs, digest);   // no net available
  assert.equal(res.ok, true);
  assert.deepEqual(res.fetched, []);
});

// -- required UX copy ------------------------------------------------------

test('the first-run notice states size and one-time-ness', () => {
  assert.equal(hydrationNotice(37 * 1048576), 'Downloading Forge runtime (~37MB, one time)…');
});

test('progress copy names artifact count and megabytes', () => {
  assert.equal(
    progressNotice({ done: 3, total: 20, bytesDone: 5 * 1048576, bytesTotal: 37 * 1048576, name: 'x' }),
    'Forge runtime: 3/20 (5.0/37.0 MB)',
  );
});

test('the offline message says what to do, and names the version', () => {
  const m = offlineNotice('0.2.363');
  assert.match(m, /Reopen Obsidian while online/);
  assert.match(m, /v0\.2\.363/);
});
