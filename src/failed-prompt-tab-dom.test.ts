// 2026-11-20-1004 - the REVIEW TAB (a plugin tab; the five resolutions of design section 2.3) driven through its real DOM with real keyboard and click events (happy-dom): oldest first with the count; the card shows the sentence as TEXT
// (markup stays text), the kind, the lines, the bar count, the grammar message, the service result; Write the lines (each line checked live by the composer's grammar, a refused line in words under the box, Copy lines, Apply to the open
// note only when it is the same note state, as a plan to confirm), Teach a word, Not a request, Ask the person, Skip; undo of the last resolution; Export; keyboard shortcuts; no tooltips, no hover behaviour, no red. Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountReviewTab, type ReviewTabPorts } from './failed-prompt-tab-dom.ts';
import { makeRecord, type FailedRecord, type FailureInput } from './failed-prompt-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const T0 = '2026-11-21T01:00:00.000Z';
const input = (over: Partial<FailureInput> = {}): FailureInput => ({ kind: 'phrase', sentence: 'swap the second and third bars', lines: ['Extend [[bar_005]] to 4 bars, repeating with fills.'], barCount: 4, grammarError: { message: 'Expected "Keep ..." but found "swap".', column: 1 }, service: { result: 'none' }, ...over });
const rec = (id: string, time: string, over: Partial<FailureInput> = {}): FailedRecord => makeRecord(input(over), { id, time, build: '0.5.41 music abc', vaultId: 'v-1' });

function rig(records: FailedRecord[], over: Partial<ReviewTabPorts> = {}) {
  const store = { records: [...records], saves: 0 }; const copied: string[] = []; const applied: Array<{ path: string; lines: string[] }> = []; let exported = 0; let enabled = true;
  const ports: ReviewTabPorts = {
    enabled: () => enabled, load: async () => store.records, save: async (r) => { store.records = [...r]; store.saves++; },
    check: async (_i, lines) => lines.map((l) => (/^(Move|Keep|Delete)\b/.test(l) ? null : `The grammar did not accept this sentence (line 1, column 1: Expected "Keep ..." but found "${l.split(' ')[0]}".).`)),
    copy: async (t) => { copied.push(t); }, exportResolved: async () => { exported++; return { count: store.records.filter((r) => r.resolution).length, file: 'plugin/failed-prompts-resolved.jsonl' }; },
    active: () => null, applyLines: async (path, lines) => { applied.push({ path, lines }); return { ok: true, message: 'Added.' }; }, now: () => '2026-11-22T00:00:00.000Z', ...over,
  };
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const tab = mountReviewTab(host, ports);
  const flush = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
  const q = (s: string) => host.querySelector(s) as HTMLElement | null;
  const qa = (s: string) => [...host.querySelectorAll(s)] as HTMLElement[];
  const click = async (s: string) => { (q(s) as HTMLElement).dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await flush(); };
  const key = async (k: string, init: Record<string, unknown> = {}, target?: HTMLElement) => { const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }); (target ?? host).dispatchEvent(e); await flush(); return e as KeyboardEvent; };
  const type = async (s: string, text: string) => { const el = q(s) as HTMLTextAreaElement; el.value = text; el.dispatchEvent(new win.Event('input', { bubbles: true })); await flush(); };
  return { host, store, copied, applied, tab, flush, q, qa, click, key, type, exported: () => exported, setEnabled: (v: boolean) => { enabled = v; }, text: () => host.textContent ?? '' };
}
const A = rec('a', '2026-11-21T01:00:00.000Z'), B = rec('b', '2026-11-21T02:00:00.000Z', { sentence: 'make it groovier', kind: 'bar', lines: ['Set the tempo to 96.'], barCount: null }), C = rec('c', '2026-11-21T00:30:00.000Z', { sentence: 'Play [[phrase_001]', kind: 'arrangement', lines: [] });

test('the queue is shown OLDEST first with the count; the card has the sentence as typed, the kind, the lines, the bar count, the build, the grammar\'s words and the service result', async () => {
  const r = rig([A, B, C]); await r.tab.refresh();
  assert.match(r.text(), /3 waiting/); assert.equal(r.q('.forge-review-sentence')!.textContent, 'Play [[phrase_001]', 'oldest first: C (00:30) before A (01:00)');
  assert.match(r.text(), /arrangement/); assert.match(r.text(), /The grammar said/); assert.match(r.text(), /The service: none/);
  assert.equal(r.qa('.forge-review-line').length, 0, 'C has no lines');
  await r.key('s'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'swap the second and third bars');
  assert.deepEqual(r.qa('.forge-review-line').map((e) => e.textContent), ['Extend [[bar_005]] to 4 bars, repeating with fills.']); assert.match(r.text(), /4 bars/);
});

