// Beat-as-data Phase 6 (drain 2026-10-07-1600): the Score view's orchestration and freshness, with the renderer and the engine injected.
//   produceScore   saved note text -> validated rhythm data -> (injected) engine compute -> a tagged MusicXML payload, or a refusal / error
//   createScoreScheduler  debounce + single-flight + "queue the latest" for re-renders on external modify (injected clock)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createScoreScheduler, produceScore, SCORE_DEBOUNCE_MS } from './rhythm-score-core.ts';

const NOTE = (extraFm = '') => `---\ntype: data\ncontent_type: json\n${extraFm}---\n\n\`\`\`json\n${JSON.stringify({
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: { kick: [true, ...new Array(15).fill(false)], snare: new Array(16).fill(false), hihat: new Array(16).fill(false) },
}, null, 2)}\n\`\`\`\n`;

const PAYLOAD = { type: 'musicxml', content: '<score-partwise/>', has_percussion: false };

test('produceScore: valid note -> compute receives the PARSED data (not text, not the wrapper) and the title; the payload comes back', async () => {
  const seen: unknown[] = [];
  const out = await produceScore({
    readNote: async () => NOTE(),
    compute: async (data, title) => { seen.push(data, title); return PAYLOAD; },
  }, 'straight rock');
  assert.deepEqual(out, { kind: 'score', payload: PAYLOAD });
  const data = seen[0] as any;
  assert.equal(data.time_signature, '4/4');
  assert.equal(data.steps, 16);
  assert.equal(data.tempo_bpm, 100);
  assert.deepEqual(Object.keys(data.channels), ['kick', 'snare', 'hihat']);
  assert.equal(seen[1], 'straight rock');
});

test('produceScore: reads the SAVED note on every call (a second call after the file changed sends the new data)', async () => {
  let text = NOTE();
  const sent: any[] = [];
  const deps = { readNote: async () => text, compute: async (d: unknown) => { sent.push(d); return PAYLOAD; } };
  await produceScore(deps, 't');
  text = text.replace('"tempo_bpm": 100', '"tempo_bpm": 140');
  await produceScore(deps, 't');
  assert.deepEqual(sent.map((d) => d.tempo_bpm), [100, 140]);
});

test('produceScore: a note that is not rhythm data (bad JSON, read_only, unknown field) is a REFUSAL carrying the reason — compute is never called', async () => {
  let called = 0;
  const compute = async () => { called++; return PAYLOAD; };
  for (const text of ['---\ntype: data\ncontent_type: json\n---\n\n```json\n{ nope\n```\n', NOTE('read_only: true\n'), 'no frontmatter at all']) {
    const out = await produceScore({ readNote: async () => text, compute }, 't');
    assert.equal(out.kind, 'refusal', text.slice(0, 30));
    assert.ok(out.kind === 'refusal' && /^Score: /.test(out.message) && out.message.length > 12);
  }
  assert.equal(called, 0);
});

test('produceScore: an engine failure is an ERROR with its message, never a throw', async () => {
  const out = await produceScore({ readNote: async () => NOTE(), compute: async () => { throw new Error('ValueError: channel kick step 3'); } }, 't');
  assert.equal(out.kind, 'error');
  assert.ok(out.kind === 'error' && out.message.includes('channel kick step 3'));
});

test('produceScore: a result that is not a tagged MusicXML payload is an error, not a blank pane', async () => {
  for (const bad of [null, undefined, 'x', { type: 'json', content: '{}' }, { type: 'musicxml' }, { type: 'musicxml', content: 5 }]) {
    const out = await produceScore({ readNote: async () => NOTE(), compute: async () => bad }, 't');
    assert.equal(out.kind, 'error', JSON.stringify(bad));
  }
});

test('produceScore: an unreadable note (read throws) is an error', async () => {
  const out = await produceScore({ readNote: async () => { throw new Error('ENOENT'); }, compute: async () => PAYLOAD }, 't');
  assert.equal(out.kind, 'error');
});

// ---- freshness -------------------------------------------------------------------------------------------------------

function clock() {
  let now = 0; let id = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => { const i = id++; timers.set(i, { at: now + ms, fn }); return i; },
    clearTimer: (h: unknown) => { timers.delete(h as number); },
    advance(ms: number) {
      const t = now + ms;
      for (;;) {
        const d = [...timers.entries()].filter(([, x]) => x.at <= t).sort((a, b) => a[1].at - b[1].at)[0];
        if (!d) break;
        timers.delete(d[0]); now = d[1].at; d[1].fn();
      }
      now = t;
    },
    pending: () => timers.size,
  };
}

