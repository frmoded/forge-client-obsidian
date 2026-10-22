// Drain 2026-10-22-1700 — the REAL `_autoConnectOnLoad` (real onload wiring, real `connectVault` over a fake Pyodide host and a fake `requestUrl`, real `connectWithRetry`, real banner core),
// recording every panel line and every notice it makes. The question: what does a person see in the Forge panel at every Obsidian start?
//   unreachable / error engine  -> NOTHING in the panel and no notice (the line said itself that nothing the panel does needs the engine); the same text goes to the console at info level
//   ok / not_attempted          -> the green "vault auto-connected" line, unchanged
//   connectVault failing        -> the terminal failure: a notice AND a red panel line, unchanged
// Lifecycle: the banner is computed ONCE, at onload (frozen at setup, as before).
import assert from 'node:assert/strict';
import { test, before, afterEach } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { loadRealOnload, type LoadedPlugin } from './test-support/real-onload.ts';

let real: RealPlugin; let plugin: LoadedPlugin;
const base = () => ({
  vault: { adapter: { exists: async () => false, read: async () => '', getBasePath: () => '/vault' }, on: () => ({}), getMarkdownFiles: () => [], getAbstractFileByPath: () => null, configDir: '.obsidian' },
  workspace: { onLayoutReady: () => {}, on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getActiveFile: () => null },
  metadataCache: { on: () => ({}) }, plugins: {},
});
before(async () => {
  const win: any = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  real = await bundleRealPlugin();
  plugin = await loadRealOnload(real, base());
  // onload starts its OWN auto-connect (3 attempts, 1 s apart; here it fails: no host, no network). Let it finish so its late notice cannot leak into a test's recorder.
  await new Promise((r) => setTimeout(r, 2600));
});
afterEach(() => { real.setPyodideHost(null); (globalThis as any).__shimFns = {}; });

const TEXT = 'Forge: vault auto-connected (Pyodide only). Engine at http://localhost:8000 is unreachable (net::ERR_CONNECTION_REFUSED). Nothing you can do from the panel needs it — Run, Forge, Freeze and Sync edges all work without it.';

/** Run the real `_autoConnectOnLoad` with the engine's HTTP /connect answering as `http`, and return everything it did. */
async function run(http: 'ok' | 'unreachable' | 'error' | 'noPyodide' | 'inventoryThrows') {
  const panel: Array<[string, string]> = []; const notices: string[] = []; const info: string[] = []; const errors: string[] = [];
  plugin.target.app = base(); plugin.target.settings = { ...(plugin.target.settings ?? {}), serverUrl: 'http://localhost:8000' };
  plugin.target.forgeOutput = async (t: string, k: string) => { panel.push([t, k]); };
  plugin.target.notice = (t: string) => { notices.push(t); };
  const fns: Record<string, (...a: any[]) => any> = {};
  if (http === 'unreachable') fns.requestUrl = async () => { throw new Error('net::ERR_CONNECTION_REFUSED'); };
  else if (http === 'error') fns.requestUrl = async () => ({ status: 500, json: {} });
  else fns.requestUrl = async () => ({ status: 200, json: { snippets: {} } });
  (globalThis as any).__shimFns = fns;
  if (http === 'noPyodide') real.setPyodideHost(null);
  else real.setPyodideHost({ getInstance: async () => ({ getConnectInventory: async () => { if (http === 'inventoryThrows') throw new Error('inventory exploded'); return { snippets: {}, warnings: [] }; } }) } as any);
  const saved = { info: console.info, error: console.error, warn: console.warn, log: console.log };
  console.info = (...a: unknown[]) => { info.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  console.warn = console.log = () => {};
  try { await plugin.target._autoConnectOnLoad(); await new Promise((r) => setTimeout(r, 20)); } finally { Object.assign(console, saved); }
  return { panel, notices, info, errors };
}

test('THE REPORTED CASE: an unreachable localhost engine posts NOTHING to the Forge panel and no notice; the text goes to the console at info level', async () => {
  const r = await run('unreachable');
  assert.deepEqual(r.panel, [], 'no panel line (it used to be one red line at every start)');
  assert.deepEqual(r.notices, []);
  assert.deepEqual(r.info, [TEXT], 'the same text, once, for a developer');
});

test('a non-2xx engine answer is the same: nothing in the panel, the text (with its HTTP detail) in the console', async () => {
  const r = await run('error');
  assert.deepEqual(r.panel, []); assert.deepEqual(r.notices, []);
  assert.equal(r.info.length, 1);
  assert.match(r.info[0], /^Forge: vault auto-connected \(Pyodide only\)\. Engine at http:\/\/localhost:8000 is unreachable \(HTTP 500\)\./);
});

test('UNCHANGED: a reachable engine posts the one green success line to the panel (exactly the old message and kind), no notice, nothing at info level', async () => {
  const r = await run('ok');
  assert.deepEqual(r.panel, [['Forge: vault auto-connected to http://localhost:8000.', 'success']]);
  assert.deepEqual(r.notices, []); assert.deepEqual(r.info, []);
});

test('UNCHANGED: the HTTP-only path (no Pyodide host, status not_attempted) posts the same green success line', async () => {
  const r = await run('noPyodide');
  assert.deepEqual(r.panel, [['Forge: vault auto-connected to http://localhost:8000.', 'success']]);
  assert.deepEqual(r.notices, []);
});

test('UNCHANGED: a terminal connect failure (3 attempts) still posts the notice AND the red panel line — a real failure is never hidden', async () => {
  const r = await run('inventoryThrows');
  assert.equal(r.notices.length, 1, JSON.stringify(r.notices));
  assert.match(r.notices[0], /^Forge: vault auto-connect failed after 3 attempts — check that the engine is running \(see Forge panel for details\)\.$/);
  assert.deepEqual(r.panel, [['Forge auto-connect: http://localhost:8000 — inventory exploded', 'error']]);
  assert.deepEqual(r.info, []);
});
