// 2026-11-16-0901 - the four music ribbon icons in real headless Chrome: drawn the way Obsidian draws a ribbon icon (an inline SVG, viewBox 0 0 100 100, `currentColor`, in a vertical ribbon column at 18 px and again large), in light and in dark.
// Verdicts: every icon draws something (its bounding box is a real part of the box, inside it), none is clipped, and it takes the THEME's colour (the computed stroke or fill is the ink colour of the scheme, light or dark: no fixed colour).
//   node --experimental-strip-types scripts/dev/measure-music-icons.ts [--out <dir>]        exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';
import { MUSIC_ICONS, MUSIC_RIBBON } from '../../src/music-ribbon-core.ts';

const arg = (name: string, dflt: string): string => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/0901-shots')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const icon = (svg: string, size: number): string => `<svg class="i" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" style="stroke:currentColor;fill:none">${svg}</svg>`;
const page = `<!doctype html><meta charset="utf-8"><style>
  :root { --ink: #2B2B2B; --bg: #FDFCFA; --rail: #F0EFEA; } @media (prefers-color-scheme: dark) { :root { --ink: #DADADA; --bg: #1E1E1E; --rail: #262626; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 13px -apple-system, sans-serif; display: flex; gap: 28px; padding: 14px; }
  .rail { background: var(--rail); width: 44px; padding: 8px 0; display: flex; flex-direction: column; align-items: center; gap: 4px; border-radius: 6px; }
  .rail .btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; }
  .big { display: flex; flex-direction: column; gap: 10px; } .big .row { display: flex; align-items: center; gap: 12px; } .big svg { width: 64px; height: 64px; }
</style><body>
<div class="rail" id="rail">${MUSIC_RIBBON.map((r) => `<div class="btn" title="${r.title}">${icon(MUSIC_ICONS.find((i) => i.id === r.icon)!.svg, 18)}</div>`).join('')}</div>
<div class="big" id="big">${MUSIC_RIBBON.map((r) => `<div class="row">${icon(MUSIC_ICONS.find((i) => i.id === r.icon)!.svg, 64)}<span>${r.title}</span></div>`).join('')}</div>`;
const p = await openPage({ dir: path.resolve(import.meta.dirname, '../..'), width: 300, height: 360, pageHtml: page });
await sleep(400);
const verdict: Record<string, boolean> = {};
for (const scheme of ['light', 'dark']) {
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }); await sleep(200);
  const r = await p.ev(`(function () { var out = { ink: getComputedStyle(document.body).color, icons: [] }; [].forEach.call(document.querySelectorAll('#big svg'), function (s) { var b = s.getBBox(); var any = s.querySelector('[stroke], [fill]'); var cs = getComputedStyle(s.firstElementChild); out.icons.push({ w: b.width, h: b.height, x: b.x, y: b.y, stroke: cs.stroke, fill: cs.fill }); }); return JSON.stringify(out); })()`);
  const d = JSON.parse(r);
  verdict[`${scheme}_fourIconsDraw`] = d.icons.length === 4 && d.icons.every((i: any) => i.w > 30 && i.h > 30);
  verdict[`${scheme}_insideTheBox`] = d.icons.every((i: any) => i.x >= 0 && i.y >= 0 && i.x + i.w <= 100 && i.y + i.h <= 100);
  verdict[`${scheme}_followsTheTheme`] = d.icons.every((i: any) => i.stroke === d.ink || i.fill === d.ink);
  await p.shot(path.join(OUT, `ribbon-${scheme}.png`), { x: 0, y: 0, width: 300, height: 360 });
}
p.close();
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every(Boolean); console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`); process.exit(ok ? 0 : 1);
