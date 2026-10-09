// Beat-as-data Phase 5c (drain 2026-10-07-0100): the Beat Box as the DEFAULT view of a rhythm data note.
// The decision is a pure allow-list predicate plus a small controller (marks + re-entrancy guard) with every Obsidian touch injected,
// so the "no loops, no flicker, Open as JSON sticks" requirements are tested for real, not just pinned.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDefaultViewController,
  decideDefaultView,
  type DefaultViewInput,
  type LeafInfo,
} from './rhythm-default-view-core.ts';

const ok = (over: Partial<DefaultViewInput> = {}): DefaultViewInput => ({
  settingOn: true, location: 'main', viewType: 'markdown', isPlainMarkdownView: true, filePath: 'rhythm_data/a.md', extension: 'md',
  frontmatterIsCandidate: true, bodyIsRhythm: true, mark: null, edition: 'music', swapInProgress: false, ...over,
});

test('a plain markdown leaf in the main area showing a valid rhythm note is swapped to the Beat Box', () => {
  assert.deepEqual(decideDefaultView(ok()), { swap: true, reason: 'swap', target: 'beatbox' });
});

test('sidebars\' document leaves count as normal leaves', () => {
  assert.equal(decideDefaultView(ok({ location: 'sidebar' })).swap, true);
});

test('allow-list: hover previews, popouts/floating windows, canvas cards and any other location are never swapped', () => {
  for (const location of ['other', 'hover', 'canvas', 'floating', ''] as const) {
    const d = decideDefaultView(ok({ location: location as never }));
    assert.equal(d.swap, false, String(location));
    assert.equal(d.reason, 'not-allowed-location');
  }
});

test('allow-list: only a plain markdown view of the file is swapped — not a diff view, not an already-swapped Beat Box, not a deferred view', () => {
  assert.equal(decideDefaultView(ok({ isPlainMarkdownView: false })).reason, 'not-markdown-view');
  assert.equal(decideDefaultView(ok({ viewType: 'forge-rhythm-edit' })).reason, 'not-markdown-view');
  assert.equal(decideDefaultView(ok({ viewType: 'git-diff' })).reason, 'not-markdown-view');
});

test('no file, a non-md file, a note that is not a data/json candidate, or an invalid rhythm body are left in the markdown view', () => {
  assert.equal(decideDefaultView(ok({ filePath: null })).reason, 'no-file');
  assert.equal(decideDefaultView(ok({ extension: 'canvas' })).reason, 'no-file');
  assert.equal(decideDefaultView(ok({ frontmatterIsCandidate: false })).reason, 'not-candidate');
  assert.equal(decideDefaultView(ok({ bodyIsRhythm: false })).reason, 'invalid-rhythm');
});

test('the body is only needed once everything cheap has said yes: bodyIsRhythm null → need-body, not a swap', () => {
  assert.deepEqual(decideDefaultView(ok({ bodyIsRhythm: null })), { swap: false, reason: 'need-body' });
  assert.equal(decideDefaultView(ok({ bodyIsRhythm: null, frontmatterIsCandidate: false })).reason, 'not-candidate');
});

test('the setting off restores the Phase 5b behaviour (button only): never swap', () => {
  assert.deepEqual(decideDefaultView(ok({ settingOn: false })), { swap: false, reason: 'setting-off' });
});

test('a "stay in JSON" mark is respected; a "stay in Score" mark opens the Score on the music edition and the Beat Box on lean', () => {
  assert.equal(decideDefaultView(ok({ mark: 'markdown' })).reason, 'prefer-markdown');
  assert.deepEqual(decideDefaultView(ok({ mark: 'score' })), { swap: true, reason: 'swap', target: 'score' });
  assert.deepEqual(decideDefaultView(ok({ mark: 'score', edition: 'lean' })), { swap: true, reason: 'swap', target: 'beatbox' });
});

test('a swap already in progress for the leaf is never started twice', () => {
  assert.deepEqual(decideDefaultView(ok({ swapInProgress: true })), { swap: false, reason: 'swap-in-progress' });
});

// ---- the controller: marks + guard + the awaited body read, with Obsidian injected ---------------------------------

function rig(over: { info?: Partial<LeafInfo>; rhythm?: boolean; setting?: boolean } = {}) {
  const leaf = { name: 'leaf' };
  const info: LeafInfo = { location: 'main', viewType: 'markdown', isPlainMarkdownView: true, filePath: 'r.md', extension: 'md', frontmatterIsCandidate: true, ...over.info };
  const state = { info: info as LeafInfo | null, setting: over.setting ?? true, rhythm: over.rhythm ?? true, swaps: [] as string[], reads: 0, slept: [] as number[] };
  const events: Array<() => Promise<unknown>> = [];
  const c = createDefaultViewController<object>({
    settingOn: () => state.setting,
    describe: () => state.info,
    readBodyIsRhythm: async () => { state.reads++; return state.rhythm; },
    edition: 'music',
    swapTo: async (_l, p) => {
      state.swaps.push(p);
      // the swap itself fires layout / file-open events that re-enter the controller — they must not start a second swap
      await Promise.all([c.evaluate(leaf), c.evaluate(leaf)]);
      state.info = { ...info, viewType: 'forge-rhythm-edit', isPlainMarkdownView: false };
    },
    isSwapped: () => state.info?.viewType === 'forge-rhythm-edit',
    sleep: async (ms) => { state.slept.push(ms); },
  });
  return { c, leaf, state, events };
}

