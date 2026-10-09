// Beat-as-data Phase 6 (drain 2026-10-07-1600): the note's tab has THREE modes — JSON, Beat Box, Score — and the music edition only has
// the third. Pure state machine: which modes exist, which header actions each mode offers, what a switch does to the per-leaf+file "sticky"
// mark, and what the default-view logic should open next.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MODE_ACTIONS,
  ModeMarks,
  availableModes,
  defaultTarget,
  headerActionsFor,
  transition,
  type RhythmMode,
} from './rhythm-mode-core.ts';

const ALL: RhythmMode[] = ['json', 'beatbox', 'score'];

test('modes: the music edition has three, the lean edition only JSON and Beat Box (Score does not exist there)', () => {
  assert.deepEqual(availableModes('music'), ['json', 'beatbox', 'score']);
  assert.deepEqual(availableModes('lean'), ['json', 'beatbox']);
});

test('header actions: every mode offers buttons for the OTHER available modes, never itself, in a fixed order', () => {
  assert.deepEqual(headerActionsFor('json', 'music').map((a) => a.mode), ['beatbox', 'score']);
  assert.deepEqual(headerActionsFor('beatbox', 'music').map((a) => a.mode), ['score', 'json']);
  assert.deepEqual(headerActionsFor('score', 'music').map((a) => a.mode), ['beatbox', 'json']);
});

test('header actions on lean: no Score action anywhere', () => {
  for (const m of ['json', 'beatbox'] as RhythmMode[]) {
    assert.ok(!headerActionsFor(m, 'lean').some((a) => a.mode === 'score'), m);
  }
  assert.deepEqual(headerActionsFor('json', 'lean').map((a) => a.mode), ['beatbox']);
  assert.deepEqual(headerActionsFor('beatbox', 'lean').map((a) => a.mode), ['json']);
});

test('the actions carry the established titles; Score gets its own icon', () => {
  assert.equal(MODE_ACTIONS.json.title, 'Open as JSON');
  assert.equal(MODE_ACTIONS.beatbox.title, 'Open as Beat Box');
  assert.equal(MODE_ACTIONS.score.title, 'Open as Score');
  assert.equal(MODE_ACTIONS.json.icon, 'braces');
  assert.equal(MODE_ACTIONS.beatbox.icon, 'music');
  assert.equal(MODE_ACTIONS.score.icon, 'list-music');
  assert.equal(new Set(ALL.map((m) => MODE_ACTIONS[m].icon)).size, 3, 'three distinct icons');
});

test('transition: every ordered pair of modes among the available ones is a legal switch with the right mark', () => {
  for (const from of ALL) {
    for (const to of ALL) {
      if (from === to) continue;
      const r = transition('music', from, to);
      assert.equal(r.ok, true, `${from} -> ${to}`);
      if (r.ok) {
        assert.equal(r.mode, to);
        assert.equal(r.mark, to === 'json' ? 'markdown' : to === 'score' ? 'score' : null, `${from} -> ${to} mark`);
      }
    }
  }
});

test('transition: to the same mode is a no-op refusal; Score on lean is refused (and nothing is marked)', () => {
  assert.deepEqual(transition('music', 'beatbox', 'beatbox'), { ok: false, reason: 'already-there' });
  assert.deepEqual(transition('lean', 'beatbox', 'score'), { ok: false, reason: 'unavailable' });
  assert.deepEqual(transition('lean', 'json', 'score'), { ok: false, reason: 'unavailable' });
  assert.equal(transition('lean', 'json', 'beatbox').ok, true);
});

test('default target: no mark → Beat Box; "stay in JSON" → none (markdown); "Score" → Score on music, Beat Box on lean', () => {
  assert.equal(defaultTarget(null, 'music'), 'beatbox');
  assert.equal(defaultTarget('markdown', 'music'), null);
  assert.equal(defaultTarget('score', 'music'), 'score');
  assert.equal(defaultTarget('score', 'lean'), 'beatbox', 'a Score mark can never open Score on lean');
  assert.equal(defaultTarget('markdown', 'lean'), null);
});

test('marks: scoped to leaf + file, dropped when the leaf shows another file, absent on a new leaf, cleared by Beat Box', () => {
  const marks = new ModeMarks<object>();
  const a = {}; const b = {};
  marks.set(a, 'x.md', 'score');
  assert.equal(marks.reconcile(a, 'x.md'), 'score');
  assert.equal(marks.reconcile(b, 'x.md'), null, 'a new tab has no mark');
  assert.equal(marks.reconcile(a, 'y.md'), null, 'leaf navigated away');
  assert.equal(marks.reconcile(a, 'x.md'), null, 'and the mark did not come back');
  marks.set(a, 'x.md', 'markdown');
  marks.clear(a);
  assert.equal(marks.reconcile(a, 'x.md'), null);
});

test('marks: choosing a mode REPLACES the previous mark for that leaf (JSON then Score → Score)', () => {
  const marks = new ModeMarks<object>();
  const a = {};
  marks.set(a, 'x.md', 'markdown');
  marks.set(a, 'x.md', 'score');
  assert.equal(marks.reconcile(a, 'x.md'), 'score');
});
