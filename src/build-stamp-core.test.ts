import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { formatBuildStamp, setStatusBarTooltip, statusBarTooltip } from './build-stamp-core.ts';

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
  assert.match(settings, /setName\('Build'\)\s*\.setDesc\(`\$\{formatBuildStamp\(BUILD_STAMP\)\}/);
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
