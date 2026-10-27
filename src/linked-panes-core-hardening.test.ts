// 2026-10-27-1000 (FULL-profile hardening of what shipped under DEMO): the survivors of the mutation pass over linked-panes-core.ts, killed with tests. The clock and the timer are INJECTED (ports.now / ports.after), so nothing
// here sleeps and the 300 ms settle is tested at 299 and 300, not "after a while".
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PAIR_SETTLE_MS, createPaneLinker, openPairAvailable, pinnedNoteFor, type PaneLinkerPorts } from './linked-panes-core.ts';
import { MIX_BAR_ROLE, MIX_HIT_ROLE } from './mix-lineage-core.ts';
import { MORPH_BAR_ROLE, MORPH_HIT_ROLE } from './morph-lineage-core.ts';
import { PHRASE_BAR_ROLE } from './phrase-lineage-core.ts';

const prov = (role: string, params: Record<string, unknown>) => ({ role, params }) as never;

// ---- which note a pin points at ---------------------------------------------------------------------------------------------------------------------------------------------------------

test('pinnedNoteFor: a number must be a finite number and a name a non-empty string, or the rule has nothing to read (null, the pane stays where it is)', () => {
  const morph = (extra: Record<string, unknown>) => pinnedNoteFor(prov(MORPH_BAR_ROLE, { a: 'bar_007', b: 'bar_008', bar: 2, bars: 5, ...extra }));
  assert.deepEqual(morph({}), { noteId: 'bars/bar_007', reason: 'pinned bar 2' });
  assert.equal(morph({ bar: Infinity }), null, 'Infinity is not a bar number');
  assert.equal(morph({ bar: NaN }), null);
  assert.equal(morph({ bar: '2' }), null, 'a string is not a number');
  assert.equal(morph({ bars: Infinity }), null);
  assert.equal(morph({ a: '' }), null, 'an empty name is no name');
  assert.equal(morph({ b: '' }), null);
  assert.equal(morph({ a: undefined }), null);
  assert.equal(morph({ b: 7 }), null);
  assert.equal(morph({ bar: 0 }) !== null, true, '0 is a number');
  const phrase = (p: Record<string, unknown>) => pinnedNoteFor(prov(PHRASE_BAR_ROLE, p));
  assert.equal(phrase({ source: '' }), null);
  assert.deepEqual(phrase({ source: 'bar_005', bar: Infinity }), { noteId: 'bars/bar_005', reason: 'pinned bar 1' }, 'a bar number that is not finite reads as bar 1 in the reason');
  assert.deepEqual(phrase({ source: 'bar_005' }), { noteId: 'bars/bar_005', reason: 'pinned bar 1' });
  assert.deepEqual(phrase({ source: 'bar_005', bar: 3, fork: '' }), { noteId: 'bars/bar_005', reason: 'pinned bar 3' }, 'an empty fork is no fork');
  assert.deepEqual(phrase({ source: 'bar_005', bar: 3, fork: 'bars/bar_012' }), { noteId: 'bars/bar_012', reason: 'forked' });
  assert.deepEqual(phrase({ source: 'x', bar: 1 }), { noteId: 'bars/x', reason: 'pinned bar 1' }, 'a one-character name is a name');
  assert.deepEqual(phrase({ source: 'bar_005', bar: 2, fork: 'f' }), { noteId: 'f', reason: 'forked' }, 'and so is a one-character fork');
});

