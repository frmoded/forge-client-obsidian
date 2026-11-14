// 2026-11-13-1214-1 - the piano voice in REAL headless Chrome: piano_voice_demo.html served as a page (it is not embedded anywhere), its own offline render of the middle C for 1.5 s with each voice and of the C-E-G chord for 2 s
// (an OfflineAudioContext: the real Web Audio graph, nothing mocked), the numbers read from the page, the Measure button clicked with a real mouse event, and a screenshot of the page with the numbers shown (light and dark).
//   node scripts/dev/measure-piano-voice.mjs [--vault ~/projects/music-theory] [--out <dir>]        exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/music-theory')).replace(/^~/, os.homedir());
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/shots')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const page = await openPage({ dir: VAULT, width: 760, height: 560, pageHtml: fs.readFileSync(path.join(VAULT, 'music_instruments/resources/html/piano_voice_demo.html'), 'utf8') });
const verdict = {}; let numbers;
try {
  await sleep(500);
  verdict.demoLoadsWithTenButtons = (await page.ev(`document.querySelectorAll('#rows button').length`)) === 10;
  numbers = JSON.parse(await page.ev(`window.__measure().then((m) => JSON.stringify(m))`));
  const o = numbers.old, n = numbers.nu;
  verdict.newHasMoreEnergyAbove1kHz = n.shareAbove1kHz > o.shareAbove1kHz;
  verdict.newCentroidIsHigher = n.centroidHz > o.centroidHz;
  verdict.newDecays = n.rmsAt1_0s < n.rmsAt0_1s * 0.5;                    // stated: at least 6 dB down between 0.1 s and 1.0 s
  verdict.noClippingOnTheChord = numbers.chordPeakNew < 0.95;
  verdict.singleNoteNotLouderThanOld = n.peak <= o.peak * 1.25 && n.peak > 0.05;
  verdict.noClickAtTheEnd = n.lastFiveMsRms < 1e-4 && n.maxStepAfter1s < 0.02;
  verdict.noNaN = Object.values({ ...o, ...n }).every((v) => Number.isFinite(v));
  // the Measure button, with a real mouse click, writes the numbers on the page
  const c = await page.ev(`(() => { const b = document.getElementById('measure'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await page.click(c.x, c.y); await sleep(1500);
  const shown = await page.ev(`document.getElementById('numbers').textContent`);
  verdict.measureButtonShowsTheNumbers = /spectral centroid/.test(shown) && /chord, peak/.test(shown);
  for (const scheme of ['light', 'dark']) {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }); await sleep(150);
    await page.shot(path.join(OUT, `piano-voice-demo-${scheme}.png`), { x: 0, y: 0, width: 760, height: 520 });
  }
  numbers.shown = shown;
  console.log(JSON.stringify(numbers, null, 1));
} finally { page.close(); }
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every(Boolean);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`);
process.exit(ok ? 0 : 1);
