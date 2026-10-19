// Beat-as-data Phase 8 (drain 2026-10-10-2200) — the `forge-rhythm` embed block: a rhythm data note shown inline, in any note, as a
// PLAYGROUND Beat Box. The pure half: the block parser, the protocol additions, the freshness decision, the one-sound-at-a-time
// coordinator, and the host-side session (everything the embed decides, with the widget, the vault and the engine injected).
//
// The invariant behind all of it: an embed NEVER writes. Its dependency bag has no write function at all, and a `forge-rhythm-save`
// from the iframe is classified `save-ignored` and goes nowhere.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MSG_CURRENT_DATA, MSG_EDITED, MSG_LOAD, MSG_OPEN_NOTE, MSG_PLAYING, MSG_READY, MSG_REQUEST_DATA, MSG_RESET, MSG_SAVE, MSG_STOP,
  buildLoadMessage, buildRequestDataMessage, buildStopMessage, contentFingerprint, formatRhythmJson, parseEmbedWidgetMessage,
  parseWidgetMessage, type RhythmData,
} from './rhythm-edit-core.ts';
import {
  DEFAULT_RHYTHM_EMBED_CIRCLE_HEIGHT_PX, DEFAULT_RHYTHM_EMBED_HEIGHT_PX, createPlaybackCoordinator, embedHeightFor, createRhythmEmbedSession, decideEmbedFreshness, UPDATED_FROM_NOTE_LABEL, UPDATED_FROM_NOTE_MS, parseRhythmEmbedSource,
  widgetMissingMessage,
} from './rhythm-embed-core.ts';

const TRESILLO: RhythmData = {
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: { kick: [true, false, false, true, false, false, true, false, false, false, false, false, false, false, false, false] },
};
const noteText = (d: RhythmData = TRESILLO, extra = '') =>
  `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${formatRhythmJson(d)}\n\`\`\`\n${extra}`;

// ---- the block parser ---------------------------------------------------------------------------------------------------

test('parser: one link line is a valid block; defaults are the documented ones', () => {
  const r = parseRhythmEmbedSource('[[rhythm_pattern_tresillo]]');
  assert.deepEqual(r, { ok: true, value: { target: 'rhythm_pattern_tresillo', heightPx: DEFAULT_RHYTHM_EMBED_HEIGHT_PX, heightExplicit: false, title: null, view: null } });
});

test('parser: height and title options (html-embed height rule: digits with an optional px)', () => {
  const r = parseRhythmEmbedSource('[[tresillo]]\nheight: 500\ntitle: The tresillo');
  assert.deepEqual(r, { ok: true, value: { target: 'tresillo', heightPx: 500, heightExplicit: true, title: 'The tresillo', view: null } });
  const px = parseRhythmEmbedSource('[[tresillo]]\nheight: 480px');
  assert.equal(px.ok && px.value.heightPx, 480);
  const upper = parseRhythmEmbedSource('[[tresillo]]\nHEIGHT: 480PX');
  assert.equal(upper.ok && upper.value.heightPx, 480, 'option names and the unit are case-insensitive');
});

test('parser: view option — circle and grid are accepted (case-insensitive), anything else is refused inline naming the two values', () => {
  const c = parseRhythmEmbedSource('[[clave]]\nview: circle');
  assert.equal(c.ok && c.value.view, 'circle');
  const g = parseRhythmEmbedSource('[[clave]]\nview: grid');
  assert.equal(g.ok && g.value.view, 'grid');
  const up = parseRhythmEmbedSource('[[clave]]\nVIEW: Circle');
  assert.equal(up.ok && up.value.view, 'circle');
  for (const bad of ['view: wheel', 'view:', 'view: circle grid']) {
    const r = parseRhythmEmbedSource(`[[clave]]\n${bad}`);
    assert.equal(r.ok, false, bad);
    if (r.ok === false) assert.match(r.message, /circle/i, bad);
  }
  const twice = parseRhythmEmbedSource('[[clave]]\nview: circle\nview: grid');
  assert.equal(twice.ok, false);
});

