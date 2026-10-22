// Drain 2026-10-22-1930 — the plugin must not contact the HTTP engine (`serverUrl`, localhost:8000 by default) at start, and no operation a person runs with the in-process engine (Pyodide)
// may need it. Measured on the REAL code paths: the real `ForgePlugin.prototype.onload` and `_autoConnectOnLoad`, the real `connectVault` / `computeSnippet` / `freezeEdge` /
// `syncDependencies`, a fake Pyodide host behind them, and a `requestUrl` that really tries the network against a port that is CLOSED (so a request is refused exactly as in the report:
// `ERR_CONNECTION_REFUSED`) and records every attempt. "No request" is the recorded list being empty, not a stub that was never asked.
import assert from 'node:assert/strict';
import net from 'node:net';
import { test, before, after, afterEach } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { loadRealOnload, type LoadedPlugin } from './test-support/real-onload.ts';

let real: RealPlugin; let closedPort: number; let serverUrl: string;
const attempts: Array<{ url: string; method?: string; outcome: string }> = [];
const base = () => ({
  vault: { adapter: { exists: async () => false, read: async () => '', getBasePath: () => '/vault' }, on: () => ({}), getMarkdownFiles: () => [], getAbstractFileByPath: () => null, configDir: '.obsidian' },
  workspace: { onLayoutReady: () => {}, on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getActiveFile: () => null },
  metadataCache: { on: () => ({}) }, plugins: {},
});

/** A port nothing listens on: bind, note the number, close. */
async function aClosedPort(): Promise<number> {
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); }); });
}
/** The shim's `requestUrl`: records the attempt, then REALLY tries the connection (refused, as in the driver's console). */
function realisticRequestUrl() {
  return async (o: { url: string; method?: string; throw?: boolean }) => {
    const rec = { url: o.url, method: o.method, outcome: 'pending' };
    attempts.push(rec);
    try { const r = await fetch(o.url, { method: o.method ?? 'GET' }); rec.outcome = `HTTP ${r.status}`; return { status: r.status, json: {} }; }
    catch (e) { rec.outcome = `refused: ${(e as Error).message}`; throw new Error('net::ERR_CONNECTION_REFUSED'); }
  };
}
const fakeHost = (calls: string[] = []) => ({
  getInstance: async () => ({
    getConnectInventory: async () => { calls.push('getConnectInventory'); return { snippets: {}, warnings: [] }; },
    computeViaEngine: async () => { calls.push('computeViaEngine'); return { result: 42, stdout: '' }; },
    setEdgeState: async () => { calls.push('setEdgeState'); },
    syncDependencies: async (_py: string, body: string) => { calls.push('syncDependencies'); return { dependencies: [], body }; },
  }),
});
const quiet = async <T>(fn: () => Promise<T>) => {
  const saved = { info: console.info, error: console.error, warn: console.warn, log: console.log };
  const lines: string[] = [];
  console.info = console.error = console.warn = console.log = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  try { return { value: await fn(), lines }; } finally { Object.assign(console, saved); }
};

before(async () => {
  const win: any = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  closedPort = await aClosedPort();
  serverUrl = `http://127.0.0.1:${closedPort}`;
  real = await bundleRealPlugin();
});
afterEach(() => { real.setPyodideHost(null); (globalThis as any).__shimFns = {}; attempts.length = 0; });
after(() => { (globalThis as any).__shimFns = {}; });

test('NON-VACUITY: the recorder really is asked, and the port really is closed (a request to it is recorded and refused)', async () => {
  (globalThis as any).__shimFns = { requestUrl: realisticRequestUrl() };
  const r = await quiet(() => real.connectVault(serverUrl, '/vault').then(() => 'resolved', (e: Error) => `rejected: ${e.message}`));
  // No Pyodide host: connectVault's HTTP path (the dev-mode route) POSTs /connect — so the harness can see a request when there is one.
  assert.equal(attempts.length, 1, JSON.stringify(attempts));
  assert.equal(attempts[0].url, `${serverUrl}/connect`);
  assert.match(attempts[0].outcome, /^refused/);
  assert.match(r.value, /^rejected: net::ERR_CONNECTION_REFUSED/);
});

