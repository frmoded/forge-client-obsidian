// 2026-11-02-1151 - settles the one survivor of drain 1135's mutation pass that happy-dom cannot see: src/player-sounds-core.ts, the CAPTURE flag of
// `el.controlPanel.addEventListener('click', onClick, true)`. The guard must run BEFORE the button's own handler (the library's start): a click on a failed
// player is a retry, not a start of a player with no sounds. In a real Chrome, with the real guard bundled by esbuild: the capture listener stops the click
// before the button's handler (starts: 0); the same guard with `false` lets the button's handler run first (starts: 1). Wall-clock, real events, real DOM.
//   node scripts/dev/check-player-sounds-capture.mjs        exit 0 = capture phase proven necessary (true: 0 starts, false: 1 start)
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bundled = await build({ entryPoints: [path.join(ROOT, 'src/player-sounds-core.ts')], bundle: true, write: false, format: 'iife', globalName: 'Sounds', platform: 'browser', logLevel: 'silent' });
const code = bundled.outputFiles[0].text;
const page = `<!doctype html><meta charset="utf-8"><body><div id="panel"><button id="play">Play</button></div><script>${code}</script></body>`;

async function scenario(capture) {
  const chrome = await openPage({ dir: ROOT, pageHtml: page });
  try {
    return await chrome.ev(`(async () => {
      const panel = document.getElementById('panel'), play = document.getElementById('play');
      const log = []; let starts = 0; let loads = 0;
      play.addEventListener('click', () => { starts++; });                               // the library's own start, on the button
      const el = { controlPanel: ${capture ? 'panel' : `{ addEventListener: (t, f) => panel.addEventListener(t, f, false), removeEventListener: (t, f) => panel.removeEventListener(t, f, false) }`}, playButton: { disabled: false }, start() {}, initPlayerNow: async () => { loads++; if (loads === 1) throw new Error('network down'); } };
      Sounds.guardPlayerSounds(el, { log: (l) => log.push(l), say: () => {} });
      await el.initPlayerNow();                                                          // the first load fails: the guard now holds a failed player
      play.click();                                                                      // the person presses Play on the failed player
      await new Promise((r) => setTimeout(r, 50));
      return { starts, loads, log: log.length };
    })()`);
  } finally { chrome.close(); }
}

const withCapture = await scenario(true);
const withoutCapture = await scenario(false);
console.log(JSON.stringify({ withCapture, withoutCapture }));
const ok = withCapture.starts === 0 && withCapture.loads === 2 && withoutCapture.starts === 1;
console.log(ok ? 'capture phase proven necessary in a real Chrome: true -> the button never started, false -> it started a player with no sounds' : 'UNEXPECTED: see the numbers above');
process.exit(ok ? 0 : 1);
