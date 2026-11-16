// 2026-11-16-1001 - the piano voice lab and the shorter voice in REAL headless Chrome: piano_voice_lab.html served as a page (it is on no note), the REAL Web Audio graph rendered offline (an OfflineAudioContext, nothing mocked), real mouse clicks on
// the preset buttons and the keys, a screenshot of the lab. The numbers: how long a note takes to fall 40 and 60 dB per register (the old voice and the new one, measured on the sound, not computed from the table), the release, no click at the end.
//   node scripts/dev/measure-piano-lab.mjs [--vault ~/projects/music-theory] [--out <dir>]        exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/music-theory')).replace(/^~/, os.homedir());
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/1001-shots')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const page = await openPage({ dir: VAULT, width: 800, height: 1500, pageHtml: fs.readFileSync(path.join(VAULT, 'music_instruments/resources/html/piano_voice_lab.html'), 'utf8') });
const verdict = {}; const table = {};
try {
  await sleep(500);
  const errors = await page.ev(`window.__errors = []; 0`);
  verdict.labOpens = (await page.ev(`document.querySelectorAll('#presets button').length`)) === 6 && (await page.ev(`document.querySelectorAll('.key').length`)) === 25;
  const presets = JSON.parse(await page.ev(`JSON.stringify(window.__lab.presets)`));
  const old = presets[0].params, nu = presets[1].params;
  const REG = [['C2', 36, 34], ['C3', 48, 30], ['C4', 60, 26], ['C5', 72, 18], ['C6', 84, 14]];
  for (const [name, midi, secs] of REG) {
    for (const [which, params] of [['old', old], ['new', nu]]) {
      const m = JSON.parse(await page.ev(`window.__lab.measure(${JSON.stringify(params)}, ${midi}, ${which === 'old' ? secs : 12}).then(function (m) { return JSON.stringify(m); })`));
      table[`${name} ${which}`] = { t40: m.t40, t60: m.t60, db4s: m.db4s };
    }
  }
  const row = (n) => table[n];
    // The measured time is the whole sound (every partial, the beating of the two strings, the hammer): the upper partials go first, so it is SHORTER than the table's time constant says, and the beating makes the crossing time jitter by half a second or so.
  // So the verdicts are about what the sound does, with room for that: the old voice rings (40 dB takes 5 s or more at every register, 60 dB 8 s or more, C2 15 s or more); the new voice is mostly gone in 1 to 4 s and 60 dB down in under 6 s at every
  // register, at least 2.5 times sooner than the old one at 60 dB, and the low notes ring longer than the high ones on average (C2 and C3 against C5 and C6).
  const t40 = (n) => row(n).t40, t60 = (n) => row(n).t60, mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  verdict.oldVoiceRings = REG.every(([n]) => t40(`${n} old`) >= 5 && t60(`${n} old`) >= 8) && t60('C2 old') >= 15;
  verdict.newIsMostlyGoneIn1To4SecondsAtEveryRegister = REG.every(([n]) => t40(`${n} new`) !== null && t40(`${n} new`) >= 1 && t40(`${n} new`) <= 4);
  verdict.newIs60dBDownInUnder6SecondsAtEveryRegister = REG.every(([n]) => t60(`${n} new`) !== null && t60(`${n} new`) < 6);
  verdict.newIsAtLeast2point5TimesSoonerAt60dB = REG.every(([n]) => t60(`${n} old`) / t60(`${n} new`) >= 2.5);
  verdict.lowNotesRingLongerThanHighOnAverage = mean([t40('C2 new'), t40('C3 new')]) > mean([t40('C5 new'), t40('C6 new')]) && mean([t60('C2 new'), t60('C3 new')]) > mean([t60('C5 new'), t60('C6 new')]);
  // the release, old and new
  const rel = {};
  for (const [which, params] of [['old', old], ['new', nu]]) rel[which] = JSON.parse(await page.ev(`window.__lab.releaseCheck(${JSON.stringify(params)}).then(function (m) { return JSON.stringify(m); })`));
  table.release = rel;
  verdict.newReleaseIsDown60dBWithin150ms = rel.new.db150 < -60;
  verdict.newReleaseHasNoClick = rel.new.maxStepAfterEnd < 0.02;
  verdict.oldReleaseWasShorterAndAlsoClean = rel.old.db100 < rel.new.db100 + 0.001 && rel.old.maxStepAfterEnd < 0.05;
  // real clicks: a preset into B, the slider, the switch
  const at = async (sel) => JSON.parse(await page.ev(`(function () { var e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); var r = e.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`));
  let c = await at('#editB'); await page.click(c.x, c.y);
  c = await at('#preset3'); await page.click(c.x, c.y);
  verdict.aPresetClickedIsInTheSettingBeingEdited = JSON.parse(await page.ev(`JSON.stringify(window.__lab.slots())`)).B.preset === 3 && (await page.ev(`document.getElementById('nameB').textContent`)) === 'Mellow';
  await page.ev(`(function () { var s = document.getElementById('s_decayMid'); s.value = '1.2'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  verdict.aSliderMovesTheNumberAndMarksItEdited = (await page.ev(`document.getElementById('nameB').textContent`)) === 'Mellow (edited)' && JSON.parse(await page.ev(`JSON.stringify(window.__lab.slots())`)).B.params.decayMid === 1.2;
  const text = await page.ev(`window.__lab.text()`);
  verdict.copyTextHasBothTables = (text.match(/var PIANO_PARAMS = \{/g) || []).length === 2 && /decayMid: 1\.2,/.test(text);
  await page.ev(`window.scrollTo(0, 0)`);
  await page.shot(path.join(OUT, 'lab-light.png'));
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }); await sleep(250);
  await page.shot(path.join(OUT, 'lab-dark.png'));
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 1900, deviceScaleFactor: 1, mobile: false }); await sleep(300);
  verdict.narrowHasNoHorizontalScroll = (await page.ev(`document.documentElement.scrollWidth <= window.innerWidth + 1`)) === true;
  await page.shot(path.join(OUT, 'lab-narrow.png'));
} finally { page.close(); }
console.log(JSON.stringify(table, null, 1)); console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every(Boolean); console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`); process.exit(ok ? 0 : 1);
