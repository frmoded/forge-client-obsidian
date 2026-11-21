// 2026-11-20-1004 - mutation survivors of failed-prompt-tab-dom.ts, pinned: the words of every panel and message (a golden of what a person reads), the structure (classes, labels, roles), what each action resets, focus, the stale-check guard, the apply plan,
// the plural forms, the skip order, and the keys that must do nothing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountReviewTab, LIST_MODEL_SENTINEL_FAILED_PROMPT_TAB_DOM, type ReviewTabPorts } from './failed-prompt-tab-dom.ts';
import { makeRecord, type FailedRecord, type FailureInput } from './failed-prompt-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const input = (over: Partial<FailureInput> = {}): FailureInput => ({ kind: 'phrase', sentence: 'swap them', lines: ['L1', 'L2'], barCount: 4, grammarError: { message: 'Expected X.', column: 3 }, service: { result: 'refused', text: 'No plan.' }, ...over });
const rec = (id: string, time: string, over: Partial<FailureInput> = {}): FailedRecord => makeRecord(input(over), { id, time, build: 'B1', vaultId: 'v' });
const A = rec('a', '2026-11-21T01:00:00.000Z'), B = rec('b', '2026-11-21T02:00:00.000Z', { sentence: 'two' }), C = rec('c', '2026-11-21T03:00:00.000Z', { sentence: 'three', barCount: null, lines: [], grammarError: null, service: { result: 'none' } });

const labelOf = (host: HTMLElement, sel: string): string | undefined => { const id = (host.querySelector(sel) as HTMLElement).getAttribute('aria-labelledby'); return id === null ? undefined : host.ownerDocument.getElementById(id)?.textContent ?? undefined; };
function rig(records: FailedRecord[], over: Partial<ReviewTabPorts> = {}) {
  const store = { records: [...records], saves: 0 }; const copied: string[] = []; const applied: Array<[string, string[]]> = []; let on = true; const checks: string[][] = [];
  const ports: ReviewTabPorts = {
    enabled: () => on, load: async () => store.records, save: async (r) => { store.records = [...r]; store.saves++; },
    check: async (_i, lines) => { checks.push(lines); return lines.map((l) => (l.startsWith('OK') ? null : `bad: ${l}`)); },
    copy: async (t) => { copied.push(t); }, exportResolved: async () => ({ count: store.records.filter((r) => r.resolution).length, file: 'dir/sub/out.jsonl' }),
    active: () => null, applyLines: async (p, ls) => { applied.push([p, ls]); return { ok: true, message: 'Done.' }; }, now: () => 'NOW', ...over,
  };
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const tab = mountReviewTab(host, ports);
  const flush = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
  const q = (s: string) => host.querySelector(s) as HTMLElement | null; const qa = (s: string) => [...host.querySelectorAll(s)] as HTMLElement[];
  const click = async (s: string) => { (q(s) as HTMLElement).dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await flush(); };
  const key = async (k: string, init: Record<string, unknown> = {}, target?: HTMLElement) => { const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }); (target ?? host).dispatchEvent(e); await flush(); return e.defaultPrevented as boolean; };
  const type = async (s: string, text: string) => { const el = q(s) as HTMLTextAreaElement; el.value = text; el.dispatchEvent(new win.Event('input', { bubbles: true })); await flush(); };
  return { host, store, copied, applied, checks, tab, flush, q, qa, click, key, type, setOn: (v: boolean) => { on = v; }, text: () => host.textContent ?? '' };
}