test('controller: a valid rhythm note is swapped exactly once even though the swap re-enters evaluate() (no loop, no flicker)', async () => {
  const { c, leaf, state } = rig();
  assert.equal(await c.evaluate(leaf), 'swap');
  assert.deepEqual(state.swaps, ['r.md']);
  assert.equal(await c.evaluate(leaf), 'not-markdown-view', 'afterwards the leaf is a Beat Box and is left alone');
  assert.equal(state.swaps.length, 1);
});

test('controller: "Open as JSON" sticks — after markPreferMarkdown the same leaf and file are never swapped again', async () => {
  const { c, leaf, state } = rig();
  c.setMark(leaf, 'r.md', 'markdown');
  assert.equal(await c.evaluate(leaf), 'prefer-markdown');
  assert.equal(await c.evaluate(leaf), 'prefer-markdown');
  assert.equal(state.swaps.length, 0);
  assert.equal(state.reads, 0, 'and the note body is not even read');
});

test('controller: an explicit "Open as Beat Box" (clearPreferMarkdown) ends the stay-in-markdown choice for the leaf', async () => {
  const { c, leaf } = rig();
  c.setMark(leaf, 'r.md', 'markdown');
  assert.equal(await c.evaluate(leaf), 'prefer-markdown');
  c.setMark(leaf, 'r.md', null);
  assert.equal(await c.evaluate(leaf), 'swap');
});

test('controller: navigating the marked leaf to another note clears the mark, so coming back to the rhythm note opens the Beat Box', async () => {
  const { c, leaf, state } = rig({ info: { frontmatterIsCandidate: false } });
  c.setMark(leaf, 'r.md', 'markdown');
  state.info = { ...state.info!, filePath: 'other.md' };
  assert.equal(await c.evaluate(leaf), 'not-candidate');
  state.info = { ...state.info!, filePath: 'r.md', frontmatterIsCandidate: true };
  assert.equal(await c.evaluate(leaf), 'swap');
});

test('controller: a rhythm note whose body no longer validates stays in the markdown view so the user can fix it', async () => {
  const { c, leaf, state } = rig({ rhythm: false });
  assert.equal(await c.evaluate(leaf), 'invalid-rhythm');
  assert.equal(state.swaps.length, 0);
});

test('controller: the setting off → no swap and no body read', async () => {
  const { c, leaf, state } = rig({ setting: false });
  assert.equal(await c.evaluate(leaf), 'setting-off');
  assert.equal(state.reads, 0);
  assert.equal(state.swaps.length, 0);
});

test('controller: if the leaf changed while the body was being read, the swap is abandoned', async () => {
  const { c, leaf, state } = rig();
  const readOriginal = state.reads;
  void readOriginal;
  const c2 = createDefaultViewController<object>({
    settingOn: () => true,
    edition: 'music',
    describe: () => state.info,
    readBodyIsRhythm: async () => { state.info = { ...state.info!, filePath: 'moved.md' }; return true; },
    swapTo: async (_l, p) => { state.swaps.push(p); },
    isSwapped: () => false,
    sleep: async () => {},
  });
  assert.equal(await c2.evaluate(leaf), 'stale');
  assert.equal(state.swaps.length, 0);
  void c;
});

test('controller: a leaf in a hover preview / other location is never read or swapped', async () => {
  const { c, leaf, state } = rig({ info: { location: 'other' } });
  assert.equal(await c.evaluate(leaf), 'not-allowed-location');
  assert.equal(state.reads, 0);
});

test('controller: an error while swapping releases the guard, so a later pass can try again', async () => {
  const leaf = {};
  let fail = true; let swaps = 0;
  const c = createDefaultViewController<object>({
    settingOn: () => true,
    edition: 'music',
    describe: () => ({ location: 'main', viewType: 'markdown', isPlainMarkdownView: true, filePath: 'r.md', extension: 'md', frontmatterIsCandidate: true }),
    readBodyIsRhythm: async () => true,
    swapTo: async () => { swaps++; if (fail) throw new Error('boom'); },
    isSwapped: () => !fail,
    sleep: async () => {},
  });
  await assert.rejects(c.evaluate(leaf), /boom/);
  fail = false;
  assert.equal(await c.evaluate(leaf), 'swap');
  assert.equal(swaps, 2);
});

