// 2026-10-31-1140 (M16a) in real Chrome: the description bar saying what became of a hand-edited RECIPE, at a wide and a NARROW pane (the notes pane is narrow). Three things the bar says now: the error of a Recipe that does not parse (the REAL
// parser's message, with its line and column, the longest it can be: an unknown step lists every step), the refusal of a note whose Description AND Recipe were both edited (the real sentence, the two buttons "Update from Description" and
// "Update from Recipe"), and the sentence that offers Update from Recipe. For each: nothing overflows its pane, no message or button text is clipped, every button is at least 20 px high and its centre IS that button (so a real click lands), a REAL
// mouse click reaches the owner with the right action, and the note below the bar is not overlapped. Writes shots/recipe-bar-*.png and recipe-bar-measurements.json; exits 1 when a verdict is false. Build and run from the client repo root:
//   OUT=<dir>/harness-description-bar.js EDITION=music ENTRY=entry-description-bar.ts node scripts/dev/browser/build.mjs      (with app.css and plugin-styles.css = this repo's styles.css in <dir>)
//   node scripts/dev/measure-recipe-bar.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';
import { parseRecipe } from '../../src/recipe-grammar-core.ts';
import { BOTH_EDITED, recipeRejectionMessage } from '../../src/recipe-apply-core.ts';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const VAULT = { bars: ['bar_007', 'bar_008'], phrases: ['phrase_001'], arrangements: [], compositions: [], kits: [] };
const failure = (recipe: string): string => { const r = parseRecipe(recipe, VAULT); if (r.ok) throw new Error(`expected a refusal: ${recipe}`); return recipeRejectionMessage(r.error); };
const SCENARIOS: Array<{ name: string; message: string; actions: string[]; click: string }> = [
  { name: 'unknown-step', message: failure('Take [[bar_007]].\nRepeat it for 8 bars with fills.\nSprinkle [[bar_008]].'), actions: ['revert'], click: 'revert' },
  { name: 'missing-bar', message: failure('Take [[bar_999]].\nRepeat it for 8 bars with fills.'), actions: ['revert'], click: 'revert' },
  { name: 'both-edited', message: BOTH_EDITED, actions: ['update', 'update-recipe'], click: 'update-recipe' },
  { name: 'update-offered', message: 'The Recipe changed (8 -> 6 bars); update the note from it.', actions: ['update-recipe', 'revert'], click: 'update-recipe' },
];
const page = (w: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light"><div class="workspace-leaf-content" style="width:${w}px;border:1px solid #ccc"><div class="view-content" id="pane" style="padding:12px"></div></div><script src="harness-description-bar.js"></script></body></html>`;
const box = (cls: string) => `(() => { const e = document.querySelector('${cls}'); const r = e.getBoundingClientRect(); const pane = document.getElementById('pane').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height, paneRight: pane.right, clipped: e.scrollWidth > e.clientWidth + 1, overflowsPane: r.right > pane.right + 0.5 }; })()`;
const buttonsJs = `[...document.querySelectorAll('.forge-description-button')].map((b) => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const pane = document.getElementById('pane').getBoundingClientRect(); return { action: b.getAttribute('data-action'), text: b.textContent, w: r.width, h: r.height, right: r.right, paneRight: pane.right, hitIsSelf: hit === b, clipped: b.scrollWidth > b.clientWidth + 1 }; })`;
const out: any = {};
for (const width of [640, 300]) {
  out[`w${width}`] = {};
  for (const sc of SCENARIOS) {
    const p = await openPage({ dir: here, width: width + 40, height: 600, pageHtml: page(width), routes: {} });
    try {
      await p.ev(`window.__mount(document.getElementById('pane'))`);
      await p.ev(`window.__bar.show({ message: ${JSON.stringify(sc.message)}, actions: ${JSON.stringify(sc.actions)} }); 0`);
      await sleep(100);
      const r: any = { message: sc.message, bar: await p.ev(box('.forge-description-bar')), text: await p.ev(box('.forge-description-message')), buttons: await p.ev(buttonsJs) };
      r.gapBelow = (await p.ev(`(() => document.getElementById('below').getBoundingClientRect().top)()`)) - r.bar.bottom;
      await p.shot(path.join(SHOTS, `recipe-bar-${sc.name}-${width}.png`));
      const at = await p.ev(`(() => { const b = document.querySelector('[data-action="${sc.click}"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
      await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      await sleep(50);
      r.heard = await p.ev('window.__heard.slice()');
      r.expectedClick = sc.click;
      out[`w${width}`][sc.name] = r;
    } finally { await p.close?.(); }
  }
}
const okOne = (r: any): boolean => r.bar.overflowsPane === false && r.text.clipped === false && r.bar.clipped === false
  && r.buttons.every((b: any) => b.h >= 20 && b.hitIsSelf && !b.clipped && b.right <= b.paneRight + 0.5)
  && Math.abs(r.gapBelow - 6) < 2 && r.heard.length === 1 && r.heard[0] === r.expectedClick;
const verdicts: Record<string, boolean> = {};
for (const w of ['w640', 'w300']) for (const sc of SCENARIOS) verdicts[`${w}/${sc.name}`] = okOne(out[w][sc.name]);
out.verdicts = verdicts;
fs.writeFileSync(path.join(here, 'recipe-bar-measurements.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(verdicts));
if (!Object.values(verdicts).every(Boolean)) { console.log(JSON.stringify(out.w300).slice(0, 2500)); process.exitCode = 1; }
