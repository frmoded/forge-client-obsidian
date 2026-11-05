// 2026-11-05-1185 (b) in real Chrome: the interval-pattern row of the Scale Explorer (the plugin's own mountScaleBlock + its real Verovio staff drawer, the sound a test double) under Obsidian's own app.css and the plugin's styles.css,
// in the widget a code block builds (div.cm-preview-code-block.cm-embed-block.markdown-rendered.cm-lang-forge-scale), at 640 and 300 px. Each verdict can fail:
//   * a default block has the row: seven chips whose text reads W W H W W W H over 2 2 1 2 2 2 1; it sits directly under the piano and above the staff;
//   * dorian reads W H W W W H W, harmonic minor shows its W+H chip and the text of that widest chip is NOT clipped (scrollWidth <= clientWidth) at 300 px;
//   * the seven chips are ONE line (the same top), do not overlap, and lie inside the row, the row inside the pane: no horizontal overflow of the widget or the page;
//   * a half tone's letter is another colour than a whole tone's (the accent), and no chip's text is clipped;
//   * the off switch: `show:` without intervals, chord mode and free mode have no row;
//   * CONTROL: dorian's chips compared with major's expected text are NOT equal (a wrong pattern fails the comparator); a row for a block that must have none would fail the off-switch verdict.
// Writes shots/scale-intervals-*.png and scale-intervals-measurements.json; exits 1 when a verdict is false. Build and run from the client repo root:
//   OUT=<dir>/harness-scale-explorer.js EDITION=music ENTRY=entry-scale-explorer.ts node scripts/dev/browser/build.mjs      (with app.css and plugin-styles.css = this repo's styles.css in <dir>)
//   node scripts/dev/measure-scale-intervals.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const BLOCKS: Record<string, string> = {
  c: '',
  d: 'tonic: D\nscale: dorian',
  hm: 'tonic: A\nscale: harmonic minor',
  fixed: 'tonic: F#\ncontrols: no',
  off: 'show: piano, staff, numbers',
  chord: 'mode: chord',
  free: 'mode: free\nshow: piano, staff, diatonic',
};
const page = (w: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="markdown-source-view mod-cm6 is-live-preview" style="width:${w}px;padding:12px"><div class="cm-editor"><div class="cm-scroller"><div class="cm-content" id="content" style="width:${w - 24}px;min-width:${w - 24}px">
${Object.keys(BLOCKS).map((id) => `<div class="cm-preview-code-block cm-embed-block markdown-rendered cm-lang-forge-scale" id="wrap-${id}" style="margin:10px 0"><div class="block-language-forge-scale" id="blk-${id}"></div></div>`).join('\n')}
</div></div></div></div><script src="harness-scale-explorer.js"></script></body></html>`;

const READ = (id: string) => `(() => {
  const blk = document.getElementById('blk-${id}'); const root = blk.querySelector('.forge-scale');
  const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const pane = r(document.getElementById('content'));
  if (!root) return { id: '${id}', mounted: false };
  const row = root.querySelector('.forge-scale-intervals');
  const piano = root.querySelector('.forge-scale-piano'); const staff = root.querySelector('.forge-scale-staff');
  const order = [...root.children].map((c) => String(c.className).split(' ')[0]);
  const rootEl = r(root);
  const overflow = { root: root.scrollWidth > root.clientWidth + 1, rootRight: rootEl.r > pane.r + 0.5, page: document.documentElement.scrollWidth > innerWidth };
  if (!row) return { id: '${id}', mounted: true, row: null, order, overflow };
  const rr = r(row);
  const steps = [...row.querySelectorAll('.forge-scale-step')];
  const letters = steps.map((s) => s.querySelector('.forge-scale-step-letter'));
  const semis = steps.map((s) => s.querySelector('.forge-scale-step-semis'));
  const boxes = steps.map(r);
  const color = (e) => getComputedStyle(e).color;
  const half = letters.filter((l, i) => steps[i].getAttribute('data-semitones') === '1');
  const whole = letters.filter((l, i) => steps[i].getAttribute('data-semitones') === '2');
  return {
    id: '${id}', mounted: true, order, overflow, role: row.getAttribute('role'),
    letters: letters.map((e) => e.textContent).join(' '), semitones: semis.map((e) => e.textContent).join(' '), count: steps.length,
    row: rr, rowInPane: rr.l >= pane.l - 0.5 && rr.r <= pane.r + 0.5,
    belowPiano: piano ? rr.t >= r(piano).b - 0.5 : null, aboveStaff: staff ? rr.b <= r(staff).t + 0.5 : null,
    oneLine: new Set(boxes.map((b) => Math.round(b.t))).size === 1,
    noOverlap: boxes.every((b, i) => i === 0 || b.l >= boxes[i - 1].r - 0.5),
    insideRow: boxes.every((b) => b.l >= rr.l - 0.5 && b.r <= rr.r + 0.5),
    clipped: [...letters, ...semis].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
    chipWidth: +boxes[0].w.toFixed(1), widest: Math.max(...letters.map((e) => e.getBoundingClientRect().width)), chipH: +boxes[0].h.toFixed(1),
    halfColour: half[0] ? color(half[0]) : null, wholeColour: whole[0] ? color(whole[0]) : null,
    fontSize: parseFloat(getComputedStyle(steps[0]).fontSize),
  };
})()`;

const MAJOR = { letters: 'W W H W W W H', semitones: '2 2 1 2 2 2 1' };
const out: any = {};
const verdicts: Record<string, boolean> = {};

for (const width of [640, 300]) {
  const key = `w${width}`;
  const p = await openPage({ dir: here, width: width + 40, height: 3000, pageHtml: page(width), routes: {} });
  try {
    await sleep(500);
    for (const [id, src] of Object.entries(BLOCKS)) await p.ev(`window.__mount(document.getElementById('blk-${id}'), ${JSON.stringify(src)})`);
    await sleep(300);
    const m: any = out[key] = {};
    for (const id of Object.keys(BLOCKS)) m[id] = await p.ev(READ(id));
    out[key].errors = await p.ev('window.__pageErrors');
    const { c, d, hm, fixed, off, chord, free } = m;
    const same = (b: any, want: { letters: string; semitones: string }) => b.letters === want.letters && b.semitones === want.semitones;

    verdicts[`${key} default block: ${c.count} chips reading "${c.letters}" over "${c.semitones}" (major)`] = c.count === 7 && same(c, MAJOR);
    verdicts[`${key} the row sits directly under the piano and above the staff (order ${c.order.join(' > ')})`] = c.belowPiano === true && c.aboveStaff === true && c.order.indexOf('forge-scale-intervals') === c.order.indexOf('forge-scale-piano') + 1 && c.role === 'group';
    verdicts[`${key} D dorian reads "${d.letters}" over "${d.semitones}"`] = same(d, { letters: 'W H W W W H W', semitones: '2 1 2 2 2 1 2' });
    verdicts[`${key} CONTROL: dorian's chips compared with major's expected text are NOT equal (a wrong pattern fails the comparator)`] = !same(d, MAJOR);
    verdicts[`${key} A harmonic minor reads "${hm.letters}" over "${hm.semitones}" (the three-semitone step is W+H)`] = same(hm, { letters: 'W H W W H W+H H', semitones: '2 1 2 2 1 3 1' });
    verdicts[`${key} F# major (controls: no) has the same row as C major: the pattern follows the type, not the tonic`] = same(fixed, MAJOR);
    verdicts[`${key} the seven chips are one line, do not overlap, lie inside the row and the row inside the pane (chip ${c.chipWidth} x ${c.chipH} px)`] = [c, d, hm, fixed].every((b: any) => b.oneLine && b.noOverlap && b.insideRow && b.rowInPane);
    verdicts[`${key} no chip's text is clipped, W+H included (${hm.widest.toFixed(1)} px of a ${hm.chipWidth} px chip)`] = [c, d, hm, fixed].every((b: any) => b.clipped.length === 0) && hm.widest <= hm.chipWidth;
    verdicts[`${key} a half tone's letter is another colour (${c.halfColour}) than a whole tone's (${c.wholeColour})`] = !!c.halfColour && !!c.wholeColour && c.halfColour !== c.wholeColour;
    verdicts[`${key} the text is the UI small size (${c.fontSize} px), readable`] = c.fontSize >= 11;
    verdicts[`${key} show: without intervals, chord mode and free mode have no row`] = off.mounted && off.row === null && chord.mounted && chord.row === null && free.mounted && free.row === null;
    verdicts[`${key} CONTROL: the off-switch comparator can fail (the default block does have a row)`] = c.row !== null;
    verdicts[`${key} nothing overflows the pane or the page`] = [c, d, hm, fixed, off, chord, free].every((b: any) => !b.overflow.root && !b.overflow.rootRight && !b.overflow.page);
    verdicts[`${key} no page errors`] = (out[key].errors ?? []).length === 0;

    const top = await p.ev(`document.getElementById('wrap-hm').getBoundingClientRect().top`);
    const bottom = await p.ev(`document.getElementById('wrap-hm').getBoundingClientRect().bottom`);
    await p.shot(path.join(SHOTS, `scale-intervals-${width}.png`), { x: 0, y: Math.max(0, top - 330), width: width + 40, height: bottom - top + 340 });
  } finally { p.close(); }
}

fs.writeFileSync(path.join(here, 'scale-intervals-measurements.json'), JSON.stringify({ out, verdicts }, null, 2));
let failed = 0;
for (const [name, ok] of Object.entries(verdicts)) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
console.log(`${Object.keys(verdicts).length - failed}/${Object.keys(verdicts).length} verdicts`);
process.exit(failed ? 1 : 0);
