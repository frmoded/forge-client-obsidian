// Drain 2026-10-10-2100 (a) — a vault-authored .html widget must be found in a NORMAL user vault, where the bundled
// library is a SUBFOLDER (`music-theory/…`), not the vault root. Three tiers.
// Drain 2026-10-11-0900 §1 SWAPPED tiers 2 and 3 (driver decision): the widget and the plugin share a message protocol, so the plugin's
// own inlined copy must beat a possibly STALE extracted copy. Order now:
//   1. a vault file at the root-relative path (the driver's dev vault, and any user override, still win)
//   2. the plugin's own inlined copy (`vaults/<name>/<path>` in BUNDLED_ASSETS) — works with no extraction at all, never stale
//   3. the same relative path under each bundled-vault folder the plugin knows (the extracted copy)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  inlinedAssetKey,
  resolveBundledAwareFile,
  searchOrder,
  type BundledAwareDeps,
} from './bundled-widget-lookup-core.ts';

const REL = 'music_instruments/resources/html/rhythm_box.html';
const NAMES = ['forge-moda', 'music-theory', 'music-core'] as const;

function makeDeps(opts: {
  vault?: Record<string, string>;
  inlined?: Record<string, string>;
  names?: readonly string[];
  throwOn?: string[];
}): BundledAwareDeps & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    bundledVaultNames: opts.names ?? NAMES,
    async readVaultFile(p: string) {
      reads.push(p);
      if (opts.throwOn?.includes(p)) throw new Error('EIO');
      return opts.vault?.[p] ?? null;
    },
    inlinedAsset(key: string) {
      return opts.inlined?.[key];
    },
  };
}

test('tier 1 wins: a root-relative vault file beats the inlined copy and the bundled folder', async () => {
  const d = makeDeps({
    vault: { [REL]: '<root/>', [`music-theory/${REL}`]: '<folder/>' },
    inlined: { [inlinedAssetKey('music-theory', REL)]: '<inlined/>' },
  });
  const r = await resolveBundledAwareFile(REL, d);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.tier, 'vault-root');
    assert.equal(r.html, '<root/>');
    assert.equal(r.location, REL);
  }
  assert.deepEqual(d.reads, [REL], 'a tier-1 hit reads nothing else');
});

test('STALE EXTRACTION does not outrank the plugin: the inlined copy beats the extracted bundled folder (drain 2026-10-11-0900 §1)', async () => {
  const d = makeDeps({
    vault: { [`music-theory/${REL}`]: '<stale-extracted-widget/>' },
    inlined: { [inlinedAssetKey('music-theory', REL)]: '<current-plugin-widget/>' },
  });
  const r = await resolveBundledAwareFile(REL, d);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.tier, 'plugin-bundle');
    assert.equal(r.html, '<current-plugin-widget/>');
  }
  assert.ok(!d.reads.includes(`music-theory/${REL}`), 'the extracted folder is not even read once the plugin copy answered');
});

test('the extracted bundled folder is still the fallback when the plugin has no inlined copy (e.g. a build without it)', async () => {
  const d = makeDeps({ vault: { [`music-theory/${REL}`]: '<folder/>' } });
  const r = await resolveBundledAwareFile(REL, d);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.tier, 'bundled-vault-folder');
    assert.equal(r.html, '<folder/>');
    assert.equal(r.location, `music-theory/${REL}`);
  }
});

test('the folder fallback walks every bundled vault name, in the plugin\'s own order, first hit wins', async () => {
  const d = makeDeps({
    vault: { [`music-core/${REL}`]: '<core/>', [`music-theory/${REL}`]: '<theory/>' },
  });
  const r = await resolveBundledAwareFile(REL, d);
  assert.equal(r.ok && r.location, `music-theory/${REL}`, 'music-theory precedes music-core in NAMES');
  assert.deepEqual(d.reads, [REL, `forge-moda/${REL}`, `music-theory/${REL}`]);
});

test('the plugin copy is the guarantee: nothing extracted, nothing in the vault — the inlined plugin copy is used', async () => {
  const d = makeDeps({ inlined: { [inlinedAssetKey('music-theory', REL)]: '<inlined/>' } });
  const r = await resolveBundledAwareFile(REL, d);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.tier, 'plugin-bundle');
    assert.equal(r.html, '<inlined/>');
    assert.match(r.location, /vaults\/music-theory\//);
  }
});

