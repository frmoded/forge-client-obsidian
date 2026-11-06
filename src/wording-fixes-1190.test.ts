// 2026-11-06-1190 (CCQA smokes 14 to 16): three small wording fixes, tests first.
//  (a) a notebook refusal the service wrote that names the engine's operations (`thin_out`, `double_up`) says them in the op picker's words ("thin out", "double up"), mapped in ONE pure function;
//  (b) the New composition dialog's Name placeholder is the name the note will get (the next free one), not always `comp_001`;
//  (c) a note that already IS a custom note is told "this note stays a custom note", not "the note becomes a custom note".
// The three wiring tests at the end pin the MECHANISM (X calls Y); if the design moves they SHOULD go red - reassess, don't just rewrite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { interpretTransformResponse, opWordsIn } from './notebook-request-core.ts';
import { nextCompositionName } from './composition-core.ts';
import { mountCompositionDialog } from './composition-dialog-dom.ts';
import { pythonCustomBarMessage } from './description-apply-core.ts';
import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { DESCRIPTION_DEBOUNCE_MS } from './description-apply-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { isCustomNote } from './phrase-notes-core.ts';

const SRC = path.resolve(import.meta.dirname);
const read = (f: string): string => fs.readFileSync(path.join(SRC, f), 'utf8');

// ---- (a) -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('(a) opWordsIn: both operation names become the op picker\'s words, everywhere in the sentence; a text with neither is returned untouched; the engine\'s function names are not operation names', () => {
  assert.equal(opWordsIn('Cannot mix two bars with a 30/70 ratio; only thin_out and double_up operations are supported'), 'Cannot mix two bars with a 30/70 ratio; only thin out and double up operations are supported');
  assert.equal(opWordsIn('Cannot reverse the sequence of hits; only thin_out and double_up operations are supported'), 'Cannot reverse the sequence of hits; only thin out and double up operations are supported');
  assert.equal(opWordsIn('thin_out thin_out, double_up.'), 'thin out thin out, double up.', 'every occurrence');
  const plain = 'Cannot change volume; only thinning out or doubling up hits is supported';
  assert.equal(opWordsIn(plain), plain, 'a text with neither name');
  assert.equal(opWordsIn(''), '');
  assert.equal(opWordsIn('thin_out_bars: bar 9 is past the last bar'), 'thin_out_bars: bar 9 is past the last bar', 'thin_out_bars / double_up_bars are the engine\'s functions, quoted as the engine said them');
  assert.notEqual(opWordsIn('only thin_out'), 'only thin_out', 'CONTROL: the mapping does something');
});

test('(a) the notebook\'s refusal from the service goes through it: the sentence the person reads has the picker\'s words, not the engine\'s names', () => {
  const refused = interpretTransformResponse({ status: 200, json: { ok: false, plan: null, error: 'Cannot mix two bars with a 30/70 ratio; only thin_out and double_up operations are supported' } }, { source: 'phrases/phrase_006', runs: [[3, 5]], row: 'kick' });
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.message, 'Cannot mix two bars with a 30/70 ratio; only thin out and double up operations are supported');
  const volume = interpretTransformResponse({ status: 200, json: { ok: false, plan: null, error: 'Cannot change volume; only thinning out or doubling up hits is supported' } }, { source: 'phrases/phrase_006', runs: [[3, 5]], row: 'kick' });
  assert.equal(volume.ok === false && volume.message, 'Cannot change volume; only thinning out or doubling up hits is supported', 'the sentence that was already fine is unchanged');
});

test('(a) MECHANISM PIN: the mapping lives in notebook-request-core.ts only and the refusal text passes through it there; the shared planRefusalText (the sentence dialog\'s too) is not touched', () => {
  const core = read('notebook-request-core.ts');
  assert.match(core, /message: opWordsIn\(planRefusalText\(json\)\)/);
  assert.equal((core.match(/export function opWordsIn|export const opWordsIn/g) ?? []).length, 1);
  assert.doesNotMatch(read('sentence-plan-core.ts'), /opWordsIn|thin out/, 'P3: the shared planner text is as it was');
});

// ---- (b) -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const win: any = new Window({ url: 'http://localhost/' });
function dialog(nextName: string) {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  mountCompositionDialog(parent, { phrases: ['phrases/phrase_003'], arrangements: [], compositions: [], hasRoot: false, nextName, create: async () => ({ ok: true, path: 'compositions/x.md' }), close: () => {} });
  return parent.querySelector('.forge-comp-name') as any;
}

