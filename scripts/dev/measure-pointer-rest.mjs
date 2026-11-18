// 2026-11-19-0800 - "nothing appears, changes or opens because the pointer RESTS on something", proved in real headless Chrome with a REAL pointer (DevTools Input.dispatchMouseEvent mouseMoved): every bundled vault gadget (in the SHIPPED mount: a blob: URL inside
// <iframe sandbox="allow-scripts">) and the built website (a sample of its pages, served under /theory/). For each page: park the pointer in a corner, take a screenshot and a hash of the DOM, move the pointer over up to 60 interactive things (buttons, links, selects, keys, sectors, steps, summaries),
// park it again, and compare. Equal = the pointer changed nothing. A page whose own screenshot is not stable at rest (an animation) is reported, not failed.
//   node scripts/dev/measure-pointer-rest.mjs [--vault assets/vaults/music-theory] [--site <built site dir>] [--out <dir>]       exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/forge-client-obsidian/assets/vaults/music-theory')).replace(/^~/, os.homedir());
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/pointer-rest')).replace(/^~/, os.homedir());
const only = arg('--only', '');
fs.mkdirSync(OUT, { recursive: true });
const INSTRUMENT = `<script>(function () {
  var A = window.AudioContext;
  window.AudioContext = class extends A { createOscillator() { var o = super.createOscillator(), s = o.start.bind(o); o.start = function (t) { parent.postMessage({ hz: o.frequency.value, t: t }, '*'); return s(t); }; return o; } };
    window.addEventListener('error', function (e) { parent.postMessage({ err: String(e.message) }, '*'); });
  window.addEventListener('message', function (e) { if (e.data && e.data.q) { var r; try { r = (0, eval)(e.data.q); } catch (x) { r = 'ERR ' + x; } parent.postMessage({ a: e.data.id, r: r }, '*'); } });
})();</script>
`;
async function mount(file, width) {
  const served = fs.readFileSync(path.join(VAULT, file), 'utf8').replace('<script>', INSTRUMENT + '<script>');
  const host = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<iframe id="f" sandbox="allow-scripts" style="width:${width}px;height:900px;border:0;display:block"></iframe>
<script>
  window.__hz = []; window.__err = []; window.__ans = {}; var n = 0;
  window.addEventListener('message', function (e) { var d = e.data || {}; if (d.hz !== undefined) window.__hz.push(+d.hz.toFixed(2)); if (d.err) window.__err.push(d.err); if (d.a) window.__ans[d.a] = d.r; });
  window.probe = function (q) { var id = ++n; document.getElementById('f').contentWindow.postMessage({ q: q, id: id }, '*'); return new Promise(function (ok) { var t = setInterval(function () { if (id in window.__ans) { clearInterval(t); ok(window.__ans[id]); } }, 5); }); };
  document.getElementById('f').src = URL.createObjectURL(new Blob([${JSON.stringify(served).replace(/</g, '\\u003c')}], { type: 'text/html' }));
</script>`;
  const page = await openPage({ dir: VAULT, width: width + 20, height: 960, pageHtml: host });
  await sleep(700);
  const probe = (js) => page.ev(`window.probe(${JSON.stringify(js)})`);
  const centre = async (sel) => { const r = await probe(`(function () { var e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; var b = e.getBoundingClientRect(); return b.width > 0 ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`); if (!r || typeof r !== 'object') throw new Error(`no visible ${sel}`); return r; };
  const press = async (sel) => { const c = await centre(sel); await page.click(c.x, c.y); await sleep(120); };
  return {
    page, probe, press,
    height: () => probe('Math.ceil(document.body.getBoundingClientRect().height)'),
    hOverflow: () => probe('document.documentElement.scrollWidth - document.documentElement.clientWidth'),
    setHeight: (h) => page.ev(`document.getElementById('f').style.height = '${h}px'`),
    vScroll: () => probe('document.documentElement.scrollHeight - document.documentElement.clientHeight'),
    hz: () => page.ev('window.__hz.slice()'), clearHz: () => page.ev('window.__hz.length = 0'), errs: () => page.ev('window.__err.slice()'),
    shot: async (name, h) => { for (const scheme of ['light', 'dark']) { await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }); await sleep(120); await page.shot(path.join(OUT, `${name}-${scheme}.png`), { x: 0, y: 0, width, height: h }); } },
  };
}
const SITE = arg('--site', '').replace(/^~/, os.homedir());
const verdict = {}, numbers = { gadgets: 0, unstable: [], moved: {} };
const POINTS = `(function(){ var out = [], sel = 'button, a[href], select, input, summary, [role=button], [tabindex], iframe, .key, .seg, .step, .cell, .pt, g[data-letter]'; var all = document.querySelectorAll(sel); var seen = 0;
  for (var i = 0; i < all.length; i++) { var b = all[i].getBoundingClientRect(); if (b.width > 2 && b.height > 2 && b.top >= 0 && b.left >= 0 && b.bottom <= window.innerHeight && b.right <= window.innerWidth) out.push({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }); }
  var step = Math.max(1, Math.ceil(out.length / 60)); return out.filter(function (_, k) { return k % step === 0; }); })()`;
const HASH = `(function(){ var h = 7, t = document.documentElement.outerHTML; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return t.length + ':' + h; })()`;
async function rest(name, ev, shotPage, send) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }); await sleep(450);
  const a = (await shotPage.send('Page.captureScreenshot', { format: 'png' })).data; await sleep(300); const a2 = (await shotPage.send('Page.captureScreenshot', { format: 'png' })).data;
  if (a !== a2) { numbers.unstable.push(name); return; }
  const dom0 = await ev(HASH), pts = await ev(POINTS);
  for (const p of pts) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await sleep(90); }
  await sleep(500); const mid = (await shotPage.send('Page.captureScreenshot', { format: 'png' })).data;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }); await sleep(450);
  const b = (await shotPage.send('Page.captureScreenshot', { format: 'png' })).data, dom1 = await ev(HASH);
  numbers.moved[name] = pts.length;
  verdict[`${name}_pointerMovedOver${pts.length}ThingsChangedNothing`] = pts.length > 0 && a === b && dom0 === dom1;
  if (!(a === b && dom0 === dom1)) fs.writeFileSync(path.join(OUT, `${name.replace(/[^\w-]/g, '_')}-diff.json`), JSON.stringify({ domSame: dom0 === dom1, pixelsSame: a === b, midSame: a === mid }));
}
const gadgets = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\/resources\/html\/[^/]+\.html$/.test(p)) gadgets.push(path.relative(VAULT, p)); } }; walk(VAULT);
for (const f of gadgets.filter((x) => !only || x.includes(only))) {
  const g = await mount(f, 800); numbers.gadgets++;
  verdict[`${path.basename(f)}_noErrors`] = (await g.errs()).length === 0;
  await rest(path.basename(f), (js) => g.probe(js), g.page, (m, p) => g.page.send(m, p));
  g.page.close();
}
if (SITE) {
  const files = []; const w = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else files.push(p); } }; w(SITE);
  const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.png': 'image/png' };
  const routes = {};
  for (const f of files) {
    const rel = path.relative(SITE, f).split(path.sep).join('/'); const serve = (q, r) => { r.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' }); r.end(fs.readFileSync(f)); };
    routes[`GET /theory/${rel}`] = serve; if (rel.endsWith('/index.html')) routes[`GET /theory/${rel.slice(0, -'index.html'.length)}`] = serve;
  }
  const pages = files.filter((f) => f.endsWith('.html') && !f.includes('/assets/')).map((f) => path.relative(SITE, f).split(path.sep).join('/'));
  const withGadgets = pages.filter((r) => /<iframe/.test(fs.readFileSync(path.join(SITE, r), 'utf8'))).slice(0, 3);
  for (const rel of ['index.html', ...withGadgets]) {
    const page = await openPage({ dir: SITE, routes, width: 1100, height: 900, pageHtml: `<!doctype html><meta http-equiv="refresh" content="0;url=/theory/${rel}">` });
    await sleep(1500); const ev = (js) => page.ev(js); const name = `site_${rel.replace(/\/index\.html$/, '').replace(/[^\w]/g, '_') || 'home'}`;
    verdict[`${name}_loaded`] = (await ev('location.pathname')).startsWith('/theory/') && (await ev('document.querySelectorAll("a[href]").length')) > 3;
    await rest(name, ev, page, (m, p) => page.send(m, p));
    page.close();
  }
}
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(Object.fromEntries(Object.entries(verdict).filter(([, v]) => v !== true)), null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}; ${numbers.unstable.length} page(s) not stable at rest (reported, not failed)`);
process.exit(ok ? 0 : 1);
