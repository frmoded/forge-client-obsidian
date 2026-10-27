// 2026-10-27-1000 (FULL-profile hardening of what shipped under DEMO): the survivors of the mutation pass over refresh-notes-core.ts: the BAR half of the run (a bar that cannot be read, a bar write that fails, hand-written
// descriptions counted only when they are) and the exact words of the evidence line and the Notice.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { refreshLine, refreshNoteLinks, refreshNotice, type RefreshNotesPorts, type RefreshSummary } from './refresh-notes-core.ts';
import { formatRhythmJson, type RhythmData } from './rhythm-edit-core.ts';

const DATA = { time_signature: '4/4', steps: 4, group_size: 4, swing_pct: 0, tempo_bpm: 90, channels: { kick: [true, false, true, false] } } as RhythmData;
const bar = (desc: string | null, json = formatRhythmJson(DATA)) => `---\ntype: data\ncontent_type: json\n${desc === null ? '' : `description: ${JSON.stringify(desc)}\n`}---\n\n\`\`\`json\n${json}\n\`\`\`\n`;
const CURRENT = (name: string) => bar(`${name} — a one-bar rhythm for the Beat Box: 2 hits in 4 steps (kick 2), tempo 90.`);
const STALE = (name: string) => bar(`${name} — a one-bar rhythm for the Beat Box: no hits in 4 steps, tempo 90.`);

function vault(files: Record<string, string>, opts: { failWrite?: string; failRead?: string } = {}) {
  const store = new Map(Object.entries(files));
  const writes: string[] = [];
  const ports: RefreshNotesPorts = {
    phrases: () => [],
    bars: () => [...store.keys()].filter((p) => /^bars\/bar_\d+\.md$/.test(p)).sort().map((path) => ({ path, name: path.replace(/^.*\//, '').replace(/\.md$/, '') })),
    read: async (p) => { if (opts.failRead === p) throw new Error('read refused'); return store.get(p)!; },
    process: async (p, fn) => { if (opts.failWrite === p) throw new Error('disk full'); writes.push(p); store.set(p, fn(store.get(p)!)); },
  };
  return { store, writes, ports };
}

test('a bar that cannot be read is named with the reader\'s reason, counted as skipped, never written, and does not stop the next bar', async () => {
  const v = vault({ 'bars/bar_001.md': bar(null, '{ nope'), 'bars/bar_002.md': STALE('bar_002'), 'bars/bar_003.md': 'no frontmatter' });
  const sum = await refreshNoteLinks(v.ports);
  assert.equal(sum.bars.total, 3);
  assert.equal(sum.bars.updated, 1);
  assert.equal(sum.bars.current, 0, 'an unreadable bar is not "already current"');
  assert.equal(sum.bars.skipped.length, 2);
  assert.match(sum.bars.skipped[0], /^bars\/bar_001\.md: The json block is not valid JSON: /);
  assert.equal(sum.bars.skipped[1], 'bars/bar_003.md: The note has no frontmatter, so it is not a data note.');
  assert.deepEqual(v.writes, ['bars/bar_002.md']);
  assert.equal(v.store.get('bars/bar_001.md'), bar(null, '{ nope'));
});

test('a bar whose write fails, or whose read throws, is a skipped line with the error\'s message; the run goes on and nothing throws', async () => {
  const v = vault({ 'bars/bar_001.md': STALE('bar_001'), 'bars/bar_002.md': STALE('bar_002'), 'bars/bar_003.md': STALE('bar_003') }, { failWrite: 'bars/bar_001.md', failRead: 'bars/bar_002.md' });
  const sum = await refreshNoteLinks(v.ports);
  assert.deepEqual(sum.bars.skipped, ['bars/bar_001.md: disk full', 'bars/bar_002.md: read refused']);
  assert.equal(sum.bars.updated, 1, 'only the third');
  assert.deepEqual(v.writes, ['bars/bar_003.md']);
  const odd = vault({ 'bars/bar_001.md': STALE('bar_001') });
  odd.ports.process = async () => { throw 'a plain string'; };
  const s2 = await refreshNoteLinks(odd.ports);
  assert.deepEqual(s2.bars.skipped, ['bars/bar_001.md: a plain string'], 'a thrown non-Error is still named');
});

test('hand-written descriptions are counted only for the bars that have one; current and updated bars are counted apart', async () => {
  const v = vault({
    'bars/bar_001.md': bar('bar_001 — my words.'),
    'bars/bar_002.md': CURRENT('bar_002'),
    'bars/bar_003.md': STALE('bar_003'),
    'bars/bar_004.md': bar(null),
  });
  const sum = await refreshNoteLinks(v.ports);
  assert.deepEqual(sum.bars, { total: 4, updated: 1, current: 3, keptAsWritten: 1, skipped: [] });
  assert.deepEqual(v.writes, ['bars/bar_003.md']);
});

test('the evidence line and the Notice, word for word, with and without skipped notes', () => {
  const s = (over: Partial<RefreshSummary['phrases']>, barsOver: Partial<RefreshSummary['bars']>): RefreshSummary => ({
    phrases: { total: 2, updated: 1, current: 1, skipped: [], ...over },
    bars: { total: 5, updated: 2, current: 3, keptAsWritten: 1, skipped: [], ...barsOver },
  });
  assert.equal(refreshLine(s({}, {})), '[forge-notes] refresh note links: phrases 2 (1 updated, 1 already current), bars 5 (2 updated, 3 already current, 1 descriptions left as written)');
  assert.equal(refreshLine(s({ skipped: ['a'] }, {})), '[forge-notes] refresh note links: phrases 2 (1 updated, 1 already current), bars 5 (2 updated, 3 already current, 1 descriptions left as written), 1 skipped');
  assert.equal(refreshLine(s({ skipped: ['a'] }, { skipped: ['b', 'c'] })), '[forge-notes] refresh note links: phrases 2 (1 updated, 1 already current), bars 5 (2 updated, 3 already current, 1 descriptions left as written), 3 skipped');
  assert.equal(refreshLine(s({}, { skipped: ['b'] })), '[forge-notes] refresh note links: phrases 2 (1 updated, 1 already current), bars 5 (2 updated, 3 already current, 1 descriptions left as written), 1 skipped');
  assert.equal(refreshNotice(s({}, {})), 'Refresh note links: 1 phrase note(s) and 2 bar note(s) updated.');
  assert.equal(refreshNotice(s({ updated: 0 }, { updated: 0 })), 'Refresh note links: every note was already up to date.');
  assert.equal(refreshNotice(s({ updated: 0 }, { updated: 1 })), 'Refresh note links: 0 phrase note(s) and 1 bar note(s) updated.', 'one bar is enough to be "updated"');
  assert.equal(refreshNotice(s({ updated: 1 }, { updated: 1 })), 'Refresh note links: 1 phrase note(s) and 1 bar note(s) updated.', 'the counts add up, they do not cancel');
  assert.equal(refreshNotice(s({ updated: 1 }, { updated: 0 })), 'Refresh note links: 1 phrase note(s) and 0 bar note(s) updated.');
  assert.equal(refreshNotice(s({ skipped: ['phrases/phrase_002.md: bad'] }, { skipped: ['bars/bar_001.md: worse'] })), 'Refresh note links: 1 phrase note(s) and 2 bar note(s) updated; 2 could not be read (phrases/phrase_002.md: bad).');
  assert.equal(refreshNotice(s({ updated: 0 }, { updated: 0, skipped: ['bars/bar_001.md: worse'] })), 'Refresh note links: every note was already up to date; 1 could not be read (bars/bar_001.md: worse).');
});