test('pinnedNoteFor, morph: the first half of the bars reads from a, the second from b; the middle bar of an odd run belongs to a; a morph hit is read like its bar', () => {
  const at = (bar: number, bars: number, role = MORPH_BAR_ROLE) => pinnedNoteFor(prov(role, { a: 'bar_007', b: 'bar_008', bar, bars }))!.noteId;
  assert.equal(at(1, 5), 'bars/bar_007');
  assert.equal(at(3, 5), 'bars/bar_007', 'the middle of five is a');
  assert.equal(at(4, 5), 'bars/bar_008');
  assert.equal(at(2, 4), 'bars/bar_007', 'of four: bar 2 is the last of a');
  assert.equal(at(3, 4), 'bars/bar_008');
  assert.equal(at(4, 5, MORPH_HIT_ROLE), 'bars/bar_008');
  assert.equal(at(1, 5, MORPH_HIT_ROLE), 'bars/bar_007');
  assert.deepEqual(pinnedNoteFor(prov(MORPH_BAR_ROLE, { a: 'bar_007', b: 'bar_008', bar: 2, bars: 5, fork: 'bars/bar_020' })), { noteId: 'bars/bar_020', reason: 'forked' });
  assert.equal(pinnedNoteFor(prov(MORPH_HIT_ROLE, { a: 'bar_007', b: 'bar_008', bar: 2, bars: 5, fork: 'bars/bar_021' }))!.noteId, 'bars/bar_021', 'a hit of a forked bar goes to the fork too');
});

test('pinnedNoteFor, mix: a bar or a hit of a mix; a path mix reads k against d, a vote mix reads the weight; anything missing is null; any other role is null', () => {
  const mix = (p: Record<string, unknown>, role = MIX_BAR_ROLE) => pinnedNoteFor(prov(role, { a: 'bar_005', b: 'bar_006', ...p }));
  assert.deepEqual(mix({ mode: 'path', k: 1, d: 4 }), { noteId: 'bars/bar_005', reason: 'pinned bar 1' });
  assert.equal(mix({ mode: 'path', k: 2, d: 4 })!.noteId, 'bars/bar_005', 'exactly half is still a');
  assert.equal(mix({ mode: 'path', k: 3, d: 4 })!.noteId, 'bars/bar_006');
  assert.equal(mix({ mode: 'path', k: 0, d: 0 })!.noteId, 'bars/bar_005', 'zero is a number: k 0 of d 0');
  assert.equal(mix({ mode: 'path', k: 3, d: 4 }, MIX_HIT_ROLE)!.noteId, 'bars/bar_006', 'a hit of a mix is read like its bar');
  assert.equal(mix({ mode: 'path', k: 1 }), null, 'no d');
  assert.equal(mix({ mode: 'path', d: 4 }), null, 'no k');
  assert.equal(mix({ mode: 'path' }), null);
  assert.equal(mix({ mode: 'path', k: Infinity, d: 4 }), null);
  assert.equal(mix({ mode: 'path', k: 1, d: NaN }), null);
  assert.equal(mix({ weight: 0.5 })!.noteId, 'bars/bar_005', 'a vote tie goes to a');
  assert.equal(mix({ weight: 0.49 })!.noteId, 'bars/bar_006');
  assert.equal(mix({ weight: 1 })!.noteId, 'bars/bar_005');
  assert.equal(mix({ weight: 0 })!.noteId, 'bars/bar_006');
  assert.equal(mix({ weight: 0, mode: 'vote' })!.noteId, 'bars/bar_006');
  assert.equal(mix({}), null, 'a vote without a weight');
  assert.equal(mix({ weight: 'heavy' }), null);
  assert.equal(mix({ weight: 0.9, a: '' }), null);
  assert.equal(mix({ weight: 0.9, b: '' }), null);
  assert.equal(mix({ weight: 0.9, a: undefined }), null);
  assert.equal(pinnedNoteFor(prov('something-else', { a: 'bar_005', b: 'bar_006', weight: 1 })), null);
  assert.equal(pinnedNoteFor(prov(MIX_BAR_ROLE, { a: 'bar_005', b: 'bar_006', weight: 1, mode: '' })) !== null, true, 'an empty mode is a vote, not a path');
});

test('openPairAvailable: only in a score-first vault and only on one of the three tabs', () => {
  assert.equal(openPairAvailable({ scoreFirst: true, kind: 'phrase' }), true);
  assert.equal(openPairAvailable({ scoreFirst: true, kind: null }), false);
  assert.equal(openPairAvailable({ scoreFirst: false, kind: 'bar' }), false);
});

// ---- the linker --------------------------------------------------------------------------------------------------------------------------------------------------------------------------