function rig() {
  const c = clock();
  const calls: number[] = [];
  const resolvers: Array<() => void> = [];
  const s = createScoreScheduler({
    setTimer: c.setTimer, clearTimer: c.clearTimer,
    render: () => new Promise<void>((resolve) => { calls.push(calls.length + 1); resolvers.push(resolve); }),
  });
  return { c, s, calls, finish: () => { const r = resolvers.shift(); assert.ok(r, 'no render in flight'); r(); } };
}
const tick = () => new Promise((r) => setImmediate(r));

test('scheduler: the debounce is 250 ms by default', () => {
  assert.equal(SCORE_DEBOUNCE_MS, 250);
});

test('scheduler: a burst of modify events is ONE render, after the quiet window', async () => {
  const { c, s, calls } = rig();
  for (let i = 0; i < 6; i++) { s.request(); c.advance(100); }
  assert.equal(calls.length, 0, 'still inside the window');
  c.advance(250);
  assert.equal(calls.length, 1);
  void s;
});

test('scheduler: a request while a render is in flight is NOT run concurrently — the latest is queued and rendered right after', async () => {
  const { c, s, calls, finish } = rig();
  s.request(); c.advance(250);
  assert.equal(calls.length, 1);
  s.request(); s.request(); c.advance(250);             // debounce fires during the render
  assert.equal(calls.length, 1, 'no second concurrent render');
  finish(); await tick();
  assert.equal(calls.length, 2, 'the queued latest ran after');
  finish(); await tick();
  assert.equal(calls.length, 2, 'and only once');
});

test('scheduler: renderNow cancels the debounce and renders immediately (the first render, a manual refresh)', async () => {
  const { c, s, calls } = rig();
  s.request();
  s.renderNow();
  assert.equal(calls.length, 1);
  assert.equal(c.pending(), 0);
});

test('scheduler: dispose cancels a pending render and ignores later requests (view closed)', async () => {
  const { c, s, calls } = rig();
  s.request();
  s.dispose();
  c.advance(1000);
  s.request(); c.advance(1000);
  assert.equal(calls.length, 0);
});

test('scheduler: a render that throws does not wedge the scheduler — the next request still renders', async () => {
  const c = clock();
  let n = 0;
  const s = createScoreScheduler({ setTimer: c.setTimer, clearTimer: c.clearTimer, render: async () => { n++; if (n === 1) throw new Error('boom'); } });
  s.request(); c.advance(250); await tick();
  s.request(); c.advance(250); await tick();
  assert.equal(n, 2);
});

// ---- freshness against autosave: opening the Score straight after editing shows the edit -----------------------------------------

import { createAutosavePipeline } from './rhythm-autosave-core.ts';
import { RhythmNoteSession } from './rhythm-edit-core.ts';

test('after an edit in the Beat Box, flushing the autosave (what the mode switch awaits) and rendering shows the EDIT — rendered from the saved body', async () => {
  let file = NOTE();
  const session = RhythmNoteSession.fromText(file);
  const p = createAutosavePipeline({
    setTimer: () => 1, clearTimer: () => {},                       // the debounce never fires on its own: only flush() writes
    onStatus: () => {},
    write: async (payload) => {
      const r = session.apply(file, payload);
      if (r.ok === false) { session.rollback(); return { ok: false, kind: r.kind, message: r.message }; }
      file = r.text; session.commit();
      return { ok: true };
    },
  });
  const edited = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100,
    channels: { kick: [true, ...new Array(15).fill(false)], snare: [false, false, false, false, true, ...new Array(11).fill(false)], hihat: new Array(16).fill(false) } };
  p.submit(edited);                                                // an edit still waiting in the debounce
  const sent: any[] = [];
  const deps = { readNote: async () => file, compute: async (d: unknown) => { sent.push(d); return PAYLOAD; } };
  await produceScore(deps, 't');                                   // WITHOUT the flush the score would show the old data
  assert.equal(sent[0].channels.snare[4], false);
  await p.flush();                                                 // what the Beat Box's mode switch does before leaving
  await produceScore(deps, 't');
  assert.equal(sent[1].channels.snare[4], true, 'the Score shows the edit');
});
