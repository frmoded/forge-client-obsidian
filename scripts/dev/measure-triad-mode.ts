// 2026-11-05-1188 (Scale Explorer: `mode: triad`) in real Chrome: the plugin's own mountScaleBlock (mode triad) + its REAL Verovio staff drawer (renderStaff), only the SOUND a test double, under Obsidian's own app.css and the plugin's
// styles.css, in the widget a code block builds, at 640 and 300 px. Each verdict can fail:
//   * the scale staff is a real engraving of the 8 notes; the picked triad's three noteheads are coloured (the root another colour than the third and the fifth, both another than a plain notehead) and carry 1, 3, 5 placed under
//     their noteheads inside the engraving; the triad's own staff is ONE chord of three noteheads;
//   * a REAL mouse click on the engraved 3rd notehead of the scale staff picks degree 3: "E minor: degrees 3, 5 and 7 of C major, the iii chord", E G B tinted on the piano, three noteheads on the triad staff; a REAL click a few pixels BESIDE
//     a notehead picks the nearest one; a REAL click on the chip for vi picks A minor (A C E on the piano, the numbers on the staff wrap: A, the octave C, E);
//   * vii° gives a diminished triad (B D F), harmonic minor's III an augmented one (C E G#, "+", a sharp in front of the G on the triad staff);
//   * the seven chips are one line, none clipped; the legend is there and visible; there is no seventh anywhere (a scan of the block's VISIBLE text: innerText, not the engraver's own <style> and credits); nothing overflows the pane or the page; no page errors;
//   * CONTROLS: the vii° piano keys compared with vi's expected keys differ; a plain notehead's colour is not the chosen one (the comparators can fail).
// Writes shots/triad-mode-*.png and triad-mode-measurements.json; exits 1 when a verdict is false. Build and run from the client repo root:
//   OUT=<dir>/harness-scale-explorer.js EDITION=music ENTRY=entry-scale-explorer.ts node scripts/dev/browser/build.mjs      (with app.css and plugin-styles.css = this repo's styles.css in <dir>)
//   node scripts/dev/measure-triad-mode.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const BLOCKS: Record<string, string> = {
  def: 'mode: triad',
  vi: 'mode: triad\ndegree: 6',
  vii: 'mode: triad\ncontrols: no\ndegree: 7',
  hm: 'tonic: A\nscale: harmonic minor\nmode: triad\ndegree: 3',
  clk: 'mode: triad',
  near: 'mode: triad',
  chip: 'mode: triad',
  bad: 'mode: triad\nsevenths: yes',
};
const page = (w: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="markdown-source-view mod-cm6 is-live-preview" style="width:${w}px;padding:12px"><div class="cm-editor"><div class="cm-scroller"><div class="cm-content" id="content" style="width:${w - 24}px;min-width:${w - 24}px">
${Object.keys(BLOCKS).map((id) => `<div class="cm-preview-code-block cm-embed-block markdown-rendered cm-lang-forge-scale" id="wrap-${id}" style="margin:10px 0"><div class="block-language-forge-scale" id="blk-${id}"></div></div>`).join('\n')}
</div></div></div></div><script src="harness-scale-explorer.js"></script></body></html>`;

/** Everything read out of one mounted block, in the page. */
const READ = (id: string) => `(() => {
  const blk = document.getElementById('blk-${id}'); const root = blk.querySelector('.forge-scale');
  const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const pane = r(document.getElementById('content'));
  const err = blk.querySelector('.forge-scale-error');
  if (!root) return { id: '${id}', error: err ? err.textContent : null };
  const rootEl = r(root);
  const sStaff = root.querySelector('.forge-triad-scale-staff'); const tStaff = root.querySelector('.forge-triad-chord-staff');
  const sNotes = sStaff ? [...sStaff.querySelectorAll('g.note')] : []; const tNotes = tStaff ? [...tStaff.querySelectorAll('g.note')] : [];
  const fillOf = (n) => { const u = n.querySelector('use'); return u ? getComputedStyle(u).fill : getComputedStyle(n).fill; };
  const marked = sNotes.map((n, i) => ({ i, role: n.getAttribute('data-role'), fill: fillOf(n), label: n.querySelector('text.forge-triad-label')?.textContent ?? null })).filter((m) => m.role);
  const plain = sNotes.filter((n) => !n.getAttribute('data-role')).map(fillOf)[0] ?? null;
  const labels = sNotes.filter((n) => n.querySelector('text.forge-triad-label')).map((n) => { const head = r(n.querySelector('g.notehead') ?? n); const t = r(n.querySelector('text.forge-triad-label')); const svg = r(sStaff.querySelector('svg')); return { w: t.w, h: t.h, below: t.t >= head.b - 2, insideSvg: t.l >= svg.l - 1 && t.r <= svg.r + 1 && t.b <= svg.b + 1 && t.t >= svg.t - 1, size: parseFloat(getComputedStyle(n.querySelector('text.forge-triad-label')).fontSize), headW: head.w }; });
  const keys = [...root.querySelectorAll('rect[data-midi]')];
  const keyFill = (k) => getComputedStyle(k).fill;
  const on = keys.filter((k) => k.classList.contains('is-triad')).map((k) => +k.getAttribute('data-midi')).sort((a, b) => a - b);
  const rootKey = keys.filter((k) => k.classList.contains('is-triad-root')).map((k) => +k.getAttribute('data-midi'));
  const tintFill = keys.filter((k) => k.classList.contains('is-in-key') && !k.classList.contains('is-triad') && k.classList.contains('forge-piano-key-white')).map(keyFill)[0];
  const plainWhite = keys.filter((k) => !k.classList.contains('is-in-key') && k.classList.contains('forge-piano-key-white')).map(keyFill)[0];
  const triadFill = keys.filter((k) => k.classList.contains('is-triad') && !k.classList.contains('is-triad-root')).map(keyFill)[0];
  const rootFill = keys.filter((k) => k.classList.contains('is-triad-root')).map(keyFill)[0];
  const chips = [...root.querySelectorAll('.forge-triad-chip')];
  const chipBoxes = chips.map(r);
  const legend = root.querySelector('.forge-triad-legend');
  const tSvg = tStaff ? tStaff.querySelector('svg') : null;
  const tAccidentals = tSvg ? [...tSvg.querySelectorAll('g.accid use')].map((u) => u.getAttribute('xlink:href') || u.getAttribute('href') || '') : [];
  return {
    id: '${id}', mounted: true, degree: root.getAttribute('data-degree'), readout: root.querySelector('.forge-triad-readout').textContent,
    scaleNotes: sNotes.length, triadNotes: tNotes.length, triadChords: tSvg ? tSvg.querySelectorAll('g.chord').length : 0, marked, plainFill: plain, labels, noteheadW: sNotes[0] ? r(sNotes[0].querySelector('g.notehead') ?? sNotes[0]).w : 0,
    triadSharps: tAccidentals.filter((h) => /E262/.test(h)).length,
    keys: { on, rootKey, tintFill, plainWhite, triadFill, rootFill },
    chips: { n: chips.length, numerals: chips.map((c) => c.getAttribute('data-numeral')), pressed: chips.map((c) => c.getAttribute('aria-pressed')), oneLine: new Set(chipBoxes.map((b) => Math.round(b.t))).size === 1, noOverlap: chipBoxes.every((b, i) => i === 0 || b.l >= chipBoxes[i - 1].r - 0.5), inPane: chipBoxes.every((b) => b.l >= pane.l - 0.5 && b.r <= pane.r + 0.5), clipped: [...root.querySelectorAll('.forge-triad-chip span')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent), h: chipBoxes[0].h },
    legend: { text: legend.textContent, w: r(legend).w, h: r(legend).h, inPane: r(legend).r <= pane.r + 0.5 && r(legend).l >= pane.l - 0.5 },
    text: root.innerText, sevenths: !!root.querySelector('.forge-scale-sevenths'),
    overflow: { root: root.scrollWidth > root.clientWidth + 1, rootRight: rootEl.r > pane.r + 0.5, page: document.documentElement.scrollWidth > innerWidth },
    staffError: root.querySelector('.forge-scale-staff-error')?.textContent ?? null,
  };
})()`;

/** The centre (and size) of the n-th notehead of a block's scale staff, in page coordinates. */
const NOTE = (id: string, n: number) => `(() => { const s = document.querySelector('#blk-${id} .forge-triad-scale-staff'); const note = s.querySelectorAll('g.note')[${n}]; const b = (note.querySelector('g.notehead') ?? note).getBoundingClientRect(); return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, w: b.width, h: b.height, right: b.right }; })()`;
const CHIP = (id: string, n: number) => `(() => { const c = document.querySelectorAll('#blk-${id} .forge-triad-chip')[${n}].getBoundingClientRect(); return { x: (c.left + c.right) / 2, y: (c.top + c.bottom) / 2 }; })()`;

const out: any = {};
const verdicts: Record<string, boolean> = {};
const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

for (const width of [640, 300]) {
  const key = `w${width}`;
  const p = await openPage({ dir: here, width: width + 40, height: 9000, pageHtml: page(width), routes: {} });
  try {
    await sleep(500);
    for (const [id, src] of Object.entries(BLOCKS)) await p.ev(`window.__mount(document.getElementById('blk-${id}'), ${JSON.stringify(src)})`);
    await sleep(500);
    const m: any = out[key] = {};
    for (const id of Object.keys(BLOCKS)) m[id] = await p.ev(READ(id));
    const { def, vi, vii, hm } = m;

    verdicts[`${key} default block: the scale staff is an engraving of ${def.scaleNotes} notes, the triad staff ONE chord of ${def.triadNotes} noteheads, no staff error`] = def.scaleNotes === 8 && def.triadNotes === 3 && def.triadChords === 1 && !def.staffError;
    verdicts[`${key} default pick (degree 1): "${def.readout}", the chip I pressed, the piano keys ${def.keys.on.join(' ')} with the root ${def.keys.rootKey.join(' ')}`] = def.readout === 'C major: degrees 1, 3 and 5 of C major, the I chord' && same(def.keys.on, [60, 64, 67]) && same(def.keys.rootKey, [60]) && def.chips.pressed[0] === 'true';
    verdicts[`${key} three noteheads are marked root / third / fifth, they carry 1, 3, 5 and no other notehead carries a number`] = same(def.marked.map((x: any) => x.i), [0, 2, 4]) && def.marked.map((x: any) => x.role).join() === 'root,third,fifth' && def.marked.map((x: any) => x.label).join('') === '135' && def.labels.length === 3;
    verdicts[`${key} the marked noteheads are coloured: the root (${def.marked[0].fill}) is not the third and fifth's colour (${def.marked[1].fill}), and neither is a plain notehead's (${def.plainFill})`] = def.marked[0].fill !== def.marked[1].fill && def.marked[1].fill === def.marked[2].fill && def.marked[0].fill !== def.plainFill && def.marked[1].fill !== def.plainFill;
    verdicts[`${key} CONTROL: a plain notehead's fill is NOT the chosen colour (the colour comparator can fail)`] = def.plainFill !== def.marked[1].fill;
    verdicts[`${key} the 1, 3, 5 are drawn under their noteheads, inside the engraving, large enough to read (${def.labels[0].size.toFixed(1)} px for a ${def.noteheadW.toFixed(1)} px notehead)`] = def.labels.every((l: any) => l.below && l.insideSvg && l.w > 0 && l.size > 0);
    verdicts[`${key} the piano: the triad keys, the root key and the scale's other keys have three different colours (${def.keys.rootFill} / ${def.keys.triadFill} / ${def.keys.tintFill}) and a plain key a fourth (${def.keys.plainWhite})`] = new Set([def.keys.rootFill, def.keys.triadFill, def.keys.tintFill, def.keys.plainWhite]).size === 4;
    verdicts[`${key} vi in C major: "${vi.readout}", the keys ${vi.keys.on.join(' ')} (A C E), the staff marks ${vi.marked.map((x: any) => x.i).join(' ')} (A, E, and the octave C that is past the top)`] = vi.readout === 'A minor: degrees 6, 1 and 3 of C major, the vi chord' && same(vi.keys.on, [69, 72, 76]) && same(vi.marked.map((x: any) => x.i), [2, 5, 7]) && vi.triadNotes === 3;
    verdicts[`${key} CONTROL: vi's keys compared with vii°'s are NOT equal (a wrong triad fails the comparator): ${vi.keys.on.join(' ')} vs ${vii.keys.on.join(' ')}`] = !same(vi.keys.on, vii.keys.on);
    verdicts[`${key} vii° gives a diminished triad: "${vii.readout}", B D F on the piano, three noteheads on the triad staff`] = vii.readout === 'B diminished: degrees 7, 2 and 4 of C major, the vii° chord' && same(vii.keys.on, [71, 74, 77]) && vii.triadNotes === 3;
    verdicts[`${key} A harmonic minor degree 3 is augmented: "${hm.readout}", C E G# on the piano (${hm.keys.on.join(' ')}), a sharp in front of the G on the triad staff (${hm.triadSharps})`] = hm.readout === 'C augmented: degrees 3, 5 and 7 of A harmonic minor, the III+ chord' && same(hm.keys.on, [72, 76, 80]) && hm.triadSharps === 1;

    // REAL mouse: a click on the engraved 3rd notehead
    const n3 = await p.ev(NOTE('clk', 2));
    await p.click(n3.x, n3.y); await sleep(900);
    const clk = out[key].clkAfter = await p.ev(READ('clk'));
    verdicts[`${key} a REAL mouse click on the engraved 3rd notehead (${n3.w.toFixed(1)} x ${n3.h.toFixed(1)} px) picks degree 3: "${clk.readout}"`] = clk.readout === 'E minor: degrees 3, 5 and 7 of C major, the iii chord' && clk.degree === '3';
    verdicts[`${key} ... and E G B are tinted on the piano, the chip iii is pressed, the triad staff has ${clk.triadNotes} noteheads, the three marked noteheads moved to ${clk.marked.map((x: any) => x.i).join(' ')}`] = same(clk.keys.on, [64, 67, 71]) && clk.chips.pressed[2] === 'true' && clk.triadNotes === 3 && same(clk.marked.map((x: any) => x.i), [2, 4, 6]) && clk.marked.map((x: any) => x.label).join('') === '135';

    // REAL mouse: a click beside a notehead picks the nearest
    const n5 = await p.ev(NOTE('near', 4));
    await p.click(n5.right + 4, n5.y); await sleep(900);
    const near = out[key].nearAfter = await p.ev(READ('near'));
    verdicts[`${key} a REAL click 4 px beside the 5th notehead picks the nearest, degree 5: "${near.readout}"`] = near.degree === '5' && same(near.keys.on, [67, 71, 74]);

    // REAL mouse: the chip for vi
    const c6 = await p.ev(CHIP('chip', 5));
    await p.click(c6.x, c6.y); await sleep(900);
    const chip = out[key].chipAfter = await p.ev(READ('chip'));
    verdicts[`${key} a REAL click on the chip "vi" picks A minor: "${chip.readout}", A C E on the piano`] = chip.readout === 'A minor: degrees 6, 1 and 3 of C major, the vi chord' && same(chip.keys.on, [69, 72, 76]) && chip.chips.pressed[5] === 'true';

    verdicts[`${key} the seven chips are one line, do not overlap, lie inside the pane, no text clipped (chip ${def.chips.h.toFixed(1)} px tall); numerals ${def.chips.numerals.join(' ')}`] = [def, vi, vii, hm].every((b: any) => b.chips.n === 7 && b.chips.oneLine && b.chips.noOverlap && b.chips.inPane && b.chips.clipped.length === 0) && def.chips.numerals.join(' ') === 'I ii iii IV V vi vii°';
    verdicts[`${key} the legend is there, whole, inside the pane (${def.legend.w.toFixed(0)} x ${def.legend.h.toFixed(0)} px)`] = [def, vi, vii, hm, clk].every((b: any) => b.legend.text === 'Roman numeral = the degree of the root. Capital = major triad, small = minor, ° = diminished, + = augmented.' && b.legend.w > 0 && b.legend.inPane);
    verdicts[`${key} NO seventh anywhere: no "seventh" and no "7ths" in any block, no digit 7 outside "degrees 7" for the picks of degrees 1 to 6, no 7ths switch`] = [def, vi, hm, clk, m.near, m.chip].every((b: any) => !/seventh|7ths/i.test(b.text) && !b.sevenths && !/7/.test(String(b.text).replace(/degrees \d, \d and \d/, ''))) && !/seventh|7ths/i.test(vii.text) && !vii.sevenths;
    verdicts[`${key} a block with a \`sevenths\` line shows the error sentence and mounts nothing`] = !m.bad.mounted && /mode: triad has no sevenths/.test(String(m.bad.error));
    verdicts[`${key} nothing overflows the pane or the page`] = [def, vi, vii, hm, clk, m.near, m.chip].every((b: any) => !b.overflow.root && !b.overflow.rootRight && !b.overflow.page);
    out[key].errors = await p.ev('window.__pageErrors');
    verdicts[`${key} no page errors`] = (out[key].errors ?? []).length === 0;

    const top = await p.ev(`document.getElementById('wrap-vi').getBoundingClientRect().top`);
    const bottom = await p.ev(`document.getElementById('wrap-vi').getBoundingClientRect().bottom`);
    await p.shot(path.join(SHOTS, `triad-mode-${width}.png`), { x: 0, y: Math.max(0, top - 10), width: width + 40, height: bottom - top + 20 });
    const t2 = await p.ev(`document.getElementById('wrap-hm').getBoundingClientRect().top`);
    const b2 = await p.ev(`document.getElementById('wrap-hm').getBoundingClientRect().bottom`);
    await p.shot(path.join(SHOTS, `triad-mode-${width}-harmonic.png`), { x: 0, y: Math.max(0, t2 - 10), width: width + 40, height: b2 - t2 + 20 });
  } finally { p.close(); }
}

fs.writeFileSync(path.join(here, 'triad-mode-measurements.json'), JSON.stringify({ out, verdicts }, null, 2));
let failed = 0;
for (const [name, ok] of Object.entries(verdicts)) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
console.log(`${Object.keys(verdicts).length - failed}/${Object.keys(verdicts).length} verdicts`);
process.exit(failed ? 1 : 0);
