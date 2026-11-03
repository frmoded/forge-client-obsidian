// 2026-11-03-1155-92 (R4, R5): the header of a Score tab (phrase / arrangement / composition) in real headless Chrome under Obsidian's own app.css, at 640 and 300 px: BEFORE (one action, "Open as JSON", icon code) and AFTER
// (two actions: "Restore to last commit" history, "Open as Forge note" file-text). The header's markup is Obsidian's (view-header, view-header-title-container, view-actions > clickable-icon view-action, lucide svgs; the label
// is the aria-label, drawn by Obsidian as a tooltip only on hover, so the tooltip box is measured too, as Obsidian's own `.tooltip` markup). What is measured, and the verdicts (each can fail; the CONTROL feeds the same
// comparator a header with eight more actions at 300 px, which must overflow):
//   * the header does not overflow its width and does not wrap (actions on one row, same top; the header's height equals the before header's);
//   * the title still fits on one line at 640 px; at 300 px it may truncate with an ellipsis (Obsidian's own rule) but never wraps;
//   * the longer label's tooltip stays inside the viewport and on one line at both widths.
// Usage (from the client repo root; <dir> holds app.css, e.g. the evidence directory of measure-score-header): node scripts/dev/measure-score-tab-header.ts <dir>   (writes <dir>/score-tab-header-measurements.json; exit 1 when a verdict is false)
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const dir = process.argv[2];
const SVG = {
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
} as const;
const action = (icon: keyof typeof SVG, label: string) => `<a class="clickable-icon view-action" aria-label="${label}" data-icon="${icon}"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-${icon}">${SVG[icon]}</svg></a>`;
const header = (actions: string, title: string) => `<div class="workspace-leaf mod-active"><div class="workspace-leaf-content" data-type="forge-phrase" style="display:flex;flex-direction:column;width:100%"><div class="view-header"><div class="view-header-left"><div class="view-header-nav-buttons"><button class="clickable-icon" aria-label="Back">‹</button><button class="clickable-icon" aria-label="Forward">›</button></div></div><div class="view-header-title-container mod-at-start"><div class="view-header-title-parent"></div><div class="view-header-title">${title}</div></div><div class="view-actions">${actions}</div></div></div></div>`;
const BEFORE = action('code', 'Open as JSON');
const AFTER = action('history', 'Restore to last commit') + action('file-text', 'Open as Forge note');
const MANY = Array.from({ length: 8 }, (_, i) => action('code', `Extra ${i}`)).join('');
const TITLE = 'phrase_012 · transform of phrase_003';
const tooltip = (text: string, x: number) => `<div class="tooltip mod-top" style="position:absolute;left:${x}px;top:46px"><div class="tooltip-arrow"></div>${text}</div>`;

async function study(width: number, label: string, actions: string, tip: string | null) {
  const html = `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos show-view-header"><div id="leaf" style="width:${width}px;border:1px solid #ccc;position:relative">${header(actions, TITLE)}</div>${tip ?? ''}</body></html>`;
  const p = await openPage({ dir, width: width + 40, height: 200, pageHtml: html });
  try {
    await sleep(300);
    const m = await p.ev(`(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return { top: +b.top.toFixed(1), left: +b.left.toFixed(1), width: +b.width.toFixed(1), height: +b.height.toFixed(1), right: +b.right.toFixed(1) }; };
      const h = document.querySelector('.view-header'); const t = document.querySelector('.view-header-title'); const acts = [...document.querySelectorAll('.view-action')];
      const tip = document.querySelector('.tooltip');
      const cs = getComputedStyle(t);
      return { header: r(h), scrollOverflow: h.scrollWidth - h.clientWidth, title: r(t), titleWrapped: t.getBoundingClientRect().height > parseFloat(cs.lineHeight) * 1.5, titleEllipsis: cs.textOverflow, actions: acts.map(r), actionsTops: [...new Set(acts.map((a) => Math.round(a.getBoundingClientRect().top)))], viewport: innerWidth,
        tooltip: tip ? { box: r(tip), oneLine: tip.getBoundingClientRect().height < parseFloat(getComputedStyle(tip).lineHeight || '20') * 1.9 + 20 } : null };
    })()`);
    return { label, width, ...m };
  } finally { p.close(); }
}

const out: any = {};
for (const w of [640, 300]) {
  out[`before${w}`] = await study(w, 'before', BEFORE, null);
  out[`after${w}`] = await study(w, 'after', AFTER, tooltip('Open as Forge note', Math.min(w - 170, 400)));
  out[`control${w}`] = await study(w, 'control', AFTER + MANY, null);
}
const fits = (s: any) => s.scrollOverflow <= 0 && s.actionsTops.length === 1 && s.header.right <= s.width + 2;
const verdicts: Record<string, boolean> = {};
const drawn = (s: any) => s.header.height > 20 && s.header.width > 100 && s.actions.every((x: any) => x.width > 10 && x.height > 10) && s.title.width > 20;
verdicts['non-vacuity: every header measured was really drawn (a box with size, every action visible)'] = Object.entries(out).filter(([k]) => !k.startsWith('control')).every(([, v]) => drawn(v));                                                    // the control is SUPPOSED to be squeezed
for (const w of [640, 300]) {
  const b = out[`before${w}`], a = out[`after${w}`], c = out[`control${w}`];
  verdicts[`${w}px: after: the header does not overflow and the actions are on one row`] = fits(a);
  verdicts[`${w}px: after: the header is as tall as before (nothing wrapped)`] = Math.abs(a.header.height - b.header.height) < 0.6;
  verdicts[`${w}px: after: the title is not wrapped${w === 300 ? ' (it may truncate)' : ' and is not cut'}`] = !a.titleWrapped && (w === 300 || a.title.width > 0);
  verdicts[`${w}px: after: the label's tooltip is inside the viewport and on one line`] = a.tooltip !== null && a.tooltip.box.left >= 0 && a.tooltip.box.right <= a.viewport && a.tooltip.oneLine;
  verdicts[`${w}px: before: non-vacuity, the old header had one action`] = b.actions.length === 1 && a.actions.length === 2;
}
verdicts['CONTROL: the same comparator sees eight more actions at 300 px overflow or wrap'] = fits(out.control300) === false || out.control300.header.height > out.before300.header.height + 0.6;
fs.writeFileSync(path.join(dir, 'score-tab-header-measurements.json'), JSON.stringify({ out, verdicts }, null, 2));
for (const [k, v] of Object.entries(verdicts)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
process.exit(Object.values(verdicts).every(Boolean) ? 0 : 1);
