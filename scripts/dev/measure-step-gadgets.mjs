// 2026-11-16-1200 - the whole/half step gadget and the basic scale player in REAL headless Chrome, with real mouse clicks: the page is exactly as tall as its content (no vertical scroll in an embed of that height), the SAME height for every state (the
// rows that change reserve their height), no horizontal scroll at 800 and at 360 px wide, the chips never wrap, a real click on two keys says the distance, the scale player's Play lights the sounding note. Heights are printed for the embed
// (the page height; the notes use it plus 12).   node scripts/dev/measure-step-gadgets.mjs [--vault ~/projects/music-theory] [--out <dir>]        exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/music-theory')).replace(/^~/, os.homedir());
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/1200-shots')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const verdict = {}; const heights = {};
const read = (rel) => fs.readFileSync(path.join(VAULT, rel), 'utf8');

async function run(name, rel, drive) {
  const page = await openPage({ dir: VAULT, width: 800, height: 1000, pageHtml: read(rel) });
  try {
    for (const w of [800, 360]) {
      await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: 1000, deviceScaleFactor: 1, mobile: false }); await sleep(350);
      const hs = [];
      const measure = async (label) => {
        const m = JSON.parse(await page.ev(`JSON.stringify({ h: Math.ceil(document.documentElement.getBoundingClientRect().height), sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, iw: window.innerWidth })`));
        hs.push({ label, ...m }); return m;
      };
      await drive(page, w, measure);
      const hh = hs.map((x) => x.h);
      heights[`${name} @${w}`] = { min: Math.min(...hh), max: Math.max(...hh), states: hs.length };
      verdict[`${name}_${w}_sameHeightInEveryState`] = Math.max(...hh) - Math.min(...hh) <= 1;
      verdict[`${name}_${w}_noHorizontalScroll`] = hs.every((x) => x.sw <= x.iw + 1);
      // an embed exactly as tall as the page: the viewport is made that tall, and nothing may overflow it (a scrollbar would show)
      await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: Math.max(...hh), deviceScaleFactor: 1, mobile: false }); await sleep(250);
      const fit = JSON.parse(await page.ev(`JSON.stringify({ sh: document.documentElement.scrollHeight, ih: window.innerHeight })`));
      verdict[`${name}_${w}_noVerticalScrollInItsOwnHeight`] = fit.sh <= fit.ih + 1;
    }
    await page.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 420, deviceScaleFactor: 1, mobile: false }); await sleep(250);
    await page.shot(path.join(OUT, `${name}-light.png`));
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }); await sleep(200);
    await page.shot(path.join(OUT, `${name}-dark.png`));
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    return page;
  } finally { page.close(); }
}
const centre = (page, sel) => page.ev(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); var r = e.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`).then(JSON.parse);
const clickSel = async (page, sel) => { const c = await centre(page, sel); await page.click(c.x, c.y); await sleep(120); };
const text = (page, sel) => page.ev(`document.querySelector(${JSON.stringify(sel)}).textContent`);

// ---- whole / half steps: C4..C5, real clicks --------------------------------------------------------------------------------------------------------------------------------------------------------
await run('whole-half-steps', 'music_instruments/resources/html/whole_half_steps.html', async (page, w, measure) => {
  await page.ev('location.reload()'); await sleep(500);
  await measure('start');
  const pairs = [[60, 61], [60, 62], [60, 67], [64, 64], [60, 72], [62, 69], [72, 60]];
  for (const [a, b] of pairs) {
    await clickSel(page, `.key[data-midi="${a}"]`); await clickSel(page, `.key[data-midi="${b}"]`);
    const m = await measure(`${a}-${b}`);
    const n = Math.abs(b - a), words = await text(page, '#readout');
    const chips = JSON.parse(await page.ev(`JSON.stringify([].map.call(document.querySelectorAll('#chips .chip'), function (c) { var r = c.getBoundingClientRect(); return { l: c.querySelector('.letter').textContent, n: c.querySelector('.count').textContent, top: Math.round(r.top), right: Math.round(r.right) }; }))`));
    const want = n === 0 ? 'Same note: 0 steps' : `${n} half step${n === 1 ? '' : 's'} = `;
    if (w === 800) {
      verdict[`whole-half-steps_${a}-${b}_readout`] = n === 0 ? words === want : words.startsWith(want);
      verdict[`whole-half-steps_${a}-${b}_chips`] = chips.map((c) => c.l).join('') === 'W'.repeat(Math.floor(n / 2)) + 'H'.repeat(n % 2) && chips.every((c) => c.n === (c.l === 'W' ? '2' : '1'));
    }
    verdict[`whole-half-steps_${a}-${b}_${w}_chipsOnOneLineInsideThePage`] = new Set(chips.map((c) => c.top)).size <= 1 && chips.every((c) => c.right <= m.iw);
    if (a === 60 && b === 67 && w === 800) {
      verdict.whole_half_steps_between_lit = (await page.ev(`document.querySelectorAll('.key.between').length`)) === 6;
      await page.shot(path.join(OUT, 'whole-half-steps-7-light.png'));
    }
  }
});

// ---- the basic scale player: real clicks on Play, the heights across tonics and scales (the staff with accidentals is the tallest state) -----------------------------------------------------------------------------------
await run('scale-player-basic', 'scales/resources/html/scale_player_basic.html', async (page, w, measure) => {
  await page.ev('location.reload()'); await sleep(500);
  await measure('C major');
  for (const [tonic, scale] of [['9', 'natural_minor'], ['1', 'natural_minor'], ['3', 'major'], ['6', 'major'], ['8', 'natural_minor'], ['0', 'major']]) {
    await page.ev(`(function(){ var t = document.getElementById('tonic'), s = document.getElementById('scale'); t.value = ${JSON.stringify(tonic)}; t.dispatchEvent(new Event('change', { bubbles: true })); s.value = ${JSON.stringify(scale)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(120); await measure(`${tonic}/${scale}`);
  }
  if (w === 800) {
    const buttons = JSON.parse(await page.ev(`JSON.stringify([].map.call(document.querySelectorAll('button'), function (b) { return b.id; }))`));
    verdict.scale_player_basic_oneButton = JSON.stringify(buttons) === '["play"]';
    verdict.scale_player_basic_twoScales = (await page.ev(`[].map.call(document.querySelectorAll('#scale option'), function (o) { return o.value; }).join()`)) === 'major,natural_minor';
    await clickSel(page, '#play'); await sleep(700);
    verdict.scale_player_basic_playLightsTheSoundingNote = (await page.ev(`document.querySelectorAll('.key.sounding, .letter.sounding').length`)) >= 1;
    await sleep(4500);
  }
});
console.log(JSON.stringify(heights, null, 1)); console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every(Boolean); console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`); process.exit(ok ? 0 : 1);
