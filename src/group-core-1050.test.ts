// 2026-11-27-1050 (prompt stack stage 2) - the PURE core of the prompt stack: every push is a GROUP over the flat list (the words, the lines it wrote, the lines it replaced), pop and pop to N give an earlier list back EXACTLY, and a list the groups
// no longer describe loses them from the first mismatch upward (never a line). The lines are made by the real list rules (`planAppend`: the conflict rule and the canonical form), never by hand-made diffs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LIST_MODEL_SENTINEL_GROUP_CORE, PROMPT_MAX, describePop, isGroup, popTo, promptWords, pushGroup, reconcile, translateGroups, type Group } from './group-core.ts';
import { contentFingerprint } from './rhythm-edit-core.ts';          // 2026-11-27-1050 (mutation pass)
import { SAID_MAX, planAppend, saidText, sentencesOfText, type ReplayCtx } from './sentence-list-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const ctx: ReplayCtx = { vault: PHRASE_VAULT };
const HEAD = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
const SLOW20 = 'Make it 20 percent slower.', SLOW30 = 'Make it 30 percent slower.';

/** A stack grown by the real list rules: each push is what typing `text` does to the list. */
function stack(start: string[] = []) {
  let list = [...start]; let groups: Group[] = []; const states: string[][] = [[...list]];
  return {
    async push(text: string, words = text) {
      const plan = await planAppend(list, 'phrase', sentencesOfText(text, 'phrase'), ctx);
      assert.equal(plan.ok, true, plan.ok === false ? plan.message : '');
      if (plan.ok !== true) return;
      groups = pushGroup(groups, list, plan.list, { words, who: 'typed', ts: states.length });
      list = plan.list; states.push([...list]);
    },
    get list() { return list; }, get groups() { return groups; }, states,
  };
}

test('the sentinel names this core (the lean build greps for it)', () => { assert.equal(LIST_MODEL_SENTINEL_GROUP_CORE, 'forge-list-model-core:group-core'); });

test('push: one group per push, with the words, the number of lines, the first line number and nothing replaced; the stack agrees with its list', async () => {
  const s = stack();
  await s.push(HEAD);
  await s.push('Delete bar 2. Keep bars 1 to 2.', 'throw one away and keep the first two');
  assert.equal(s.groups.length, 2);
  assert.deepEqual({ p: s.groups[0].p, n: s.groups[0].n, at: s.groups[0].at, rep: s.groups[0].rep, who: s.groups[0].who }, { p: 'Extend bar_005 to 4 bars, repeating with fills.', n: 1, at: 1, rep: [], who: 'typed' });
  assert.deepEqual({ p: s.groups[1].p, n: s.groups[1].n, at: s.groups[1].at, rep: s.groups[1].rep }, { p: 'throw one away and keep the first two', n: 2, at: 2, rep: [] });
  assert.deepEqual(reconcile(s.groups, s.list), s.groups);
});

test('pop one: the last group goes, its lines with it; the earlier list comes back exactly', async () => {
  const s = stack(); await s.push(HEAD); await s.push('Delete bar 2.'); await s.push('Copy bar 1 and put it at the end.');
  const r = popTo(s.groups, s.list, 2)!;
  assert.deepEqual(r.list, s.states[2]);
  assert.deepEqual(r.groups, s.groups.slice(0, 2));
  assert.deepEqual(r.gone, [s.groups[2]]);
  assert.deepEqual(reconcile(r.groups, r.list), r.groups, 'what is left still agrees with the list');
});