test('markup in a sentence, a refusal or a line is TEXT: no element, no attribute, no script is made from it', async () => {
  const evil = rec('e', T0, { sentence: '<img src=x onerror=alert(1)> <b>hi</b>', lines: ['<script>1</script>'], grammarError: { message: '<i>no</i>', column: 2 }, service: { result: 'refused', text: '<u>nope</u>' } });
  const r = rig([evil]); await r.tab.refresh();
  assert.equal(r.q('.forge-review-sentence')!.textContent, '<img src=x onerror=alert(1)> <b>hi</b>'); assert.equal(r.host.querySelectorAll('img, script, b, i, u').length, 0);
  assert.match(r.text(), /<i>no<\/i>/); assert.match(r.text(), /<u>nope<\/u>/); assert.match(r.text(), /<script>1<\/script>/);
});

test('empty queue: "Nothing is waiting."; setting OFF: it says how to turn it on and shows no card', async () => {
  const r = rig([]); await r.tab.refresh(); assert.match(r.text(), /Nothing is waiting/); assert.ok(r.q('.forge-review-card') === null);
  const off = rig([A]); off.setEnabled(false); await off.tab.refresh(); assert.match(off.text(), /Keeping unprocessed sentences is off/); assert.match(off.text(), /Settings/); assert.ok(off.q('.forge-review-card') === null);
});

test('Write the lines: each line is checked LIVE by the composer\'s grammar, a refused line is shown in words under the box, Save is only offered when every line reads; Save resolves, moves on, and counts', async () => {
  const r = rig([A, B]); await r.tab.refresh();
  await r.key('w'); assert.ok(r.q('.forge-review-lines-box')); assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, true);
  await r.type('.forge-review-lines-box', 'Move bar 3 one bar left.\nMake it sparkle.');
  const says = r.qa('.forge-review-check').map((e) => e.textContent ?? ''); assert.equal(says.length, 2); assert.match(says[0], /reads/i); assert.match(says[1], /Line 2: .*did not accept/);
  assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, true, 'a refused line blocks Save');
  await r.type('.forge-review-lines-box', 'Move bar 3 one bar left.\nKeep bars 1 to 2.');
  assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, false);
  await r.click('.forge-review-save');
  assert.deepEqual(r.store.records.find((x) => x.id === 'a')!.resolution, { kind: 'lines', lines: ['Move bar 3 one bar left.', 'Keep bars 1 to 2.'], time: '2026-11-22T00:00:00.000Z' });
  assert.equal(r.q('.forge-review-sentence')!.textContent, 'make it groovier', 'the next item is shown'); assert.match(r.text(), /1 waiting/);
});

test('Copy lines puts the lines on the clipboard (one per line), and the status says so in words; an empty box copies nothing', async () => {
  const r = rig([A]); await r.tab.refresh(); await r.key('w');
  await r.click('.forge-review-copy'); assert.deepEqual(r.copied, []);
  await r.type('.forge-review-lines-box', 'Keep bars 1 to 2.\n\nDelete bar 3.\n'); await r.click('.forge-review-copy');
  assert.deepEqual(r.copied, ['Keep bars 1 to 2.\nDelete bar 3.']); assert.match(r.q('.forge-review-status')!.textContent ?? '', /Copied 2 lines/);
});

test('Apply to the open note is offered ONLY when the open note has the same kind and the same lines (a note that still exists as it was); it is a PLAN to confirm and writes nothing until Add', async () => {
  const none = rig([A]); await none.tab.refresh(); await none.key('w'); await none.type('.forge-review-lines-box', 'Keep bars 1 to 2.'); assert.ok(none.q('.forge-review-apply') === null);
  const other = rig([A], { active: () => ({ path: 'phrases/phrase_009.md', kind: 'phrase', lines: ['something else'] }) }); await other.tab.refresh(); await other.key('w'); await other.type('.forge-review-lines-box', 'Keep bars 1 to 2.'); assert.ok(other.q('.forge-review-apply') === null);
  const same = rig([A], { active: () => ({ path: 'phrases/phrase_001.md', kind: 'phrase', lines: [...A.lines] }) }); await same.tab.refresh(); await same.key('w');
  assert.ok(same.q('.forge-review-apply') === null, 'nothing to apply while the box is empty'); await same.type('.forge-review-lines-box', 'Keep bars 1 to 2.\nDelete bar 3.');
  await same.click('.forge-review-apply'); assert.deepEqual(same.applied, [], 'a plan first'); assert.match(same.text(), /This will add 2 lines to the open note/);
  await same.click('.forge-review-apply-cancel'); assert.deepEqual(same.applied, []); await same.click('.forge-review-apply'); await same.click('.forge-review-apply-confirm');
  assert.deepEqual(same.applied, [{ path: 'phrases/phrase_001.md', lines: ['Keep bars 1 to 2.', 'Delete bar 3.'] }]); assert.match(same.text(), /Added\./);
});

