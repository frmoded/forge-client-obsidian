// WALL-CLOCK ONLY: nothing here uses virtual time (no Emulation.setVirtualTimePolicy, no fake timers); every number a proof reports is a real performance.now() in a real Chrome.
// Tiny Chrome DevTools helper: serve a directory + a page, drive headless Chrome, evaluate, hover, screenshot.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { spawn } from 'node:child_process';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function openPage({ dir, width = 900, height = 1200, pageHtml, routes = {} }) {
  const srv = http.createServer(async (q, r) => {
    if (routes[q.method + ' ' + q.url]) { await routes[q.method + ' ' + q.url](q, r); return; }
    if (q.url === '/' || q.url === '/index.html') { r.writeHead(200, { 'content-type': 'text/html' }); r.end(pageHtml); return; }
    const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'content-type': f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); } else { r.writeHead(404); r.end('no'); }
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = 9300 + Math.floor(Math.random() * 600); const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars=false', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  let targets = null; for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); } }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((ok) => ws.addEventListener('open', ok));
  let id = 0; const pending = new Map(); ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((ok) => { const i = ++id; pending.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/` }); await sleep(600);
  // Find an element INSIDE the (sandboxed, opaque-origin) widget iframe through the DevTools DOM tree (pierce: true), and act on it by its real box.
  const findNode = async (pred) => {
    const doc = (await send('DOM.getDocument', { depth: -1, pierce: true })).result.root;
    let hit = null;
    const walk = (n) => { if (hit) return; if (n.nodeType === 1 && pred(n, Object.fromEntries((n.attributes || []).reduce((a, v, i, arr) => (i % 2 ? a : [...a, [v, arr[i + 1]]]), [])))) { hit = n; return; } for (const c of [...(n.children || []), ...(n.contentDocument ? [n.contentDocument] : [])]) walk(c); };
    walk(doc);
    return hit;
  };
  const boxCenter = async (nodeId) => { const q = (await send('DOM.getBoxModel', { nodeId })).result.model.content; return { x: (q[0] + q[2] + q[4] + q[6]) / 4, y: (q[1] + q[3] + q[5] + q[7]) / 4 }; };
  const api = {
    findNode, boxCenter,
    click: async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(150); },
    attrs: async (nodeId) => { const a = (await send('DOM.getAttributes', { nodeId })).result.attributes; return Object.fromEntries(a.reduce((acc, v, i) => (i % 2 ? acc : [...acc, [v, a[i + 1]]]), [])); },
    ev, send, sleep,
    hover: async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(150); },
    shot: async (file, clip) => { const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); },
    close: () => { try { ws.close(); } catch {} chrome.kill('SIGKILL'); srv.close(); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} },
  };
  return api;
}
