// 2026-11-20-1004 - the SETUP core: what the composer's controller hands in when a sentence ends unprocessed (`noteFailure`: the record's input is built from what the controller knows, never from file names), the grammar check the review tab uses
// (the composer's own: list kinds through planAppend over the item's lines, bars through planBarAppend), the failure list, the "+" menu entry, and P3 (the port is optional: absent = nothing happens).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createReview, noteFailure, REVIEW_MENU_ID, type FailedPromptsPort, type ReviewDeps } from './failed-prompt-setup-core.ts';
import { emptyPhraseNote } from './empty-note-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';
import { makeRecord, type FailedRecord, type FailureInput } from './failed-prompt-core.ts';
import type { FileAdapter } from './failed-prompt-store.ts';

const win: any = new Window({ url: 'http://localhost/' });
const noteWith = (lines: string[]) => emptyPhraseNote('x').replace(/# Description[\s\S]*?(?=\n# |\n```|$)/, `# Description\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n`);
const EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';

test('noteFailure builds the record input from what the controller knows: the typed sentence, the note\'s canonical lines (parsed from the note text), the DRAWN bar count, the grammar\'s words, the service result; no path, no body', () => {
  const got: FailureInput[] = []; const port: FailedPromptsPort = { record: (i) => { got.push(i); }, known: () => null };
  const pane = win.document.createElement('div'); pane.innerHTML = `<div class="forge-rhythm-score-host"><svg>${'<g class="measure"></g>'.repeat(4)}</svg></div>`;
  noteFailure(port, { family: 'phrase', sentence: 'swap them', cur: noteWith([EXTEND]), vault: PHRASE_VAULT as never, pane, grammar: { message: 'Expected X.', column: 3 }, service: { result: 'refused', text: 'No.' } });
  assert.deepEqual(got, [{ kind: 'phrase', sentence: 'swap them', lines: [EXTEND], barCount: 4, grammarError: { message: 'Expected X.', column: 3 }, service: { result: 'refused', text: 'No.' } }]);
  assert.ok(!JSON.stringify(got).includes('phrase_'), 'no note name is in it');
});

test('a bar record carries the bar\'s own lines, no bar count; a note with no Score has a null count; no pane = null; absent port = nothing happens', () => {
  const got: FailureInput[] = []; const port: FailedPromptsPort = { record: (i) => { got.push(i); }, known: () => null };
  noteFailure(port, { family: 'bar', sentence: 'x', lines: ['Set the tempo to 96.'], grammar: null, service: { result: 'none' } });
  noteFailure(port, { family: 'phrase', sentence: 'y', cur: noteWith([]), vault: PHRASE_VAULT as never, pane: win.document.createElement('div'), grammar: null, service: { result: 'none' } });
  assert.deepEqual(got.map((g) => [g.kind, g.lines, g.barCount]), [['bar', ['Set the tempo to 96.'], null], ['phrase', [], null]]);
  assert.doesNotThrow(() => noteFailure(undefined, { family: 'bar', sentence: 'x', lines: [], grammar: null, service: { result: 'none' } }));
});

function adapter() {
  const files = new Map<string, string>();
  const a: FileAdapter = { read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('ENOENT'); return t; }, write: async (p, t) => { files.set(p, t); }, append: async (p, t) => { files.set(p, (files.get(p) ?? '') + t); }, exists: async (p) => files.has(p) };
  return { files, a };
}
function deps(over: Partial<ReviewDeps> = {}) {
  const m = adapter(); const copied: string[] = []; let on = true;
  const d: ReviewDeps = { adapter: m.a, dir: 'plug', enabled: () => on, build: () => 'b', now: () => 1_700_000_000_000, rand: () => 0.3, warn: () => {}, vault: () => PHRASE_VAULT as never, active: () => null, applyLines: async () => ({ ok: true, message: 'Added.' }), copy: async (t) => { copied.push(t); }, ...over };
  return { d, m, copied, setOn: (v: boolean) => { on = v; } };
}
const item = (over: Partial<FailureInput> = {}): FailedRecord => makeRecord({ kind: 'phrase', sentence: 's', lines: [EXTEND], barCount: 4, grammarError: null, service: { result: 'none' }, ...over }, { id: 'a', time: 't', build: 'b', vaultId: 'v' });