type Leaf = { id: string };
function rig(opts: { holdThrows?: boolean; withReading?: boolean; withEvidence?: boolean; withHold?: boolean } = {}) {
  const lines: string[] = [];
  const alive = new Set<Leaf>();
  const shownCalls: Array<[Leaf, string]> = [];
  const holds: Array<[Leaf, boolean]> = [];
  const focus: Leaf[] = [];
  const timers: Array<{ at: number; fn: () => void }> = [];
  let clock = 1000;
  const paneAt = new Map<Leaf, string | null>();
  const reading = new Map<Leaf, boolean>();
  const gate = { block: null as null | Promise<void>, fail: null as null | Error };
  let n = 0;
  const mk = (): Leaf => { const l = { id: `leaf${++n}` }; alive.add(l); return l; };
  const ports: PaneLinkerPorts<Leaf> = {
    openBeside: async (_s, path) => { const l = mk(); paneAt.set(l, path); reading.set(l, true); return l; },
    show: async (l, path) => { if (gate.block) await gate.block; if (gate.fail) throw gate.fail; shownCalls.push([l, path]); paneAt.set(l, path); reading.set(l, true); },
    alive: (l) => alive.has(l),
    focus: (l) => { focus.push(l); },
    trace: (line) => { lines.push(line); },
    pathOf: (l) => paneAt.get(l) ?? null,
    now: () => clock,
    after: (ms, fn) => { timers.push({ at: clock + ms, fn }); },
    ...(opts.withEvidence ? { leafCount: () => alive.size, idOf: (l: Leaf) => l.id } : {}),
    ...(opts.withReading ? { isReading: (l: Leaf) => reading.get(l) === true } : {}),
    ...(opts.withHold ? { hold: (l: Leaf, on: boolean) => { if (opts.holdThrows) throw new Error('no hold'); holds.push([l, on]); } } : {}),
  };
  const linker = createPaneLinker<Leaf>(ports);
  const advance = async (ms: number) => {
    const target = clock + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      clock = Math.max(clock, due.at);
      due.fn();
      await Promise.resolve();
    }
    clock = target;
  };
  return { linker, lines, alive, shownCalls, holds, focus, timers, mk, paneAt, reading, gate, advance, tick: (ms: number) => { clock += ms; }, now: () => clock };
}

