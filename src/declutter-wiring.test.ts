// 2026-11-05-1189 (score-tab declutter) - WHERE the declutter is wired. Pins the MECHANISM (the call sites that pass `compact: true`, the one that is `headless`, the strip that is no longer mounted for a bar); if the design moves
// this SHOULD go red - reassess, don't just rewrite. The P3 property behind it: a surface that is not a score-first Score tab (the Forge output panel, an embedded Beat Box, a vault that is not score-first) gets exactly the DOM
// it always had, because it never asks for `compact`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const SRC = path.resolve(import.meta.dirname);
const prod = fs.readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.generated.ts'));
const text = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');
const having = (needle: RegExp) => prod.filter((f) => needle.test(text(f))).sort();

test('`compact: true` is passed by exactly the score-first Score tabs: the bar\'s Beat Box and Score tab, the phrase, arrangement and composition tabs - and never by the output panel or the embedded Beat Box', () => {
  assert.deepEqual(having(/\bcompact: true\b/), ['compositions.ts', 'kits-arrangements.ts', 'phrase-view.ts', 'rhythm-edit-view.ts', 'rhythm-score-view.ts']);
  for (const f of ['output-view.ts', 'rhythm-embed-view.ts']) assert.doesNotMatch(text(f), /\bcompact:/, `${f} keeps what it always had`);
});

test('the bar\'s read-only Score tab asks for it ONLY in a score-first vault (the same question every score-first behaviour asks)', () => {
  assert.match(text('rhythm-score-view.ts'), /messageDelivery\.isScoreFirst\(\) \? \{ clickToPlay: scoreClickPlays, compact: true \} : \{ clickToPlay: scoreClickPlays \}/);
});

test('the Beat Box tab asks for it inside the score panel, which exists only for plan "score" (score-first, music edition)', () => {
  const t = text('rhythm-edit-view.ts');
  assert.match(t, /inspector: plan === 'score' \? \{\s*headless: true,/);
  assert.match(t, /renderInto: \(host, payload\) => musicEdition\.renderTaggedMusicXML\(host, payload, file\.basename, \{ clickToPlay: scoreClickPlays, compact: true \}\)/);
});

test('`headless` (no Inspector section) is the bar\'s Beat Box tab and nothing else; the phrase, arrangement and composition tabs keep their Inspector', () => {
  assert.deepEqual(having(/\bheadless: true\b/), ['rhythm-edit-view.ts']);
  for (const f of ['phrase-view.ts', 'kits-arrangements.ts', 'compositions.ts']) assert.doesNotMatch(text(f), /\bheadless:/, f);
});

test('the music edition draws the compact chrome only when asked: the Verovio header is dropped, the toolbar made, the host marked, all from `opts.compact`', () => {
  const full = text('music-edition.full.ts');
  assert.equal((full.match(/opts\.compact === true/g) ?? []).length >= 3, true, 'every compact branch asks opts.compact');
  assert.match(full, /renderMusicXMLAndMIDI\(musicxml, await waitForWidth\(host\), \{ noHeader: opts\.compact === true \}\)/);
  assert.match(text('verovio.ts'), /\.\.\.\(noHeader \? \{ header: 'none' \} : \{\}\)/);
  assert.match(text('verovio.ts'), /applyOptions\(toolkit, hostWidthPx, opts\.noHeader === true\);/, 'the flag reaches the toolkit options (not dropped on the way)');
  assert.match(text('music-edition.ts'), /compact\?: boolean;/);
});

test('a bar\'s tab no longer mounts the "used by" strip: score-first.ts neither builds the chips nor mounts a strip; the phrase tab and the arrangement tab still mount theirs', () => {
  const sf = text('score-first.ts');
  for (const gone of ['usedByChips', 'mountStructureStrip', 'syncBarStrips', 'barStrips']) assert.doesNotMatch(sf, new RegExp(`\\b${gone}\\b`), `score-first.ts still has ${gone}`);
  assert.match(text('phrase-dom.ts'), /mountStructureStrip\(parent,/);
  assert.match(text('arrangement-strip-dom.ts'), /mountStructureStrip\(parent,/);
});