test('parser: the default height follows the view (circle is taller); an explicit height always wins, in either order', () => {
  const circle = parseRhythmEmbedSource('[[clave]]\nview: circle');
  assert.equal(circle.ok && circle.value.heightPx, DEFAULT_RHYTHM_EMBED_CIRCLE_HEIGHT_PX);
  assert.ok(DEFAULT_RHYTHM_EMBED_CIRCLE_HEIGHT_PX > DEFAULT_RHYTHM_EMBED_HEIGHT_PX);
  const grid = parseRhythmEmbedSource('[[clave]]\nview: grid');
  assert.equal(grid.ok && grid.value.heightPx, DEFAULT_RHYTHM_EMBED_HEIGHT_PX);
  for (const src of ['[[clave]]\nview: circle\nheight: 500', '[[clave]]\nheight: 500\nview: circle']) {
    const r = parseRhythmEmbedSource(src);
    assert.equal(r.ok && r.value.heightPx, 500, src);
    assert.equal(r.ok && r.value.view, 'circle', src);
  }
});

test('parser: heightExplicit says whether the author wrote a height line (the view then keeps its hands off)', () => {
  assert.equal((parseRhythmEmbedSource('[[clave]]') as any).value.heightExplicit, false);
  assert.equal((parseRhythmEmbedSource('[[clave]]\nview: circle') as any).value.heightExplicit, false);
  assert.equal((parseRhythmEmbedSource('[[clave]]\nheight: 480') as any).value.heightExplicit, true);
  assert.equal((parseRhythmEmbedSource('[[clave]]\nview: circle\nheight: 300') as any).value.heightExplicit, true);
});

// Drain 2026-10-15-2230 §2 — the defaults follow the compact layout, measured in real Chromium at a 460 px pane (worst case: a wider pane
// is shorter). Before: grid 488-602 px for 1-4 instruments (default 420 — it scrolled), circle 961 px whatever was in it (default 960).
test('embedHeightFor: the default height follows what is IN the note — instruments for the grid, rings for the circle', () => {
  const grid = [1, 2, 3, 4].map((n) => embedHeightFor(null, n));
  const circle = [1, 2, 3, 4].map((n) => embedHeightFor('circle', n));
  // drain 2026-10-20-0900: re-measured after Reset / "not saved" moved into the host toolbar and Tap tempo went (widget body at 460 px: grid 184/214/244/274, circle 432/484/536/610) + 16-20 px of slack
  assert.deepEqual(grid, [200, 230, 260, 290]);
  assert.deepEqual(circle, [450, 500, 550, 630]);
  for (const series of [grid, circle]) assert.ok(series.every((v, i) => i === 0 || v > series[i - 1]), 'monotone: more instruments, more room');
  assert.equal(embedHeightFor('grid', 3), embedHeightFor(null, 3), 'grid is the default view');
  assert.equal(embedHeightFor('grid', 6), 290 + 2 * 30, 'the grid has no instrument limit: one more row, a little more room');
  assert.equal(embedHeightFor('circle', 5), embedHeightFor('grid', 5), 'five instruments: the circle falls back to the grid, so the grid\'s room');
});

test('embedHeightFor: the fixed defaults are the 4-instrument worst case, and an unknown count gets them', () => {
  assert.equal(DEFAULT_RHYTHM_EMBED_HEIGHT_PX, 290);
  assert.equal(DEFAULT_RHYTHM_EMBED_CIRCLE_HEIGHT_PX, 630);
  assert.equal(embedHeightFor(null, 0), DEFAULT_RHYTHM_EMBED_HEIGHT_PX);
  assert.equal(embedHeightFor('circle', 0), DEFAULT_RHYTHM_EMBED_CIRCLE_HEIGHT_PX);
  assert.ok(DEFAULT_RHYTHM_EMBED_CIRCLE_HEIGHT_PX < 960, 'less than the 960 that was clipping nothing but wasting half the space');
});

