// 2026-11-05-1182 (score_first M17a): a bar note's provenance sections in real headless Chrome under Obsidian's own app.css. (1) The REAL Beat Box tab (RhythmEditView) opens a bar that carries its `# Description` and `# Recipe`
// (a New bar's note, and an old-form fork run through "Refresh note links"), with the real widget in its sandboxed iframe, the real score-first check and the real engine behind /compute: both editions. (2) A REAL click on a step of the
// widget autosaves through the tab's own write path: the note then holds the new data AND a Description that counts the new hits ("Bar made in the Beat Box; 5 hits ..."), the frontmatter untouched, the origin kept. (3) The note's text
// shown the way Obsidian's reading view shows a note (the notes pane): its documented DOM (`markdown-preview-view markdown-rendered`, h1[data-heading], p, a.internal-link, pre > code) built by hand from the note's text - Obsidian's own
// markdown renderer cannot run outside Obsidian - so this measures the content and the layout under app.css, not Obsidian's parser. The verdicts, each of which can fail; the CONTROLS must:
//   * the Beat Box opens a bar with sections: the widget has its rows, the Score is drawn (music edition); a click saves, the Description says 5 hits, the json has the click, the frontmatter lines are unchanged;
//   * the reading view shows `Description`, its sentence, `Recipe`, its step, in that order above the json block; the fork's sentence and step carry an internal link to phrase_006; nothing overflows the pane;
//   * CONTROL 1: a bar with NO sections (as in any other vault) saved from the same tab by the same click gets NO sections - the note changes only in its json block;
//   * CONTROL 2: the reading-view check applied to that plain note reads false (a comparator that cannot fail proves nothing).
// Build and run (from the client repo root; <dir> holds app.css, plugin-styles.css, harness-music.js and harness-lean.js - see measure-kit-picker.ts for the two build lines):
//   node scripts/dev/measure-bar-provenance.ts <dir>      (writes <dir>/bar-provenance-measurements.json and <dir>/shots/bar-provenance-*.png; exits 1 when a verdict is false)
import fs from 'node:fs';
import path from 'node:path';
import { engine, compute } from '../../src/test-support/real-rhythm-engine.ts';
import { planNewBar } from '../../src/score-first-core.ts';
import { refreshBarNoteText } from '../../src/phrase-notes-core.ts';
import { formatRhythmJson } from '../../src/rhythm-edit-core.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const root = process.argv[2];
const SHOTS = path.join(root, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const WIDGET_FILE = process.env.RHYTHM_BOX_WIDGET_FILE ?? new URL('../../assets/vaults/music-theory/music_instruments/resources/html/rhythm_box.html', import.meta.url).pathname;
const WIDGET = fs.readFileSync(WIDGET_FILE, 'utf8');
const TOML = fs.readFileSync(new URL('../../test/fixtures/score-first/music-playground.forge.toml', import.meta.url), 'utf8');
const row = (hits: number[]) => Array.from({ length: 16 }, (_, i) => hits.includes(i));
const DATA = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: row([0, 8]), snare: row([4, 12]) } } as never;
const bar = (front: string) => `---\ntype: data\ncontent_type: json\n${front}---\n\n\`\`\`json\n${formatRhythmJson(DATA)}\n\`\`\`\n`;

const NEW_BAR = (planNewBar({ existingBasenames: [], exists: () => false }) as { content: string }).content;                     // what "New bar" writes now
const FORK = (refreshBarNoteText(bar('description: "bar_002 — forked from phrases/phrase_006 bar 3 to edit by hand. The phrase shows this bar instead of the generated one."\nforked_from: "phrases/phrase_006 bar 3"\n'), 'bar_002') as { text: string }).text;
const PLAIN = bar('description: "bar_001 — a one-bar rhythm for the Beat Box."\n');                                             // a bar of any other vault: no sections

const py = await engine();
const routes = {
  'POST /compute': async (q: any, r: any) => {
    let body = ''; for await (const ch of q) body += ch;
    const { data, title } = JSON.parse(body);
    try { const payload = compute(py, data, title); r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload })); }
    catch (e: any) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e) })); }
  },
};
const W = Number(process.env.PANE_W ?? 700);
const page = (harness: string) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-rhythm-edit" style="width:${W}px;height:800px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content forge-rhythm-edit-view" id="pane" style="flex:1 1 0;min-height:0"></div></div>
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script>
<script src="${harness}"></script></body></html>`;

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A note's text as the reading view shows it: no frontmatter, no HTML comment, headings as h1[data-heading], wikilinks as a.internal-link, the fence as pre > code (Obsidian's documented DOM; the renderer itself cannot run here). */
function readingHtml(note: string): string {
  const body = note.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  const link = (s: string) => esc(s).replace(/\[\[([^\]]+)\]\]/g, (_m, n) => `<a data-href="${n}" href="${n}" class="internal-link" target="_blank" rel="noopener nofollow">${n}</a>`);
  const out: string[] = [];
  const parts = body.split(/\n(?=```json)/);
  for (const block of parts) {
    if (block.startsWith('```json')) { out.push(`<pre class="language-json"><code class="language-json is-loaded">${esc(block.replace(/^```json\n/, '').replace(/\n```\s*$/, ''))}</code></pre>`); continue; }
    for (const para of block.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
      const h = /^# (.+)$/.exec(para);
      out.push(h ? `<h1 data-heading="${esc(h[1])}" dir="auto" class="heading" id="${esc(h[1])}">${esc(h[1])}</h1>` : `<p dir="auto">${para.split('\n').map(link).join('<br>')}</p>`);
    }
  }
  return `<div class="markdown-reading-view" style="width:${W - 40}px;padding:12px"><div class="markdown-preview-view markdown-rendered" id="reading"><div class="markdown-preview-sizer markdown-preview-section">${out.join('')}</div></div></div>`;
}
const readingPage = (note: string) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">${readingHtml(note)}</body></html>`;

