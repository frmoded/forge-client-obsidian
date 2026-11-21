// 2026-11-20-1002a - the driver's report: `Morph [[bar_005]] into [[bar_008]] over 27 bars, in musical order.` then `Delete bar 2 and bar 4.`; the dialog showed Applied, the applied line, and then
// `Removed: Delete bar 2 and bar 4.`, and the driver saw all the bars. THE FINDING (no code defect): "Removed:" is the UNDO notice only (description-apply stepList / bar-list-controller stepBar); no apply path
// says it. On the REAL engine (Pyodide) the replay of the two lines gives 25 bars at HEAD (and the real Score in Chrome: scripts/dev/measure-inspector-steps.mjs --only morph27, `bar N of 25`). These tests pin:
//   A. the CONTROLLER (the two-Enter path of build 1001 and the one-Enter path): after the Delete is applied the dialog never says "Removed:"; only Cmd/Ctrl+Z says it, and it takes the Delete back (the list
//      goes back to the Morph alone) and Shift+Cmd+Z puts it back;
//   B. the REAL ENGINE: the driver's phrase leaves 25 bars with `forge_steps {head: 27}`, the Delete of bar 4 in a 3-bar morph and of bar 2 in a 1-bar mix are refused in plain words (nothing written).
import assert from 'node:assert/strict';
import { test as baseTest, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';

import { dialogEntries } from './test-support/dialog-view.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { emptyPhraseNote } from './empty-note-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { PHRASE_VAULT, PLAYGROUND_PHRASES, asListNote } from './test-support/phrase-list-fixtures.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';
import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { barsOfPayload, noteContentFor, producePhraseNote, type PhraseParams } from './phrase-core.ts';
import * as L from './sentence-list-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';

const MORPH = 'Morph [[bar_005]] into [[bar_008]] over 27 bars, in musical order.';
const DELETE = 'Delete bar 2 and bar 4.';
const PH = 'phrases/phrase_001.md';
const win: any = new Window({ url: 'http://localhost/' });

function rig(preview: boolean) {
  const store = new Map<string, string>();
  for (const b of PHRASE_VAULT.bars) store.set(`bars/${b}.md`, PLAYGROUND_BARS[b] ?? PLAYGROUND_BARS['bar_001']);
  for (const [n, t] of Object.entries(PLAYGROUND_PHRASES)) store.set(`phrases/${n}.md`, asListNote(t, n));
  store.set(PH, emptyPhraseNote('x'));
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports = descriptionPortsFor({
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) store.set(p, next); },
    basenamesIn: (folder) => [...store.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: () => 1, clearTimer: () => {}, trace: () => {}, warn: () => {},
  }, { composerAutoApply: () => !preview });
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  panes.push({ path: PH, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const press = async (init: Record<string, unknown>) => { field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await flush(); };
  const say = async (s: string) => { field().value = s; field().dispatchEvent(new win.Event('input', { bubbles: true })); await press({ key: 'Enter' }); if (preview) await press({ key: 'Enter' }); };
  const list = () => extractDescription(store.get(PH)!).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''));
  const texts = () => dialogEntries(el).map((e) => e.text);
  return { ctl, el, press, say, list, texts, undo: (shift = false) => press({ key: shift ? 'Z' : 'z', metaKey: true, shiftKey: shift }), ready: async () => { await ctl.inspect(PH); await flush(); } };
}

for (const preview of [true, false]) {
  const way = preview ? 'two Enters (build 1001 / the setting "Preview before applying")' : 'one Enter (instant apply)';
  test(`A. ${way}: after the Delete is applied the dialog never says "Removed:"; Cmd/Ctrl+Z says it and takes the Delete back, Shift+Cmd+Z puts it back`, async () => {
    const r = rig(preview); await r.ready();
    await r.say(MORPH); await r.say(DELETE);
    assert.deepEqual(r.list(), [MORPH, DELETE], 'both lines are in the list');
    assert.ok(r.texts().some((t) => t.includes('Applied') && t.includes(DELETE)), 'the dialog says the Delete was applied');
    assert.ok(!r.texts().some((t) => /^Removed:/.test(t)), 'no "Removed:" until an undo is asked for');
    await r.undo();
    assert.deepEqual(r.list(), [MORPH], 'Cmd/Ctrl+Z took the Delete back: the Morph alone is left');
    assert.ok(r.texts().some((t) => t === `Removed: ${DELETE}`), 'the undo notice is the one the driver saw');
    await r.undo(true);
    assert.deepEqual(r.list(), [MORPH, DELETE], 'Shift+Cmd/Ctrl+Z put the Delete back');
  });
}

// ----- B. the real engine ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const FIX = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const NAMES = ['bar_005', 'bar_006', 'bar_007', 'bar_008'];
const files: Record<string, string> = {};
for (const n of NAMES) { const p = path.join(FIX, `${n}.md`); if (fs.existsSync(p)) files[`bars/${n}.md`] = fs.readFileSync(p, 'utf8'); }
async function run(lines: string[]) {
  const py = await engine();
  const deps = { readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found ' + p); return t; }, compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title) };
  const rp = L.replayGrammar(lines, 'phrase', { vault: { ...PHRASE_VAULT, bars: NAMES } as any });
  if (rp.stop) return { stop: rp.stop.message };
  const w: any = writeListNote(noteContentFor('phrase_015', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }), 'phrase_015', 'phrase', { params: rp.params, list: lines } as any);
  assert.ok(w.ok, 'the note is written');
  const out: any = await producePhraseNote(deps as never, w.text, 'phrase_015');
  return out.kind === 'score' ? { bars: (barsOfPayload(out.payload) as unknown[]).length, steps: out.payload.forge_steps ?? null } : { refusal: out.message as string };
}
const t = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 600_000 }, fn);
t('B. the REAL engine: the driver\'s phrase (a 27-bar Morph, then Delete bar 2 and bar 4) leaves 25 bars; the Morph alone has 27', async () => {
  const head = await run([MORPH]); assert.deepEqual(head, { bars: 27, steps: null });
  const both = await run([MORPH, DELETE]); assert.deepEqual(both, { bars: 25, steps: { head: 27 } });
});
t('B. the REAL engine: a short Morph (3 bars) and a Mix (1 bar) refuse the Delete in plain words, and say which bar is missing; a longer Morph and an Extend delete', async () => {
  const short: any = await run(['Morph [[bar_005]] into [[bar_008]] over 3 bars, in musical order.', DELETE]);
  assert.match(short.refusal, /the morph has 3 bars.*bar 4 asked for, but there are 3 bars/);
  const mix: any = await run(['Mix [[bar_005]] and [[bar_008]], 50 percent bar_005, as a vote.', DELETE]);
  assert.match(mix.refusal, /the mix has 1 bar.*bar 2 asked for, but there is 1 bar/);
  assert.equal(((await run(['Morph [[bar_005]] into [[bar_006]] over 6 bars, in musical order.', DELETE])) as any).bars, 4);
  assert.equal(((await run(['Extend [[bar_005]] to 8 bars, repeating with fills.', DELETE])) as any).bars, 6);
});