test('the sentinel; the words of the whole tab for one item (a golden of what a person reads), in order', async () => {
  assert.equal(LIST_MODEL_SENTINEL_FAILED_PROMPT_TAB_DOM, 'forge-list-model-core:failed-prompt-tab-dom');
  const r = rig([A]); await r.tab.refresh();
  assert.equal(r.text(), 'Unprocessed sentences1 waitingUndo the last resolution (U)Export the resolved sentencesswap themphrase, 4 bars, B1, 2026-11-21T01:00:00.000ZThe note\'s linesL1L2The grammar said: Expected X. (column 3)The service: refused — No plan.Write the lines (W)Teach a word (T)Not a request (N)Ask the person (A)Skip (S)');
  assert.deepEqual(r.qa('h3, p, ol, div, button').map((e) => e.className), ['forge-review-title', 'forge-review-count forge-review-muted', 'forge-review-row', 'forge-review-undo', 'forge-review-export', 'forge-review-card', 'forge-review-sentence', 'forge-review-meta forge-review-muted', 'forge-review-label', 'forge-review-lines', 'forge-review-grammar', 'forge-review-service', 'forge-review-actions forge-review-row', 'forge-review-act forge-review-act-w', 'forge-review-act forge-review-act-t', 'forge-review-act forge-review-act-n', 'forge-review-act forge-review-act-a', 'forge-review-act forge-review-act-s', 'forge-review-panel', 'forge-review-status forge-review-muted']);
  assert.ok(r.host.classList.contains('forge-review-tab')); assert.equal(r.q('.forge-review-status')!.getAttribute('role'), 'status'); assert.equal(r.qa('button').every((b) => b.getAttribute('type') === 'button'), true);
});

test('the item with no Score, no lines, no grammar message and a service that said nothing', async () => {
  const r = rig([C]); await r.tab.refresh();
  assert.equal(r.text(), 'Unprocessed sentences1 waitingUndo the last resolution (U)Export the resolved sentencesthreephrase, no Score drawn, B1, 2026-11-21T03:00:00.000ZThe note\'s linesThe note had no lines.The grammar said: nothing was recorded.The service: noneWrite the lines (W)Teach a word (T)Not a request (N)Ask the person (A)Skip (S)');
});

test('the words of each panel, the box labels and rows, and the save button starting disabled', async () => {
  const r = rig([A]); await r.tab.refresh();
  await r.key('w'); assert.match(r.q('.forge-review-panel')!.textContent ?? '', /^One canonical sentence per line\. Each line is checked by the same grammar the composer uses\.Canonical sentences, one per lineSave the linesCopy lines$/);
  assert.equal(labelOf(r.host, '.forge-review-lines-box'), 'Canonical sentences, one per line'); assert.equal(Number((r.q('.forge-review-lines-box') as HTMLTextAreaElement).rows), 5);
  assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, true); assert.ok(r.q('.forge-review-checks') !== null);
  await r.key('t'); assert.equal(r.q('.forge-review-panel')!.textContent, 'A note for forge-core: what the grammar should learn to read.A note for forge-coreSave the note'); assert.equal(labelOf(r.host, '.forge-review-note-box'), 'A note for forge-core'); assert.equal(Number((r.q('.forge-review-note-box') as HTMLTextAreaElement).rows), 3); assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, true);
  await r.key('a'); assert.equal(r.q('.forge-review-panel')!.textContent, 'One short question, kept with the item.A question for the personSave the question'); assert.equal(labelOf(r.host, '.forge-review-question-box'), 'A question for the person'); assert.equal(Number((r.q('.forge-review-question-box') as HTMLTextAreaElement).rows), 2);
});

test('empty and off states say their words and keep the title', async () => {
  const e = rig([]); await e.tab.refresh(); assert.equal(e.text(), 'Unprocessed sentences0 waitingUndo the last resolution (U)Export the resolved sentencesNothing is waiting.');
  const off = rig([A]); off.setOn(false); await off.tab.refresh(); assert.equal(off.text(), 'Unprocessed sentencesKeeping unprocessed sentences is off. Turn it on in Settings → Forge (Keep unprocessed sentences for review).');
  assert.equal(off.qa('button').length, 0); await off.key('w'); assert.ok(off.q('.forge-review-panel') === null);
});