test('pop to N: every group above N goes in one step; pop to 0 empties; N at or above the top, below 0 or not a whole number is nothing', async () => {
  const s = stack(); await s.push(HEAD); await s.push('Delete bar 2.'); await s.push('Copy bar 1 and put it at the end.'); await s.push(SLOW20);
  const one = popTo(s.groups, s.list, 1)!;
  assert.deepEqual(one.list, s.states[1]); assert.equal(one.gone.length, 3); assert.equal(one.groups.length, 1);
  assert.deepEqual(popTo(s.groups, s.list, 0)!.list, []);
  for (const bad of [4, 5, -1, 1.5, Number.NaN]) assert.equal(popTo(s.groups, s.list, bad), null, String(bad));
  assert.equal(popTo([], ['x'], 0), null, 'no stack, nothing to pop');
});

test('a push that replaces an earlier line in place records it, and pop puts it back where it stood', async () => {
  const s = stack(); await s.push(HEAD); await s.push(SLOW20); await s.push('Delete bar 2.'); await s.push(SLOW30);
  assert.deepEqual(s.list, [HEAD, SLOW30, 'Delete bar 2.']);
  const top = s.groups[3];
  assert.deepEqual({ n: top.n, at: top.at, rep: top.rep }, { n: 1, at: 2, rep: [{ i: 1, t: SLOW20 }] });
  assert.deepEqual(popTo(s.groups, s.list, 3)!.list, [HEAD, SLOW20, 'Delete bar 2.']);
});

test('a head replaced by a later push (which also supersedes the length line) and popped: the old head AND the dropped line come back in their places', async () => {
  const s = stack(); await s.push(HEAD); await s.push('Make it 5 bars long.'); await s.push('Delete bar 2.');
  const before = [...s.list];
  await s.push('Extend [[bar_007]] to 6 bars, repeating with fills.');
  assert.equal(s.list.length, 2, 'the length line was superseded');
  assert.deepEqual(s.groups[3].rep.map((r) => r.i), [0, 1]);
  assert.deepEqual(popTo(s.groups, s.list, 3)!.list, before);
  assert.deepEqual(popTo(s.groups, s.list, 1)!.list, [HEAD]);
});

test('one push of several lines that replaces in the middle AND appends keeps both: its lines are not next to each other', async () => {
  const s = stack(); await s.push(HEAD); await s.push(SLOW20); await s.push('Delete bar 2.');
  const before = [...s.list];
  await s.push(`${SLOW30} Delete bar 1.`, 'slower and one bar less');
  const top = s.groups[3];
  assert.equal(top.n, 2); assert.deepEqual(top.w, [2, 4]); assert.deepEqual(top.rep, [{ i: 1, t: SLOW20 }]);
  assert.deepEqual(popTo(s.groups, s.list, 3)!.list, before);
});

test('reconcile: a hand edit of a line of group 2 drops groups 2 and up, keeps group 1; nothing of the list is touched', async () => {
  const s = stack(); await s.push(HEAD); await s.push('Delete bar 2.'); await s.push('Keep bars 1 to 2.');
  const edited = [s.list[0], 'Delete bar 3.', s.list[2]];
  assert.deepEqual(reconcile(s.groups, edited), s.groups.slice(0, 1));
  const r = popTo(s.groups, edited, 0)!;
  assert.deepEqual(r.list, ['Delete bar 3.', 'Keep bars 1 to 2.'], 'popping group 1 takes ITS line only; the hand-edited lines stay');
});

test('reconcile: a hand-deleted line, an inserted line and a changed first line shorten the stack; an emptied list empties it', async () => {
  const s = stack(); await s.push(HEAD); await s.push('Delete bar 2.'); await s.push('Keep bars 1 to 2.');
  assert.equal(reconcile(s.groups, s.list.slice(0, 2)).length, 2, 'the last line deleted: its group goes');
  assert.equal(reconcile(s.groups, [s.list[0], s.list[2]]).length, 1, 'the middle line deleted');
  assert.equal(reconcile(s.groups, [s.list[0], 'Delete bar 1.', ...s.list.slice(1)]).length, 1, 'a line inserted in the middle');
  assert.equal(reconcile(s.groups, ['Delete bar 1.', ...s.list]).length, 0, 'a line inserted in front');
  assert.equal(reconcile(s.groups, []).length, 0);
});