test('the tab\'s grammar check is the COMPOSER\'S: each line is checked after the ones above it over the item\'s own lines; a refused line comes back in the grammar\'s words; a bar uses the bar grammar', async () => {
  const r = createReview(deps().d);
  const out = await r.tabPorts.check(item(), ['Keep bars 1 to 2.', 'Make it sparkle.', 'Delete bar 3.']);
  assert.equal(out[0], null); assert.match(out[1] ?? '', /did not accept this sentence/); assert.equal(out[2], null);
  const bar = await r.tabPorts.check(item({ kind: 'bar', lines: ['Set the tempo to 96.'] }), ['Hit kick on steps 1, 5 and 9.', 'Frobnicate the kick.']);
  assert.equal(bar[0], null); assert.match(bar[1] ?? '', /do not know how to read|did not accept/i);
  const empty = await r.tabPorts.check(item({ lines: [] }), ['Keep bars 1 to 2.']); assert.match(empty[0] ?? '', /did not accept|head|Extend|start/i);
});

test('"Apply to the open note" goes through the controller\'s own appendLine, one canonical line after the other, and says what happened; the open note is asked at the moment of the click', async () => {
  const calls: string[] = []; const { d } = deps({ active: () => ({ path: 'phrases/phrase_001.md', kind: 'phrase', lines: [EXTEND] }), applyLines: async (p, ls) => { calls.push(`${p}: ${ls.join(' | ')}`); return { ok: true, message: `Added ${ls.length}.` }; } });
  const r = createReview(d); assert.deepEqual(r.tabPorts.active(), { path: 'phrases/phrase_001.md', kind: 'phrase', lines: [EXTEND] });
  assert.deepEqual(await r.tabPorts.applyLines('phrases/phrase_001.md', ['Keep bars 1 to 2.']), { ok: true, message: 'Added 1.' }); assert.deepEqual(calls, ['phrases/phrase_001.md: Keep bars 1 to 2.']);
});

test('the port the composer uses: record writes the line when ON and nothing when OFF; known() is the personal table; the "+" menu entry exists only when something waits', async () => {
  const { d, m, setOn } = deps(); const r = createReview(d);
  assert.equal(r.menuItem(), null); r.port.record({ kind: 'phrase', sentence: 'swap them', lines: [], barCount: null, grammarError: null, service: { result: 'none' } }); await r.settle();
  assert.equal(r.menuItem()?.id, REVIEW_MENU_ID); assert.equal(r.menuItem()?.label, 'Review unprocessed (1)');
  assert.ok([...m.files.keys()].some((k) => k.endsWith('failed-prompts.jsonl')));
  setOn(false); assert.equal(r.menuItem(), null); r.port.record({ kind: 'phrase', sentence: 'two', lines: [], barCount: null, grammarError: null, service: { result: 'none' } }); await r.settle();
  assert.equal(m.files.get('plug/failed-prompts.jsonl')!.trim().split('\n').length, 1, 'OFF writes nothing');
  assert.equal(r.port.known('swap them'), null);
});

test('the weekly list: `failureText` is the top failed sentences by count (the clipboard text) and is also what the command copies', async () => {
  const { d, copied } = deps(); const r = createReview(d);
  for (const s of ['Swap them.', 'swap them', 'Make it funky']) r.port.record({ kind: 'phrase', sentence: s, lines: [], barCount: null, grammarError: null, service: { result: 'none' } });
  await r.settle(); const text = await r.failureText(); assert.match(text, /^Failed sentences \(top 2 of 2 different, 3 in all\)\n2\tswap them\n1\tmake it funky$/);
  await r.copyFailureList(); assert.deepEqual(copied, [text]);
});