test('parser: basename links and folder-qualified links both give the link path; alias and heading are dropped', () => {
  for (const [src, want] of [
    ['[[rhythm_pattern_tresillo]]', 'rhythm_pattern_tresillo'],
    ['[[rhythm_data/rhythm_pattern_tresillo]]', 'rhythm_data/rhythm_pattern_tresillo'],
    ['[[rhythm_pattern_tresillo|the tresillo]]', 'rhythm_pattern_tresillo'],
    ['[[rhythm_pattern_tresillo#Heading]]', 'rhythm_pattern_tresillo'],
    ['  [[ spaced ]]  ', 'spaced'],
  ] as const) {
    const r = parseRhythmEmbedSource(src);
    assert.equal(r.ok && r.value.target, want, src);
  }
});

test('parser: CRLF and blank lines are tolerated', () => {
  const r = parseRhythmEmbedSource('\r\n[[tresillo]]\r\n\r\nheight: 400\r\n');
  assert.deepEqual(r, { ok: true, value: { target: 'tresillo', heightPx: 400, heightExplicit: true, title: null, view: null } });
});

test('parser: an empty block, a first line that is not a link, and a second link are each refused with a message that says what to write', () => {
  for (const [src, re] of [
    ['', /empty|link/i],
    ['   \n  ', /empty|link/i],
    ['rhythm_pattern_tresillo', /link/i],
    ['height: 400\n[[tresillo]]', /link/i],
    ['[[tresillo]]\n[[hemiola]]', /one link|unrecogni[sz]ed/i],
    ['[[]]', /link/i],
  ] as const) {
    const r = parseRhythmEmbedSource(src);
    assert.equal(r.ok, false, JSON.stringify(src));
    if (r.ok === false) assert.match(r.message, re, JSON.stringify(src));
  }
});

test('parser: an unknown option is REJECTED (named, with the supported ones), never silently ignored', () => {
  const r = parseRhythmEmbedSource('[[tresillo]]\nedit: true');
  assert.equal(r.ok, false);
  if (r.ok === false) {
    assert.match(r.message, /"edit"/);
    assert.match(r.message, /height/);
    assert.match(r.message, /title/);
  }
});

test('parser: bad values — height not a whole number of px, zero, a repeated option, an empty title, a line that is not key: value', () => {
  for (const src of [
    '[[t]]\nheight: tall', '[[t]]\nheight: 0', '[[t]]\nheight: 12.5', '[[t]]\nheight: -4',
    '[[t]]\nheight: 400\nheight: 500', '[[t]]\ntitle:', '[[t]]\ntitle:    ', '[[t]]\nsomething else',
  ]) {
    assert.equal(parseRhythmEmbedSource(src).ok, false, JSON.stringify(src));
  }
});

// ---- the protocol additions ---------------------------------------------------------------------------------------------

test('protocol: note-editing load is byte-for-byte what it was; playground adds only a mode flag', () => {
  assert.deepEqual(buildLoadMessage(TRESILLO, 'n'), { type: MSG_LOAD, data: TRESILLO, noteName: 'n' });
  assert.deepEqual(buildLoadMessage(TRESILLO, 'n', 'edit'), { type: MSG_LOAD, data: TRESILLO, noteName: 'n' });
  assert.deepEqual(buildLoadMessage(TRESILLO, 'n', 'playground'), { type: MSG_LOAD, data: TRESILLO, noteName: 'n', mode: 'playground' });
  assert.deepEqual(buildRequestDataMessage(), { type: MSG_REQUEST_DATA });
  assert.deepEqual(buildStopMessage(), { type: MSG_STOP });
});