test('opening a panel moves focus into its box, clears the box and the status; Esc closes it; another panel starts empty', async () => {
  const r = rig([A]); await r.tab.refresh(); await r.key('w'); assert.ok(win.document.activeElement === r.q('.forge-review-lines-box'));
  await r.type('.forge-review-lines-box', 'OK one'); await r.click('.forge-review-copy'); assert.equal(r.q('.forge-review-status')!.textContent, 'Copied 1 line.');
  await r.key('t'); assert.equal(r.q('.forge-review-status')!.textContent, ''); assert.equal((r.q('.forge-review-note-box') as HTMLTextAreaElement).value, ''); assert.ok(win.document.activeElement === r.q('.forge-review-note-box'));
  await r.key('Escape', {}, r.q('.forge-review-note-box')!); assert.ok(r.q('.forge-review-panel')!.children.length === 0);
  await r.key('w'); assert.equal((r.q('.forge-review-lines-box') as HTMLTextAreaElement).value, '');
});

test('the check numbers lines as typed (blank lines keep their numbers), says "reads" per line, and a STALE answer never overwrites a newer one', async () => {
  const slow: Array<() => void> = []; let calls = 0;
  const r = rig([A], { check: async (_i, lines) => { const n = ++calls; if (n === 1) await new Promise<void>((res) => slow.push(res)); return lines.map((l) => (l.startsWith('OK') ? null : `bad ${n}`)); } });
  await r.tab.refresh(); await r.key('w');
  await r.type('.forge-review-lines-box', 'OK a\n\nnope'); assert.deepEqual(r.qa('.forge-review-check').map((e) => e.textContent), [], 'the first check is still running');
  await r.type('.forge-review-lines-box', 'OK b\n\nOK c'); assert.deepEqual(r.qa('.forge-review-check').map((e) => e.textContent), ['Line 1 reads.', 'Line 3 reads.']);
  slow[0](); await r.flush(); assert.deepEqual(r.qa('.forge-review-check').map((e) => e.textContent), ['Line 1 reads.', 'Line 3 reads.'], 'the stale answer was dropped');
  assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, false);
  await r.type('.forge-review-lines-box', '  '); assert.equal(r.qa('.forge-review-check').length, 0); assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, true);
  const failing = rig([A], { check: async () => { throw new Error('boom'); } }); await failing.tab.refresh(); await failing.key('w'); await failing.type('.forge-review-lines-box', 'x');
  assert.deepEqual(failing.qa('.forge-review-check').map((e) => e.textContent), ['The lines could not be checked: boom']); await failing.type('.forge-review-lines-box', 'y'); assert.equal(failing.qa('.forge-review-check').length, 1);
  const str = rig([A], { check: async () => { throw 'plain'; } }); await str.tab.refresh(); await str.key('w'); await str.type('.forge-review-lines-box', 'x'); assert.match(str.text(), /could not be checked: plain/);
});

test('Save is allowed only when the answer is for the CURRENT text (same number of lines) and every line reads; teach and ask need non-blank text; Cmd/Ctrl+Enter does the same as the button', async () => {
  const r = rig([A, B]); await r.tab.refresh(); await r.key('w'); const box = r.q('.forge-review-lines-box')!;
  await r.type('.forge-review-lines-box', 'OK x\nbad y'); assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, true); await r.key('Enter', { metaKey: true }, box); assert.equal(r.store.saves, 0);
  await r.type('.forge-review-lines-box', 'OK x\nOK y'); assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, false); await r.key('Enter', { ctrlKey: true }, box); assert.equal(r.store.saves, 1);
  assert.deepEqual(r.store.records[0].resolution, { kind: 'lines', lines: ['OK x', 'OK y'], time: 'NOW' });
  await r.key('t'); await r.type('.forge-review-note-box', '   '); assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, true); await r.key('Enter', { metaKey: true }, r.q('.forge-review-note-box')!); assert.equal(r.store.saves, 1);
  await r.type('.forge-review-note-box', '  hello  '); assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, false); await r.click('.forge-review-save'); assert.deepEqual(r.store.records[1].resolution, { kind: 'teach', note: 'hello', time: 'NOW' });
  const q = rig([A]); await q.tab.refresh(); await q.key('a'); await q.type('.forge-review-question-box', ' Which? '); await q.click('.forge-review-save'); assert.deepEqual(q.store.records[0].resolution, { kind: 'ask', question: 'Which?', time: 'NOW' });
  const none = rig([A]); await none.tab.refresh(); await none.key('Enter', { metaKey: true }); assert.equal(none.store.saves, 0);
});

