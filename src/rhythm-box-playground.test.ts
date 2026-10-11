// Beat-as-data Phase 8 (drain 2026-10-10-2200) — the Rhythm Box widget's PLAYGROUND mode, in happy-dom (the Phase 5-7 harness).
//
// Playground = the widget embedded in a chapter by a `forge-rhythm` block. It is a toy over a COPY of the note's data:
//   - it never posts `forge-rhythm-save` (the hard pin — checked after every kind of data action),
//   - it shows a "not saved" label, Reset and Open note; no autosave indicator, no Save / Reload-from-note,
//   - Random / Clear / time signature apply at once (nothing is at risk; Reset undoes them),
//   - it answers `forge-rhythm-request-data` with its CURRENT state, and `forge-rhythm-stop` stops playback.
// Standalone behaviour and note-editing behaviour are covered by rhythm-box-widget.test.ts and must stay as they are.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROCK, fakeAudio, loadWidget, skip, widgetScript, type Harness } from './test-support/rhythm-widget-harness.ts';

const load = (data: unknown = ROCK, noteName = 'rhythm_pattern_straight_rock', mode: unknown = 'playground') =>
  ({ type: 'forge-rhythm-load', data, noteName, mode });
/** The note-editing load: exactly the message every pre-Phase-8 host sends (no `mode` key at all). */
const loadEdit = (data: unknown = ROCK, noteName = 'my beat') => ({ type: 'forge-rhythm-load', data, noteName });
const types = (h: Harness, t: string) => h.posted.filter((m) => m.type === t);
const fire = (h: Harness, id: string, type: string) => h.el(id).dispatchEvent(new h.win.Event(type, { bubbles: true }));
const settle = () => new Promise((r) => setTimeout(r, 5));
const onSteps = (h: Harness, ch: string, n = 16) => [...Array(n).keys()].filter((s) => h.cell(ch, s)?.classList.contains('on'));

async function playground(data: unknown = ROCK): Promise<Harness> {
  const h = await loadWidget(true);
  await h.send(load(data));
  return h;
}

test('playground load: label, Reset and Open note are shown; the autosave controls are not', { skip }, async () => {
  const h = await playground();
  assert.equal(h.el('hostBar').hidden, false);
  assert.match(h.el('playgroundLabel').textContent, /playground/i);
  assert.match(h.el('playgroundLabel').textContent, /not saved/i);
  assert.equal(h.el('playgroundLabel').hidden, false);
  assert.equal(h.el('bReset').hidden, false);
  assert.equal(h.el('bOpenNote').hidden, false);
  assert.equal(h.el('bReload').hidden, true, 'no Reload-from-note');
  assert.equal(h.el('saveMsg').textContent, '', 'no autosave indicator text');
  assert.equal(h.el('hostEditing').hidden, true, 'the "Editing <note>" prefix is the note-editing mode\'s');
  assert.equal(h.el('hostNote').textContent, 'rhythm_pattern_straight_rock');
  assert.deepEqual(onSteps(h, 'kick'), [0, 8], 'the data is on the grid');
});

test('note-editing load (no mode flag) is unchanged: "Editing", no playground label / Reset / Open note', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(loadEdit(ROCK, 'my beat'));
  assert.equal(h.el('hostEditing').hidden, false);
  assert.equal(h.el('playgroundLabel').hidden, true);
  assert.equal(h.el('bReset').hidden, true);
  assert.equal(h.el('bOpenNote').hidden, true);
  h.cell('kick', 1).click();
  await settle();
  assert.equal(types(h, 'forge-rhythm-save').length, 1, 'note-editing still autosaves');
  assert.equal(types(h, 'forge-rhythm-edited').length, 0, 'and never sends the playground-only message');
});

test('an unknown mode value is note-editing mode (only the exact string "playground" opts in)', { skip }, async () => {
  for (const mode of ['Playground', 'playground ', 'embed', '', 7]) {
    const h = await loadWidget(true);
    await h.send({ ...load(ROCK), mode });
    assert.equal(h.el('bReset').hidden, true, JSON.stringify(mode));
  }
});