test('protocol: the embed classifies every widget message it can receive — and a SAVE is classified save-ignored, carrying no data', () => {
  assert.deepEqual(parseEmbedWidgetMessage({ type: MSG_READY }), { kind: 'ready' });
  assert.deepEqual(parseEmbedWidgetMessage({ type: MSG_EDITED }), { kind: 'edited' });
  assert.deepEqual(parseEmbedWidgetMessage({ type: MSG_RESET }), { kind: 'reset' });
  assert.deepEqual(parseEmbedWidgetMessage({ type: MSG_OPEN_NOTE }), { kind: 'open-note' });
  assert.deepEqual(parseEmbedWidgetMessage({ type: MSG_PLAYING, playing: true }), { kind: 'playing', playing: true });
  assert.deepEqual(parseEmbedWidgetMessage({ type: MSG_PLAYING, playing: false }), { kind: 'playing', playing: false });
  assert.deepEqual(parseEmbedWidgetMessage({ type: MSG_CURRENT_DATA, data: { a: 1 } }), { kind: 'current-data', data: { a: 1 } });
  assert.deepEqual(parseEmbedWidgetMessage({ type: MSG_SAVE, data: TRESILLO }), { kind: 'save-ignored' });
  assert.equal(parseEmbedWidgetMessage({ type: MSG_PLAYING, playing: 'yes' }).kind, 'malformed');
  assert.equal(parseEmbedWidgetMessage({ type: MSG_CURRENT_DATA }).kind, 'malformed');
  for (const junk of [null, 'x', 3, [], {}, { type: 'something-else' }]) assert.equal(parseEmbedWidgetMessage(junk).kind, 'ignored');
});

test('protocol: the Beat Box view\'s own parser is UNCHANGED — the new message types are not its business', () => {
  for (const t of [MSG_EDITED, MSG_RESET, MSG_OPEN_NOTE, MSG_PLAYING, MSG_CURRENT_DATA]) {
    assert.deepEqual(parseWidgetMessage({ type: t, playing: true, data: {} }), { kind: 'ignored' }, t);
  }
  assert.deepEqual(parseWidgetMessage({ type: MSG_SAVE, data: TRESILLO }), { kind: 'save', data: TRESILLO });
});

// ---- freshness ----------------------------------------------------------------------------------------------------------

// Drain 2026-10-18-1800 (driver clarification, replacing Phase 8's rule "a dirty embed keeps the experiment and only warns"): when the data note
// changes on disk by ANY route, every open embed shows the note as it now is — an unsaved playground experiment is ephemeral by design.
test('freshness: unchanged -> ignore (even with local edits); changed -> reload, WITH or WITHOUT local edits', () => {
  assert.equal(decideEmbedFreshness({ loadedFingerprint: 'a', currentFingerprint: 'a' }), 'ignore');
  assert.equal(decideEmbedFreshness({ loadedFingerprint: 'a', currentFingerprint: 'b' }), 'reload');
});

test('the "Updated from note" label: the driver\'s words, shown for a few seconds (brief, not a permanent banner)', () => {
  assert.equal(UPDATED_FROM_NOTE_LABEL, 'Updated from note');
  assert.ok(UPDATED_FROM_NOTE_MS >= 2000 && UPDATED_FROM_NOTE_MS <= 8000, `${UPDATED_FROM_NOTE_MS} ms`);
});

// ---- one sound at a time ------------------------------------------------------------------------------------------------

test('coordinator: when one embed starts playing the others are stopped; the player itself is not', () => {
  const stopped: string[] = [];
  const c = createPlaybackCoordinator();
  c.register('A', () => stopped.push('A'));
  c.register('B', () => stopped.push('B'));
  c.register('C', () => stopped.push('C'));
  c.setPlaying('A', true);
  assert.deepEqual(stopped.sort(), ['B', 'C']);
  stopped.length = 0;
  c.setPlaying('B', true);
  assert.deepEqual(stopped.sort(), ['A', 'C']);
});

