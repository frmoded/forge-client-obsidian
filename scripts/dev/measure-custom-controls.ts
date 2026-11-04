// 2026-11-03-1160 (c): the controls of a CUSTOM note are drawn DISABLED with the tooltip `Custom Python: the controls are off for this note.`, in real headless Chrome under Obsidian's own app.css at 640 and 300 px: the real ArrangementView
// (kit rows: Mute, Solo, volume) over a custom arrangement and a plain one (the CONTROL), and the real phrase tab (mountPhrase) over a custom phrase and a plain one, with the real engine behind /phrase. REAL mouse clicks: a click on a
// custom note's Mute changes nothing and writes nothing; the same click on a plain note's Mute presses it and writes the note (so "nothing happened" can fail). The verdicts also read the computed look (opacity, cursor), the tooltip
// and that nothing overflows the pane at 300 px. Build the harness as measure-score-order.ts does (ENTRY=entry-score-order.ts into <dir>/harness-order.js, app.css and this build's styles.css as plugin-styles.css in <dir>) and run:
//   node scripts/dev/measure-custom-controls.ts <dir>     (writes <dir>/custom-controls-measurements.json and <dir>/shots/custom-controls-*.png; exits 1 when a verdict is false)
import fs from 'node:fs';
import path from 'node:path';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import { newArrangementNote, type ArrangementParams } from '../../src/arrangement-core.ts';
import { newKitNote } from '../../src/kit-core.ts';
import { noteContentFor } from '../../src/phrase-core.ts';
import { asCustom, pythonTextOf, CUSTOM_BANNER } from '../../src/phrase-notes-core.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const root = process.argv[2];
const SHOTS = path.join(root, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const fx = (n: string) => fs.readFileSync(new URL(`../../test/fixtures/score-first/${n}.md`, import.meta.url), 'utf8');
const extend = (source: string, bars: number): any => ({ kind: 'extend', source, bars, style: 'repeat_with_fills', tempo_change_pct: 0 });
const customOf = (text: string): string => { const py = pythonTextOf(text) as string; return asCustom(text.replace(py, `${py}\n  # the person's own line`)); };
const arr = (n: string) => newArrangementNote(n, { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] } as ArrangementParams);
const FILES: Record<string, string> = {
  'bars/bar_007.md': fx('bar_007'), 'bars/bar_008.md': fx('bar_008'),
  'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] } as any), 'kits/latin.md': newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] } as any),
  'phrases/phrase_003.md': noteContentFor('phrase_003', extend('bar_007', 4)), 'phrases/phrase_009.md': noteContentFor('phrase_009', extend('bar_008', 2)),
  'arrangements/arr_001.md': arr('arr_001'), 'arrangements/arr_900.md': customOf(arr('arr_900')),
};
const PHRASE_PLAIN = noteContentFor('phrase_001', extend('bar_007', 4));
const PHRASE_CUSTOM = customOf(noteContentFor('phrase_900', extend('bar_007', 4)));
const py = await engine();
const routes = { 'POST /phrase': async (q: any, r: any) => { let b = ''; for await (const c of q) b += c; const { data, params, title } = JSON.parse(b); try { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload: computePhrase(py, data, params, title) })); } catch (e: any) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e) })); } } };
const pageFor = (W: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos show-view-header">
${['arr-custom', 'arr-plain', 'phrase-custom', 'phrase-plain'].map((k) => `<div class="workspace-leaf-content" id="leaf-${k}" style="width:${W}px;border:1px solid #ccc"><div class="view-content ${k.startsWith('arr') ? 'forge-arrangement-view' : 'forge-phrase-view'}" id="pane-${k}" style="height:800px;overflow:auto"></div></div>`).join('\n')}
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script><script src="harness-order.js"></script></body></html>`;

const out: any = {};
for (const W of [640, 300]) {
  const p = await openPage({ dir: root, width: W + 60, height: 900, pageHtml: pageFor(W), routes });
  const r: any = {};
  try {
    await p.ev(`window.__messageDelivery.setScoreFirst(true); true`);
    const mountArr = async (id: string, file: string) => { await p.ev(`(async () => { await window.__mountArrangement(document.getElementById('pane-${id}'), { files: ${JSON.stringify(FILES)}, path: ${JSON.stringify(file)} }); return true; })()`); };
    await mountArr('arr-custom', 'arrangements/arr_900.md');
    await mountArr('arr-plain', 'arrangements/arr_001.md');
    for (const [id, text, name] of [['phrase-custom', PHRASE_CUSTOM, 'phrase_900'], ['phrase-plain', PHRASE_PLAIN, 'phrase_001']] as const) {
      await p.ev(`(async () => { await window.__mountPhrase(document.getElementById('pane-${id}'), { phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(fx('bar_007'))}, path: 'phrases/${name}.md', name: ${JSON.stringify(name)} }); return true; })()`);
    }
    await sleep(1500);
    const look = (id: string, sel: string) => p.ev(`(() => { const pane = document.getElementById('pane-${id}'); const cs = [...pane.querySelectorAll(${JSON.stringify(sel)})]; return { n: cs.length, disabled: cs.filter((c) => c.disabled).length, titled: cs.filter((c) => c.getAttribute('title') === ${JSON.stringify(CUSTOM_BANNER)}).length, opacity: cs.length ? getComputedStyle(cs[0]).opacity : null, cursor: cs.length ? getComputedStyle(cs[0]).cursor : null, overflowX: pane.scrollWidth - pane.clientWidth }; })()`);
    r.armCustom = await look('arr-custom', '.forge-arr-controls button, .forge-arr-controls input');
    r.armPlain = await look('arr-plain', '.forge-arr-controls button, .forge-arr-controls input');
    r.phraseCustom = await look('phrase-custom', '.forge-phrase-controls input, .forge-phrase-controls select');
    r.phrasePlain = await look('phrase-plain', '.forge-phrase-controls input, .forge-phrase-controls select');
    const click = async (id: string, sel: string) => {
      await p.ev(`document.querySelectorAll('.workspace-leaf-content').forEach((l) => { l.style.display = l.id === 'leaf-${id}' ? '' : 'none'; }); true`);          // only this tab is on the page: its controls are inside the viewport for a real click
      const c = await p.ev(`(() => { const b = document.getElementById('pane-${id}').querySelector(${JSON.stringify(sel)}); b.scrollIntoView({ block: 'center' }); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
      ((out as any).__hits ??= []).push(await p.ev(`(() => { const h = document.elementFromPoint(${c.x}, ${c.y}); return h ? h.className + ' in ' + (h.closest('[id^=pane-]')?.id ?? '?') : null; })()`));
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y }); await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 }); await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
      await sleep(900);
      await p.ev(`document.querySelectorAll('.workspace-leaf-content').forEach((l) => { l.style.display = ''; }); true`);
    };
    const state = (id: string) => p.ev(`(() => { const b = document.getElementById('pane-${id}').querySelector('.forge-arr-mute'); return { pressed: b.getAttribute('aria-pressed') }; })()`);
    await p.ev(`window.__processed = []; true`);
    await click('arr-custom', '.forge-arr-mute');
    r.customAfterClick = { ...(await state('arr-custom')), writes: await p.ev(`window.__processed.length`) };
    await p.ev(`window.__processed = []; true`);
    await click('arr-plain', '.forge-arr-mute');
    r.plainAfterClick = { ...(await state('arr-plain')), writes: await p.ev(`window.__processed.length`) };
    for (const id of ['arr-custom', 'arr-plain', 'phrase-custom']) {
      await p.ev(`document.querySelectorAll('.workspace-leaf-content').forEach((l) => { l.style.display = l.id === 'leaf-${id}' ? '' : 'none'; }); document.getElementById('pane-${id}').scrollTop = 0; true`);
      await sleep(250);
      const shot = await p.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, `custom-controls-${W}-${id}.png`), Buffer.from(shot.result.data, 'base64'));
    }
    r.errors = (await p.ev('window.__errors.slice()')).filter((e: string) => !/resume|AudioContext|SoundFont|is not a constructor|forge-player|midi/i.test(e));
  } finally { p.close(); }
  out[W] = r;
}
const v: Record<string, boolean> = {};
for (const W of [640, 300]) {
  const r = out[W];
  v[`@${W}: a CUSTOM arrangement's ${r.armCustom.n} kit controls are ALL disabled and ALL carry the tooltip "${CUSTOM_BANNER}"`] = r.armCustom.n >= 6 && r.armCustom.disabled === r.armCustom.n && r.armCustom.titled === r.armCustom.n;
  v[`@${W}: CONTROL: a plain arrangement's ${r.armPlain.n} controls are enabled and untitled`] = r.armPlain.n >= 6 && r.armPlain.disabled === 0 && r.armPlain.titled === 0;
  v[`@${W}: the disabled controls LOOK off (computed opacity ${r.armCustom.opacity} < the plain one's ${r.armPlain.opacity}; cursor ${r.armCustom.cursor})`] = Number(r.armCustom.opacity) < Number(r.armPlain.opacity) || r.armCustom.cursor === 'not-allowed';
  v[`@${W}: a REAL click on a custom note's Mute presses nothing (aria-pressed ${r.customAfterClick.pressed}) and writes nothing (${r.customAfterClick.writes} writes)`] = r.customAfterClick.pressed !== 'true' && r.customAfterClick.writes === 0;
  v[`@${W}: CONTROL: the same click on a plain note's Mute presses it (aria-pressed ${r.plainAfterClick.pressed}) and writes the note (${r.plainAfterClick.writes} write(s))`] = r.plainAfterClick.pressed === 'true' && r.plainAfterClick.writes >= 1;
  v[`@${W}: a CUSTOM phrase's strip (${r.phraseCustom.n} fields) is disabled with the tooltip; a plain phrase's (${r.phrasePlain.n}) is on`] = r.phraseCustom.n >= 3 && r.phraseCustom.disabled === r.phraseCustom.n && r.phraseCustom.titled === r.phraseCustom.n && r.phrasePlain.disabled === 0;
  v[`@${W}: nothing overflows the pane (custom arrangement ${r.armCustom.overflowX}, custom phrase ${r.phraseCustom.overflowX})`] = r.armCustom.overflowX <= 0 && r.phraseCustom.overflowX <= 0;
  v[`@${W}: no page errors`] = r.errors.length === 0;
}
fs.writeFileSync(path.join(root, 'custom-controls-measurements.json'), JSON.stringify({ out, verdicts: v }, null, 2));
for (const [k, ok] of Object.entries(v)) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}`);
process.exit(Object.values(v).every(Boolean) ? 0 : 1);
