// 2026-11-27-1050 (prompt stack stage 2) - the edges of pop, through the REAL controller: after a restart (no undo memory), the preview setting on, a repaired sentence, a Translate answer that comes late, a legacy paragraph a new head replaced, a note
// whose bar is gone, an old stack beside a push, and the forms the typed reader takes.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXTEND, PH, rig, type Rig, type Svc } from './test-support/service-lines-rig.ts';
import { readGroups } from './group-note-core.ts';
import { readStepText } from './typed-step-core.ts';
import { emptyPhraseNote } from './empty-note-core.ts';

const COPY = 'Copy bar 1 and put it at the end.';
const refusal = { status: 200, json: { ok: false, error: 'I cannot say that yet.', lines: null, question: null } };
const answer = (...l: string[]) => ({ status: 200, json: { ok: true, lines: l } });
const none: Svc = async () => refusal;
const flush = async () => { for (let i = 0; i < 600; i++) await Promise.resolve(); };

function dress(r: Rig) {
  const wrote: string[] = []; const set = r.store.set.bind(r.store);
  r.store.set = (k, v) => { if (k === PH && r.store.get(k) !== v) wrote.push(v); return set(k, v); };
  return Object.assign(r, { wrote, text: () => r.store.get(PH)!, groups: () => readGroups(r.store.get(PH)!).groups });
}
const open = async (service: Svc, extra: Partial<Parameters<typeof rig>[0]> = {}) => { const r = dress(rig({ service, ...extra })); await r.ready(); return r; };

test('after a restart there is no undo memory, but the stack is in the note: Pop works, in one write, and its Cmd/Ctrl+Z gives the prompt back', async () => {
  const first = await open(none); await first.say(EXTEND); await first.say(COPY);
  const r = await open(none, { note: first.text() });
  const full = r.text();
  await r.say('Pop.');
  assert.deepEqual(r.list(), [EXTEND]); assert.equal(r.wrote.length, 1);
  await r.press({ key: 'z', metaKey: true });
  assert.equal(r.text(), full);
});

test('with "Preview before applying": a typed sentence shows its bar order on its card and is a group once applied; Pop. still applies at once', async () => {
  const r = await open(none, { drawn: 4, autoApply: false });
  r.type(EXTEND); await r.enter(); await r.enter();
  await r.say('Delete bar 2.');
  assert.equal(r.el.querySelector('.forge-chat-suggestion-bars')!.textContent, 'bars 1 2 3 4 become 1 3 4');
  assert.equal(r.groups().length, 1, 'the card writes nothing');
  await r.enter();
  assert.deepEqual(r.groups().map((g) => g.p).at(-1), 'Delete bar 2.');
  await r.say('Pop.');
  assert.deepEqual(r.list(), [EXTEND]);
});

test('a repaired sentence ("did you mean") is a group with the words the person typed', async () => {
  const r = await open(none, { configured: false });
  await r.say(EXTEND); await r.say('Delet bar 2.'); await r.enter();
  assert.equal(r.list().length, 2);
  assert.deepEqual(r.groups().map((g) => [g.who, g.p]).at(-1), ['typed', 'Delet bar 2.']);
  await r.say('Pop.');
  assert.deepEqual(r.list(), [EXTEND]);
});

test('a "Translate line N" answer that comes back AFTER the waiting line was popped writes nothing', async () => {
  let release!: () => void; const hold = new Promise<void>((ok) => { release = ok; });
  let calls = 0;
  const r = await open(async () => { if (++calls === 1) return refusal; await hold; return answer('Delete bar 1.'); });
  await r.say(EXTEND); await r.say('lose the first');
  r.type('Translate line 2.'); await r.enter();
  assert.equal(calls, 2);
  await r.ctl.popLast(PH);
  assert.deepEqual(r.list(), [EXTEND]);
  const popped = r.text(); const writes = r.wrote.length;
  release(); await flush();
  await r.enter(); await flush();
  assert.equal(r.text(), popped); assert.equal(r.wrote.length, writes);
});

test('an old paragraph the grammar cannot read, replaced by a new head: the pop is refused in words and writes nothing (it could not be written back as it was)', async () => {
  const note = emptyPhraseNote('x').replace('# Description\n', '# Description\n\nMake it sound nice. Please do.\n');
  const r = await open(none, { note });
  await r.say(EXTEND);
  assert.deepEqual(r.list(), [EXTEND]); assert.equal(r.groups().length, 1);
  const now = r.text(); const writes = r.wrote.length;
  const done = await r.ctl.popLast(PH);
  assert.equal(done.ok, false); assert.equal(done.message, 'The lines from before that prompt cannot be written back as they were, so nothing was changed.');
  assert.equal(r.text(), now); assert.equal(r.wrote.length, writes);
});

test('the bar the first line names is gone: a pop that would leave nothing readable is refused, the Score is not emptied', async () => {
  const r = await open(none); await r.say(EXTEND); await r.say(COPY);
  r.store.delete('bars/bar_005.md');
  const now = r.text(); const writes = r.wrote.length;
  const done = await r.ctl.popLast(PH);
  assert.equal(done.message, 'No line from before that prompt can be read now (a note it names may be gone), so nothing was changed.');
  assert.equal(r.text(), now); assert.equal(r.wrote.length, writes);
});

test('a push on a note whose stack went stale writes the shorter stack with the new group: nothing of the old entries is kept', async () => {
  const first = await open(none); await first.say(EXTEND); await first.say(COPY); await first.say('Delete bar 1.');
  const r = await open(none, { note: first.text().replace(`2. ${COPY}`, '2. Copy bar 2 and put it at the end.') });
  await r.say('Delete bar 3.');
  assert.deepEqual(r.groups().map((g) => g.p.slice(0, 12)), ['Extend bar_0', 'Delete bar 3']);
  await r.say('Pop.');
  assert.deepEqual(r.list(), [EXTEND, 'Copy bar 2 and put it at the end.', 'Delete bar 1.']);
});

test('the forms the reader takes: Pop and Pop to N (figures or words up to ten, any case); everything else is a sentence like any other', () => {
  for (const t of ['Pop', 'Pop.', 'pop', ' POP. ', 'Pop!']) assert.deepEqual(readStepText(t), { kind: 'pop', to: null }, t);
  for (const [t, n] of [['Pop to 2.', 2], ['pop to 12', 12], ['Pop to two.', 2], ['POP TO TEN', 10], ['Pop to 0.', 0]] as const) assert.deepEqual(readStepText(t), { kind: 'pop', to: n }, t);
  for (const t of ['Pop that.', 'Pop 2', 'Pop to the chorus', 'pop the snare out', 'Popular bars.', 'Pop to eleven', 'Play [[pop]].', 'Make it pop.']) assert.equal(readStepText(t).kind, 'none', t);
  for (const t of ['Pop. Delete bar 1.', 'Delete bar 1. Pop to 2.', 'Pop.\nPop.']) assert.equal(readStepText(t).kind, 'refused', t);
  assert.deepEqual(readStepText('Undo 3'), { kind: 'undo', count: 3 }); assert.equal(readStepText('Undo nothing').kind, 'refused');
});