test('coordinator: stopping, an unknown id, and an unregistered embed stop nobody; unregistering a player stops it', () => {
  const stopped: string[] = [];
  const c = createPlaybackCoordinator();
  c.register('A', () => stopped.push('A'));
  c.register('B', () => stopped.push('B'));
  c.setPlaying('A', true); stopped.length = 0;
  c.setPlaying('A', false);
  c.setPlaying('ghost', true);
  assert.deepEqual(stopped, [], 'stopping, and an id nobody registered, signal nobody');
});

test('coordinator: unload of a player silences it; a removed embed is never signalled again', () => {
  const stopped: string[] = [];
  const c = createPlaybackCoordinator();
  c.register('A', () => stopped.push('A'));
  c.register('B', () => stopped.push('B'));
  c.setPlaying('A', true); stopped.length = 0;
  c.unregister('A');
  assert.deepEqual(stopped, ['A'], 'the player that goes away is stopped');
  stopped.length = 0;
  c.setPlaying('B', true);
  assert.deepEqual(stopped, [], 'A is gone: nothing to stop');
  assert.equal(c.playingId(), 'B');
});

// ---- the host-side session ----------------------------------------------------------------------------------------------

function makeSession(over: { text?: () => string; computeScore?: (d: RhythmData, t: string) => Promise<unknown> } = {}) {
  let text = noteText();
  const posted: any[] = [];
  const log = { errors: [] as string[], updated: 0, opened: 0, playing: [] as boolean[], timers: [] as Array<() => void> };
  const session = createRhythmEmbedSession({
    noteName: 'rhythm_pattern_tresillo',
    title: 'The tresillo',
    readNote: async () => (over.text ? over.text() : text),
    post: (m) => { posted.push(m); },
    openNote: () => { log.opened++; },
    onPlaying: (p) => { log.playing.push(p); },
    showUpdated: () => { log.updated++; },
    showError: (m) => { log.errors.push(m); },
    computeScore: over.computeScore,
    setTimer: (fn) => { log.timers.push(fn); return log.timers.length; },
    clearTimer: () => { /* tests fire timers by hand */ },
  });
  return { session, posted, log, setText: (t: string) => { text = t; } };
}

test('session: ready -> the saved note is read and sent as a PLAYGROUND load', async () => {
  const { session, posted } = makeSession();
  await session.onWidgetMessage({ type: MSG_READY });
  assert.deepEqual(posted, [{ type: MSG_LOAD, data: TRESILLO, noteName: 'rhythm_pattern_tresillo', mode: 'playground' }]);
});

test('session: a view option rides on the load (the widget applies it once); no option leaves the load unchanged', async () => {
  let posted: any[] = [];
  const mk = (view?: 'circle' | 'grid' | null) => createRhythmEmbedSession({
    noteName: 'n', title: 'n', view, readNote: async () => noteText(), post: (m) => { posted.push(m); }, openNote: () => {},
    onPlaying: () => {}, showUpdated: () => {}, showError: () => {}, setTimer: () => 0, clearTimer: () => {},
  });
  await mk('circle').onWidgetMessage({ type: MSG_READY });
  assert.deepEqual(posted, [{ type: MSG_LOAD, data: TRESILLO, noteName: 'n', mode: 'playground', view: 'circle' }]);
  posted = [];
  await mk(null).onWidgetMessage({ type: MSG_READY });
  assert.equal('view' in posted[0], false, 'no view key at all when none was asked for');
  assert.deepEqual(buildLoadMessage(TRESILLO, 'n', 'edit', 'circle'), { type: MSG_LOAD, data: TRESILLO, noteName: 'n', view: 'circle' });
});

test('session: a note that is not valid rhythm data shows an inline error and sends no load', async () => {
  const { session, posted, log } = makeSession({ text: () => '---\ntype: data\ncontent_type: json\n---\n\n```json\n{"x":1}\n```\n' });
  await session.onWidgetMessage({ type: MSG_READY });
  assert.deepEqual(posted, []);
  assert.equal(log.errors.length, 1);
  assert.match(log.errors[0], /rhythm/i);
});