test('the settle window is 300 ms: a missing pane is dropped at 300 and not at 299, the first look never closes, and a pane that came back forgets it was missing', async () => {
  assert.equal(PAIR_SETTLE_MS, 300);
  const r = rig();
  const score = r.mk();
  assert.equal(await r.linker.open(score, 'phrases/phrase_001.md', 'phrases/phrase_001.md'), 'opened');
  const notes = [...r.alive].find((l) => l !== score)!;
  r.alive.delete(notes);
  r.linker.sweep();
  assert.equal(r.lines.length, 1, 'the first look closes nothing');
  assert.equal(r.timers.length, 1, 'it schedules the second look');
  assert.equal(r.timers[0].at - r.now(), PAIR_SETTLE_MS);
  r.tick(299); r.linker.sweep();
  assert.equal(r.lines.length, 1, 'at 299 ms: still waiting');
  assert.equal(r.timers.length, 2, 'and it looks again');
  r.tick(1); r.linker.sweep();
  assert.equal(r.lines.length, 2, 'at 300 ms: confirmed gone');
  assert.match(r.lines[1], /^\[forge-panes\] pair closed \(notes pane; reason: leaf missing from iterateAllLeaves on layout-change #4\)$/);
  // a pane that comes back resets the clock: missing again starts a NEW window
  const r2 = rig();
  const s2 = r2.mk(); await r2.linker.open(s2, 'p.md', 'p.md');
  const n2 = [...r2.alive].find((l) => l !== s2)!;
  r2.alive.delete(n2); r2.linker.sweep();
  r2.tick(200); r2.alive.add(n2); r2.linker.sweep();
  r2.tick(200); r2.alive.delete(n2); r2.linker.sweep();
  r2.tick(200); r2.linker.sweep();
  assert.equal(r2.lines.filter((l) => /pair closed/.test(l)).length, 0, '400 ms after the first miss, but only 200 after the second: not closed');
  r2.tick(100); r2.linker.sweep();
  assert.equal(r2.lines.filter((l) => /pair closed/.test(l)).length, 1);
});

test('sweep schedules a second look only while something waits; a healthy pair schedules nothing; the sweep number counts from 1', async () => {
  const r = rig();
  const score = r.mk(); await r.linker.open(score, 'p.md', 'p.md');
  r.linker.sweep(); r.linker.sweep();
  assert.equal(r.timers.length, 0, 'both panes alive: nothing to look at again');
  const notes = [...r.alive].find((l) => l !== score)!;
  r.alive.delete(notes);
  r.linker.sweep(true);
  assert.match(r.lines.at(-1)!, /asked by the command #4\)$/, "open() was #1, two sweeps #2 and #3");
  assert.equal(r.timers.length, 0, 'a strict sweep closed it: nothing left to wait for');
  const fresh = rig();
  const s = fresh.mk(); await fresh.linker.open(s, 'p.md', 'p.md');
  const n = [...fresh.alive].find((l) => l !== s)!; fresh.alive.delete(n);
  fresh.linker.sweep(true);
  assert.match(fresh.lines.at(-1)!, /asked by the command #2\)$/, 'open() itself sweeps strictly first: that was #1');
});

test('a pair is dropped with its listeners: a pair made later for the same Score is not heard by the old listener; hold(false) goes to a notes pane that is still there, never to one that is gone', async () => {
  const r = rig({ withHold: true });
  const score = r.mk(); await r.linker.open(score, 'p.md', 'p.md');
  const notes = [...r.alive].find((l) => l !== score)!;
  assert.deepEqual(r.holds, [[notes, true]], 'held from the moment it is made');
  const heard: string[] = [];
  r.linker.onNotesNavigated(score, (p) => heard.push(p));
  const gone = r.mk(); r.alive.delete(gone);
  r.alive.delete(score);
  r.linker.sweep(true);
  assert.deepEqual(r.holds, [[notes, true], [notes, false]], 'the score went, the notes pane is an ordinary leaf again');
  r.alive.add(score);
  await r.linker.open(score, 'p.md', 'p.md');
  const notes2 = [...r.alive].find((l) => l !== score && l !== notes)!;
  r.paneAt.set(notes2, 'bars/bar_001.md');
  r.linker.checkNotes();
  assert.deepEqual(heard, [], 'the old listener went with the old pair');
  // the notes pane gone: nothing to release
  r.alive.delete(notes2);
  r.linker.sweep(true);
  assert.deepEqual(r.holds.filter(([, on]) => !on).length, 1, 'no hold(false) for a pane that no longer exists');
});

test('a hold that throws is reported in one line and the pair still opens', async () => {
  const r = rig({ withHold: true, holdThrows: true });
  const score = r.mk();
  assert.equal(await r.linker.open(score, 'p.md', 'p.md'), 'opened');
  assert.deepEqual(r.lines, ['[forge-panes] could not hold the notes pane: no hold', '[forge-panes] opened pair (score p.md, notes p.md)']);
  r.alive.delete([...r.alive].find((l) => l !== score)!);
  assert.doesNotThrow(() => r.linker.sweep(true));
});

test('the closing line says which pane went, with the evidence only when the ports have it', async () => {
  const bare = rig();
  const s = bare.mk(); await bare.linker.open(s, 'p.md', 'p.md');
  bare.alive.delete(s);
  bare.linker.sweep(true);
  assert.equal(bare.lines.at(-1), '[forge-panes] pair closed (score pane; reason: leaf missing from iterateAllLeaves asked by the command #2)');
  const rich = rig({ withEvidence: true });
  const s2 = rich.mk(); await rich.linker.open(s2, 'p.md', 'p.md');
  const n2 = [...rich.alive].find((l) => l !== s2)!;
  rich.alive.delete(n2);
  rich.linker.sweep(true);
  assert.equal(rich.lines.at(-1), `[forge-panes] pair closed (notes pane; reason: leaf missing from iterateAllLeaves asked by the command #2, leaves=1, leafId=${n2.id})`);
  const both = rig({ withEvidence: true });
  const s3 = both.mk(); await both.linker.open(s3, 'p.md', 'p.md');
  const n3 = [...both.alive].find((l) => l !== s3)!;
  both.alive.delete(s3); both.alive.delete(n3);
  both.linker.sweep(true);
  assert.equal(both.lines.at(-1), `[forge-panes] pair closed (both panes; reason: leaf missing from iterateAllLeaves asked by the command #2, leaves=0, leafId=${n3.id})`);
});

// ---- one show at a time, toward the last ask --------------------------------------------------------------------------------------------------------------------------------------------

test('a show that fails says so, forgets the ask (the pane still shows what it showed) and a later ask for the same note is tried again', async () => {
  const r = rig();
  const score = r.mk(); await r.linker.open(score, 'phrases/p.md', 'phrases/p.md');
  r.gate.fail = new Error('leaf is busy');
  await r.linker.pinned(score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' });
  assert.equal(r.lines.at(-1), '[forge-panes] could not show bars/bar_005.md in the notes pane: leaf is busy');
  assert.equal(r.shownCalls.length, 0);
  r.gate.fail = null;
  await r.linker.pinned(score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' });
  assert.deepEqual(r.shownCalls.map(([, p]) => p), ['bars/bar_005.md'], 'tried again');
  assert.equal(r.lines.at(-1), '[forge-panes] notes pane -> bars/bar_005.md (reason: pinned bar 2)');
  await r.linker.pinned(score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' });
  assert.equal(r.shownCalls.length, 1, 'already shown: no second show');
});

test('rapid asks while a show is running are ONE more navigation, to the last of them', async () => {
  const r = rig();
  const score = r.mk(); await r.linker.open(score, 'phrases/p.md', 'phrases/p.md');
  let release!: () => void;
  r.gate.block = new Promise<void>((res) => { release = res; });
  const first = r.linker.pinned(score, { noteId: 'bars/bar_001', reason: 'one' });
  const second = r.linker.pinned(score, { noteId: 'bars/bar_002', reason: 'two' });
  const third = r.linker.navigate(score, 'bars/bar_003');
  const done = { first: false, second: false, third: false };
  void first.then(() => { done.first = true; }); void second.then(() => { done.second = true; }); void third.then(() => { done.third = true; });
  await new Promise((res) => setImmediate(res));
  assert.deepEqual(done, { first: false, second: false, third: false }, 'every ask waits for the navigation it asked for, the ones that joined a running show too');
  r.gate.block = null; release();
  await second;
  assert.deepEqual(r.shownCalls.map(([, p]) => p), ['bars/bar_001.md', 'bars/bar_003.md'], 'the ask that joined a running show returns only when the last navigation is done');
  await Promise.all([first, second, third]);
  assert.deepEqual(r.shownCalls.map(([, p]) => p), ['bars/bar_001.md', 'bars/bar_003.md'], 'the first started before the others; then the last ask, nothing in between');
  assert.equal(r.lines.at(-1), '[forge-panes] notes pane -> bars/bar_003.md (reason: structure chip)');
  assert.equal(await r.linker.navigate(r.mk(), 'bars/x'), false, 'a Score without a pair');
});

// ---- the person navigates the notes pane -------------------------------------------------------------------------------------------------------------------------------------------

test('a link opened for editing in the notes pane is shown again as the reading view: the show is ours (nothing is echoed while it runs), the listener hears once, and a failure says so', async () => {
  const r = rig({ withReading: true });
  const score = r.mk(); await r.linker.open(score, 'phrases/p.md', 'phrases/p.md');
  const notes = [...r.alive].find((l) => l !== score)!;
  const heard: string[] = [];
  r.linker.onNotesNavigated(score, (p) => heard.push(p));
  let release!: () => void;
  r.gate.block = new Promise<void>((res) => { release = res; });
  r.paneAt.set(notes, 'bars/bar_008.md'); r.reading.set(notes, false);
  r.linker.checkNotes();
  assert.deepEqual(heard, ['bars/bar_008.md']);
  assert.equal(r.lines.at(-1), '[forge-panes] notes pane -> bars/bar_008.md (reason: navigated in the pane)');
  // while our own show runs, a workspace event must not look like a second navigation
  r.paneAt.set(notes, 'bars/bar_009.md');
  r.linker.checkNotes();
  assert.deepEqual(heard, ['bars/bar_008.md'], 'busy: not echoed');
  r.gate.block = null; release();
  await new Promise((res) => setImmediate(res));
  assert.equal(r.lines.at(-1), '[forge-panes] notes pane -> bars/bar_008.md (reason: kept as the reading view)');
  // a failure to keep it as the reading view
  const f = rig({ withReading: true });
  const s2 = f.mk(); await f.linker.open(s2, 'p.md', 'p.md');
  const n2 = [...f.alive].find((l) => l !== s2)!;
  f.gate.fail = new Error('busy');
  f.paneAt.set(n2, 'bars/bar_001.md'); f.reading.set(n2, false);
  f.linker.checkNotes();
  await new Promise((res) => setImmediate(res));
  assert.equal(f.lines.at(-1), '[forge-panes] could not keep bars/bar_001.md as the reading view: busy');
  f.gate.fail = null;
  f.paneAt.set(n2, 'bars/bar_002.md');
  f.linker.checkNotes();
  assert.equal(f.lines.filter((l) => /bar_002.md \(reason: navigated/.test(l)).length, 1, 'busy was released after the failure: the next navigation is heard');
});

test('a navigation in the pane that is already reading is heard but not re-shown; a pane that is gone, shows nothing, or shows what we showed is not a navigation; a listener that throws does not stop the others', async () => {
  const r = rig({ withReading: true });
  const score = r.mk(); await r.linker.open(score, 'p.md', 'p.md');
  const notes = [...r.alive].find((l) => l !== score)!;
  const heard: string[] = [];
  const stop = r.linker.onNotesNavigated(score, () => { throw new Error('listener bug'); });
  r.linker.onNotesNavigated(score, (p) => heard.push(p));
  r.paneAt.set(notes, 'bars/bar_004.md'); r.reading.set(notes, true);
  r.linker.checkNotes();
  assert.deepEqual(heard, ['bars/bar_004.md']);
  assert.equal(r.shownCalls.length, 0, 'reading already: nothing re-shown');
  r.linker.checkNotes();
  assert.deepEqual(heard, ['bars/bar_004.md'], 'same path again: not a navigation');
  r.paneAt.set(notes, null); r.linker.checkNotes();
  assert.deepEqual(heard, ['bars/bar_004.md'], 'no file: not a navigation');
  stop();
  r.paneAt.set(notes, 'bars/bar_005.md'); r.linker.checkNotes();
  assert.deepEqual(heard, ['bars/bar_004.md', 'bars/bar_005.md'], 'a stopped listener is not called, the others are');
  r.alive.delete(notes); r.paneAt.set(notes, 'bars/bar_006.md'); r.linker.checkNotes();
  assert.deepEqual(heard, ['bars/bar_004.md', 'bars/bar_005.md'], 'a pane that is gone says nothing');
});

test('open on a Score that already has a pair focuses that Score and opens nothing; a pane that cannot be made says so and leaves no pair', async () => {
  const r = rig();
  const score = r.mk();
  assert.equal(await r.linker.open(score, 'p.md', 'p.md'), 'opened');
  const before = r.alive.size;
  assert.equal(await r.linker.open(score, 'p.md', 'p.md'), 'focused');
  assert.deepEqual(r.focus, [score]);
  assert.equal(r.alive.size, before);
  const bad = createPaneLinker<Leaf>({ openBeside: async () => { throw new Error('no room'); }, show: async () => {}, alive: () => true, focus: () => {}, trace: (l) => r.lines.push(l), pathOf: () => null });
  assert.equal(await bad.open(score, 'p.md', 'p.md'), 'failed');
  assert.equal(r.lines.at(-1), '[forge-panes] could not open the notes pane: no room');
  assert.equal(await bad.navigate(score, 'x'), false, 'no pair was left behind');
});
