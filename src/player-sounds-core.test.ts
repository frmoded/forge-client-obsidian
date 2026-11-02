// 2026-10-31-1135 (CCQA smoke 10, A) - a failed soundfont fetch (storage.googleapis.com/magentadata, ENOTFOUND) was an UNCAUGHT FetchError and left the player on "!" until a reload. html-midi-player loads the samples as soon as the note
// sequence is set (initPlayerNow, from a setTimeout), sets its own error state - the Play button DISABLED - and rethrows. The guard catches that load where the player loads sounds: one `[forge-player] sounds could not be loaded: <reason>`
// line, one sentence next to the player, the Play button usable again, and the next Play tries the load again (and then plays). Host-faithful stand-in (card 12): a real DOM (happy-dom) with the library's own structure - the click
// handler is on the button, the guard listens on the control panel in the capture phase - and a `fetch` that fails once and then works.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { SOUNDS_FAILED_MESSAGE, guardPlayerSounds, soundsFailedLine } from './player-sounds-core.ts';

/** What html-midi-player does, in the parts the guard touches: initPlayerNow loads (and on failure sets the error state - the button disabled - and rethrows), start() plays, the button's own click handler starts or stops. */
function fakePlayer(doc: Document, fetchSamples: () => Promise<void>) {
  const controlPanel = doc.createElement('div'); controlPanel.className = 'controls stopped';
  const playButton = doc.createElement('button'); playButton.className = 'play'; controlPanel.appendChild(playButton);
  doc.body.appendChild(controlPanel);
  const calls: string[] = [];
  const el: any = {
    controlPanel, playButton,
    async initPlayerNow() {
      calls.push('load');
      try { await fetchSamples(); controlPanel.classList.remove('error', 'frozen'); playButton.disabled = false; calls.push('loaded'); }
      catch (e) { playButton.disabled = true; controlPanel.classList.add('error', 'frozen'); calls.push('error'); throw e; }
    },
    start() { calls.push('start'); },
  };
  playButton.addEventListener('click', () => el.start());          // the library's own handler, on the button
  return { el, calls };
}
const window = new Window({ url: 'http://localhost/' });
const unhandled: unknown[] = [];
process.on('unhandledRejection', (r) => { unhandled.push(r); });
const tick = () => new Promise((r) => setTimeout(r, 5));

test('a fetch that fails once: no uncaught rejection, one evidence line with the reason, one sentence, Play usable; the next Play loads again and then plays - and a click while it is loading is not a second load', async () => {
  let fetches = 0; let fail = true;
  const { el, calls } = fakePlayer(window.document as unknown as Document, async () => { fetches++; if (fail) throw Object.assign(new Error('request to https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus/instrument.json failed, reason: getaddrinfo ENOTFOUND storage.googleapis.com'), { name: 'FetchError' }); });
  const lines: string[] = []; const said: Array<string | null> = [];
  const guard = guardPlayerSounds(el, { log: (l) => lines.push(l), say: (m) => said.push(m) });
  await el.initPlayerNow();                                         // what the library's setTimeout does on creation: it must NOT reject now
  await tick();
  assert.deepEqual(unhandled, [], 'no uncaught rejection');
  assert.deepEqual(lines, [soundsFailedLine('request to https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus/instrument.json failed, reason: getaddrinfo ENOTFOUND storage.googleapis.com')]);
  assert.match(lines[0], /^\[forge-player\] sounds could not be loaded: .*ENOTFOUND/);
  assert.deepEqual(said, [SOUNDS_FAILED_MESSAGE]); assert.equal(SOUNDS_FAILED_MESSAGE, 'Sounds could not be loaded (network). Press Play to try again.');
  assert.equal(el.playButton.disabled, false, 'the library disabled Play; the guard gives it back so there IS a Play to press');

  fail = false;                                                      // the network is back
  el.playButton.dispatchEvent(new window.Event('click', { bubbles: true }) as unknown as Event);
  el.playButton.dispatchEvent(new window.Event('click', { bubbles: true }) as unknown as Event);        // a second click while the retry is in flight
  await tick(); await tick();
  assert.equal(fetches, 2, 'one retry, not two');
  assert.deepEqual(calls, ['load', 'error', 'load', 'loaded', 'start'], 'the retry loaded, then played (the library\'s own start ran once)');
  assert.deepEqual(said, [SOUNDS_FAILED_MESSAGE, null], 'the sentence is taken away when the sounds are there');
  assert.deepEqual(unhandled, []);
  // from now on the guard is out of the way: a click is the library's own start
  el.playButton.dispatchEvent(new window.Event('click', { bubbles: true }) as unknown as Event);
  await tick();
  assert.deepEqual(calls.slice(-1), ['start']);
  assert.equal(fetches, 2);
  guard.dispose();
});