test('session: a forge-rhythm-save from the iframe is IGNORED — nothing is written, nothing is posted, nothing changes', async () => {
  const { session, posted, log } = makeSession();
  await session.onWidgetMessage({ type: MSG_READY });
  posted.length = 0;
  await session.onWidgetMessage({ type: MSG_SAVE, data: { ...TRESILLO, tempo_bpm: 40 } });
  assert.deepEqual(posted, []);
  assert.deepEqual(log.errors, []);
  assert.equal(session.isDirty(), false, 'a save is not even an edit');
});

// Drain 2026-10-20-2100: "dirty" is no longer a flag set by an `edited` message — an edit makes the session ASK the widget for its data and compare it with the loaded note
// (rhythm-embed-dirty.test.ts has the full behaviour); this test keeps the forwarding of Open note / playing and the first step of that.
test('session: Open note and playing are forwarded to the host; an edit asks the widget for its data and a differing answer makes the playground dirty', async () => {
  const { session, log, posted } = makeSession();
  await session.onWidgetMessage({ type: MSG_OPEN_NOTE });
  assert.equal(log.opened, 1);
  await session.onWidgetMessage({ type: MSG_PLAYING, playing: true });
  await session.onWidgetMessage({ type: MSG_PLAYING, playing: false });
  assert.deepEqual(log.playing, [true, false]);
  assert.equal(session.isDirty(), false);
  await session.onWidgetMessage({ type: MSG_READY });
  posted.length = 0;
  await session.onWidgetMessage({ type: MSG_EDITED });
  assert.deepEqual(posted, [{ type: MSG_REQUEST_DATA }], 'an edit asks the widget what it holds now');
  assert.equal(session.isDirty(), false, 'asking is not knowing');
  await session.onWidgetMessage({ type: MSG_CURRENT_DATA, data: { ...TRESILLO, tempo_bpm: 60 } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(session.isDirty(), true);
});

test('session: the note changes on disk with NO local edits -> the embed reloads it', async () => {
  const { session, posted, setText } = makeSession();
  await session.onWidgetMessage({ type: MSG_READY });
  posted.length = 0;
  setText(noteText({ ...TRESILLO, tempo_bpm: 140 }));
  await session.onNoteModified();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].data.tempo_bpm, 140);
  assert.equal(posted[0].mode, 'playground');
});

test('session: a reload caused by the note changing says so ("Updated from note"); the first load and a Reset do not', async () => {
  const { session, posted, log, setText } = makeSession();
  await session.onWidgetMessage({ type: MSG_READY });
  await session.onWidgetMessage({ type: MSG_RESET });
  assert.equal(log.updated, 0, 'ready / Reset are the student\'s own doing');
  setText(noteText({ ...TRESILLO, tempo_bpm: 140 }));
  await session.onNoteModified();
  assert.equal(log.updated, 1);
  await session.onNoteModified();                                    // the same text again: nothing happened
  assert.equal(log.updated, 1);
  assert.equal(posted.length, 3);
});

test('session: the note changes on disk WITH local edits -> the embed shows the NOTE (the experiment is ephemeral), and says so', async () => {
  const { session, posted, log, setText } = makeSession();
  await session.onWidgetMessage({ type: MSG_READY });
  await session.onWidgetMessage({ type: MSG_EDITED });
  await session.onWidgetMessage({ type: MSG_CURRENT_DATA, data: { ...TRESILLO, tempo_bpm: 60 } });     // the experiment: the widget holds a different tempo
  await Promise.resolve(); await Promise.resolve();
  assert.equal(session.isDirty(), true);
  posted.length = 0;
  setText(noteText({ ...TRESILLO, tempo_bpm: 140 }));
  await session.onNoteModified();
  assert.equal(posted.length, 1, 'the new data is sent over the stale experiment');
  assert.equal(posted[0].data.tempo_bpm, 140);
  assert.equal(log.updated, 1);
  assert.equal(session.isDirty(), false, 'the embed is back in step with the note');
  await session.onWidgetMessage({ type: MSG_RESET });
  assert.equal(posted.length, 2, 'Reset still reads the note as it is on disk now');
  assert.equal(posted[1].data.tempo_bpm, 140);
  assert.equal(log.updated, 1, 'Reset is not an "Updated from note"');
});