test('a line the groups do not describe is NEVER deleted: a line typed by hand at the end survives a pop', async () => {
  const s = stack(); await s.push(HEAD); await s.push('Delete bar 2.');
  const hand = [...s.list, 'my own words'];
  assert.equal(reconcile(s.groups, hand).length, 2);
  assert.deepEqual(popTo(s.groups, hand, 1)!.list, [HEAD, 'my own words']);
  assert.deepEqual(popTo(s.groups, hand, 0)!.list, ['my own words']);
});

test('a push after a hand edit drops the stale groups first, then records itself; popping it gives the hand-edited list back', async () => {
  const s = stack(); await s.push(HEAD); await s.push('Delete bar 2.'); await s.push('Keep bars 1 to 2.');
  const edited = [s.list[0], 'Delete bar 3.', s.list[2]];
  const after = [...edited, 'Delete bar 1.'];
  const groups = pushGroup(s.groups, edited, after, { words: 'Delete bar 1.', who: 'typed', ts: 9 });
  assert.equal(groups.length, 2);
  assert.deepEqual(popTo(groups, after, 1)!.list, edited);
  assert.deepEqual(popTo(groups, after, 0)!.list, edited.slice(1));
});

test('duplicate lines: with one of three identical lines deleted by hand a pop removes at most one line, and only one the group describes', async () => {
  const copy = 'Copy bar 1 and put it at the end.';
  const s = stack(); await s.push(HEAD); await s.push(copy); await s.push(copy); await s.push(copy);
  assert.deepEqual(s.list, [HEAD, copy, copy, copy]);
  const hand = [HEAD, copy, copy];
  assert.equal(reconcile(s.groups, hand).length, 3);
  const r = popTo(s.groups, hand, 2)!;
  assert.deepEqual(r.list, [HEAD, copy]);
});

test('a push that changes nothing records no group; a Waiting line is a line of its group and popping removes it', async () => {
  const s = stack(); await s.push(HEAD);
  assert.deepEqual(pushGroup(s.groups, s.list, s.list, { words: 'x', who: 'typed', ts: 2 }), s.groups);
  const waiting = [...s.list, 'Waiting: make it swing'];
  const groups = pushGroup(s.groups, s.list, waiting, { words: 'make it swing', who: 'typed', ts: 3 });
  assert.equal(groups.length, 2);
  assert.deepEqual(popTo(groups, waiting, 1)!.list, s.list);
});

test('translate: the Waiting line of the top group is replaced INSIDE that group; popping it takes every translated line', async () => {
  const s = stack(); await s.push(HEAD);
  const waiting = [...s.list, 'Waiting: drop two bars'];
  const groups = pushGroup(s.groups, s.list, waiting, { words: 'drop two bars', who: 'typed', ts: 3 });
  const done = [...s.list, 'Delete bar 2.', 'Delete bar 1.'];
  const t = translateGroups(groups, waiting, done, 1, 2);
  assert.equal(t.length, 2);
  assert.deepEqual({ p: t[1].p, n: t[1].n, at: t[1].at }, { p: 'drop two bars', n: 2, at: 2 });
  assert.deepEqual(popTo(t, done, 1)!.list, [HEAD]);
});

test('translate under a later push (a new head over a waiting line): both groups still pop exactly, the translated lines stay in the group that held the Waiting line', async () => {
  const h2 = 'Extend [[bar_007]] to 6 bars, repeating with fills.';
  const one = pushGroup([], [], [HEAD], { words: HEAD, who: 'typed', ts: 1 });
  const two = pushGroup(one, [HEAD], [HEAD, 'Waiting: lose a bar'], { words: 'lose a bar', who: 'typed', ts: 2 });
  const three = pushGroup(two, [HEAD, 'Waiting: lose a bar'], [h2, 'Waiting: lose a bar'], { words: h2, who: 'typed', ts: 3 });
  const t = translateGroups(three, [h2, 'Waiting: lose a bar'], [h2, 'Delete bar 2.'], 1, 1);
  assert.equal(t.length, 3);
  const popped = popTo(t, [h2, 'Delete bar 2.'], 2)!;
  assert.deepEqual(popped.list, [HEAD, 'Delete bar 2.']);
  assert.deepEqual(popTo(popped.groups, popped.list, 1)!.list, [HEAD]);
});

