// Tests for the BRAT Phase 1b adapter seams (drain 2026-08-20-1200).
//
// `brat-hydration.ts` imports from 'obsidian', so it cannot be imported
// under `node --test` (the npm package is a types-only stub). What IS
// testable — and what actually broke in the v0.2.22-class incidents —
// is the byte-handling contract each adapter must satisfy. These tests
// pin that contract against the same production source, extracted at
// test time so the fixture cannot drift from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'brat-hydration.ts');
const SOURCE = readFileSync(SRC, 'utf8');

// -- the digest contract ---------------------------------------------------
//
// The manifest generator uses node's createHash(...).digest('hex'). The
// runtime uses crypto.subtle. If those two ever disagree, EVERY artifact
// fails verification and a BRAT install can never hydrate — so the
// agreement is worth an explicit test rather than an assumption.

/** The same computation `subtleDigest` performs, run against the same
 *  WebCrypto API Obsidian exposes. */
async function subtleHex(bytes: Uint8Array): Promise<string> {
  const view = new Uint8Array(bytes);
  const buf = view.byteLength === view.buffer.byteLength
    ? view.buffer
    : view.slice().buffer;
  const digest = await webcrypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

test('subtle SHA-256 hex matches the manifest generator byte-for-byte', async () => {
  for (const sample of ['', 'a', 'WHEELBYTES', 'x'.repeat(5000)]) {
    const bytes = new TextEncoder().encode(sample);
    assert.equal(
      await subtleHex(bytes),
      createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
      `digest disagreement on ${JSON.stringify(sample.slice(0, 12))} would fail every artifact`,
    );
  }
});

test('a view into a larger buffer hashes only its own bytes', async () => {
  // The trap this guards: `resp.arrayBuffer` handed to a Uint8Array view
  // that does not span the whole allocation. Hashing `view.buffer` would
  // digest the neighbours too and reject a perfectly good artifact.
  const backing = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const slice = backing.subarray(2, 5);               // [3,4,5]
  assert.notEqual(slice.byteLength, slice.buffer.byteLength, 'fixture must be a partial view');
  assert.equal(await subtleHex(slice), await subtleHex(new Uint8Array([3, 4, 5])));
});

// -- production-source contracts -------------------------------------------
//
// Read out of brat-hydration.ts rather than restated, so these cannot
// pass while the real code says something else.

test('the net adapter uses requestUrl, never browser fetch (CORS)', () => {
  assert.match(SOURCE, /requestUrl\(\{[^}]*method: 'GET'/s);
  assert.ok(
    !/\bawait fetch\(/.test(SOURCE),
    'browser fetch from app://obsidian.md to github.com is CORS-blocked (v0.2.174)',
  );
});

test('requestUrl is called with throw:false so a 404 returns a status', () => {
  // Without this, Obsidian throws on non-2xx and the 404 case — the
  // exact Phase 0 failure mode — would surface as 'network' instead of
  // 'http', losing the status the user needs to see.
  assert.match(SOURCE, /throw:\s*false/);
});

test('both write paths slice before handing bytes onward', () => {
  // Same partial-view trap as the digest test, on the write side.
  assert.match(SOURCE, /adapter\.writeBinary\(path, bytes\.slice\(\)\.buffer/);
});

test('a complete plan returns early and stays silent', () => {
  // The zip-install path must not learn it is being audited: no Notice,
  // no download, on every launch.
  assert.match(SOURCE, /if \(plan\.complete\)/);
  assert.match(SOURCE, /wasAlreadyComplete: true/);
});

test('hydrateRuntime never throws — onload must not die on a failed download', () => {
  assert.match(SOURCE, /catch \(e\)[\s\S]*?return \{ ready: false/);
});

test('the progress Notice is dismissed even when hydration throws', () => {
  assert.match(SOURCE, /finally \{\s*notice\.hide\(\);/);
});

test('failure reporting distinguishes offline from a bad artifact', () => {
  assert.match(SOURCE, /reason === 'network'/);
  assert.match(SOURCE, /offlineNotice\(version\)/);
});

// -- the boot gate ---------------------------------------------------------

const HOST = readFileSync(join(dirname(SRC), 'pyodide-host.ts'), 'utf8');

test('Pyodide refuses to boot when the runtime is not hydrated', () => {
  assert.match(HOST, /if \(!this\._runtimeHydrated\) \{/);
  assert.match(HOST, /throw new Error\(\s*'Forge runtime is not hydrated/);
});

test('the gate defaults to TRUE so non-onload construction is unchanged', () => {
  // Tests and any direct construction must behave exactly as they did
  // before this drain; only main.ts's onload narrows it.
  assert.match(HOST, /private _runtimeHydrated = true;/);
});

test('the unverified wheel CDN fallback is gone, not merely disabled', () => {
  for (const dead of ['wheelCdnBase', 'fellBackToCdn']) {
    assert.ok(!HOST.includes(dead), `${dead} still present — the old path is reachable`);
  }
  // And nothing in the wheel-mount region fetches over the network.
  const region = HOST.slice(HOST.indexOf('Forge wheel-mount: manifest has'),
                            HOST.indexOf('Forge wheel-mount summary'));
  assert.ok(!/requestUrl|https?:\/\//.test(region),
    'the wheel path must read from disk only; hydration owns fetching');
});

test('main.ts awaits hydration before constructing the host', () => {
  const MAIN = readFileSync(join(dirname(SRC), 'main.ts'), 'utf8');
  const hydrateAt = MAIN.indexOf('await hydrateRuntime(');
  const hostAt = MAIN.indexOf('new PyodideHost(');
  assert.ok(hydrateAt > 0 && hostAt > 0, 'both call sites must exist');
  assert.ok(hydrateAt < hostAt, 'a lazy host must not exist before hydration settles');
  assert.match(MAIN, /pyodideHost\.setRuntimeHydrated\(this\._hydrationReady\)/);
});

test('hydration is ordered after the inlined-asset restore', () => {
  const MAIN = readFileSync(join(dirname(SRC), 'main.ts'), 'utf8');
  assert.ok(
    MAIN.indexOf('await restoreInlinedAssets(') < MAIN.indexOf('await hydrateRuntime('),
    'the restore creates assets/, which hydration writes into',
  );
});