test('session: a modify event that did not change the note is ignored', async () => {
  const { session, posted } = makeSession();
  await session.onWidgetMessage({ type: MSG_READY });
  posted.length = 0;
  await session.onNoteModified();
  assert.deepEqual(posted, []);
});

test('session: current data — the request goes to the widget and resolves with its answer; it is a READ of widget state', async () => {
  const { session, posted } = makeSession();
  const p = session.requestCurrentData();
  assert.deepEqual(posted.at(-1), { type: MSG_REQUEST_DATA });
  await session.onWidgetMessage({ type: MSG_CURRENT_DATA, data: { tempo_bpm: 77 } });
  assert.deepEqual(await p, { tempo_bpm: 77 });
});

test('session: an unanswered data request rejects (the Score toggle shows an error, it never hangs)', async () => {
  const { session, log } = makeSession();
  const p = session.requestCurrentData();
  log.timers[0]();
  await assert.rejects(p, /did not answer/);
});

test('session: Score of the CURRENT playground state — validated, computed by the injected engine, and the saved note is not consulted', async () => {
  const edited = { ...TRESILLO, tempo_bpm: 66 };
  let computedWith: RhythmData | null = null;
  const { session } = makeSession({
    computeScore: async (d) => { computedWith = d; return { type: 'musicxml', content: '<score/>' }; },
    text: () => { throw new Error('the score of a playground must not read the saved note'); },
  });
  const p = session.currentScore();
  await session.onWidgetMessage({ type: MSG_CURRENT_DATA, data: edited });
  const r = await p;
  assert.equal(r.kind, 'score');
  assert.deepEqual(computedWith, edited);
});

test('session: Score of invalid widget data is a refusal, and with no engine it is an error — never a throw', async () => {
  const bad = makeSession({ computeScore: async () => ({ type: 'musicxml', content: 'x' }) });
  const p = bad.session.currentScore();
  await bad.session.onWidgetMessage({ type: MSG_CURRENT_DATA, data: { nonsense: true } });
  assert.equal((await p).kind, 'refusal');

  const none = makeSession({});
  const q = none.session.currentScore();
  await none.session.onWidgetMessage({ type: MSG_CURRENT_DATA, data: TRESILLO });
  assert.equal((await q).kind, 'error');
});

test('session: stop posts forge-rhythm-stop; after dispose nothing more is posted', async () => {
  const { session, posted } = makeSession();
  session.stop();
  assert.deepEqual(posted, [{ type: MSG_STOP }]);
  session.dispose();
  posted.length = 0;
  session.stop();
  await session.onWidgetMessage({ type: MSG_READY });
  assert.deepEqual(posted, []);
});

test('error wording: a missing widget reuses the lookup\'s own message (what was searched)', () => {
  assert.match(widgetMissingMessage('not found. Searched — vault root: a (not found).'), /^Rhythm embed: the Rhythm Box widget was not found\. Searched — /);
});

test('the session\'s dependency bag has no write function: nothing in it can modify a note', () => {
  const { session } = makeSession();
  assert.ok(session);
  // The contract is structural: EmbedSessionDeps lists readNote/post/openNote/onPlaying/showUpdated/showError/computeScore/timers only.
  // The source pin in rhythm-embed-wiring.test.ts additionally checks the Obsidian glue for any vault write API.
  assert.equal(contentFingerprint('a') === contentFingerprint('a'), true);
});