test('translate of a Waiting line no group describes (typed by hand): no group is made up; the groups below stay', async () => {
  const s = stack(); await s.push(HEAD);
  const hand = [HEAD, 'Waiting: lose a bar'];
  const t = translateGroups(s.groups, hand, [HEAD, 'Delete bar 2.'], 1, 1);
  assert.equal(t.length, 1);
  assert.deepEqual(popTo(t, [HEAD, 'Delete bar 2.'], 0)!.list, ['Delete bar 2.']);
});

test('a stored group that was changed (the replaced text, the count, the position, a line break) is not believed: it and everything above it go', async () => {
  const r = stack(); await r.push(HEAD); await r.push(SLOW20); await r.push(SLOW30);
  assert.equal(reconcile([...r.groups.slice(0, 2), { ...r.groups[2], rep: [{ i: 1, t: 'Delete bar 1.' }] }], r.list).length, 1, 'and a group whose line the bad one replaced cannot be shown any more either');
  const s = stack(); await s.push(HEAD); await s.push('Delete bar 2.'); await s.push('Keep bars 1 to 2.');
  const bad = (patch: Partial<Group>) => reconcile([s.groups[0], s.groups[1], { ...s.groups[2], ...patch }], s.list).length;
  assert.equal(bad({}), 3);
  assert.equal(bad({ rep: [{ i: 1, t: 'Delete bar 1.' }] }), 2);
  assert.equal(bad({ rep: [{ i: 1, t: 'Delete bar 1.\n2. Delete bar 2.' }] }), 2);
  assert.equal(bad({ n: 2 }), 2);
  assert.equal(bad({ at: 1 }), 2);
  assert.equal(bad({ len: 1 }), 2);
  assert.equal(bad({ h: 'x' }), 2);
  assert.equal(bad({ rep: [{ i: 99, t: 'Delete bar 1.' }] }), 2);
});

test('random pushes and pops: every pop gives back exactly the list as it was after that group', async () => {
  const says = ['Delete bar 1.', 'Copy bar 1 and put it at the end.', SLOW20, SLOW30, 'Make it 6 bars long.', 'Make it 7 bars long.', 'Extend [[bar_007]] to 8 bars, repeating with fills.', HEAD, 'Move bar 2 to the start.', 'Bar 1 is replaced by [[bar_007]].'];
  let seed = 11; const next = (n: number) => { seed = (seed * 48271) % 2147483647; return seed % n; };
  for (let run = 0; run < 40; run++) {
    let list: string[] = [], groups: Group[] = []; const states: string[][] = [[]];
    for (let step = 0; step < 8; step++) {
      const typed = step === 0 ? [HEAD] : [says[next(says.length)], ...(next(3) === 0 ? [says[next(says.length)]] : [])];
      const plan = await planAppend(list, 'phrase', typed, ctx);
      if (plan.ok !== true || plan.unchanged) continue;
      groups = pushGroup(groups, list, plan.list, { words: typed.join(' '), who: 'typed', ts: step }); list = plan.list; states.push([...list]);
    }
    assert.equal(reconcile(groups, list).length, states.length - 1, `run ${run}`);
    for (let n = 0; n < states.length - 1; n++) assert.deepEqual(popTo(groups, list, n)!.list, states[n], `run ${run} keep ${n}`);
  }
});