async function mountAndClick(harness: string, label: string, note: string) {
  const p = await openPage({ dir: root, width: W + 60, height: 880, pageHtml: page(harness), routes });
  const out: any = { label, noteBefore: note, noteAfter: note, errors: [] as string[], hasKick: false, hasSnare: false, scoreDrawn: false };
  try {
   try {
    await p.ev(`window.__mountTab(document.getElementById('pane'), { note: ${JSON.stringify(note)}, widget: ${JSON.stringify(WIDGET)}, toml: ${JSON.stringify(TOML)} })`);
    const step = async (ch: string, n: number) => p.findNode((nd: any, a: any) => /\bstep\b/.test(a.class ?? '') && a['data-channel'] === ch && a['data-step'] === String(n));
    for (let w = 0; w < 12000; w += 100) { if (await step('kick', 0)) break; await sleep(100); }
    await sleep(800);
    out.rowsBefore = await p.ev(`document.querySelector('iframe') ? 'iframe' : 'none'`);
    out.scoreDrawn = harness.includes('music') ? await (async () => { for (let w = 0; w < 15000; w += 100) { if (await p.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) return true; await sleep(100); } return false; })() : null;
    out.hasKick = !!(await step('kick', 0)); out.hasSnare = !!(await step('snare', 4));
    out.noteBefore = await p.ev('window.__note()');
    await p.shot(path.join(SHOTS, `bar-provenance-${label}-open.png`), { x: 0, y: 0, width: W + 60, height: 800 });
    const target = await step('kick', 2);                                            // an empty step: a real click adds a hit (4 -> 5)
    if (!target) throw new Error('the widget has no kick step to click (the tab did not open the bar)');
    const c = await p.boxCenter(target.nodeId);
    await p.click(c.x, c.y);
    for (let w = 0; w < 8000; w += 100) { if ((await p.ev('window.__note()')) !== out.noteBefore) break; await sleep(100); }
    await sleep(300);
    out.noteAfter = await p.ev('window.__note()');
    out.errors = (await p.ev('window.__errors.slice()')).filter((e: string) => !/resume|AudioContext|SoundFont|is not a constructor|forge-player/.test(e));
    await p.shot(path.join(SHOTS, `bar-provenance-${label}-saved.png`), { x: 0, y: 0, width: W + 60, height: 800 });
   } catch (e: any) { out.failure = String(e?.message ?? e).slice(0, 300); }       // a tab that does not open (or a step that is not there) is a FALSE verdict, never a crash
  } finally { p.close(); }
  return out;
}

async function reading(label: string, note: string) {
  const p = await openPage({ dir: root, width: W + 60, height: 700, pageHtml: readingPage(note), routes: {} });
  try {
    const r = await p.ev(`(() => {
      const el = document.getElementById('reading'); const kids = [...el.querySelector('.markdown-preview-sizer').children].map((c) => ({ tag: c.tagName, text: c.textContent.trim().slice(0, 90), links: [...c.querySelectorAll('a.internal-link')].map((a) => a.getAttribute('data-href')), top: Math.round(c.getBoundingClientRect().top) }));
      return { kids, overflowX: el.scrollWidth - el.clientWidth, fontSize: getComputedStyle(el.querySelector('p') || el).fontSize };
    })()`);
    await p.shot(path.join(SHOTS, `bar-provenance-${label}-reading.png`), { x: 0, y: 0, width: W + 60, height: 420 });
    return r;
  } finally { p.close(); }
}

