// 2026-11-02-1152 - the C major triad keyboard (music-theory: music_instruments/resources/html/piano_keyboard_c_major_triad.html) on a narrow pane. The note embeds it as an iframe sized to the pane
// (```html-embed ... 300```), and the keyboard scrolls sideways under 560 px by design: on load only C4 was in view and E4, G4 were off to the right. Real Chrome, the real file served as the vault serves it,
// the iframe at 300, 420 and 640 px: are C4, E4 and G4 inside the visible strip on load, how many white keys wide is the strip, are the held keys still 60, 64, 67, do the buttons and a key click still work
// (a real mouse click; the oscillators the real Web Audio graph is asked for are counted), is there any page overflow. Wall-clock, no virtual time.
//   node scripts/dev/measure-triad-gadget.mjs [--tag before|after] [--vault ~/projects/music-theory]   exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const TAG = arg('--tag', 'after');
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/music-theory')).replace(/^~/, os.homedir());
const GADGET = 'music_instruments/resources/html/piano_keyboard_c_major_triad.html';
const SHOTS = path.join(os.homedir(), '.forge-mem-evidence/measure/shots');
fs.mkdirSync(SHOTS, { recursive: true });

const rows = [];
for (const width of [300, 420, 640]) {
  const page = await openPage({ dir: VAULT, width, height: 360, routes: { [`GET /${GADGET}`]: async (_q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(fs.readFileSync(path.join(VAULT, GADGET))); } }, pageHtml: `<!doctype html><meta charset="utf-8"><style>body{margin:0}iframe{border:0;display:block;width:${width}px;height:300px}</style><iframe id="f" src="/${GADGET}"></iframe>` });
  try {
    await sleep(500);
    const probe = `(() => {
      const f = document.getElementById('f'), d = f.contentDocument, w = f.contentWindow;
      const sc = d.querySelector('.scroller'), svg = d.getElementById('svg');
      const s = sc.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      const keyPx = svg.getBoundingClientRect().width * 40 / vb.width;           // one white key, in CSS pixels
      const inside = (m) => { const r = d.querySelector('[data-midi="' + m + '"]').getBoundingClientRect(); return r.left >= s.left - 0.5 && r.right <= s.right + 0.5; };
      const held = [...d.querySelectorAll('.key')].filter((k) => k.getAttribute('aria-pressed') === 'true').map((k) => +k.dataset.midi).sort((a, b) => a - b);
      return { scrollerPx: Math.round(sc.clientWidth), svgPx: Math.round(svg.getBoundingClientRect().width), scrollLeft: Math.round(sc.scrollLeft), maxScroll: Math.round(sc.scrollWidth - sc.clientWidth),
        visibleKeys: +(sc.clientWidth / keyPx).toFixed(1), c4: inside(60), e4: inside(64), g4: inside(67), held,
        overflowX: Math.max(d.documentElement.scrollWidth - d.documentElement.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth) };
    })()`;
    const onLoad = await page.ev(probe);
    await page.shot(path.join(SHOTS, `triad-gadget-${TAG}-${width}.png`));
    // the buttons and a key still work: a real mouse click on each, the oscillators asked of the real Web Audio graph counted
    await page.ev(`(() => { const w = document.getElementById('f').contentWindow; window.__osc = 0; const A = w.AudioContext; w.AudioContext = class extends A { createOscillator() { window.__osc++; return super.createOscillator(); } }; })()`);
    const centre = async (sel) => page.ev(`(() => { const r = document.getElementById('f').contentDocument.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(), o = document.getElementById('f').getBoundingClientRect(); return { x: o.left + r.left + r.width / 2, y: o.top + r.top + r.height / 2 }; })()`);
    const click = async (sel) => { const c = await centre(sel); await page.click(c.x, c.y); await sleep(250); };
    const heldNow = () => page.ev(`[...document.getElementById('f').contentDocument.querySelectorAll('.key')].filter((k) => k.getAttribute('aria-pressed') === 'true').map((k) => +k.dataset.midi).sort((a, b) => a - b)`);
    await page.ev(`document.getElementById('f').contentDocument.querySelector('[data-midi="60"]').scrollIntoView({ inline: 'nearest' })`);   // the rest only checks the controls: C4 must be within a mouse's reach (at 300 px it was cut by the edge)
    await click('#bT'); const oscTogether = await page.ev('window.__osc');
    await click('#bU'); const oscAfterUp = await page.ev('window.__osc');
    await click('#bD'); const oscAfterDown = await page.ev('window.__osc');
    await click('[data-midi="60"]'); const afterKey = await heldNow();            // C4 clicked: released
    await click('[data-midi="60"]'); const afterKeyAgain = await heldNow();       // and held again
    await click('#bC'); const afterClear = await heldNow();
    const controls = { together: oscTogether, up: oscAfterUp - oscTogether, down: oscAfterDown - oscAfterUp, keyReleased: !afterKey.includes(60), keyHeldAgain: afterKeyAgain.includes(60), cleared: afterClear.length === 0 };
    const fits = onLoad.maxScroll === 0 || onLoad.c4 && onLoad.e4 && onLoad.g4;
    const verdict = { threeInView: onLoad.c4 && onLoad.e4 && onLoad.g4, held607467: onLoad.held.join() === '60,64,67', noOverflow: onLoad.overflowX <= 0,
      buttons: controls.together === 3 && controls.up === 3 && controls.down === 3 && controls.keyReleased && controls.keyHeldAgain && controls.cleared };
    rows.push({ width, onLoad, controls, verdict, fits });
  } finally { page.close(); }
}
for (const r of rows) console.log(JSON.stringify(r));
const ok = rows.every((r) => Object.values(r.verdict).every(Boolean));
console.log(`${TAG}: ${rows.length * 4} verdicts, ${ok ? 'all true' : 'NOT all true'}`);
process.exit(ok ? 0 : 1);