test('resolving resets everything: mode, box, status, the apply plan; the history grows by one id; a failed save restores the record AND the history', async () => {
  const r = rig([A, B]); await r.tab.refresh(); await r.key('w'); await r.type('.forge-review-lines-box', 'OK x'); await r.click('.forge-review-save');
  assert.ok(r.q('.forge-review-panel')!.children.length === 0); assert.equal(r.q('.forge-review-status')!.textContent, ''); assert.equal((r.q('.forge-review-undo') as HTMLButtonElement).disabled, false);
  await r.key('w'); assert.equal((r.q('.forge-review-lines-box') as HTMLTextAreaElement).value, '');
  let fail = false; const f = rig([A, B], { save: async () => { if (fail) throw new Error('disk full'); } }); await f.tab.refresh(); await f.key('n'); fail = true; await f.key('n');
  assert.equal(f.q('.forge-review-sentence')!.textContent, 'two'); assert.match(f.text(), /Could not save: disk full/); fail = false; await f.key('u'); assert.equal(f.q('.forge-review-sentence')!.textContent, 'swap them');
  const g = rig([A], { save: async () => { throw 'plain'; } }); await g.tab.refresh(); await g.key('n'); assert.match(g.text(), /Could not save: plain/);
});

test('undo: newest first, closes any open panel and clears the box and status; a failed undo keeps the history; the shortcuts u and Cmd/Ctrl+Z; Cmd+Z in a box is the box\'s own', async () => {
  const r = rig([A, B, C]); await r.tab.refresh(); await r.key('n'); await r.key('n'); await r.key('w'); await r.type('.forge-review-lines-box', 'OK y');
  assert.equal(await r.key('z', { metaKey: true }), true, 'Cmd+Z is taken'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'two'); assert.ok(r.q('.forge-review-panel')!.children.length === 0); assert.equal(r.q('.forge-review-status')!.textContent, '');
  await r.key('z', { ctrlKey: true }); assert.equal(r.q('.forge-review-sentence')!.textContent, 'swap them'); assert.equal((r.q('.forge-review-undo') as HTMLButtonElement).disabled, true); await r.key('u'); assert.equal(r.store.saves, 4);
  await r.key('n'); await r.key('w'); await r.key('z', { metaKey: true }, r.q('.forge-review-lines-box')!); assert.equal(r.store.saves, 5, 'inside the box Cmd+Z does nothing to the queue');
  let fail = false; const f = rig([A, B], { save: async () => { if (fail) throw new Error('nope'); } }); await f.tab.refresh(); await f.key('n'); fail = true; await f.key('u'); assert.match(f.text(), /Could not save: nope/); fail = false; await f.key('u'); assert.equal(f.q('.forge-review-sentence')!.textContent, 'swap them');
  const s = rig([A], { save: async () => { throw 'plain'; } }); await s.tab.refresh(); await s.key('u'); assert.equal(s.store.saves, 0);
});