test('HARD PIN: every kind of data action in playground mode posts ZERO saves (and an `edited` notice instead)', { skip }, async () => {
  const h = await playground();
  const actions: Array<[string, () => void]> = [
    ['toggle a cell', () => h.cell('snare', 1).click()],
    ['tempo up', () => h.el('bBpmUp').click()],
    ['tempo down', () => h.el('bBpmDown').click()],
    ['swing', () => { h.el('swing').value = '40'; fire(h, 'swing', 'input'); }],
    ['random', () => h.el('bRandom').click()],
    ['clear', () => h.el('bClear').click()],
    ['time signature', () => { h.el('timeSig').value = '3/4'; fire(h, 'timeSig', 'change'); }],
    ['add instrument', () => { h.el('addInstrument').value = 'bell'; fire(h, 'addInstrument', 'change'); }],
  ];
  for (const [name, act] of actions) {
    const before = h.posted.length;
    act();
    await settle();
    const fresh = h.posted.slice(before);
    assert.equal(fresh.filter((m) => m.type === 'forge-rhythm-save').length, 0, `${name}: no save`);
  }
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
  assert.ok(types(h, 'forge-rhythm-edited').length >= 1, 'edits are announced as edits');
  assert.ok(h.posted.every((m) => !('data' in m) || m.type === 'forge-rhythm-current-data'), 'no message other than current-data carries pattern data');
});

test('HARD PIN: remove instrument, and a load/status/save-result from the host, post no save either — and show no autosave indicator', { skip }, async () => {
  const h = await playground();
  const rm = h.doc.querySelector('.remove-row, [data-remove-row], button[aria-label^="Remove"]');
  if (rm) { rm.click(); await settle(); }
  await h.send(load({ ...ROCK, tempo_bpm: 120 }));
  // statuses LAST, so a later load cannot be what cleared them
  await h.send({ type: 'forge-rhythm-status', state: 'saved' });
  await h.send({ type: 'forge-rhythm-save-result', ok: true, message: '' });
  await h.send({ type: 'forge-rhythm-status', state: 'conflict', message: 'The note changed on disk' });
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
  assert.equal(h.el('saveMsg').textContent, '', 'a status message never shows an autosave indicator in a playground');
  assert.equal(h.el('bReload').hidden, true, 'and never the Reload-from-note button');
});

test('playground: Random, Clear and a time-signature change apply AT ONCE — no confirm bar', { skip }, async () => {
  const h = await playground();
  h.el('bClear').click();
  await settle();
  assert.equal(h.el('confirmBar').hidden, true);
  assert.equal(h.doc.querySelectorAll('.step.on').length, 0, 'Clear applied immediately');
  h.el('bRandom').click();
  await settle();
  assert.equal(h.el('confirmBar').hidden, true);
  assert.ok(h.doc.querySelectorAll('.step.on').length > 0, 'Random applied immediately');
  h.el('timeSig').value = '3/4';
  fire(h, 'timeSig', 'change');
  await settle();
  assert.equal(h.el('confirmBar').hidden, true);
  assert.equal(h.el('timeSig').value, '3/4');
  assert.equal(h.doc.querySelectorAll('.step').length, 12 * 3, 'the grid is 3/4 now');
});

test('note-editing mode still asks first (the contrast): Random shows the confirm bar', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(loadEdit(ROCK, 'n'));
  h.el('bRandom').click();
  await settle();
  assert.equal(h.el('confirmBar').hidden, false);
});

test('Reset restores the loaded data (cells, tempo, swing, meter, rows), tells the host, and clears the local edits', { skip }, async () => {
  const h = await playground();
  h.cell('kick', 3).click();
  h.el('bBpmUp').click();
  h.el('timeSig').value = '3/4';
  fire(h, 'timeSig', 'change');
  await settle();
  assert.equal(h.el('timeSig').value, '3/4');
  h.el('bReset').click();
  await settle();
  assert.equal(h.el('timeSig').value, '4/4');
  assert.equal(h.el('bpmVal').textContent, '100 BPM');
  assert.deepEqual(onSteps(h, 'kick'), [0, 8]);
  assert.deepEqual(onSteps(h, 'snare'), [4, 12]);
  assert.equal(types(h, 'forge-rhythm-reset').length, 1, 'the host is told, so it can pick up a changed note');
  assert.equal(types(h, 'forge-rhythm-save').length, 0);
});

