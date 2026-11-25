// 2026-11-24-1033 - THE NAMES REACH THE COMPOSER, end to end on the surface a person uses (happy-dom): the REAL phrase tab (mountPhrase paints, on every drawn measure, the note that made the bar) and the REAL composer + dialog (the description controller) in the SAME tab element.
// `please duplicate [[bar_009]]` in a phrase whose bar 3 was forked into bar_009 says `Copy bar 3.` (the Score decided: the service is not even set up in this rig); a bar the phrase does not hold is refused in words; a bar it holds at several positions is asked about; a transform's bars have no
// bar note, so the Score does not say and the sentence goes the old way. The rig is the 0992 gesture rig (duplicate-click-wiring.test.ts), unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';
import { registerBarSelectionHost } from './bar-selection-bus.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { dialogButtons, dialogEntries } from './test-support/dialog-view.ts';
import { installHostClock } from './test-support/host-workspace.ts';
import { planNewBar } from './score-first-core.ts';
import { pinnedNoteFor } from './linked-panes-core.ts';
import { MORPH_BAR_ROLE } from './morph-lineage-core.ts';

const BAR = (planNewBar({ existingBasenames: [], exists: () => false }) as { content: string }).content;
const xmlFor = (bars: number) => {
  const part = (p: number) => `<part id="P${p}">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><attributes><divisions>4</divisions></attributes><direction><sound tempo="100"/></direction><note><rest/><duration>16</duration></note></measure>`).join('')}</part>`;
  return `<score-partwise>${part(1)}${part(2)}</score-partwise>`;
};
const barOf = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100 - n, channels: { kick: Array(16).fill(false), snare: Array(16).fill(false) } });
const win: any = new Window({ url: 'http://localhost/' });
const FORKED: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0, overrides: { '3': 'bars/bar_009', '6': 'bars/bar_002' } };
const TRANSFORM: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }] };

async function rig(phrase: PhraseParams, opts: { host?: boolean; composer?: boolean } = {}) {
  const clock = installHostClock(win);
  const notePath = 'phrases/phrase_020.md';
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([['bars/bar_005.md', BAR], ['bars/bar_002.md', BAR], ['bars/bar_009.md', BAR], ['phrases/phrase_006.md', noteContentFor('phrase_006', { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 })], [notePath, noteContentFor('phrase_020', phrase)]]);
  const phraseWrites: unknown[] = []; const pins: unknown[] = []; let processCalls = 0; const creates: string[] = []; const timers: Array<() => void> = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ctl = createDescriptionController(descriptionPortsFor({
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { processCalls++; const cur = files.get(p)!; const next = fn(cur); if (next !== cur) files.set(p, next); },
    basenamesIn: (folder) => [...files.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, warn: () => {},
    create: async (p: string, c: string) => { if (files.has(p)) throw new Error('File already exists.'); files.set(p, c); creates.push(p); }, exists: (p: string) => files.has(p), isAlreadyExists: (e: unknown) => /already exists/i.test((e as Error)?.message ?? ''),
  }, {}));
  const off = opts.host === false ? () => {} : registerBarSelectionHost({
    appendLine: (p, s) => ctl.appendLine(p, s), makePhrase: async () => ({ ok: true as const, path: 'phrases/phrase_099.md' }),
    duplicateArmed: (p) => ctl.duplicateArmed(p), duplicateClick: (p, id, bar) => ctl.duplicateClick(p, id, bar),      // 2026-11-19-0996b (deliberate): the bar's number rides along, as score-first.ts registers it
  });
  const ports: PhraseMountPorts = {
    path: notePath, title: 'phrase_020', plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (p: unknown) => { phraseWrites.push(p); return { ok: true }; },
    compute: async (data: any, params) => {
      const bars = params.kind === 'transform' ? data.bars : Array.from({ length: (params as any).bars ?? 8 }, (_, i) => barOf(i));
      return { type: 'musicxml', content: xmlFor(bars.length), multi_staff_content: xmlFor(bars.length), kit_content: xmlFor(bars.length), bars_data: bars };
    },
    renderInto: (host, payload) => {
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(String(payload.multi_staff_content))![1];
      const ids = [...first.matchAll(/<measure number="\d+" id="([^"]+)"/g)].map((m) => m[1]);
      host.innerHTML = `<svg>${ids.map((id) => `<g class="measure" id="${id}"><g class="note" id="n_${id}"></g></g>`).join('')}</svg>`;
      host.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBBox = () => ({ x: 100 * i, y: 0, width: 90, height: 50 }); });
      return true;
    },
    stopPlayers: () => {},
    setTimer: (fn, ms) => (globalThis as any).setTimeout(fn, ms) as number, clearTimer: (h) => (globalThis as any).clearTimeout(h), now: () => 0,
    inspector: { openNote: () => {}, onPin: (p: unknown) => { pins.push(p); } },
  } as never;
  const handle = mountPhrase(parent, ports);
  await handle.load(); await clock.advance(400);
  if (opts.composer !== false) { panes.push({ path: notePath, contentEl: parent, tab: true }); await ctl.inspect(notePath); for (let i = 0; i < 240; i++) await Promise.resolve(); }
  const bars = () => [...parent.querySelectorAll('g.measure')] as any[];
  const click = (el: any, init: object = {}) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, ...init }));
  const field = () => parent.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const flush = async () => { for (let i = 0; i < 240; i++) await Promise.resolve(); await clock.advance(20); };
  const press = async (init: Record<string, unknown>) => { field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await flush(); };
  const suggestion = () => [...parent.querySelectorAll('.forge-chat-suggestion-description')].pop()?.textContent ?? '';
  const count = () => (parent.querySelector('.forge-bar-selection .forge-bar-selection-count') as any)?.textContent as string | undefined;
  return { handle, parent, files, pins, bars, click, field, type, press, flush, suggestion, count, creates, notePath, phraseWrites, calls: () => processCalls, ctl, buttons: () => dialogButtons(parent), entries: () => dialogEntries(parent), done: () => { off(); handle.dispose(); ctl.dispose(); clock.restore(); } };

}

test('end to end: the tab paints the note of every bar; `please duplicate [[bar_009]]` is `Copy bar 3.` (a fork gives its own bar note), `Copy [[bar_002]].` is bar 6', async () => {
  const r = await rig(FORKED);
  assert.deepEqual(r.bars().map((g: any) => g.getAttribute('data-forge-bar-note')), ['bar_005', 'bar_005', 'bar_009', 'bar_005', 'bar_005', 'bar_002', 'bar_005', 'bar_005']);
  r.type('please duplicate [[bar_009]]'); await r.press({ key: 'Enter' });
  assert.ok(r.entries().map((e: any) => e.text).includes('Did you mean: Copy bar 3? bar_009 is bar 3 of this phrase.'), r.entries().map((e: any) => e.text).join(' | '));
  r.type('Copy [[bar_002]].'); await r.press({ key: 'Enter' });
  assert.ok(r.entries().map((e: any) => e.text).includes('Did you mean: Copy bar 6? bar_002 is bar 6 of this phrase.'), r.entries().map((e: any) => e.text).join(' | '));
  r.done();
});
// 2026-11-24-1037 (deliberate): the one wording (`There is no bar named bar_007 in this phrase.`) and the which-question said as `bar_005 is bars ...: which one? Say Copy bar N.` (no `for the one you mean`).
test('end to end: a bar the phrase does not hold is refused in words; a bar it holds at several positions is asked about (never guessed); nothing is written', async () => {
  const r = await rig(FORKED); const before = r.files.get(r.notePath);
  r.type('please duplicate [[bar_007]]'); await r.press({ key: 'Enter' });
  r.type('please duplicate [[bar_005]]'); await r.press({ key: 'Enter' });
  const t = r.entries().map((e: any) => e.text);
  assert.ok(t.includes('There is no bar named bar_007 in this phrase.'), t.join(' | ')); assert.ok(t.includes('bar_005 is bars 1, 2, 4, 5, 7 and 8 of this phrase: which one? Say Copy bar N.'), t.join(' | '));
  assert.equal(r.files.get(r.notePath), before, 'the note is not written'); r.done();
});
test('end to end: a transform\'s bars have no bar note: the Score says nothing, so the sentence is not read here (the old path)', async () => {
  const r = await rig(TRANSFORM);
  assert.ok(r.bars().length > 0); assert.ok(r.bars().every((g: any) => g.getAttribute('data-forge-bar-note') === null));
  r.type('please duplicate [[bar_009]]'); await r.press({ key: 'Enter' });
  assert.ok(!r.entries().some((e: any) => /^Did you mean: Copy bar|There is no bar named/.test(e.text)), r.entries().map((e: any) => e.text).join(' | ')); r.done();
});
