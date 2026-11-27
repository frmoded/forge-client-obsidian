// 2026-11-24-1030z - the circle-of-fifths wheel (360 px, 1026) is centred in Obsidian's Reading view AND Live Preview by the PLUGIN'S styles, keyed on that ONE image path. The vault note keeps its flex <div> (the site needs it), but in Obsidian that wrapper
// does not reach the picture: CommonMark ends an HTML block at the first blank line, so the opening <div>, the embed paragraph and </div> are three blocks and the picture sits left in its own paragraph.
// What this pins: the rules exist, every selector of them is keyed on the wheel's file name, the declarations centre a shrink-wrapped block, the selectors match the DOM shapes Obsidian 1.12 builds (read from its own app.js / app.css) and only that embed,
// and NOTHING ELSE in styles.css changed (every line of the stylesheet as it was at 9fb83d0 is still there, in order). The real window is not reachable from a test: the driver's glance at Reading view and Live Preview is the check.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { Window } from 'happy-dom';

const ROOT = path.resolve(import.meta.dirname, '..'), CSS_TEXT = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const BASE = '9fb83d0', WHEEL = 'circle_of_fifths_wheel.svg', KEY = `[src$="${WHEEL}"]`;
const BEGIN = '/* 1030z begin */', END = '/* 1030z end */';

const block = (): string => { const a = CSS_TEXT.indexOf(BEGIN), b = CSS_TEXT.indexOf(END); assert.ok(a >= 0 && b > a, 'the 1030z block is delimited in styles.css'); return CSS_TEXT.slice(a, b + END.length); };
const rulesOf = (css: string): { selectors: string[]; body: string }[] => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((x) => x.trim()).filter(Boolean), body: m[2] }));

// 2026-11-25-1043 (deliberate): the same two rules now also name the drawing fifths_on_a_line.svg (added selector-list entries), so a selector is keyed on ONE of the two file names; its own pins are in fifths-flat-arrows-1043.test.ts.
test('1030z: the block holds exactly two rules (Reading view, Live Preview), every selector is keyed on the wheel file name (or, since 1043, the drawing\'s) and nothing else', () => {
  const rules = rulesOf(block()), keys = [KEY, '[src$="fifths_on_a_line.svg"]'];
  assert.equal(rules.length, 2, 'one rule for Reading view, one for Live Preview');
  for (const r of rules) for (const s of r.selectors) { assert.equal(keys.filter((k) => s.includes(k)).length, 1, `${s} is keyed on one of ${keys.join(' or ')}`); assert.match(s, /\.internal-embed\.image-embed/, `${s} names the embed`); }
  for (const k of keys) assert.equal(CSS_TEXT.split(k).length - 1, rules.flatMap((r) => r.selectors).filter((s) => s.includes(k)).length, `${k} appears in no selector outside the block`);
  assert.equal(rules.flatMap((r) => r.selectors).filter((s) => s.includes(KEY)).length, 2, 'the wheel keeps its two selectors');
});

test('1030z: the declarations centre a shrink-wrapped block (display, width: fit-content, auto side margins), and the Live Preview margin out-ranks Obsidian\'s `.cm-content > * { margin: 0 !important }`', () => {
  const [reading, live] = rulesOf(block());
  for (const r of [reading, live]) { assert.match(r.body, /width:\s*fit-content/); assert.match(r.body, /margin-inline:\s*auto/); }
  assert.match(reading.body, /display:\s*block/, 'Reading view: the span becomes a block so auto margins work');
  assert.doesNotMatch(reading.selectors.join(','), /cm-|markdown-source-view/, 'the Reading rule is not scoped to the editor');
  assert.match(live.selectors.join(','), /\.markdown-source-view\.mod-cm6 \.cm-content/, 'Live Preview: scoped to the editor content');
  assert.match(live.body, /margin-inline:\s*auto\s*!important/, 'Obsidian zeroes the margin of every direct child of .cm-content with !important');
  assert.match(live.body, /display:\s*flex/, 'Obsidian makes a direct image child flex; keep it a block-level box');
});

test('1030z: the selectors match the embed of the wheel in the DOM shapes Obsidian 1.12 builds (Reading: span.internal-embed.image-embed in a paragraph; Live Preview: div.internal-embed.image-embed, inline in a .cm-line and as a direct child of .cm-content) and no other embed', () => {
  const [reading, live] = rulesOf(block()), win = new Window(), doc = win.document;
  const src = `circle_of_fifths/resources/images/${WHEEL}`, other = 'circle_of_fifths/resources/images/another_wheel.svg';
  doc.body.innerHTML = `<div class="markdown-preview-view"><p><span class="internal-embed image-embed is-loaded" src="${src}" alt="w"><img src="x"></span></p><p><span class="internal-embed image-embed is-loaded" src="${other}"><img src="y"></span></p></div>`
    + `<div class="markdown-source-view mod-cm6"><div class="cm-content"><div class="cm-line"><div class="internal-embed image-embed is-loaded" src="${src}"><div class="image-wrapper"><img src="x"></div></div></div>`
    + `<div class="internal-embed image-embed is-loaded" src="${src}"></div><div class="internal-embed image-embed is-loaded" src="${other}"></div><div class="internal-embed markdown-embed" src="notes/${WHEEL.replace('.svg', '')}"></div></div></div>`;
  const hit = (sel: string) => [...doc.querySelectorAll(sel)].map((e) => e.getAttribute('src'));
  assert.deepEqual(hit(reading.selectors.join(',')), [src, src, src], 'Reading rule: the wheel embeds only');
  assert.deepEqual(hit(live.selectors.join(',')), [src, src], 'Live Preview rule: the two wheel embeds inside the editor only, not the reading one');
  assert.equal(doc.querySelectorAll(`.internal-embed${KEY}`).length, 3);
  win.close();
});

test('1030z: no other selector or declaration in styles.css changed (every line of the stylesheet at 9fb83d0 is still there, in order; the block is the only addition)', () => {
  let base: string;
  try { base = execFileSync('git', ['show', `${BASE}:styles.css`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return; /* no git history on this machine: the check cannot run */ }
  const have = CSS_TEXT.split('\n'); let at = 0;
  for (const line of base.split('\n')) { if (line.trim() === '') continue; const i = have.indexOf(line, at); assert.ok(i >= 0, `a line of the stylesheet at ${BASE} is gone or moved: ${line.slice(0, 100)}`); at = i + 1; }
  const without = CSS_TEXT.replace(block(), '');
  assert.equal(without.split('\n').filter((l) => l.trim() !== '').length >= base.split('\n').filter((l) => l.trim() !== '').length, true, 'nothing was removed');
  // CONTROL: the check can fail: a stylesheet with one base line changed does not pass the same walk.
  const broken = CSS_TEXT.replace('.forge-review-status { min-height: 1.5em;', '.forge-review-status { min-height: 2em;').split('\n'); let p2 = 0, failed = false;
  for (const line of base.split('\n')) { if (line.trim() === '') continue; const i = broken.indexOf(line, p2); if (i < 0) { failed = true; break; } p2 = i + 1; }
  assert.equal(failed, true, 'a changed base line is detected');
});
