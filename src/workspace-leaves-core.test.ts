// 2026-10-26-1545 (DEMO blocker: "Open Score with notes" closed its own pair within the same second). The mock workspaces of the earlier tests had a `iterateAllLeaves` that called the callback for EVERY leaf; Obsidian's does not:
// `iterateLeaves` stops a split's walk as soon as the callback returns something truthy (app.js 1.14.5: `else if (e instanceof jD) { if (t(e)) return !0 }`, and iterateAllLeaves walks root, left, right, floating, each stopping on its own).
// `(l) => all.add(l)` returns the Set, so the plugin's "which leaves are alive" saw ONE leaf per split and the notes pane "left the workspace" on the first layout-change. This file is the faithful workspace.
// It pins the MECHANISM (the callback must return nothing); if Obsidian's walk changes this SHOULD go red - reassess, don't just rewrite.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createPaneLinker, PAIR_SETTLE_MS, type PaneLinkerPorts } from './linked-panes-core.ts';
import { collectLeaves } from './workspace-leaves-core.ts';
import { obsidianWorkspace } from './test-support/host-workspace.ts';

type Leaf = { id: string };

const mk = (id: string): Leaf => ({ id });

test('the faithful workspace reproduces the incident: an expression-bodied callback that returns the Set sees ONE leaf per split', () => {
  const [other, score, notes, side] = [mk('other'), mk('score'), mk('notes'), mk('side')];
  const ws = obsidianWorkspace({ root: [other, score, notes], left: [side], right: [], floating: [] });
  const all = new Set<Leaf>();
  ws.iterateAllLeaves((l) => all.add(l));                 // the 2026-10-26-1250 code, verbatim in shape
  assert.deepEqual([...all].map((l) => l.id), ['other', 'side'], 'the Score and the notes pane were invisible');
});

