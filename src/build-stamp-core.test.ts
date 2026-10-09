import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { formatBuildStamp } from './build-stamp-core.ts';

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
  assert.match(main, /`Build: \$\{formatBuildStamp\(BUILD_STAMP\)\}\\n`/);
  assert.match(settings, /setName\('Build'\)\s*\.setDesc\(`\$\{formatBuildStamp\(BUILD_STAMP\)\}/);
});

test('the generated stamp is gitignored and written by the version-inline script', () => {
  const ig = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf-8');
  assert.match(ig, /^src\/build-stamp\.generated\.ts$/m);
  const script = fs.readFileSync(path.resolve(process.cwd(), 'scripts/inline-plugin-version.mjs'), 'utf-8');
  assert.match(script, /renderBuildStamp\(stamp\)/);
});