test('keys: letters in either case; any modifier means "not mine" (Ctrl/Alt/Meta+letter does nothing); an unknown key does nothing and is not swallowed; shortcuts call preventDefault', async () => {
  const r = rig([A, B]); await r.tab.refresh();
  assert.equal(await r.key('x'), false); assert.equal(await r.key('w', { altKey: true }), false); assert.equal(await r.key('n', { ctrlKey: true }), false); assert.equal(await r.key('n', { metaKey: true }), false); assert.equal(r.store.saves, 0);
  assert.equal(await r.key('W'), true); assert.ok(r.q('.forge-review-lines-box') !== null); await r.key('Escape', {}, r.q('.forge-review-lines-box')!);
  assert.equal(await r.key('N'), true); assert.equal(r.store.saves, 1); assert.equal(await r.key('Escape'), false); assert.equal(await r.key('Enter'), false);
  const typing = rig([A]); await typing.tab.refresh(); await typing.key('w'); const box = typing.q('.forge-review-lines-box')!;
  assert.equal(await typing.key('Enter', {}, box), false, 'a plain Enter in the box is a new line'); assert.equal(await typing.key('Enter', { metaKey: true }, box), true); assert.equal(await typing.key('Escape', {}, box), true);
});

test('skip: the item goes to the END of this session; skipping again moves it behind the others again; a skipped item that is resolved leaves the skipped list; nothing is saved', async () => {
  const r = rig([A, B, C]); await r.tab.refresh();
  await r.key('s'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'two'); await r.key('s'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'three'); await r.key('s'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'swap them');
  await r.key('s'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'two', 'order of skipping: two, three, swap them... now swap them again goes behind them'); assert.equal(r.store.saves, 0);
  await r.key('n'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'three'); await r.key('n'); await r.key('n'); assert.match(r.text(), /Nothing is waiting/);
  const one = rig([A]); await one.tab.refresh(); await one.key('s'); assert.equal(one.q('.forge-review-sentence')!.textContent, 'swap them'); assert.ok(one.q('.forge-review-panel')!.children.length === 0);
});

test('Copy lines: plural words, the empty box, trimmed lines; Export: singular and plural, the file\'s base name, a failure in words (also a non-Error)', async () => {
  const r = rig([A, B]); await r.tab.refresh(); await r.key('w');
  await r.click('.forge-review-copy'); assert.equal(r.q('.forge-review-status')!.textContent, 'Nothing to copy.'); assert.deepEqual(r.copied, []);
  await r.type('.forge-review-lines-box', ' a \n\n b '); await r.click('.forge-review-copy'); assert.deepEqual(r.copied, ['a\nb']); assert.equal(r.q('.forge-review-status')!.textContent, 'Copied 2 lines.');
  await r.type('.forge-review-lines-box', 'only'); await r.click('.forge-review-copy'); assert.equal(r.q('.forge-review-status')!.textContent, 'Copied 1 line.');
  await r.click('.forge-review-export'); assert.equal(r.q('.forge-review-status')!.textContent, 'Exported 0 resolved sentences to out.jsonl.');
  await r.key('Escape', {}, r.q('.forge-review-lines-box')!); await r.key('n'); await r.click('.forge-review-export'); assert.equal(r.q('.forge-review-status')!.textContent, 'Exported 1 resolved sentence to out.jsonl.');
  const bad = rig([A], { exportResolved: async () => { throw new Error('read only'); } }); await bad.tab.refresh(); await bad.click('.forge-review-export'); assert.equal(bad.q('.forge-review-status')!.textContent, 'Could not export: read only');
  const str = rig([A], { exportResolved: async () => { throw 'plain'; } }); await str.tab.refresh(); await str.click('.forge-review-export'); assert.equal(str.q('.forge-review-status')!.textContent, 'Could not export: plain');
});

