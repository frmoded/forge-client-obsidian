// 2026-11-04-1170 (Scale Explorer 1 of 4) in real Chrome: the `forge-scale` block (the plugin's own mountScaleBlock + its real Verovio staff drawer, only the SOUND is a test double) under Obsidian's own app.css and the plugin's styles.css, inside the DOM Obsidian's Live Preview
// builds for a code-block widget (div.cm-preview-code-block.cm-embed-block.markdown-rendered.cm-lang-forge-scale > div.block-language-forge-scale), at 640 and 300 px. Each verdict can fail:
//   * the highlighted keys are the scale's (8 = 7 pitch classes + the octave), the root keys are marked and differ in colour from the other highlighted keys and from a plain key, each carries its degree number 1..8 inside its own key;
//   * CONTROL: the same read of D dorian compared with D major's expected keys is false (a wrong scale fails the comparator);
//   * the staff is a real engraving with 8 notes; C# major has 7 sharps in its key signature, F major one flat, C major none (and no accidentals in front of the notes for C# and F);
//   * a REAL click on Play together reaches the sound double with the 8 notes at once; firing the hooks lights the piano keys (colour changes) and the end puts them out; a second click stops;
//   * every highlighted key is inside the piano scroller's visible area at its opening scroll; the piano is 146 px tall (medium); nothing overflows the pane or the page; no page errors;
//   * a bad source shows the inline error naming the bad value, within the pane; `controls: no` has no dropdown and no button.
// Writes shots/scale-explorer-*.png and scale-explorer-measurements.json; exits 1 when a verdict is false. Build and run from the client repo root:
//   OUT=<dir>/harness-scale-explorer.js EDITION=music ENTRY=entry-scale-explorer.ts node scripts/dev/browser/build.mjs      (with app.css and plugin-styles.css = this repo's styles.css in <dir>)
//   node scripts/dev/measure-scale-explorer.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';
import { scaleNotes } from '../../src/scale-explorer-core.ts';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const BLOCKS: Record<string, string> = {
  c: '',
  cs: 'tonic: C#',
  f: 'tonic: F',
  d: 'tonic: D\nscale: dorian',
  fixed: 'tonic: A\nscale: harmonic minor\ncontrols: no',
  bad: 'tonic: C\nscale: blues',
};
const page = (w: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="markdown-source-view mod-cm6 is-live-preview" style="width:${w}px;padding:12px"><div class="cm-editor"><div class="cm-scroller"><div class="cm-content" id="content" style="width:${w - 24}px;min-width:${w - 24}px">
${Object.keys(BLOCKS).map((id) => `<div class="cm-preview-code-block cm-embed-block markdown-rendered cm-lang-forge-scale" id="wrap-${id}" style="margin:10px 0"><div class="block-language-forge-scale" id="blk-${id}"></div></div>`).join('\n')}
</div></div></div></div><script src="harness-scale-explorer.js"></script></body></html>`;

/** Everything read out of one mounted block, in the page. */
const READ = (id: string) => `(() => {
  const blk = document.getElementById('blk-${id}'); const wrap = document.getElementById('wrap-${id}'); const root = blk.querySelector('.forge-scale');
  const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const pane = r(document.getElementById('content'));
  const err = blk.querySelector('.forge-scale-error');
  if (!root) return { id: '${id}', error: err ? { text: err.textContent, rect: r(err), withinPane: r(err).r <= pane.r + 0.5 && r(err).l >= pane.l - 0.5 } : null, wrapRect: r(wrap) };
  const keys = [...root.querySelectorAll('rect[data-midi]')];
  const scale = keys.filter((k) => k.classList.contains('is-scale'));
  const fill = (k) => getComputedStyle(k).fill;
  const sc = root.querySelector('.forge-piano-scroller'); const scr = r(sc);
  const labels = [...root.querySelectorAll('text.forge-scale-degree')].map((t) => { const key = root.querySelector('rect.is-scale[data-degree="' + t.getAttribute('data-degree') + '"]'); const tb = r(t), kb = r(key); const cx = (tb.l + tb.r) / 2, cy = (tb.t + tb.b) / 2; return { text: t.textContent, insideKey: cx >= kb.l && cx <= kb.r && cy >= kb.t && cy <= kb.b, fill: getComputedStyle(t).fill }; });
  const staff = root.querySelector('.forge-scale-staff svg');
  const useIds = (sel) => staff ? [...staff.querySelectorAll(sel + ' use')].map((u) => u.getAttribute('xlink:href') || u.getAttribute('href') || '') : [];
  const keySig = useIds('g.keySig');
  const noteAccids = useIds('g.note g.accid');
  const rootEl = root.getBoundingClientRect();
  return {
    id: '${id}', tonic: root.getAttribute('data-tonic'), scale: root.getAttribute('data-scale'),
    allKeys: keys.length, midis: scale.map((k) => +k.getAttribute('data-midi')).sort((a, b) => a - b), pitchClasses: new Set(scale.map((k) => +k.getAttribute('data-midi') % 12)).size,
    rootMidis: keys.filter((k) => k.classList.contains('is-root')).map((k) => +k.getAttribute('data-midi')).sort((a, b) => a - b),
    scaleFill: scale.filter((k) => !k.classList.contains('is-root')).map(fill)[0], rootFill: keys.filter((k) => k.classList.contains('is-root')).map(fill)[0],
    plainWhiteFill: fill(keys.find((k) => !k.classList.contains('is-scale') && k.classList.contains('forge-piano-key-white'))), plainBlackFill: fill(keys.find((k) => !k.classList.contains('is-scale') && k.classList.contains('forge-piano-key-black'))),
    labels, scrollerScrollLeft: sc.scrollLeft, scrollerScrollable: sc.scrollWidth > sc.clientWidth + 1,
    scaleKeysVisible: scale.every((k) => { const b = r(k); return b.l >= scr.l - 1 && b.r <= scr.r + 1; }),
    pianoHeight: +root.querySelector('svg.forge-scale-svg').getAttribute('height'), widgetHeight: rootEl.height, widgetWidth: rootEl.width,
    staff: staff ? { notes: staff.querySelectorAll('g.note').length, keySigSharps: keySig.filter((h) => /E262/.test(h)).length, keySigFlats: keySig.filter((h) => /E260/.test(h)).length, noteAccidentals: noteAccids.length, w: r(staff).w, h: r(staff).h, withinPane: r(staff).r <= pane.r + 0.5 } : null,
    staffError: root.querySelector('.forge-scale-staff-error')?.textContent ?? null,
    caption: root.querySelector('.forge-scale-caption').textContent,
    controls: { selects: root.querySelectorAll('select').length, buttons: [...root.querySelectorAll('button')].map((b) => b.textContent) },
    overflow: { root: root.scrollWidth > root.clientWidth + 1, rootRight: rootEl.right > pane.r + 0.5, page: document.documentElement.scrollWidth > innerWidth },
    wrapRect: r(wrap),
  };
})()`;

const expectedMidis = (tonic: string, type: any) => scaleNotes(tonic, type, 4).map((n) => n.midi).sort((a, b) => a - b);
const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const out: any = {};
const verdicts: Record<string, boolean> = {};

for (const width of [640, 300]) {
  const key = `w${width}`;
  const p = await openPage({ dir: here, width: width + 40, height: 1400, pageHtml: page(width), routes: {} });
  try {
    await sleep(500);
    for (const [id, src] of Object.entries(BLOCKS)) await p.ev(`window.__mount(document.getElementById('blk-${id}'), ${JSON.stringify(src)})`);
    await sleep(300);
    const m: any = out[key] = {};
    for (const id of Object.keys(BLOCKS)) m[id] = await p.ev(READ(id));
    const c = m.c, cs = m.cs, f = m.f, d = m.d;

    verdicts[`${key} C major: the highlighted keys are C D E F G A B C (8 keys, 7 pitch classes), the root marked on both Cs and on no other key`] = same(c.midis, expectedMidis('C', 'major')) && c.pitchClasses === 7 && same(c.rootMidis, [60, 72]);
    verdicts[`${key} the root key's colour differs from the other highlighted keys and both differ from a plain key (${c.rootFill} / ${c.scaleFill} / ${c.plainWhiteFill})`] = c.rootFill !== c.scaleFill && c.scaleFill !== c.plainWhiteFill && c.rootFill !== c.plainWhiteFill;
    verdicts[`${key} degree numbers 1 to 8, each inside its own key`] = c.labels.map((l: any) => l.text).join('') === '12345678' && c.labels.every((l: any) => l.insideKey);
    verdicts[`${key} D dorian: its keys are D dorian's (D E F G A B C D)`] = same(d.midis, expectedMidis('D', 'dorian'));
    verdicts[`${key} CONTROL: D dorian's keys compared with D major's expected keys are NOT equal (a wrong scale fails the comparator)`] = !same(d.midis, expectedMidis('D', 'major'));
    verdicts[`${key} C major staff: a real engraving, 8 notes, no sharps or flats in the key signature, no staff error`] = !!c.staff && c.staff.notes === 8 && c.staff.keySigSharps === 0 && c.staff.keySigFlats === 0 && c.staffError === null;
    verdicts[`${key} C# major staff: 8 notes, 7 sharps in the key signature, no accidental in front of any note`] = !!cs.staff && cs.staff.notes === 8 && cs.staff.keySigSharps === 7 && cs.staff.keySigFlats === 0 && cs.staff.noteAccidentals === 0 && same(cs.midis, expectedMidis('C#', 'major'));
    verdicts[`${key} F major staff: 8 notes, one flat in the key signature, no accidental in front of any note`] = !!f.staff && f.staff.notes === 8 && f.staff.keySigFlats === 1 && f.staff.keySigSharps === 0 && f.staff.noteAccidentals === 0 && same(f.midis, expectedMidis('F', 'major'));
    verdicts[`${key} every highlighted key is inside the piano's visible area at its opening scroll (scrolled to ${c.scrollerScrollLeft} px)`] = [c, cs, f, d].every((b: any) => b.scaleKeysVisible);
    verdicts[`${key} the piano scrolls (88 keys) and is ${c.pianoHeight} px tall (medium: 120 to 150)`] = c.scrollerScrollable && c.pianoHeight >= 120 && c.pianoHeight <= 150;
    verdicts[`${key} nothing overflows the pane or the page, the staff stays inside the pane`] = [c, cs, f, d, m.fixed].every((b: any) => !b.overflow.root && !b.overflow.rootRight && !b.overflow.page) && [c, cs, f].every((b: any) => b.staff.withinPane);
    verdicts[`${key} a bad source shows the inline error naming the bad value, inside the pane, and mounts no explorer`] = !!m.bad.error && /Scale explorer: scale must be one of .*\(got "blues"\)/.test(m.bad.error.text) && m.bad.error.withinPane;
    verdicts[`${key} controls: no draws the picture with no dropdown and no button`] = m.fixed.controls.selects === 0 && m.fixed.controls.buttons.length === 0 && m.fixed.midis.length === 8;
    verdicts[`${key} controls: yes has the two dropdowns and Play up / Play down / Play together`] = c.controls.selects === 2 && c.controls.buttons.join('|') === 'Play up|Play down|Play together';
    verdicts[`${key} the pane shows the caption naming the scale (${c.caption})`] = c.caption === 'C Major (Ionian): C D E F G A B C';

    // A REAL click on Play together (block c): the sound double hears it, with all 8 notes at once.
    const before = await p.ev('window.__sound.plays.length');
    const btn = await p.ev(`(() => { const b = document.querySelector('#blk-c button[data-mode="together"]'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b }; })()`);
    await p.click(btn.x, btn.y); await sleep(150);
    const play = await p.ev(`(() => { const s = window.__sound; const e = s.plays[s.plays.length - 1]?.events ?? []; return { plays: s.plays.length, midis: e.map((x) => x.midi).sort((a, b) => a - b), allAtOnce: e.every((x) => x.startMs === 0), label: document.querySelector('#blk-c button[data-mode="together"]').textContent, stops: s.stops }; })()`);
    verdicts[`${key} a real click on Play together starts the sound: 1 play, the 8 notes at once, the button says Stop (target was the button: ${btn.hit})`] = btn.hit && play.plays === before + 1 && same(play.midis, expectedMidis('C', 'major')) && play.allAtOnce && play.label === 'Stop';
    await p.ev(`window.__fire('on', 60); window.__fire('on', 67); 0`); await sleep(100);
    const lit = await p.ev(`(() => { const k = (m) => document.querySelector('#blk-c rect[data-midi="' + m + '"]'); return { lit: [...document.querySelectorAll('#blk-c rect.is-playing')].map((e) => +e.getAttribute('data-midi')), fill60: getComputedStyle(k(60)).fill, fill64: getComputedStyle(k(64)).fill, fill67: getComputedStyle(k(67)).fill }; })()`);
    verdicts[`${key} the playing notes light on the piano (C4 and G4 lit: ${lit.fill60} / ${lit.fill67}, a note not playing keeps ${lit.fill64})`] = lit.lit.join() === '60,67' && lit.fill60 !== c.rootFill && lit.fill67 !== c.scaleFill && lit.fill64 === c.scaleFill && lit.fill60 === lit.fill67;
    await p.shot(path.join(SHOTS, `scale-explorer-${width}-playing.png`), { x: 0, y: await p.ev(`document.getElementById('wrap-c').getBoundingClientRect().top + scrollY - 8`), width: width + 40, height: Math.ceil(c.wrapRect.h) + 16 });
    const widthStop = await p.ev(`document.querySelector('#blk-c button[data-mode="together"]').getBoundingClientRect().width`);
    verdicts[`${key} the button keeps its width when its label becomes Stop (${btn.w.toFixed(1)} px before, ${widthStop.toFixed(1)} px after), so a second click at the same spot lands on it`] = Math.abs(btn.w - widthStop) < 0.5 && (await p.ev(`(() => { const b = document.querySelector('#blk-c button[data-mode="together"]').getBoundingClientRect(); return document.elementFromPoint(${btn.x}, ${btn.y}) === document.querySelector('#blk-c button[data-mode="together"]'); })()`));
    await p.click(btn.x, btn.y); await sleep(150);
    const stopped = await p.ev(`(() => ({ plays: window.__sound.plays.length, stops: window.__sound.stops, label: document.querySelector('#blk-c button[data-mode="together"]').textContent, lit: document.querySelectorAll('#blk-c rect.is-playing').length }))()`);
    verdicts[`${key} a second click stops it: no new play, the sound double was stopped, the lit keys are out, the button says Play together`] = stopped.plays === play.plays && stopped.stops > play.stops && stopped.lit === 0 && stopped.label === 'Play together';

    verdicts[`${key} no page errors`] = (await p.ev('window.__pageErrors.length')) === 0;
    out[key].pageErrors = await p.ev('window.__pageErrors');
    for (const id of Object.keys(BLOCKS)) {
      const y = await p.ev(`document.getElementById('wrap-${id}').getBoundingClientRect().top + scrollY - 8`); const h = Math.ceil(m[id].wrapRect.h) + 16;
      await p.shot(path.join(SHOTS, `scale-explorer-${width}-${id}.png`), { x: 0, y, width: width + 40, height: h });
    }
  } finally { await p.close?.(); }
}
out.verdicts = verdicts;
fs.writeFileSync(path.join(here, 'scale-explorer-measurements.json'), JSON.stringify(out, null, 2));
for (const [k, v] of Object.entries(verdicts)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
process.exit(Object.values(verdicts).every(Boolean) ? 0 : 1);
