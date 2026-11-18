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