test('Apply to the open note: offered only for the same kind AND the same lines (length too); a plan with singular/plural words; Cancel and Add; the note gone at the click; the result message is shown', async () => {
  const act = (over: Partial<{ path: string; kind: 'phrase' | 'bar'; lines: string[] }> = {}) => ({ path: 'phrases/p.md', kind: 'phrase' as const, lines: ['L1', 'L2'], ...over });
  for (const [label, a, shown] of [['same', act(), true], ['other kind', act({ kind: 'bar' }), false], ['other lines', act({ lines: ['L1', 'LX'] }), false], ['shorter', act({ lines: ['L1'] }), false], ['longer', act({ lines: ['L1', 'L2', 'L3'] }), false]] as const) {
    const r = rig([A], { active: () => a }); await r.tab.refresh(); await r.key('w'); await r.type('.forge-review-lines-box', 'OK x');
    assert.equal(r.q('.forge-review-apply') !== null, shown, label);
  }
  const r = rig([A], { active: () => act() }); await r.tab.refresh(); await r.key('w'); await r.type('.forge-review-lines-box', 'OK x'); await r.click('.forge-review-apply');
  assert.match(r.q('.forge-review-plan')!.textContent ?? '', /^This will add 1 line to the open note\.AddCancel$/); assert.ok(r.q('.forge-review-apply') === null, 'the button is gone while the plan shows');
  await r.click('.forge-review-apply-cancel'); assert.ok(r.q('.forge-review-plan') === null); assert.ok(r.q('.forge-review-apply') !== null); assert.deepEqual(r.applied, []);
  await r.type('.forge-review-lines-box', 'OK x\nOK y'); await r.click('.forge-review-apply'); assert.match(r.q('.forge-review-plan')!.textContent ?? '', /This will add 2 lines/);
  await r.click('.forge-review-apply-confirm'); assert.deepEqual(r.applied, [['phrases/p.md', ['OK x', 'OK y']]]); assert.equal(r.q('.forge-review-status')!.textContent, 'Done.'); assert.ok(r.q('.forge-review-plan') === null);
  let open = true; const gone = rig([A], { active: () => (open ? act() : null) }); await gone.tab.refresh(); await gone.key('w'); await gone.type('.forge-review-lines-box', 'OK x'); await gone.click('.forge-review-apply'); open = false; await gone.click('.forge-review-apply-confirm');
  assert.equal(gone.q('.forge-review-status')!.textContent, 'The open note is not the one this sentence was typed in any more.'); assert.deepEqual(gone.applied, []); assert.ok(gone.q('.forge-review-plan') === null);
  let lines = ['L1', 'L2']; const moved = rig([A], { active: () => act({ lines }) }); await moved.tab.refresh(); await moved.key('w'); await moved.type('.forge-review-lines-box', 'OK x'); await moved.click('.forge-review-apply'); lines = ['changed']; await moved.click('.forge-review-apply-confirm');
  assert.deepEqual(moved.applied, [], 'the note changed after the plan was shown: nothing is added'); assert.match(moved.q('.forge-review-status')!.textContent ?? '', /not the one/);
  await r.key('Escape', {}, r.q('.forge-review-lines-box')!); await r.key('w'); await r.type('.forge-review-lines-box', 'OK z'); await r.click('.forge-review-apply'); await r.key('Escape', {}, r.q('.forge-review-lines-box')!); await r.key('w'); assert.ok(r.q('.forge-review-plan') === null, 'Esc drops the plan');
});

test('destroy removes the key handler and empties the host; refresh reloads the queue', async () => {
  const r = rig([A]); await r.tab.refresh(); r.store.records = [A, B]; await r.tab.refresh(); assert.match(r.text(), /2 waiting/);
  r.tab.destroy(); assert.equal(r.text(), ''); await r.key('n'); assert.equal(r.store.saves, 0);
  const off = rig([A]); off.setOn(false); let loads = 0; const o2 = rig([A], { load: async () => { loads++; return [A]; }, enabled: () => false }); await o2.tab.refresh(); assert.equal(loads, 0, 'off: the queue is not even read');
});

