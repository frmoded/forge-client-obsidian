// 2026-11-24-1033 - `please duplicate [[bar_007]]` in a phrase composer: the pure parts. The sentence says a bar by its LINK; the grammar says it by NUMBER (`Copy bar 3.`); the drawn Score is what ties the two (the note name each bar of it was made from).
//   A  what the client knows and what the service was sent (the grammar table has a Copy row and no Duplicate row; the request carried no name per position)
//   B  the deterministic reading: one position -> `Copy bar K.`, several -> ask which in words, none -> `Bar 007 is not in this phrase.`
//   C  the request's optional `bar_names` (same length as `bar_numbers`; absent when unknown; an old request is unchanged)
//   and the DOM: the phrase tab writes the name on each drawn measure, the composer reads it back.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { LIST_MODEL_SENTINEL_DID_YOU_MEAN_CORE, drawnBarNames, duplicateByLink, repairCandidate, suggestRepair, offerRepair } from './did-you-mean-core.ts';
import { grammarTable, linesRequestFields } from './service-lines-core.ts';
import { BAR_NOTE_ATTR, paintBarNotes } from './selection-tint-dom.ts';

assert.ok(LIST_MODEL_SENTINEL_DID_YOU_MEAN_CORE);

// ---- A: the table the model was shown ---------------------------------------------------------------------------------------------------------------------------------------------------------
test('A: the table the client sends for a phrase has a COPY row (a range of bars, by number) and NO Duplicate row, and no row says a bar by its link', () => {
  const t = grammarTable('phrase');
  assert.ok(t.includes('copy: Copy bars 3 to 5.'), t.join(' | '));
  assert.ok(!t.some((r) => /duplicate/i.test(r)), 'no Duplicate row: the model had to know that Duplicate is Copy');
  assert.ok(!t.some((r) => /\[\[bar_/.test(r) && /^(copy|move|keep|delete):/.test(r)), 'no Copy/Move/Keep/Delete row has a link where it has a number');
});

// ---- B: the reading ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const NAMES = ['bar_005', 'bar_007', 'bar_005', 'bar_012'];
test('B: one position -> `Copy bar K.` for the position the Score gives the bar; the sentence forms (the politeness word before or after, Copy or Duplicate, case, full stop or none, alias, folder, .md)', () => {
  for (const s of ['please duplicate [[bar_007]]', 'Please duplicate [[bar_007]].', 'please, copy [[bar_007]]', 'Copy [[bar_007]].', 'copy [[bar_007]]', 'Copy [[bar_007]] please.', 'duplicate [[bar_007]] please', 'Please Duplicate [[bars/bar_007]].', 'Copy [[bar_007|the one]].', 'Copy [[bar_007.md]].', '  Copy   [[ bar_007 ]]  . ']) {
    const r = duplicateByLink(s, NAMES);
    assert.ok(r !== null && r.kind === 'copy', `${JSON.stringify(s)} -> ${JSON.stringify(r)}`);
    assert.equal((r as { sentence: string }).sentence, 'Copy bar 2.', s);
    assert.equal((r as { hint: string }).hint, 'bar_007 is bar 2 of this phrase.');
  }
});
test('B: SEVERAL positions: it asks which, in words, and never guesses (no sentence)', () => {
  const r = duplicateByLink('please duplicate [[bar_005]]', NAMES);
  assert.deepEqual(r, { kind: 'which', message: 'Bar 005 is bars 1 and 3 of this phrase: which one? Say Copy bar 1. or Copy bar 3.' });
  const three = duplicateByLink('Copy [[bar_005]].', ['bar_005', 'bar_005', 'bar_005']);
  assert.deepEqual(three, { kind: 'which', message: 'Bar 005 is bars 1, 2 and 3 of this phrase: which one? Say Copy bar 1., Copy bar 2. or Copy bar 3.' });
  const many = duplicateByLink('Copy [[bar_005]].', Array.from({ length: 9 }, () => 'bar_005'));
  assert.equal(many?.kind, 'which'); assert.match((many as { message: string }).message, /^Bar 005 is bars 1, 2, 3, 4, 5, 6, 7, 8 and 9 of this phrase: which one\? Say Copy bar N\. for the one you mean\.$/);
});
test('B: the bar is NOT in the phrase: `Bar 007 is not in this phrase.`, nothing to write; a name that is not `bar_N` is said with its link', () => {
  assert.deepEqual(duplicateByLink('please duplicate [[bar_007]]', ['bar_005', 'bar_005']), { kind: 'absent', message: 'Bar 007 is not in this phrase.' });
  assert.deepEqual(duplicateByLink('Copy [[kick_pattern]].', ['bar_005']), { kind: 'absent', message: '[[kick_pattern]] is not in this phrase.' });
});
test('B: not this shape, or the Score does not say: null (the sentence goes the way it always went)', () => {
  assert.equal(duplicateByLink('please duplicate [[bar_007]]', null), null, 'the Score gives no names: unknown, not "absent"');
  assert.equal(duplicateByLink('please duplicate [[bar_007]]', []), null, 'no drawn bar: unknown');
  for (const s of ['Copy bar 3.', 'Duplicate bar 3.', 'Copy bars 3 to 5.', 'Copy [[bar_007]] after bar 2.', 'Copy [[bar_007]] and [[bar_005]].', 'please duplicate bar_007', 'Copy [[bar_007]]. Delete bar 1.', 'Copy [[phrases/phrase_002]].', 'Copy [[]].', 'duplicate the kick', 'Move [[bar_007]].', 'unduplicate [[bar_007]]']) assert.equal(duplicateByLink(s, NAMES), null, s);
});
test('B: the sentence it writes is one the grammar READS (Copy bar K.), and the repair offers it with the words that say why', async () => {
  const c = repairCandidate('please duplicate [[bar_007]]', 'phrase', NAMES);
  assert.deepEqual(c, { sentence: 'Copy bar 2.', hint: 'bar_007 is bar 2 of this phrase.' });
  assert.equal(repairCandidate('please duplicate [[bar_007]]', 'phrase'), null, 'no names: no repair (as before)');
  assert.equal(repairCandidate('please duplicate [[bar_007]]', 'arrangement', NAMES), null, 'a phrase only');
  const said: unknown[] = [];
  const o = await offerRepair('please duplicate [[bar_007]]', 'phrase', (t) => /^Copy bar \d+\.$/.test(t), (ev) => said.push(ev), undefined, NAMES);
  assert.deepEqual(o, { ok: true, proposal: { description: 'Copy bar 2.', via: 'grammar', instead: 'Copy bar 2.' } });
  assert.equal((said[0] as { question: string }).question, 'Did you mean: Copy bar 2? bar_007 is bar 2 of this phrase.');
  assert.equal(await suggestRepair('please duplicate [[bar_007]]', 'phrase', () => false, undefined, NAMES), null, 'a reader that says no: nothing is offered');
});

// ---- the DOM: the phrase tab writes the name on each measure, the composer reads it ---------------------------------------------------------------------------------------------------------
const doc = (html: string): { host: Element; root: Element } => { const w: any = new Window({ url: 'http://localhost/' }); w.document.body.innerHTML = `<div class="forge-rhythm-score-host"><svg>${html}</svg></div>`; const host = w.document.querySelector('.forge-rhythm-score-host'); return { host, root: w.document.body }; };
test('DOM: paintBarNotes writes the note name of each phrase bar on its measure (fork wins, then the source; a bar from a phrase or a mix has none), and is idempotent (an observer must find no work in it)', () => {
  const { host } = doc('<g class="measure" id="ph_bar_1"></g><g class="measure" id="ph_bar_2"></g><g class="measure" id="ph_bar_3"></g><g class="measure" id="ph_bar_4"></g>');
  const prov = (params: Record<string, unknown>, role = 'phrase-bar') => ({ noteId: 'phrases/phrase_001', role, params });
  const map = { ph_bar_1: prov({ bar: 1, source: 'bar_005' }), ph_bar_2: prov({ bar: 2, source: 'bar_005', fork: 'bars/bar_012' }), ph_bar_3: prov({ bar: 3, source: 'phrases/phrase_002', transform: true }), ph_bar_4: prov({ bar: 4 }, 'mix-bar') };
  assert.equal(paintBarNotes(host, map), 2, 'two measures were written');
  assert.deepEqual([...host.querySelectorAll('g.measure')].map((g) => g.getAttribute(BAR_NOTE_ATTR)), ['bar_005', 'bar_012', null, null]);
  assert.equal(paintBarNotes(host, map), 0, 'a second paint changes nothing');
  assert.equal(BAR_NOTE_ATTR, 'data-forge-bar-note');
});
test('DOM: drawnBarNames reads them back, one per drawn measure; a measure without one, no measure, or no host = unknown (null)', () => {
  const ok = doc('<g class="measure" data-forge-bar-note="bar_005"></g><g class="measure" data-forge-bar-note="bar_007"></g>').host.parentElement!;
  assert.deepEqual(drawnBarNames(ok), ['bar_005', 'bar_007']);
  assert.equal(drawnBarNames(doc('<g class="measure" data-forge-bar-note="bar_005"></g><g class="measure"></g>').host.parentElement!), null, 'one bar has no name: the Score does not say');
  assert.equal(drawnBarNames(doc('').host.parentElement!), null);
  const stale = doc('<g class="measure" data-forge-bar-note="bar_005"></g>'); stale.host.classList.add('forge-rhythm-score-host-stale'); assert.equal(drawnBarNames(stale.host.parentElement!), null, 'a Score that is behind the list says nothing');
  const redraw = doc('<g class="measure" data-forge-bar-note="bar_005"></g>'); const next = redraw.host.ownerDocument.createElement('div'); next.className = 'forge-rhythm-score-host forge-rhythm-score-host-pending'; next.innerHTML = '<svg><g class="measure"></g></svg>'; redraw.host.parentElement!.insertBefore(next, redraw.host);
  assert.deepEqual(drawnBarNames(redraw.host.parentElement!), ['bar_005'], 'a Score still being drawn (pending) is not the one on screen');
  assert.equal(drawnBarNames(undefined), null); assert.equal(drawnBarNames(null), null);
  const w: any = new Window({ url: 'http://localhost/' }); w.document.body.innerHTML = '<div><g class="measure"></g></div>'; assert.equal(drawnBarNames(w.document.body), null, 'no Score host in the pane');
});

// ---- C: the request ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('C: linesRequestFields carries bar_names ONLY when it is given and as long as bar_numbers; an old call is unchanged (no key)', () => {
  const f = linesRequestFields({ family: 'phrase', list: [], barCount: 4, barNames: NAMES });
  assert.deepEqual(f.bar_names, NAMES); assert.equal(f.bar_names!.length, f.bar_numbers.length);
  assert.ok(!('bar_names' in linesRequestFields({ family: 'phrase', list: [], barCount: 4 })), 'absent when not given');
  assert.ok(!('bar_names' in linesRequestFields({ family: 'phrase', list: [], barCount: 4, barNames: null })));
  assert.ok(!('bar_names' in linesRequestFields({ family: 'phrase', list: [], barCount: 4, barNames: ['bar_005'] })), 'a different length is not sent: positions would be guessed');
  assert.ok(!('bar_names' in linesRequestFields({ family: 'phrase', list: [], barCount: null, barNames: [] })));
  assert.ok(!('bar_names' in linesRequestFields({ family: 'arrangement', list: [], barCount: 4, barNames: NAMES })), 'a phrase only');
  const old = linesRequestFields({ family: 'phrase', list: ['Keep bars 1 to 2.'], barCount: 4 });
  assert.deepEqual(Object.keys(old).sort(), ['bar_count', 'bar_numbers', 'grammar', 'instruction', 'list', 'mode', 'note_kind']);
});