test('Teach a word / Not a request / Ask the person resolve with their own data; Skip does not resolve and moves the item to the end of THIS session', async () => {
  const r = rig([A, B, C]); await r.tab.refresh();                       // order C, A, B
  await r.key('s'); assert.equal(r.q('.forge-review-sentence')!.textContent, 'swap the second and third bars'); assert.equal(r.store.saves, 0, 'skip writes nothing');
  await r.key('t'); await r.type('.forge-review-note-box', 'swap is a word'); await r.click('.forge-review-save');
  assert.deepEqual(r.store.records.find((x) => x.id === 'a')!.resolution, { kind: 'teach', note: 'swap is a word', time: '2026-11-22T00:00:00.000Z' });
  await r.key('a'); await r.type('.forge-review-question-box', 'Which bars do you mean?'); await r.click('.forge-review-save');
  assert.equal(r.store.records.find((x) => x.id === 'b')!.resolution!.kind, 'ask');
  assert.equal(r.q('.forge-review-sentence')!.textContent, 'Play [[phrase_001]', 'the skipped one comes back after the others');
  await r.key('n'); assert.equal(r.store.records.find((x) => x.id === 'c')!.resolution!.kind, 'not-a-request'); assert.match(r.text(), /Nothing is waiting/);
});

test('Undo takes the LAST resolution back exactly (one step at a time, newest first); the item returns as the current one; keyboard and button', async () => {
  const r = rig([A, B]); await r.tab.refresh();
  await r.key('n'); await r.key('n'); assert.match(r.text(), /Nothing is waiting/);
  await r.click('.forge-review-undo'); assert.equal(r.store.records.find((x) => x.id === 'b')!.resolution, null); assert.equal(r.q('.forge-review-sentence')!.textContent, 'make it groovier');
  await r.key('u'); assert.equal(r.store.records.find((x) => x.id === 'a')!.resolution, null); assert.equal((r.q('.forge-review-undo') as HTMLButtonElement).disabled, true);
});

test('Export writes the resolved file and says how many and where, in words', async () => {
  const r = rig([A]); await r.tab.refresh(); await r.key('n'); await r.click('.forge-review-export');
  assert.equal(r.exported(), 1); assert.match(r.q('.forge-review-status')!.textContent ?? '', /Exported 1 resolved sentence to failed-prompts-resolved\.jsonl/);
});

test('keys: the five shortcuts work from the card, NOT while typing in a box (a letter is a letter there); Cmd/Ctrl+Enter saves, Esc closes the box; every control is a real button or box that Tab reaches', async () => {
  const r = rig([A]); await r.tab.refresh(); await r.key('w');
  await r.key('n', {}, r.q('.forge-review-lines-box')!); assert.equal(r.store.saves, 0, 'typing n in the box resolves nothing');
  await r.type('.forge-review-lines-box', 'Keep bars 1 to 2.');
  await r.key('Enter', { metaKey: true }, r.q('.forge-review-lines-box')!); assert.equal(r.store.records[0].resolution!.kind, 'lines');
  const r2 = rig([A]); await r2.tab.refresh(); await r2.key('w'); await r2.key('Escape', {}, r2.q('.forge-review-lines-box')!); assert.ok(r2.q('.forge-review-lines-box') === null);
  for (const el of r.qa('button')) assert.notEqual(el.tagName, 'DIV'); assert.ok(r2.qa('button').every((b) => (b as HTMLButtonElement).tabIndex !== -1));
});

test('no tooltips (no title attribute anywhere), no hover handlers, no inline red; the five buttons are labelled with their key', async () => {
  const r = rig([A]); await r.tab.refresh();
  assert.equal(r.host.querySelectorAll('[title]').length, 0); assert.equal(r.host.querySelectorAll('[onmouseover],[onmouseenter]').length, 0);
  assert.ok(!/red|#f00|#ff0000/i.test(r.host.innerHTML.replace(/<[^>]*class="[^"]*"/g, '')), 'no red in inline styles');
  const labels = r.qa('.forge-review-actions button').map((b) => b.textContent ?? ''); assert.equal(labels.length, 5);
  assert.deepEqual(labels.map((l) => l.trim().slice(-3)), ['(W)', '(T)', '(N)', '(A)', '(S)']);
});

test('the grammar checker throwing is said in words under the box (a line is never silently accepted); a failing save is said and the item stays', async () => {
  const r = rig([A], { check: async () => { throw new Error('boom'); } }); await r.tab.refresh(); await r.key('w'); await r.type('.forge-review-lines-box', 'Keep bars 1 to 2.');
  assert.match(r.q('.forge-review-check')?.textContent ?? '', /could not be checked/i); assert.equal((r.q('.forge-review-save') as HTMLButtonElement).disabled, true);
  const f = rig([A], { save: async () => { throw new Error('disk full'); } }); await f.tab.refresh(); await f.key('n');
  assert.match(f.text(), /Could not save: disk full/); assert.equal(f.q('.forge-review-sentence')!.textContent, 'swap the second and third bars');
});
