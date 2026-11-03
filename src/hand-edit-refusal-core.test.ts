// 2026-11-03-1155-8 (A and B): the pure parts of the hand-edit refusal bridge - which messages count, when a shown refusal is stale, who is told. The wiring (a control inside the 600 ms wait, the bar, the red line) is pinned on the real
// plugin in description-apply-wiring.test.ts; the MECHANISM pins at the end say which writers report ("if the design moves these SHOULD go red - reassess, don't just rewrite").
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { handEditRefused, handEditStatusSettled, isHandEditRefusal, onHandEditRefusal } from './hand-edit-refusal-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { customRefusal, handEditRefusal, pythonEditRefusal, recipeEditRefusal } from './phrase-notes-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';

const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const clean = noteContentFor('phrase_001', EXTEND);
const recipeEdited = ((): string => { const x = extractRecipeSection(clean) ?? ''; return clean.replace(x, x.replace('8 bars', '6 bars')); })();
const descriptionEdited = ((): string => { const d = extractDescription(clean); return clean.replace(d, d.replace('8 bars', '6 bars')); })();

test('the four refusal sentences (either lead) count; other refusals and ordinary text do not', () => {
  for (const lead of [true, false]) for (const f of [handEditRefusal, recipeEditRefusal, pythonEditRefusal, customRefusal]) assert.equal(isHandEditRefusal(f(lead)), true);
  for (const other of ['', 'Not saved: weight must be between 0 and 1', 'Not saved: the note is read only', 'Rendering score...']) assert.equal(isHandEditRefusal(other), false, other);
});

test('a shown refusal goes stale when the note no longer answers with it, and only then; other messages are never touched', () => {
  assert.equal(handEditStatusSettled(recipeEditRefusal(true), clean), true, 'the note is settled');
  assert.equal(handEditStatusSettled(recipeEditRefusal(true), recipeEdited), false, 'still hand-edited: still true');
  assert.equal(handEditStatusSettled(recipeEditRefusal(true), descriptionEdited), true, 'a different facet is the edited one now: this sentence is stale');
  assert.equal(handEditStatusSettled(handEditRefusal(false), descriptionEdited), false);
  assert.equal(handEditStatusSettled('Not saved: weight must be between 0 and 1', clean), false, 'a refusal of another kind is not ours to clear');
  assert.equal(handEditStatusSettled('', clean), false);
});

test('handEditRefused tells every listener for a hand-edit sentence, nobody for anything else, and a listener that stopped hearing is not called', () => {
  const heard: string[] = [];
  const off = onHandEditRefusal((p) => heard.push(p));
  assert.equal(handEditRefused('phrases/phrase_001.md', recipeEditRefusal(true)), true);
  assert.equal(handEditRefused('phrases/phrase_001.md', 'Not saved: the note is read only'), false);
  assert.deepEqual(heard, ['phrases/phrase_001.md']);
  off();
  handEditRefused('phrases/phrase_001.md', recipeEditRefusal(true));
  assert.deepEqual(heard, ['phrases/phrase_001.md']);
});

const ROOT = path.resolve(import.meta.dirname, '..');
const src = (f: string): string => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
test('MECHANISM pin: the two writers that can refuse a control for a hand edit (the phrase tab, the arrangement tab) report it, and the one subscriber is wired in score-first.ts only', () => {
  assert.match(src('phrase-view.ts'), /handEditRefused\(file\.path, refusal\)/);
  assert.match(src('kits-arrangements.ts'), /handEditRefused\(file\.path, refused\)/);
  assert.match(src('score-first.ts'), /onHandEditRefusal\(/);
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts') && n !== 'score-first.ts' && n !== 'hand-edit-refusal-core.ts')) assert.doesNotMatch(src(f), /onHandEditRefusal\(/, `${f} must not subscribe (P3: only a score-first vault listens)`);
});
