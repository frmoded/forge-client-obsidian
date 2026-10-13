#!/usr/bin/env node
// Drain 2026-10-14-0900 §6 — measure, in REAL Chromium, what a widget iframe can still do under a given sandbox.
//
//   node scripts/probe-widget-sandbox.mjs              the shipped mount: blob: URL, sandbox="allow-scripts"
//   node scripts/probe-widget-sandbox.mjs --current    the OLD mount, for contrast: sandbox="allow-scripts allow-same-origin"
//   CHROME=/path/to/chrome node scripts/probe-widget-sandbox.mjs
//
// For each shipped widget (music-theory/music_instruments/resources/html/*.html): load it exactly as createSandboxedWidgetIframe does
// (blob URL, referrerpolicy no-referrer), then report whether the load event fired, whether the Rhythm Box's host handshake + load +
// request-data round trip works, whether the host can read the frame's document, and every console warning/error Chrome logged.
// Exit 0 when every widget loads and the Rhythm Box round trip works; 1 otherwise; 2 when no Chrome is available (a skipped probe
// is not a passing probe — it says so and exits non-zero).
//
// REAL TIME, deliberately: headless Chrome's --virtual-time-budget advances the page clock without waiting for the OTHER process an
// opaque-origin iframe lives in, so it reports a sandboxed frame as dead when it is merely not scheduled yet. This drives Chrome over
// the DevTools protocol on the wall clock instead.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FLAGS = process.argv.includes('--current') ? ['allow-scripts', 'allow-same-origin'] : ['allow-scripts'];
const WIDGET_DIRS = [
  path.resolve(ROOT, '../music-theory/music_instruments/resources/html'),
  path.join(ROOT, 'assets/vaults/music-theory/music_instruments/resources/html'),
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const embed = (o) => JSON.stringify(o).replace(/<\//g, '<\\/');

if (!fs.existsSync(CHROME)) { console.error(`probe-widget-sandbox: no Chrome at ${CHROME} (set CHROME=…) — NOT measured.`); process.exit(2); }
const dir = WIDGET_DIRS.find((d) => fs.existsSync(d));
if (!dir) { console.error('probe-widget-sandbox: widget directory not found'); process.exit(2); }

const pageFor = (html) => `<!doctype html><meta charset=utf-8><body><pre id="out">running…</pre><div id="host"></div>
<script>
const W = ${embed(html)};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const KICK = [true,false,false,false,false,false,true,false,false,false,false,false,true,false,false,false];
(async () => {
  const f = document.createElement('iframe'); f.style.cssText = 'width:800px;height:520px';
  ${JSON.stringify(FLAGS)}.forEach(x => f.sandbox.add(x));
  f.setAttribute('referrerpolicy', 'no-referrer');
  const inbox = []; let loaded = false;
  f.addEventListener('load', () => { loaded = true; });
  window.addEventListener('message', (e) => { if (e.source === f.contentWindow) inbox.push(e.data && e.data.type); });
  f.src = URL.createObjectURL(new Blob([W], {type: 'text/html;charset=utf-8'}));
  document.getElementById('host').appendChild(f);
  await sleep(2500);
  let roundTrip = null;
  if (inbox.includes('forge-rhythm-ready')) {
    f.contentWindow.postMessage({type:'forge-rhythm-load', mode:'playground', noteName:'p', data:{time_signature:'4/4',steps:16,group_size:4,swing_pct:0,tempo_bpm:100,channels:{kick:KICK}}}, '*');
    await sleep(400);
    const n = inbox.length; f.contentWindow.postMessage({type:'forge-rhythm-request-data'}, '*'); await sleep(400);
    roundTrip = inbox.slice(n).includes('forge-rhythm-current-data');
  }
  let canReadDoc; try { canReadDoc = !!f.contentDocument; } catch (e) { canReadDoc = false; }
  document.getElementById('out').textContent = JSON.stringify({ sandbox: f.getAttribute('sandbox'), loadEvent: loaded, handshake: inbox.includes('forge-rhythm-ready'), roundTrip, hostCanReadFrameDocument: canReadDoc });
})();
<\/script>`;

async function run(html) {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(pageFor(html)); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = 9300 + Math.floor(Math.random() * 600);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-sbx-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); } }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((ok) => ws.addEventListener('open', ok));
  let id = 0; const pending = new Map(); const logs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Log.entryAdded') logs.push(`${m.params.entry.level}: ${m.params.entry.text}`);
    else if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
  });
  const send = (method, params = {}) => new Promise((ok) => { const i = ++id; pending.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/` });
  let out = null;
  for (const t0 = Date.now(); Date.now() - t0 < 40000 && out === null;) {
    await sleep(500);
    const r = await send('Runtime.evaluate', { expression: "document.getElementById('out').textContent", returnByValue: true });
    const v = r.result?.result?.value;
    if (v && v !== 'running…') out = JSON.parse(v);
  }
  ws.close(); chrome.kill('SIGKILL'); srv.close();
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* best effort */ }
  return { out, logs };
}

let bad = 0;
console.log(`sandbox flags: ${FLAGS.join(' ')}   (blob: URL mount, real-time Chromium, widgets from ${dir})`);
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort()) {
  const { out, logs } = await run(fs.readFileSync(path.join(dir, file), 'utf8'));
  const warn = logs.filter((l) => /sandbox|escape|error|exception|refused|denied/i.test(l));
  const rhythm = file === 'rhythm_box.html';
  const ok = out !== null && out.loadEvent && (!rhythm || (out.handshake && out.roundTrip));
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file.padEnd(22)} ${out ? `load=${out.loadEvent}${rhythm ? ` handshake=${out.handshake} roundTrip=${out.roundTrip}` : ''} hostReadsFrameDocument=${out.hostCanReadFrameDocument}` : 'no result (timeout)'}`);
  for (const w of warn) console.log(`       console ${w.slice(0, 160)}`);
}
process.exit(bad ? 1 : 0);