const frontOf = (t: string) => t.slice(0, t.indexOf('\n---', 4) + 4);
const jsonOf = (t: string) => { try { return JSON.parse(/```json\n([\s\S]*?)\n```/.exec(t)![1]); } catch { return { channels: { kick: [], snare: [] } }; } };
/** The reading-view check: Description heading, its sentence, Recipe heading, its step - in that order, ahead of the json block - and (when linked) the internal link. */
const showsProvenance = (r: any, sentence: RegExp, step: RegExp, link: string | null) => {
  const k: any[] = r.kids; const idx = (f: (x: any) => boolean) => k.findIndex(f);
  const d = idx((x) => x.tag === 'H1' && x.text === 'Description'), s = idx((x) => x.tag === 'P' && sentence.test(x.text)), h = idx((x) => x.tag === 'H1' && x.text === 'Recipe'), t = idx((x) => x.tag === 'P' && step.test(x.text)), j = idx((x) => x.tag === 'PRE');
  const ordered = d >= 0 && s === d + 1 && h > s && t === h + 1 && j > t;
  const linked = link === null || (k[s]?.links ?? []).includes(link) && (k[t]?.links ?? []).includes(link);
  return ordered && linked && r.overflowX <= 0;
};

const results: any[] = [];
for (const edition of ['music', 'lean'] as const) {
  const harness = `harness-${edition}.js`;
  const made = await mountAndClick(harness, `${edition}-newbar`, NEW_BAR);
  const fork = await mountAndClick(harness, `${edition}-fork`, FORK);
  const plain = await mountAndClick(harness, `${edition}-plain`, PLAIN);
  const readMade = await reading(`${edition}-newbar`, made.noteAfter), readFork = await reading(`${edition}-fork`, fork.noteAfter), readPlain = await reading(`${edition}-plain`, plain.noteAfter);
  const v: Record<string, boolean> = {
    'the Beat Box tab opens a New bar with its sections: the widget has kick and snare rows': made.hasKick && made.hasSnare,
    'the Score is drawn above it (music edition; the lean edition has no Score)': edition === 'music' ? made.scoreDrawn === true : made.scoreDrawn === null,
    'a REAL click on a step saves: the json has 5 hits and the Description says "Bar made in the Beat Box; 5 hits in 16 steps, tempo 100."': jsonOf(made.noteAfter).channels.kick[2] === true && /\nBar made in the Beat Box; 5 hits in 16 steps, tempo 100\.\n/.test(made.noteAfter),
    'the frontmatter lines are unchanged by the save and the Recipe is still "Draw the bar in the Beat Box."': frontOf(made.noteAfter) === frontOf(made.noteBefore) && /\n# Recipe\n\nDraw the bar in the Beat Box\.\n/.test(made.noteAfter),
    'the fork opens and saves: its origin sentence, its Recipe step and its links: are unchanged by the save': fork.hasKick && /\nBar 3 of \[\[phrase_006\]\], forked to edit by hand\.\n/.test(fork.noteAfter) && /\nTake bar 3 of \[\[phrase_006\]\]\.\n/.test(fork.noteAfter) && /\nlinks:\n {2}- "\[\[phrase_006\]\]"\n/.test(fork.noteAfter) && jsonOf(fork.noteAfter).channels.kick[2] === true,
    'the reading view shows Description, its sentence, Recipe, its step, then the json block, nothing overflowing (New bar)': showsProvenance(readMade, /^Bar made in the Beat Box; 5 hits in 16 steps, tempo 100\.$/, /^Draw the bar in the Beat Box\.$/, null),
    'the reading view of the fork links [[phrase_006]] from the sentence AND the Recipe step': showsProvenance(readFork, /^Bar 3 of phrase_006, forked to edit by hand\.$/, /^Take bar 3 of phrase_006\.Change it in the Beat Box\.$/, 'phrase_006'),
    'CONTROL 1: a bar with NO sections, saved from the same tab by the same click, gets none: only its json block changed': jsonOf(plain.noteAfter).channels.kick[2] === true && !/# Description|# Recipe/.test(plain.noteAfter) && plain.noteAfter.slice(0, plain.noteAfter.indexOf('```json')) === plain.noteBefore.slice(0, plain.noteBefore.indexOf('```json')),
    'CONTROL 2: the reading-view check applied to that plain note reads false (the comparator can fail)': showsProvenance(readPlain, /^Bar made in the Beat Box/, /^Draw the bar/, null) === false,
    'no console errors in either page': [...made.errors, ...fork.errors, ...plain.errors].length === 0,
  };
  results.push({ edition, verdicts: v, made: { ...made, noteBefore: undefined }, fork: { ...fork, noteBefore: undefined }, readMade, readFork, readPlain });
  for (const [k, ok] of Object.entries(v)) console.log(`${ok ? 'PASS' : 'FAIL'}  [${edition}] ${k}`);
}
fs.writeFileSync(path.join(root, 'bar-provenance-measurements.json'), JSON.stringify({ widget: WIDGET_FILE, results }, null, 1));
const failed = results.flatMap((r) => Object.entries(r.verdicts).filter(([, ok]) => !ok).map(([k]) => `[${r.edition}] ${k}`));
console.log(failed.length ? `bar-provenance: ${failed.length} verdict(s) FALSE` : `bar-provenance: all ${results.reduce((n, r) => n + Object.keys(r.verdicts).length, 0)} verdicts true`);
process.exit(failed.length ? 1 : 0);
