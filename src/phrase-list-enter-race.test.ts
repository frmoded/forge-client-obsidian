// 2026-11-19-0980 (found by scripts/dev/measure-phrase-list.mjs in real Chrome: after `Thin out ...` was applied the note's list had the line but the composer's text area still held the sentence). What was asked: what does the composer do with a SECOND Enter
// that arrives while the first one's preview is still working, and is the stale text a bug? Evidence pinned here:
//   * a second Enter during `working` is SWALLOWED (ignored: not queued, not a second apply); the preview then waits for ITS Enter, with the text kept and nothing written; a third Enter applies ONCE and clears the field;
//   * Enters while `applying` are ignored too (one `process` call, one write);
//   * a text area that keeps its sentence after a "successful" write is an APPLY THAT FAILED AFTER THE WRITE (the vault's `process` wrote and then threw): the apply is reported failed, the sentence is kept so the person can say it again, the dialog says "Apply failed: ...".
//     That is exactly what happened in Chrome: the measure script's Score stand-in drew inside its `process`, handed every op of a Take (a thin_out too) to applyStructureOps, which threw `op.runs is not iterable` AFTER the note was stored; the stand-in is fixed (it applies only the structure steps, as the real Score does).
// A DOM element is never an assert operand (a failure would format the whole tree).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { dialogEntries } from './test-support/dialog-view.ts';
import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { emptyPhraseNote } from './empty-note-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PH = 'phrases/phrase_001.md';

function rig(opts: { throwAfterWrite?: boolean } = {}) {
  const store = new Map<string, string>([[PH, emptyPhraseNote('phrase_001')]]); let writes = 0, calls = 0; const state = { throwAfterWrite: opts.throwAfterWrite === true };
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { calls++; await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes++; if (state.throwAfterWrite) throw new Error('the Score could not be drawn'); } },
    vault: () => PHRASE_VAULT, barNames: () => PHRASE_VAULT.bars as string[], phraseNames: () => PHRASE_VAULT.phrases as string[],
    setTimer: () => 0, clearTimer: () => {}, trace: () => {}, panes: () => panes,
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el); panes.push({ path: PH, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  /** the keydown is dispatched NOW; the returned promise is the flush after it (so two calls without an await between are two Enters back to back) */
  const press = (key = 'Enter') => { field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })); return flush(); };
  const cls = (): string => (el.querySelector('.forge-prompt-box') as HTMLElement).className;
  const kinds = (k: string): number => dialogEntries(el).filter((e) => e.kind === k).length;
  return { ctl, store, el, flush, field, type, press, cls, kinds, state, writes: () => writes, calls: () => calls, ready: async () => { await ctl.inspect(PH); await flush(); } };
}

const CASES: Array<{ label: string; first?: string; sentence: string }> = [
  { label: 'a head (Take)', sentence: 'Take [[phrase_002]].' },
  { label: 'a Thin out line', first: 'Take [[phrase_002]].', sentence: 'Thin out bars 1 to 2, by half, keeping the downbeat.' },
  { label: 'a modifier line', first: 'Extend [[bar_005]] to 4 bars, repeating with fills.', sentence: 'Make it 8 bars long.' },
  { label: 'a replacing head', first: 'Extend [[bar_005]] to 4 bars, repeating with fills.', sentence: 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.' },
];
for (const c of CASES) {
  test(`${c.label}: two Enters back to back: the second is SWALLOWED (the preview was still working), nothing is written, the text stays; a third Enter applies ONCE and empties the field`, async () => {
    const r = rig(); await r.ready();
    if (c.first !== undefined) { r.type(c.first); await r.press(); await r.press(); assert.equal(r.writes(), 1, 'the premise: the first line is in'); }
    const w = r.writes(), calls = r.calls();
    r.type(c.sentence);
    const a = r.press(), b = r.press();                                           // no await between: the second Enter arrives while the first one's preview is working
    await Promise.all([a, b]); await r.flush();
    assert.equal(r.writes(), w, 'nothing was written: the second Enter did not apply'); assert.equal(r.calls(), calls);
    assert.equal(r.field().value, c.sentence, 'the text is kept');
    assert.ok(r.cls().includes('is-previewing'), 'the preview is waiting for its own Enter');
    assert.equal(r.kinds('suggestion'), (c.first === undefined ? 0 : 1) + 1, 'ONE preview for this sentence, not two');
    await r.press(); await r.flush();
    assert.equal(r.writes(), w + 1, 'the third Enter applied once'); assert.equal(r.calls(), calls + 1);
    assert.equal(r.field().value, '', 'and the field is empty');
    assert.ok(!r.cls().includes('is-edited') && !r.cls().includes('is-previewing'));
  });
}

test('Enters while the apply is writing are ignored: three Enters back to back after the preview make ONE process call and ONE write', async () => {
  const r = rig(); await r.ready();
  r.type('Take [[phrase_002]].'); await r.press(); assert.ok(r.cls().includes('is-previewing'));
  const all = [r.press(), r.press(), r.press()]; await Promise.all(all); await r.flush();
  assert.equal(r.writes(), 1); assert.equal(r.calls(), 1); assert.equal(r.field().value, ''); assert.equal(r.kinds('applied'), 1);
});

test('an apply that FAILS AFTER the write (the vault stored the note, then process threw) is reported failed and KEEPS the sentence in the field, so it can be said again: this is the stale text seen in real Chrome (the measure stand-in threw while drawing, inside `process`)', async () => {
  const r = rig({ throwAfterWrite: true }); await r.ready();
  const errors: unknown[][] = []; const o = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    r.type('Take [[phrase_002]].'); await r.press(); await r.press();
  } finally { console.error = o; }
  assert.equal(r.writes(), 1, 'the list HAS the line (the note was stored before the throw)');
  assert.equal(r.field().value, 'Take [[phrase_002]].', 'the field still holds the sentence');
  assert.equal(r.kinds('applied'), 0); assert.deepEqual(dialogEntries(r.el).filter((e) => e.kind === 'failed').map((e) => e.text), ['Apply failed: Apply: the Score could not be drawn']);
  assert.equal(errors.length, 1); assert.equal(errors[0][0], '[forge-promptbox] could not write the Description');          // 2026-11-23-1022 (deliberate): the Description wording
  assert.ok(r.cls().includes('is-edited'), 'and it is still an unsent sentence');
});