test('Open note asks the host to open the data note — and nothing else', { skip }, async () => {
  const h = await playground();
  const before = h.posted.length;
  h.el('bOpenNote').click();
  await settle();
  assert.deepEqual(h.posted.slice(before), [{ type: 'forge-rhythm-open-note' }]);
});

test('request-data answers with the CURRENT state (edited, unsaved), not the loaded one', { skip }, async () => {
  const h = await playground();
  h.cell('kick', 3).click();
  h.el('bBpmUp').click();
  await settle();
  await h.send({ type: 'forge-rhythm-request-data' });
  const answer = types(h, 'forge-rhythm-current-data').at(-1);
  assert.ok(answer, 'the widget answered');
  assert.equal(answer.data.tempo_bpm, 101);
  assert.equal(answer.data.channels.kick[3], true, 'the edited cell is in the answer');
  assert.equal(answer.data.time_signature, '4/4');
  assert.equal(types(h, 'forge-rhythm-save').length, 0, 'a data request is a read, not a save');
});

test('request-data before any load answers null data rather than inventing a pattern', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send({ type: 'forge-rhythm-request-data' });
  const answer = types(h, 'forge-rhythm-current-data').at(-1);
  assert.ok(answer);
  assert.equal(answer.data, null);
});

test('playing: announced in playground mode; `forge-rhythm-stop` stops it and announces that', { skip }, async () => {
  const h = await playground();
  fakeAudio(h.win);
  h.el('bPlay').click();
  try {
    await settle();
    assert.deepEqual(types(h, 'forge-rhythm-playing').at(-1), { type: 'forge-rhythm-playing', playing: true });
    assert.equal(h.el('bPlay').getAttribute('aria-pressed'), 'true');
    await h.send({ type: 'forge-rhythm-stop' });
    assert.equal(h.el('bPlay').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(types(h, 'forge-rhythm-playing').at(-1), { type: 'forge-rhythm-playing', playing: false });
  } finally {
    // never leave the lookahead timer running: it would keep the node process alive
    if (h.el('bPlay').getAttribute('aria-pressed') === 'true') h.el('bPlay').click();
  }
});

test('playing is NOT announced in note-editing mode (the Beat Box tab is unchanged)', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(loadEdit(ROCK, 'n'));
  fakeAudio(h.win);
  h.el('bPlay').click();
  h.el('bPlay').click();
  await settle();
  assert.equal(types(h, 'forge-rhythm-playing').length, 0);
});

test('messages from a window that is not the embedder are ignored (the widget\'s side of the source check)', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load(ROCK), { postMessage() {} });          // some other window
  assert.equal(h.el('hostBar').hidden, true, 'nothing loaded');
  await h.send({ type: 'forge-rhythm-request-data' }, { postMessage() {} });
  assert.equal(types(h, 'forge-rhythm-current-data').length, 0);
});

test('standalone (no host) is untouched by Phase 8: nothing posted, no playground controls', { skip }, async () => {
  const h = await loadWidget(false);
  assert.deepEqual(h.posted, []);
  assert.equal(h.el('bReset').hidden, true);
  assert.equal(h.el('bOpenNote').hidden, true);
  h.cell('kick', 0).click();
  assert.deepEqual(h.posted, []);
});

test('widget source: the ONE `forge-rhythm-save` post is inside commitChange and after the playground return (source pin)', { skip }, () => {
  const posts = [...widgetScript.matchAll(/type:\s*"forge-rhythm-save"/g)];
  assert.equal(posts.length, 1, 'exactly one place can post a save');
  const fn = /function commitChange\(\) \{[\s\S]*?\n  \}/.exec(widgetScript)?.[0] ?? '';
  const guard = fn.indexOf('hostMode === "playground"');
  const post = fn.indexOf('forge-rhythm-save');
  assert.ok(guard > 0 && post > guard, 'the playground branch returns before the save is built');
});
