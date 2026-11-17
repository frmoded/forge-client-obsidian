import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { formatBuildSha, formatBuildStamp, setStatusBarTooltip, statusBarTooltip } from './build-stamp-core.ts';

test('format: sha, +dirty marker, and a minute-resolution UTC time', () => {
  assert.equal(formatBuildStamp({ sha: '904d575c7', dirty: false, builtAt: '2026-10-09T20:53:15.964Z' }), '904d575c7 · built 2026-10-09 20:53 UTC');
  assert.equal(formatBuildStamp({ sha: '904d575c7', dirty: true, builtAt: '2026-10-09T20:53:15.964Z' }), '904d575c7+dirty · built 2026-10-09 20:53 UTC');
});

test('format: an unreadable SHA says "unknown build"; an unparseable time is simply omitted', () => {
  assert.equal(formatBuildStamp({ sha: 'unknown', dirty: false, builtAt: '2026-10-09T20:53:15.964Z' }), 'unknown build · built 2026-10-09 20:53 UTC');
  assert.equal(formatBuildStamp({ sha: 'abc1234', dirty: false, builtAt: 'yesterday' }), 'abc1234');
});

test('wiring: the stamp is shown in the status-bar tooltip and in the settings tab, from the generated constant', () => {
  const main = fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf-8');
  const settings = fs.readFileSync(path.resolve(process.cwd(), 'src/settings.ts'), 'utf-8');
  assert.match(main, /import \{ BUILD_STAMP \} from '\.\/build-stamp\.generated\.ts';/);
  // Drain 2026-10-11-0900 §6: the tooltip text is built by the pure `statusBarTooltip` from the same formatter, and applied as an
  // Obsidian tooltip (aria-label), not the native `title` that never showed in the status bar.
  assert.match(main, /statusBarTooltip\(\{[\s\S]*?build: formatBuildStamp\(BUILD_STAMP\),/);
  // 2026-11-17-0901 A (amended on purpose): the Settings line goes through formatBuildLine (= formatBuildStamp + the vault whose copy this is).
  assert.match(settings, /setName\('Build'\)\s*\.setDesc\(`\$\{formatBuildLine\(BUILD_STAMP, /);
});

test('the generated stamp is gitignored and written by the version-inline script', () => {
  const ig = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf-8');
  assert.match(ig, /^src\/build-stamp\.generated\.ts$/m);
  const script = fs.readFileSync(path.resolve(process.cwd(), 'scripts/inline-plugin-version.mjs'), 'utf-8');
  assert.match(script, /renderBuildStamp\(stamp\)/);
});


// ---- Drain 2026-10-11-0900 §6: hovering "Forge v0.6.1" showed nothing -------------------------------------------------------
// Obsidian draws its own tooltip from `aria-label` (positioned by `data-tooltip-position`); a bare `title` on a status-bar item is
// not shown there. The text is one line (separators, not newlines) so it reads the same however the tooltip wraps.

const fakeEl = () => {
  const attrs = new Map<string, string>();
  return {
    attrs,
    title: undefined as string | undefined,
    setAttribute(n: string, v: string) { attrs.set(n, v); },
    removeAttribute(n: string) { attrs.delete(n); },
  };
};

test('tooltip text: version, build, plugin id and minimum app version on one line', () => {
  const t = statusBarTooltip({ version: '0.6.1', build: '2b977eb+dirty · built 2026-10-11 02:00 UTC', pluginId: 'forge-actions', minAppVersion: '1.4.0' });
  assert.equal(t, 'Forge Client v0.6.1 · Build: 2b977eb+dirty · built 2026-10-11 02:00 UTC · Plugin ID: forge-actions · Min app version: 1.4.0');
  assert.ok(!t.includes('\n'));
});

test('tooltip is set as an Obsidian tooltip: aria-label + data-tooltip-position (and no native title that would double it)', () => {
  const el = fakeEl();
  el.title = 'old native title';
  setStatusBarTooltip(el, 'hello');
  assert.equal(el.attrs.get('aria-label'), 'hello');
  assert.equal(el.attrs.get('data-tooltip-position'), 'top');
  assert.equal(el.title, undefined, 'the native title is cleared so two tooltips never stack');
});

test('wiring: main.ts applies the tooltip through setStatusBarTooltip and no longer assigns statusBarItem.title', () => {
  const main = fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf-8').replace(/\/\/.*$/gm, '');
  assert.match(main, /setStatusBarTooltip\(statusBarItem, statusBarTooltip\(/);
  assert.ok(!/statusBarItem\.title\s*=/.test(main));
});

test('2026-10-31-1115: the banner names the commit alone: the sha, +dirty for a dirty tree, "unknown build" when it could not be read', () => {
  assert.equal(formatBuildSha({ sha: '904d575c7', dirty: false }), '904d575c7');
  assert.equal(formatBuildSha({ sha: '904d575c7', dirty: true }), '904d575c7+dirty');
  assert.equal(formatBuildSha({ sha: 'unknown', dirty: false }), 'unknown build');
});

// ---- 2026-11-17-0901 A: the banner and the Settings "Build" line say WHICH vault's plugin copy is running --------------------------------------
// The driver installed f6390ce into music-playground and read "a2d1f0385" in the banner: that was music-theory's own, older copy (installed 2026-11-10; every vault keeps its own
// plugin folder). The stamp was true; nothing said whose copy it was. Now the banner and the Settings line carry the vault name, and `dirty` is a word, not a symbol.
import { formatBuildLine, formatLoadBanner } from './build-stamp-core.ts';

test('0901 A: the load banner names the version, the edition, the commit and the vault whose copy of the plugin is running', () => {
  const stamp = { sha: 'f6390ce12', dirty: false, builtAt: '2026-11-17T01:50:08.507Z' };
  assert.equal(formatLoadBanner({ version: '0.6.1', edition: 'music', stamp, vaultName: 'music-theory' }), 'FORGE CLIENT v0.6.1 LOADED (edition: music, f6390ce12, vault: music-theory)');
  assert.equal(formatLoadBanner({ version: '0.6.1', edition: 'music', stamp: { ...stamp, dirty: true }, vaultName: 'music-playground' }), 'FORGE CLIENT v0.6.1 LOADED (edition: music, f6390ce12+dirty, vault: music-playground)');
});

test('0901 A: no vault name (or a blank one) leaves the banner exactly as it was before; an unknown sha says "unknown build"', () => {
  const stamp = { sha: 'f6390ce12', dirty: false, builtAt: '2026-11-17T01:50:08.507Z' };
  const before = 'FORGE CLIENT v0.6.1 LOADED (edition: music, f6390ce12)';
  assert.equal(formatLoadBanner({ version: '0.6.1', edition: 'music', stamp }), before);
  assert.equal(formatLoadBanner({ version: '0.6.1', edition: 'music', stamp, vaultName: '   ' }), before);
  assert.equal(formatLoadBanner({ version: '0.6.1', edition: 'lean', stamp: { sha: 'unknown', dirty: false, builtAt: '' }, vaultName: 'v' }), 'FORGE CLIENT v0.6.1 LOADED (edition: lean, unknown build, vault: v)');
});

test('0901 A: the Settings Build line is the commit, +dirty, the time and the vault: one sentence the driver can quote', () => {
  const stamp = { sha: 'f6390ce12', dirty: true, builtAt: '2026-11-17T01:50:08.507Z' };
  assert.equal(formatBuildLine(stamp, 'music-theory'), 'f6390ce12+dirty · built 2026-11-17 01:50 UTC · this vault (music-theory) has its own copy of the plugin');
  assert.equal(formatBuildLine({ ...stamp, dirty: false }, undefined), 'f6390ce12 · built 2026-11-17 01:50 UTC');
});

test('0901 A: main.ts and settings.ts use them (the banner is not a hand-built string any more)', () => {
  const main = fs.readFileSync(path.join(import.meta.dirname, 'main.ts'), 'utf8');
  const settings = fs.readFileSync(path.join(import.meta.dirname, 'settings.ts'), 'utf8');
  assert.match(main, /formatLoadBanner\(\{/);
  assert.doesNotMatch(main, /LOADED \(edition: \$\{EDITION\}/);
  assert.match(settings, /formatBuildLine\(BUILD_STAMP,/);
});

// 2026-11-17-0901 A (found by the whole npm test: 398 failures): the host's vault is a stub in most tests and may lack getName; reading the vault's name must never be able to stop onload or the Settings tab.
import { vaultNameOf } from './build-stamp-core.ts';

test('0901 A: vaultNameOf returns the name, and undefined (never a throw) when the vault has no getName, getName throws, or it returns a non-string', () => {
  assert.equal(vaultNameOf({ vault: { getName: () => 'music-theory' } }), 'music-theory');
  assert.equal(vaultNameOf({ vault: {} }), undefined);
  assert.equal(vaultNameOf({}), undefined);
  assert.equal(vaultNameOf(undefined), undefined);
  assert.equal(vaultNameOf({ vault: { getName: () => { throw new Error('no vault yet'); } } }), undefined);
  assert.equal(vaultNameOf({ vault: { getName: () => 42 as unknown as string } }), undefined);
});

test('0901 A: main.ts and settings.ts read the name only through vaultNameOf', () => {
  const main = fs.readFileSync(path.join(import.meta.dirname, 'main.ts'), 'utf8');
  const settings = fs.readFileSync(path.join(import.meta.dirname, 'settings.ts'), 'utf8');
  assert.match(main, /vaultName: vaultNameOf\(this\.app\)/);
  assert.match(settings, /formatBuildLine\(BUILD_STAMP, vaultNameOf\(this\.app\)\)/);
  assert.doesNotMatch(main + settings, /vault\.getName\(\)/);
});