// Obsidian's WorkspaceLeaf.setViewState silently returns when the leaf is already inside another setViewState (`if (this.working) return`).
// A swap attempted from an event handler can therefore be DROPPED without any error: the controller verifies and retries.
function flaky(dropFirst: number) {
  const leaf = {};
  const st = { info: { location: 'main', viewType: 'markdown', isPlainMarkdownView: true, filePath: 'r.md', extension: 'md', frontmatterIsCandidate: true } as LeafInfo | null, attempts: 0, slept: [] as number[] };
  const c = createDefaultViewController<object>({
    settingOn: () => true,
    edition: 'music',
    describe: () => st.info,
    readBodyIsRhythm: async () => true,
    swapTo: async () => { st.attempts++; if (st.attempts > dropFirst) st.info = { ...st.info!, viewType: 'forge-rhythm-edit', isPlainMarkdownView: false }; },
    isSwapped: () => st.info?.viewType === 'forge-rhythm-edit',
    sleep: async (ms) => { st.slept.push(ms); },
  });
  return { c, leaf, st };
}

test('controller: a swap Obsidian silently drops (leaf busy) is verified and retried with backoff until it takes', async () => {
  const { c, leaf, st } = flaky(2);
  assert.equal(await c.evaluate(leaf), 'swap');
  assert.equal(st.attempts, 3);
  assert.equal(st.slept.length, 2);
  assert.ok(st.slept[0] < st.slept[1], 'backoff grows');
});

test('controller: a swap that never takes gives up after a bounded number of attempts and says so — no infinite retry', async () => {
  const { c, leaf, st } = flaky(99);
  assert.equal(await c.evaluate(leaf), 'swap-failed');
  assert.equal(st.attempts, 4, 'one try plus three retries');
});

test('controller: a retry is abandoned if the leaf moved to another note in the meantime', async () => {
  const { c, leaf, st } = flaky(99);
  const origSleep = st.slept;
  const c2 = createDefaultViewController<object>({
    settingOn: () => true,
    edition: 'music',
    describe: () => st.info,
    readBodyIsRhythm: async () => true,
    swapTo: async () => { st.attempts++; },
    isSwapped: () => false,
    sleep: async () => { st.info = { ...st.info!, filePath: 'elsewhere.md' }; },
  });
  assert.equal(await c2.evaluate(leaf), 'stale');
  assert.equal(st.attempts, 1);
  void c; void origSleep;
});

test('controller: the guard stays held across retries (events during a retry window cannot start another swap)', async () => {
  const leaf = {};
  const st = { info: { location: 'main', viewType: 'markdown', isPlainMarkdownView: true, filePath: 'r.md', extension: 'md', frontmatterIsCandidate: true } as LeafInfo | null, attempts: 0, inner: [] as string[] };
  const c = createDefaultViewController<object>({
    settingOn: () => true,
    edition: 'music',
    describe: () => st.info,
    readBodyIsRhythm: async () => true,
    swapTo: async () => { st.attempts++; if (st.attempts > 1) st.info = { ...st.info!, viewType: 'forge-rhythm-edit', isPlainMarkdownView: false }; },
    isSwapped: () => st.info?.viewType === 'forge-rhythm-edit',
    sleep: async () => { st.inner.push(await c.evaluate(leaf)); },
  });
  assert.equal(await c.evaluate(leaf), 'swap');
  assert.deepEqual(st.inner, ['swap-in-progress']);
  assert.equal(st.attempts, 2);
});

// ---- Phase 6: the Score target ------------------------------------------------------------------------------------------------

function scoreRig(edition: 'lean' | 'music') {
  const leaf = {};
  const st = { info: { location: 'main', viewType: 'markdown', isPlainMarkdownView: true, filePath: 'r.md', extension: 'md', frontmatterIsCandidate: true } as LeafInfo | null, targets: [] as string[] };
  const c = createDefaultViewController<object>({
    settingOn: () => true,
    edition,
    describe: () => st.info,
    readBodyIsRhythm: async () => true,
    swapTo: async (_l, _p, target) => { st.targets.push(target); st.info = { ...st.info!, viewType: `forge-rhythm-${target}`, isPlainMarkdownView: false }; },
    isSwapped: (_l, target) => st.info?.viewType === `forge-rhythm-${target}`,
    sleep: async () => {},
  });
  return { c, leaf, st };
}

test('Score is sticky: a leaf marked "score" is re-opened as the Score (not the Beat Box) when it shows the note again', async () => {
  const { c, leaf, st } = scoreRig('music');
  c.setMark(leaf, 'r.md', 'score');
  assert.equal(await c.evaluate(leaf), 'swap');
  assert.deepEqual(st.targets, ['score']);
});

test('no mark on the music edition: the default target is still the Beat Box', async () => {
  const { c, leaf, st } = scoreRig('music');
  assert.equal(await c.evaluate(leaf), 'swap');
  assert.deepEqual(st.targets, ['beatbox']);
});

test('lean edition: a stale "score" mark can never open the Score — it opens the Beat Box', async () => {
  const { c, leaf, st } = scoreRig('lean');
  c.setMark(leaf, 'r.md', 'score');
  assert.equal(await c.evaluate(leaf), 'swap');
  assert.deepEqual(st.targets, ['beatbox']);
});

test('the Score mark is scoped to leaf + file: another note on that leaf opens the Beat Box', async () => {
  const { c, leaf, st } = scoreRig('music');
  c.setMark(leaf, 'other.md', 'score');
  assert.equal(await c.evaluate(leaf), 'swap');
  assert.deepEqual(st.targets, ['beatbox']);
});