// ---- third round -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a blank box asks nobody (the grammar is not called for nothing); after a STALE answer was dropped, Cmd+Enter still saves the CURRENT lines', async () => {
  const slow: Array<() => void> = []; let calls = 0;
  const r = rig([A], { check: async (_i, lines) => { const n = ++calls; if (n === 1) await new Promise<void>((res) => slow.push(res)); return lines.map((l) => (l.startsWith('OK') ? null : 'bad')); } });
  await r.tab.refresh(); await r.key('w'); await r.type('.forge-review-lines-box', ''); await r.type('.forge-review-lines-box', ' \n '); assert.equal(calls, 0, 'nothing to check');
  await r.type('.forge-review-lines-box', 'OK a\nnope'); await r.type('.forge-review-lines-box', 'OK b\nOK c'); slow[0](); await r.flush();
  await r.key('Enter', { metaKey: true }, r.q('.forge-review-lines-box')!); assert.deepEqual(r.store.records[0].resolution, { kind: 'lines', lines: ['OK b', 'OK c'], time: 'NOW' });
});

test('a failed undo changes nothing on screen (the item stays resolved); real CLICKS on the five buttons act', async () => {
  let fail = false; const f = rig([A, B], { save: async () => { if (fail) throw new Error('nope'); } }); await f.tab.refresh(); await f.key('n'); fail = true; await f.key('u');
  assert.equal(f.q('.forge-review-sentence')!.textContent, 'two', 'A stays resolved: B is still the current item'); assert.match(f.text(), /1 waiting/);
  const r = rig([A, B, C]); await r.tab.refresh(); await r.click('.forge-review-act-n'); assert.equal(r.store.records[0].resolution?.kind, 'not-a-request'); await r.click('.forge-review-act-s'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'three');
  await r.click('.forge-review-act-w'); assert.ok(r.q('.forge-review-lines-box') !== null); await r.click('.forge-review-act-t'); assert.ok(r.q('.forge-review-note-box') !== null); await r.click('.forge-review-act-a'); assert.ok(r.q('.forge-review-question-box') !== null);
});

test('skip closes an open panel and clears its text; an undone item is not still marked skipped', async () => {
  const r = rig([A, B]); await r.tab.refresh(); await r.key('w'); await r.type('.forge-review-lines-box', 'OK x'); await r.click('.forge-review-act-s');
  assert.ok(r.q('.forge-review-panel')!.children.length === 0); await r.key('w'); assert.equal((r.q('.forge-review-lines-box') as HTMLTextAreaElement).value, '');
  await r.key('Escape', {}, r.q('.forge-review-lines-box')!); await r.key('s');                                 // order now: B skipped, then A skipped -> B, A
  await r.key('n'); await r.key('u'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'swap them', 'the undone item is first again, not stuck behind a stale skip');
});