test('missing everywhere: ok=false and EVERY searched location is named', async () => {
  const d = makeDeps({});
  const r = await resolveBundledAwareFile(REL, d);
  assert.equal(r.ok, false);
  if (r.ok === false) {
    const expected = [REL, ...NAMES.map((n) => `${n}/${REL}`), ...NAMES.map((n) => inlinedAssetKey(n, REL))];
    for (const loc of expected) {
      assert.ok(r.searched.some((s) => s.includes(loc)), `searched must name ${loc}; got ${JSON.stringify(r.searched)}`);
      assert.ok(r.message.includes(loc), `the refusal message must name ${loc}`);
    }
  }
});

test('an empty or whitespace-only file at one tier is a miss — the next tier is tried, and the empty one is noted', async () => {
  const d = makeDeps({
    vault: { [REL]: '   \n', [`music-theory/${REL}`]: '' },
    inlined: { [inlinedAssetKey('music-theory', REL)]: '<inlined/>' },
  });
  const r = await resolveBundledAwareFile(REL, d);
  assert.equal(r.ok && r.tier, 'plugin-bundle');

  const none = await resolveBundledAwareFile(REL, makeDeps({ vault: { [REL]: '  ' } }));
  assert.equal(none.ok, false);
  if (none.ok === false) assert.ok(none.searched.some((s) => s.includes(REL) && /empty/.test(s)), JSON.stringify(none.searched));
});

test('a read error at one tier does not abort the lookup, and is reported as unreadable', async () => {
  const d = makeDeps({
    vault: { [`music-theory/${REL}`]: '<folder/>' },
    throwOn: [REL],
  });
  const r = await resolveBundledAwareFile(REL, d);
  assert.equal(r.ok && r.tier, 'bundled-vault-folder');

  const both = await resolveBundledAwareFile(REL, makeDeps({ throwOn: [REL] }));
  assert.equal(both.ok, false);
  if (both.ok === false) assert.ok(both.searched.some((s) => s.includes(REL) && /unreadable/.test(s)), JSON.stringify(both.searched));
});

test('a path that climbs out (`..`) or is absolute is looked up at tier 1 only — never joined under a bundled folder or the asset map', async () => {
  for (const bad of ['../secret.html', 'a/../../b.html', '/etc/x.html']) {
    const d = makeDeps({ inlined: {} });
    const r = await resolveBundledAwareFile(bad, d);
    assert.equal(r.ok, false);
    assert.deepEqual(d.reads, [bad], `only tier 1 may read ${bad}`);
  }
});

test('lean edition (no bundled music vault names): tier 1 and the refusal only — no invented folders', async () => {
  const d = makeDeps({ names: [] });
  const r = await resolveBundledAwareFile(REL, d);
  assert.equal(r.ok, false);
  assert.deepEqual(d.reads, [REL]);
  assert.deepEqual(searchOrder(REL, []).map((s) => s.tier), ['vault-root']);
});

test('searchOrder is exactly root, then inlined, then folders — one entry per bundled name', () => {
  const o = searchOrder(REL, ['a', 'b']);
  assert.deepEqual(o.map((s) => [s.tier, s.location]), [
    ['vault-root', REL],
    ['plugin-bundle', `vaults/a/${REL}`],
    ['plugin-bundle', `vaults/b/${REL}`],
    ['bundled-vault-folder', `a/${REL}`],
    ['bundled-vault-folder', `b/${REL}`],
  ]);
});

// ---- real data: the plugin's own inlined copy (present only when the music edition's assets were generated) ----------------

test('real bundle: with an EMPTY vault, the Beat Box widget resolves from the plugin\'s inlined music-theory copy (tier 3)', async () => {
  const { BUNDLED_ASSETS } = await import('./bundled-assets.generated.ts');
  const inlined = BUNDLED_ASSETS as Record<string, string>;
  const key = inlinedAssetKey('music-theory', REL);
  if (!(key in inlined)) return;   // lean-generated state: the music vault is not inlined, nothing to resolve
  const r = await resolveBundledAwareFile(REL, {
    bundledVaultNames: ['music-theory'],
    readVaultFile: async () => null,
    inlinedAsset: (k) => inlined[k],
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.tier, 'plugin-bundle');
    assert.ok(r.html.length > 1000 && /<html|<!doctype/i.test(r.html), 'a real HTML document');
  }
});
