// 2026-11-21-1011: the plugin's settings tab is named `Forge Actions (Beta)` (manifest.json "name"), so every user-visible string that sends the person there must say `Settings → Forge Actions (Beta)`, not `Settings → Forge`
// (the driver looked for a setting and the old words sent them to the wrong tab). The scan reads every non-test source file and the bundled vault notes, drops the comments, and finds the old words in any arrow form (→, ->, >); the control shows it is not vacuous.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = process.cwd();
const OLD = /Settings\s*(?:→|->|>)\s*Forge\b(?!\s+Actions)/g;
const NEW = 'Settings → Forge Actions (Beta)';
/** The text without comments: block comments, full-line comments, and a trailing ` // ...` comment. A user-visible string is never one of these. */
export const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n');
export const oldWords = (text: string): string[] => [...withoutComments(text).matchAll(OLD)].map((m) => m[0]);
function walk(dir: string, keep: (f: string) => boolean, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(f, keep, out); } else if (keep(f)) out.push(f); }
  return out;
}

test('the plugin\'s manifest name is the tab\'s name the strings must use', () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).name, 'Forge Actions (Beta)');
});
test('no user-visible string says `Settings → Forge` without `Actions` (source files and the bundled vault notes; comments and tests of old strings are not scanned)', () => {
  const files = [...walk(path.join(ROOT, 'src'), (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes(`${path.sep}test-support${path.sep}`)), ...walk(path.join(ROOT, 'assets'), (f) => /\.(md|json)$/.test(f))];
  assert.ok(files.length > 150, `non-vacuity: ${files.length} files scanned`);
  const found = files.flatMap((f) => oldWords(fs.readFileSync(f, 'utf8')).map((w) => `${path.relative(ROOT, f)}: ${w}`));
  assert.deepEqual(found, [], 'these strings send the person to the wrong tab');
  const good = files.reduce((n, f) => n + (withoutComments(fs.readFileSync(f, 'utf8')).split(NEW).length - 1), 0);
  assert.ok(good >= 14, `non-vacuity: the right words appear ${good} times`);
});
test('CONTROL: the scan sees every old form (→, ->, >, a line break, a template literal) and skips comments and the right words', () => {
  for (const bad of ["'Check Settings → Forge → Transpile token.'", "'in Settings -> Forge.'", "'Settings > Forge > Music'", '`Paste it (Settings → Forge →\n   Transpile)`', "'Settings → Forge'", "'Settings→Forge →'"]) assert.equal(oldWords(bad).length, 1, bad);
  for (const ok of ["'Check Settings → Forge Actions (Beta) → Transpile token.'", "// Settings -> Forge -> Music tabs\nconst x = 1;", "/* Settings → Forge */ const y = 2;", "const z = 3; // Settings -> Forge", "'Forge settings are elsewhere'"]) assert.deepEqual(oldWords(ok), [], ok);
});