test('the apply button: ONE of them however often the box changes, with its words and type; the box keeps its text when the plan opens; every button of a panel is type=button; the hints are muted; Save starts disabled in every panel', async () => {
  const act = { path: 'phrases/p.md', kind: 'phrase' as const, lines: ['L1', 'L2'] };
  const r = rig([A], { active: () => act }); await r.tab.refresh(); await r.key('w'); await r.type('.forge-review-lines-box', 'OK a'); await r.type('.forge-review-lines-box', 'OK a\nOK b');
  assert.equal(r.qa('.forge-review-apply').length, 1); const ap = r.q('.forge-review-apply')!; assert.equal(ap.textContent, 'Apply to the open note'); assert.equal(ap.getAttribute('type'), 'button');
  await r.click('.forge-review-apply'); assert.equal((r.q('.forge-review-lines-box') as HTMLTextAreaElement).value, 'OK a\nOK b'); assert.equal(r.qa('.forge-review-panel button').every((b) => b.getAttribute('type') === 'button'), true); assert.equal(r.qa('.forge-review-panel button').length, 4);
  assert.deepEqual(r.qa('.forge-review-panel > p').map((p) => p.className), ['forge-review-muted']);
  await r.key('Escape', {}, r.q('.forge-review-lines-box')!); await r.key('t'); assert.deepEqual(r.qa('.forge-review-panel > p').map((p) => p.className), ['forge-review-muted']); assert.equal(r.q('.forge-review-save')!.getAttribute('type'), 'button');
  await r.key('Escape', {}, r.q('.forge-review-note-box')!); await r.key('a'); assert.deepEqual(r.qa('.forge-review-panel > p').map((p) => p.className), ['forge-review-muted']); assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, true); assert.equal(r.q('.forge-review-save')!.getAttribute('type'), 'button');
  const e = rig([]); await e.tab.refresh(); assert.equal(e.qa('p').find((x) => x.textContent === 'Nothing is waiting.')!.className, 'forge-review-muted'); const off = rig([A]); off.setOn(false); await off.tab.refresh(); assert.equal(off.qa('p')[0].className, 'forge-review-muted');
  const lines = rig([A]); await lines.tab.refresh(); assert.equal(lines.qa('.forge-review-label + p, .forge-review-label + ol').length, 1); const none = rig([C]); await none.tab.refresh(); assert.equal(none.q('.forge-review-label + p')!.className, 'forge-review-muted');
});

test('the plain keys call preventDefault (u undoes, a letter opens a panel); a key typed in a box is not taken', async () => {
  const r = rig([A]); await r.tab.refresh(); await r.key('n'); assert.equal(await r.key('u'), true);
  const q = rig([A]); await q.tab.refresh(); await q.key('w'); assert.equal(await q.key('u', {}, q.q('.forge-review-lines-box')!), false); assert.equal(q.store.saves, 0);
});

// ---- fourth round -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a STALE error of the grammar check never replaces a newer answer; a refresh while a check is running does not break the panel; reopening the panel starts without the old checks', async () => {
  const gates: Array<() => void> = []; let calls = 0;
  const q = rig([A], { check: async (_i, lines) => { const n = ++calls; if (n === 1) { await new Promise<void>((res) => gates.push(res)); throw new Error('late'); } return lines.map(() => null); } });
  await q.tab.refresh(); await q.key('w'); await q.type('.forge-review-lines-box', 'one'); await q.type('.forge-review-lines-box', 'two'); assert.deepEqual(q.qa('.forge-review-check').map((e) => e.textContent), ['Line 1 reads.']);
  gates[gates.length - 1](); await q.flush(); assert.deepEqual(q.qa('.forge-review-check').map((e) => e.textContent), ['Line 1 reads.'], 'the stale error was dropped');
  const p = rig([A], { check: async () => { await new Promise<void>(() => {}); return []; } }); await p.tab.refresh(); await p.key('w'); await p.type('.forge-review-lines-box', 'pending');
  await assert.doesNotReject(p.tab.refresh()); assert.ok(p.q('.forge-review-lines-box') !== null, 'the open panel survives a refresh');
  const o = rig([A]); await o.tab.refresh(); await o.key('w'); await o.type('.forge-review-lines-box', 'OK x'); assert.equal(o.qa('.forge-review-check').length, 1);
  await o.key('Escape', {}, o.q('.forge-review-lines-box')!); await o.key('w'); assert.equal(o.qa('.forge-review-check').length, 0, 'a fresh box, no old verdicts');
});

test('an undone item is not still treated as skipped: skip A, resolve B, C and A, undo twice: A (the oldest) is first again, not behind C', async () => {
  const r = rig([A, B, C]); await r.tab.refresh();
  await r.key('s');                                      // order B, C, A
  await r.key('n'); await r.key('n'); await r.key('n'); assert.match(r.text(), /Nothing is waiting/);
  await r.key('u'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'swap them');
  await r.key('u'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'swap them', 'A (01:00) is before C (03:00): the old skip is forgotten');
});