test('collectLeaves lists EVERY leaf of every split, whatever the order', () => {
  const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(mk);
  const ws = obsidianWorkspace({ root: [a, b, c], left: [d], right: [e], floating: [] });
  assert.deepEqual([...collectLeaves<Leaf>((each) => ws.iterateAllLeaves(each))].map((l) => l.id), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(collectLeaves<Leaf>((each) => obsidianWorkspace({ root: [], left: [], right: [], floating: [] }).iterateAllLeaves(each)).size, 0);
});

// ---- the pair on that workspace: the order Obsidian really has -------------------------------------------------------------------------------------------------------------------------

function pairWorld(opts: { fixed: boolean }) {
  const [other, score] = [mk('other'), mk('score')];
  const ws = obsidianWorkspace({ root: [other, score], left: [], right: [], floating: [] });
  const lines: string[] = [];
  const shown = new Map<Leaf, string>();
  let clock = 0;
  const timers: Array<{ at: number; fn: () => void }> = [];
  const live = (): Set<Leaf> => {
    if (opts.fixed) return collectLeaves<Leaf>((each) => ws.iterateAllLeaves(each));
    const all = new Set<Leaf>(); ws.iterateAllLeaves((l) => all.add(l)); return all;
  };
  const ports: PaneLinkerPorts<Leaf> = {
    openBeside: async (s, path) => { const n = mk('notes'); ws.splits.root.splice(ws.splits.root.indexOf(s) + 1, 0, n); shown.set(n, path); return n; },
    show: async (n, path) => { await Promise.resolve(); shown.set(n, path); },
    alive: (l) => live().has(l),
    focus: () => {},
    trace: (line) => { lines.push(line); },
    pathOf: (l) => shown.get(l) ?? null,
    now: () => clock,
    after: (ms, fn) => { timers.push({ at: clock + ms, fn }); },
    leafCount: () => live().size,
    idOf: (l) => l.id,
  };
  const advance = (ms: number) => { clock += ms; for (const t of timers.filter((x) => x.at <= clock)) { timers.splice(timers.indexOf(t), 1); t.fn(); } };
  return { ws, score, lines, shown, linker: createPaneLinker<Leaf>(ports), advance, notes: () => ws.splits.root.find((l) => l.id === 'notes')! };
}

test('RED on the old walk: the first layout-change closed a pair whose notes pane was on screen', async () => {
  const w = pairWorld({ fixed: false });
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  w.linker.sweep(true);                                    // what a strict look says with the broken walk
  assert.ok(w.lines.some((l) => /pair closed \(both panes/.test(l)), `the incident: ${w.lines.join(' | ')}`);
});

test('GREEN on the faithful walk: layout-changes after the open leave the pair standing, and a pin reaches the notes pane', async () => {
  const w = pairWorld({ fixed: true });
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  for (let i = 0; i < 5; i++) { w.linker.sweep(); w.advance(PAIR_SETTLE_MS + 1); }
  assert.deepEqual(w.lines, ['[forge-panes] opened pair (score phrases/phrase_001.md, notes phrases/phrase_001.md)']);
  await w.linker.pinned(w.score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' });
  assert.equal(w.shown.get(w.notes()), 'bars/bar_005.md');
  assert.equal(await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md'), 'focused', 'the command again focuses the pair: no third pane');
});

// ---- the settle check -----------------------------------------------------------------------------------------------------------------------------------------------------------------

test('a pane missing on ONE look (a layout-change in the middle of a split) does not close the pair; it is looked at again PAIR_SETTLE_MS later', async () => {
  const w = pairWorld({ fixed: true });
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  const notes = w.notes();
  w.ws.splits.root.splice(w.ws.splits.root.indexOf(notes), 1);      // gone for a moment
  w.linker.sweep();
  w.ws.splits.root.push(notes);                                      // ... and back (Obsidian re-parents it)
  w.advance(PAIR_SETTLE_MS + 1);
  assert.equal(w.lines.length, 1, `still only the open line: ${w.lines.join(' | ')}`);
  await w.linker.pinned(w.score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' });
  assert.equal(w.shown.get(notes), 'bars/bar_005.md');
});

test('a pane that is really gone is confirmed after PAIR_SETTLE_MS: ONE line naming which pane, the reason, the leaf count and the leaf id; no timer-less limbo', async () => {
  const w = pairWorld({ fixed: true });
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  w.ws.splits.root.splice(w.ws.splits.root.indexOf(w.notes()), 1);
  w.linker.sweep();
  assert.equal(w.lines.length, 1, 'not closed on the first look');
  w.advance(PAIR_SETTLE_MS - 1);
  assert.equal(w.lines.length, 1, 'not before the settle time');
  w.advance(2);
  assert.equal(w.lines.length, 2);
  assert.match(w.lines[1]!, /^\[forge-panes\] pair closed \(notes pane; reason: leaf missing from iterateAllLeaves on layout-change #\d+, leaves=2, leafId=notes\)$/);
  w.linker.sweep(); w.advance(1000);
  assert.equal(w.lines.length, 2, 'once');
});

test('the command asks strictly: a notes pane that is really closed makes a fresh pair at once, not a "focused" dead one', async () => {
  const w = pairWorld({ fixed: true });
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  w.ws.splits.root.splice(w.ws.splits.root.indexOf(w.notes()), 1);
  assert.equal(await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md'), 'opened');
  assert.ok(w.lines.some((l) => /pair closed \(notes pane; reason: leaf missing from iterateAllLeaves asked by the command/.test(l)));
});

// ---- the guard: the mechanism, not today's spelling -------------------------------------------------------------------------------------------------------------------------------------

/** Every callback handed to Obsidian's leaf walks must be a BLOCK (or a bare function name): an expression body returns its value, and a truthy one stops the walk. */
export function expressionBodiedLeafWalks(source: string): string[] {
  const found: string[] = [];
  const re = /\biterate(?:All|Root)?Leaves\(\s*(?:\([\w\s,:<>]*\)|[A-Za-z_]\w*)\s*=>\s*(?=[^\s{])([^\n]{0,60})/g;
  for (let m = re.exec(source); m; m = re.exec(source)) found.push(m[0]);
  return found;
}

test('GUARD (non-vacuous): the detector flags the original line, and no source file in src/ walks Obsidian\'s leaves with an expression-bodied callback', () => {
  assert.equal(expressionBodiedLeafWalks('const liveLeaves = () => { const all = new Set(); app.workspace.iterateAllLeaves((l) => all.add(l)); return all; };').length, 1, 'the 1250 line');
  assert.equal(expressionBodiedLeafWalks('app.workspace.iterateRootLeaves(leaf => n++)').length, 1);
  assert.equal(expressionBodiedLeafWalks('app.workspace.iterateAllLeaves((l) => { all.add(l); });').length, 0, 'a block is fine');
  const offenders: string[] = [];
  for (const f of readdirSync(new URL('.', import.meta.url))) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
    for (const hit of expressionBodiedLeafWalks(readFileSync(new URL(f, import.meta.url), 'utf8'))) offenders.push(`${f}: ${hit}`);
  }
  assert.deepEqual(offenders, []);
});
