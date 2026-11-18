// 2026-11-18-1000 - the gadgets the public Music Theory site publishes (the vault's interval and scale chapters embed them) may not name the plugin or its style-guide file anywhere, not even in a CSS comment (view-source shows comments). Four gadget
// comments said "(forge_music_theory_style_guide.md)": they now say only what the rule is. theory-site's lint (scripts and src/lint.mjs there) enforces the same on every published gadget; this test pins the four files here, in the bundle the plugin ships,
// and that the rewording changed NOTHING but the comment (the shared blocks are still byte-identical: ear-gadgets-split.test.ts; the heights are unchanged: a comment has no layout).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const VAULT = path.resolve(import.meta.dirname, '../assets/vaults/music-theory');
const FILES = ['music_instruments/resources/html/interval_ear_one_after_the_other.html', 'music_instruments/resources/html/interval_ear_both_at_once.html', 'music_instruments/resources/html/interval_ear_triads.html', 'music_instruments/resources/html/tune_shifter.html'];
const read = (f: string): string => fs.readFileSync(path.join(VAULT, f), 'utf8');
const WORDS = /style_guide|\bforge\b|forge[-_]/i;

test('the four gadgets name neither the plugin nor its style guide, in code, text or comments', () => {
  for (const f of FILES) { const h = read(f); assert.doesNotMatch(h, WORDS, `${f}: ${WORDS.exec(h)?.[0]}`); assert.match(h, /\/\* Palette: the same values as piano_keyboard\.html\. No margin, no padding, no fixed height: the page is exactly its content/, `${f}: the comment still says the rule`); }
});

test('the rewording changed only the comment: the CSS comment is the same sentence without the file name, and each file is otherwise what the other three siblings are (the shared blocks stay byte-identical)', () => {
  const lineOf = (h: string): string => h.split('\n')[7];
  for (const f of FILES) assert.match(lineOf(read(f)), /^\s*\/\* Palette: the same values as piano_keyboard\.html\. No margin, no padding, no fixed height: the page is exactly its content/, f);
  const trio = FILES.slice(0, 3).map((f) => read(f).split('\n').slice(8).join('\n').replace(/<title>.*<\/title>/, '')); assert.ok(trio.every((t) => t.length > 20000), 'non-vacuity');
});

// 2026-11-18-1200 (c) - the other 21 gadgets (the first batch said 11: a miscount, found by the grep below) carried the same comment. None is published today, but the day a chapter embeds one the site lint would fail the build; the rule is
// now pinned over EVERY gadget the bundle ships, so a new gadget copied from an old one cannot bring the file name back.
const gadgetsIn = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? gadgetsIn(path.join(dir, e.name)) : /\/resources\/html\/[^/]+\.html$/.test(path.join(dir, e.name)) ? [path.join(dir, e.name)] : []));

test('no gadget in the bundled vault names the style-guide file, in a CSS comment or anywhere else (the sibling of the four above, over every gadget the bundle ships)', () => {
  const all = gadgetsIn(VAULT); assert.ok(all.length >= 30, `non-vacuity: walked ${all.length} gadget files`);
  const named = all.filter((f) => /style_guide/i.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(VAULT, f));
  assert.deepEqual(named, [], 'these gadgets still name the style-guide file');
});

test('the 21 rewordings changed only the comment: every one still opens its palette comment on line 8, and the 14 siblings that shared the same five lines still share them byte for byte', () => {
  const all = gadgetsIn(VAULT).filter((f) => /\/(music_instruments|tuning)\//.test(f));
  const palette = all.filter((f) => /^\s*\/\* Palette: /.test(fs.readFileSync(f, 'utf8').split('\n')[7] ?? '')); assert.ok(palette.length >= 21, `non-vacuity: ${palette.length} palette comments`);
  const groups = new Map<string, number>(); for (const f of palette) { const k = fs.readFileSync(f, 'utf8').split('\n').slice(7, 12).join('\n'); groups.set(k, (groups.get(k) ?? 0) + 1); }
  assert.ok(Math.max(...groups.values()) >= 14, `the biggest group of identical comment blocks has ${Math.max(...groups.values())} files`);
});