test('(b) the Name placeholder is the name the note will get: comp_002 when comp_001 exists, comp_004 when 1 to 3 do', () => {
  assert.equal(dialog('comp_002').placeholder, 'comp_002');
  assert.equal(dialog('comp_004').placeholder, 'comp_004');
  assert.equal(dialog('comp_001').placeholder, 'comp_001', 'the first note of a vault is still comp_001');
  assert.equal(dialog('comp_002').value, '', 'a placeholder, not a value: an empty Name still means "the next free one"');
});

test('(b) MECHANISM PIN: the placeholder\'s name is the one nextCompositionName picks, from the vault\'s files at the moment the dialog opens (the same function Create uses)', () => {
  const comps = read('compositions.ts');
  assert.match(comps, /nextName: nextCompositionName\(\(p\) => app\.vault\.getAbstractFileByPath\(p\) !== null\)/);
  assert.match(read('composition-dialog-dom.ts'), /name\.placeholder = ports\.nextName;/);
  assert.equal(nextCompositionName((p) => p === 'compositions/comp_001.md'), 'comp_002', 'CONTROL: the function does skip a taken name');
});

// ---- (c) -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('(c) pythonCustomBarMessage: a note that is not custom yet becomes one; one that already is stays one (and neither says the other\'s words)', () => {
  assert.equal(pythonCustomBarMessage(false), 'The Python is not a shape the controls know: the note becomes a custom note.');
  assert.equal(pythonCustomBarMessage(true), 'The Python is not a shape the controls know: this note stays a custom note.');
  assert.doesNotMatch(pythonCustomBarMessage(true), /becomes/);
  assert.doesNotMatch(pythonCustomBarMessage(false), /stays/);
});

const PATH = 'phrases/phrase_001.md';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const THIN = "  bars[1] = thin_out_bars(bars=[bars[1]], first=1, last=1, amount=0.5)[0]\n  return bars";
const withPython = (text: string, edit: (py: string) => string): string => { const py = (text.match(/```python\n([\s\S]*?)\n```/) as RegExpMatchArray)[1]; return text.replace(py, edit(py)); };
const msg = (el: HTMLElement): string => el.querySelector('.forge-description-message')?.textContent ?? '';

/** A small stand-in vault (the ports of description-apply.test.ts): one note, a clock the test moves. */
function rig(start: string) {
  const store = new Map<string, string>([[PATH, start]]);
  const doc = win.document;
  const panes: Array<{ path: string; contentEl: HTMLElement }> = [];
  let now = 0, ids = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) store.set(p, next); },
    vault: () => ({ bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003'], arrangements: [], compositions: [], kits: [] }),
    barNames: () => ['bar_007', 'bar_008'], phraseNames: () => ['phrase_001'],
    setTimer: (fn, ms) => { const id = ++ids; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    trace: () => {}, panes: () => panes,
  };
  const ctl = createDescriptionController(ports);
  const pane = (): HTMLElement => { const el = doc.createElement('div'); doc.body.appendChild(el); panes.push({ path: PATH, contentEl: el }); return el as HTMLElement; };
  const advance = async (ms: number): Promise<void> => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((x, y) => x.at - y.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } for (let i = 0; i < 30; i++) await Promise.resolve(); };
  return { store, ctl, pane, advance };
}

test('(c) the bar of a note that is ALREADY custom, whose Python was edited again to another shape the grammar does not know, says "this note stays a custom note"; a note that is not custom yet keeps "becomes"', async () => {
  const original = noteContentFor('phrase_001', EXTEND);
  const first = rig(original);
  first.store.set(PATH, withPython(original, (py) => py.replace('  return bars', THIN)));
  first.ctl.modified(PATH); await first.advance(DESCRIPTION_DEBOUNCE_MS);
  const custom = first.store.get(PATH)!;
  assert.equal(isCustomNote(custom), true, 'setup: the note is custom');
  // the person edits the custom Python again (not applied yet: opened with inspect)
  const again = rig(withPython(custom, (py) => py.replace('amount=0.5', 'amount=0.25')));
  const a = again.pane();
  await again.ctl.inspect(PATH);
  assert.match(msg(a), /this note stays a custom note/, `bar says: ${msg(a)}`);
  assert.doesNotMatch(msg(a), /becomes/);
});

test('(c) MECHANISM PIN: the bar\'s sentence for the python-custom state comes from pythonCustomBarMessage(st.already), the flag the state already carried', () => {
  assert.match(read('description-apply.ts'), /st\.kind === 'python-custom'\) return \{ message: u\.message \?\? pythonCustomBarMessage\(st\.already\)/);
});