test('the prompt words go through the SAME sanitiser as `(you said)`, cut at 400 and not at 160', () => {
  assert.equal(PROMPT_MAX, 400);
  const raw = 'please (now) [really] see https://example.com/x and /Users/me/file and notes.md\nthen "copy": bar #3';
  assert.equal(promptWords(raw), saidText(raw));
  assert.equal(promptWords(raw), 'please now really see and and then "copy": bar #3');
  const long = Array(200).fill('word').join(' ');
  assert.ok(promptWords(long).length > SAID_MAX && promptWords(long).length <= PROMPT_MAX);
  assert.ok(saidText(long).length <= SAID_MAX, '`(you said)` keeps its own limit');
});

test('describePop names every prompt that goes, by number, with its words and its lines; a long run names the numbers it does not list', async () => {
  const s = stack(); await s.push(HEAD); await s.push('Delete bar 2.', 'lose bar two'); await s.push('Copy bar 1 and put it at the end. Delete bar 1.', '');
  assert.equal(describePop(s.groups.slice(1), 2), '2: "lose bar two" (1 line). 3: "(no words)" (2 lines).');
  const many = Array.from({ length: 30 }, (_, i) => ({ ...s.groups[1], p: `${'very long words '.repeat(10)}${i}` }));
  const text = describePop(many, 2);
  assert.ok(text.length <= 600, String(text.length));
  assert.match(text, /and \d+ more, up to prompt 31\.$/);
});

// ---- 2026-11-27-1050 (mutation pass) ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** An entry whose fingerprint fits what it claims (as `stamp` in group-core makes it), so that only the other checks can turn it down. `after` = the lines it stands on. */
const signed = (after: string[], g: Omit<Group, 'h'>): Group => ({ ...g, h: contentFingerprint(JSON.stringify([after, g.w ?? Array.from({ length: g.n }, (_, k) => g.at + k), g.rep.map((r) => [r.i, r.t])])) });
const BASE = { p: 'x', who: 'typed' as const, ts: 1 };

test('2026-11-27-1050 (mutation pass): an entry whose replaced line has no whole index, no text, or is no object is not an entry', () => {
  const g = signed(['a'], { ...BASE, n: 1, at: 1, rep: [{ i: 0, t: 'b' }], len: 1 });
  assert.equal(isGroup(g), true);
  for (const rep of [[{ i: 'x', t: 'b' }], [{ i: -1, t: 'b' }], [{ i: 1.5, t: 'b' }], [{ t: 'b' }], [{ i: 0, t: 5 }], [{ i: 0 }], [null], [5]]) assert.equal(isGroup({ ...g, rep }), false, JSON.stringify(rep));
});

test('2026-11-27-1050 (mutation pass): a line position said twice, or past the lines, is not believed (even under a fitting fingerprint): dropped, no error', () => {
  const list = ['a', 'b'];
  assert.equal(reconcile([signed(list, { ...BASE, n: 1, at: 2, rep: [], len: 2 })], list).length, 1, 'the control: a fitting entry is believed');
  for (const bad of [signed(list, { ...BASE, n: 2, at: 1, w: [1, 1], rep: [], len: 2 }), signed(list, { ...BASE, n: 1, at: 3, rep: [], len: 2 })]) {
    assert.equal(isGroup(bad), true);
    assert.deepEqual(reconcile([bad], list), [], JSON.stringify(bad));
    assert.equal(popTo([bad], list, 0), null);
  }
});

test('2026-11-27-1050 (mutation pass): replaced lines must stand in rising order, one per place: otherwise a pop would make a list nobody pushed on', () => {
  const list = ['a', 'b'];
  const of = (rep: Group['rep']) => signed(list, { ...BASE, n: 0, at: 1, rep, len: 2 });
  assert.deepEqual(popTo([of([{ i: 0, t: 'y' }, { i: 1, t: 'x' }])], list, 0)!.list, ['y', 'x', 'a', 'b'], 'the control: rising order');
  for (const rep of [[{ i: 1, t: 'x' }, { i: 0, t: 'y' }], [{ i: 0, t: 'x' }, { i: 0, t: 'y' }]]) assert.equal(popTo([of(rep)], list, 0), null, JSON.stringify(rep));
});