test('STARTUP (the reported case): the real onload and its auto-connect, in-process engine wired, engine port closed -> NO request to serverUrl, the green success line unchanged, no "unreachable" line anywhere', async () => {
  (globalThis as any).__shimFns = { requestUrl: realisticRequestUrl() };
  const panel: Array<[string, string]> = []; const notices: string[] = [];
  const plugin: LoadedPlugin = await loadRealOnload(real, base());
  await new Promise((res) => setTimeout(res, 2600));                         // onload's OWN auto-connect (3 attempts, 1 s apart) finishes first, so its late failure line cannot leak into the recorder below
  real.setPyodideHost(fakeHost());                                           // onload wired the real (unhydrated) host; the in-process engine under test is the fake one
  plugin.target.settings = { ...(plugin.target.settings ?? {}), serverUrl };
  plugin.target.forgeOutput = async (t: string, k: string) => { panel.push([t, k]); };
  plugin.target.notice = (t: string) => { notices.push(t); };
  attempts.length = 0;                                                       // whatever onload's own start-up did is cleared; the explicit run below is measured on its own
  const r = await quiet(async () => { await plugin.target._autoConnectOnLoad(); await new Promise((res) => setTimeout(res, 50)); });
  assert.deepEqual(attempts, [], `startup contacted the engine: ${JSON.stringify(attempts)}`);
  assert.deepEqual(panel, [[`Forge: vault auto-connected to ${serverUrl}.`, 'success']]);
  assert.deepEqual(notices, []);
  assert.ok(!r.lines.some((l) => /unreachable|ERR_CONNECTION_REFUSED/.test(l)), `a console line still names the engine: ${r.lines.join(' | ')}`);
});

test('EVERY operation with the in-process engine wired works with the engine port closed and sends NO request: connect, Run / Forge (compute), Freeze, Sync dependencies', async () => {
  (globalThis as any).__shimFns = { requestUrl: realisticRequestUrl() };
  const calls: string[] = [];
  real.setPyodideHost(fakeHost(calls));
  const out = await quiet(async () => ({
    connect: await real.connectVault(serverUrl, '/vault'),
    compute: await real.computeSnippet(serverUrl, '/vault', 'hello', [], {}),
    freeze: await real.freezeEdge(serverUrl, '/vault', 'a', 'b', 'frozen'),
    sync: await real.syncDependencies('# Python\nx = 1\n'),
  }));
  assert.deepEqual(attempts, [], `an operation contacted the engine: ${JSON.stringify(attempts)}`);
  assert.deepEqual(calls, ['getConnectInventory', 'computeViaEngine', 'setEdgeState', 'syncDependencies']);
  assert.equal(out.value.compute.status, 200);
  assert.equal(out.value.freeze.status, 200);
  assert.equal(out.value.sync.status, 200);
  assert.equal((out.value.connect as { engine_http_status?: string }).engine_http_status, undefined, 'the connect result carries no engine-reachability field any more');
});

test('DEV MODE (no in-process engine): the HTTP route is unchanged and lazy — the first operation POSTs /connect, and a refused engine is a thrown error naming it (the message the caller shows), never swallowed', async () => {
  (globalThis as any).__shimFns = { requestUrl: realisticRequestUrl() };
  real.setPyodideHost(null);
  const r = await quiet(() => real.connectVault(serverUrl, '/vault').then(() => 'resolved', (e: Error) => `rejected: ${e.message}`));
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].url, `${serverUrl}/connect`);
  assert.equal(r.value, 'rejected: net::ERR_CONNECTION_REFUSED');
});

test('DEV MODE, the lazy failure is loud and plain: Run with no in-process engine and the HTTP engine refusing posts ONE notice naming the engine URL and the note, and it asked /connect exactly once, at that moment', async () => {
  (globalThis as any).__shimFns = { requestUrl: realisticRequestUrl() };
  const plugin: LoadedPlugin = await loadRealOnload(real, base());
  await new Promise((res) => setTimeout(res, 2600));                         // onload's own auto-connect finishes first
  real.setPyodideHost(null);
  plugin.target.settings = { ...(plugin.target.settings ?? {}), serverUrl };
  const notices: string[] = [];
  plugin.target.notice = (t: string) => { notices.push(t); };
  attempts.length = 0;
  await quiet(() => plugin.target.computeSnippetWithArgs('/vault', 'hello', [], {}));
  assert.equal(attempts.length, 1, JSON.stringify(attempts));
  assert.equal(attempts[0].url, `${serverUrl}/connect`);
  assert.equal(notices.length, 1, JSON.stringify(notices));
  assert.match(notices[0], new RegExp(`^Forge: connect failed — the engine at ${serverUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} did not answer, so hello could not run \\(net::ERR_CONNECTION_REFUSED\\)\\.$`));
});