test('a retry that fails again says so again (one line each), keeps the Play button usable, and never rejects', async () => {
  const { el, calls } = fakePlayer(window.document as unknown as Document, async () => { throw new Error('offline'); });
  const lines: string[] = []; const said: Array<string | null> = [];
  guardPlayerSounds(el, { log: (l) => lines.push(l), say: (m) => said.push(m) });
  await el.initPlayerNow(); await tick();
  el.playButton.dispatchEvent(new window.Event('click', { bubbles: true }) as unknown as Event);
  await tick(); await tick();
  assert.deepEqual(lines, ['[forge-player] sounds could not be loaded: offline', '[forge-player] sounds could not be loaded: offline']);
  assert.deepEqual(calls.filter((c) => c === 'start'), [], 'it never plays without sounds');
  assert.equal(el.playButton.disabled, false);
  assert.deepEqual(said, [SOUNDS_FAILED_MESSAGE, SOUNDS_FAILED_MESSAGE]);
  assert.deepEqual(unhandled, []);
});

test('the happy path is untouched: a load that works says nothing, logs nothing and a click is the library\'s own; dispose puts the original method back', async () => {
  const { el, calls } = fakePlayer(window.document as unknown as Document, async () => {});
  const original = el.initPlayerNow;
  const lines: string[] = []; const said: Array<string | null> = [];
  const guard = guardPlayerSounds(el, { log: (l) => lines.push(l), say: (m) => said.push(m) });
  await el.initPlayerNow(); await tick();
  el.playButton.dispatchEvent(new window.Event('click', { bubbles: true }) as unknown as Event);
  assert.deepEqual(calls, ['load', 'loaded', 'start']);
  assert.deepEqual([lines, said], [[], []]);
  guard.dispose();
  assert.equal(el.initPlayerNow, original);
});

test('the reason is one line: a multi-line error (a stack) is cut to its first line, an empty one still says something', () => {
  assert.equal(soundsFailedLine('FetchError: boom\n    at fetch (node:internal)\n    at x'), '[forge-player] sounds could not be loaded: FetchError: boom');
  assert.equal(soundsFailedLine(''), '[forge-player] sounds could not be loaded: unknown reason');
});

test('MECHANISM PIN 2026-10-31-1135 (the music edition guards the <midi-player> BEFORE it sets the note sequence, because the element starts loading the soundfont the moment the sequence is set; if the design moves this SHOULD go red - reassess, do not just rewrite)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const text = fs.readFileSync(path.join(import.meta.dirname, 'music-edition.full.ts'), 'utf8');
  const guard = text.indexOf('guardPlayerSounds(player,');
  const sequence = text.indexOf('player.noteSequence = noteSequence;');
  assert.ok(guard > 0 && sequence > 0, 'both are there');
  assert.ok(guard < sequence, 'the guard is installed first');
  assert.match(text, /say: \(message\) => \{ soundsNote\.textContent = message \?\? ''; soundsNote\.hidden = message === null; \}/, 'the sentence goes to the line beside the player');
  assert.match(text, /log: \(line\) => \{ console\.error\(line\); \}/, 'and the evidence line at Error level');
});

// Added by the 1135 mutation pass.
test('a retry that has FINISHED does not block the next one: fail, click, fail, click again - each click tries the load again (one line each)', async () => {
  const { el } = fakePlayer(window.document as unknown as Document, async () => { throw new Error('offline'); });
  const lines: string[] = [];
  guardPlayerSounds(el, { log: (l) => lines.push(l), say: () => {} });
  await el.initPlayerNow(); await tick();
  for (let i = 0; i < 2; i++) { el.playButton.dispatchEvent(new window.Event('click', { bubbles: true }) as unknown as Event); await tick(); await tick(); }
  assert.equal(lines.length, 3, 'the first load and one line for each of the two retries');
});

test('dispose stops the guard: after it a click on a player whose sounds failed is the library\'s own again (it starts), and the original method is back', async () => {
  const { el, calls } = fakePlayer(window.document as unknown as Document, async () => { throw new Error('offline'); });
  const guard = guardPlayerSounds(el, { log: () => {}, say: () => {} });
  await el.initPlayerNow(); await tick();
  guard.dispose();
  calls.length = 0;
  el.playButton.dispatchEvent(new window.Event('click', { bubbles: true }) as unknown as Event);
  await tick();
  assert.deepEqual(calls, ['start'], 'no retry, the click reaches the library\'s own handler');
});

// Added by the 1135 mutation pass re-run (1151): the guarded load promises true (the sounds are there) or false (they are not) and never rejects; nothing read the answer.
test('the guarded load answers true when the sounds came and false when they did not (never undefined, never a rejection)', async () => {
  let works = false;
  const { el } = fakePlayer(window.document as unknown as Document, async () => { if (!works) throw new Error('offline'); });
  guardPlayerSounds(el, { log: () => {}, say: () => {} });
  assert.strictEqual(await el.initPlayerNow(), false);
  works = true;
  assert.strictEqual(await el.initPlayerNow(), true);
});