test('2026-11-27-1050 (mutation pass): a line written IN FRONT of a line that stays is one added line; nothing is said to be replaced', () => {
  const [g] = pushGroup([], ['x'], ['y', 'x'], { words: 'w', who: 'typed', ts: 1 });
  assert.deepEqual({ n: g.n, at: g.at, rep: g.rep, w: g.w }, { n: 1, at: 1, rep: [], w: undefined });
  assert.deepEqual(popTo([g], ['y', 'x'], 0)!.list, ['x']);
});

test('2026-11-27-1050 (mutation pass): translate keeps an entry\'s `model` and `card`; an entry without them gets no such key', () => {
  const one = pushGroup([], [], [HEAD], { words: HEAD, who: 'typed', ts: 1 });
  const two = pushGroup(one, [HEAD], [HEAD, 'Waiting: lose a bar'], { words: 'lose a bar', who: 'service', ts: 2 });
  const t = translateGroups([two[0], { ...two[1], model: 'm-1', card: 'c-1' }], [HEAD, 'Waiting: lose a bar'], [HEAD, 'Delete bar 2.'], 1, 1);
  assert.equal(t.length, 2);
  assert.deepEqual([t[1].model, t[1].card, t[1].who, t[1].ts], ['m-1', 'c-1', 'service', 2]);
  for (const g of [one[0], two[1], t[0]]) assert.deepEqual(['model' in g, 'card' in g], [false, false]);
});

test('2026-11-27-1050 (mutation pass): translate of a Waiting line with lines AFTER it: every later group keeps its own line and pops exactly', () => {
  const WAIT = 'Waiting: lose a bar';
  const lists = [[], [HEAD], [HEAD, WAIT], [HEAD, WAIT, SLOW20], [HEAD, WAIT, SLOW20, 'Delete bar 1.']];
  let groups: Group[] = [];
  for (let i = 1; i < lists.length; i++) groups = pushGroup(groups, lists[i - 1], lists[i], { words: `push ${i}`, who: 'typed', ts: i });
  const done = [HEAD, 'Delete bar 2.', 'Keep bars 1 to 2.', SLOW20, 'Delete bar 1.'];
  const t = translateGroups(groups, lists[4], done, 1, 2);
  assert.deepEqual(t.map((g) => [g.p, g.n]), [['push 1', 1], ['push 2', 2], ['push 3', 1], ['push 4', 1]]);
  assert.deepEqual([3, 2, 1, 0].map((n) => popTo(t, done, n)!.list), [done.slice(0, 4), done.slice(0, 3), [HEAD], []]);
});

test('2026-11-27-1050 (mutation pass): describePop shows a long prompt by its first 40 characters and an ellipsis (no space before it)', () => {
  const of = (p: string) => describePop([signed(['a'], { ...BASE, p, n: 1, at: 1, rep: [], len: 1 })], 2);
  const forty = 'abcdefghi abcdefghi abcdefghi abcdefghij';
  assert.equal(of(forty), `2: "${forty}" (1 line).`);
  assert.equal(of('abcdefghi abcdefghi abcdefghi abcdefghi tail'), '2: "abcdefghi abcdefghi abcdefghi abcdefghi…" (1 line).');
});

test('2026-11-27-1050 (mutation pass): words over the limit are cut BETWEEN words, in a group and in `(you said)`: no half word is written', () => {
  const long = Array(100).fill('abcdef').join(' ');
  assert.equal(promptWords(long), Array(57).fill('abcdef').join(' '));
  assert.equal(saidText(long), Array(22).fill('abcdef').join(' '));
});
