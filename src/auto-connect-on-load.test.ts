// Drain 2026-10-22-1700, revised by drain 2026-10-22-1930 — the REAL `_autoConnectOnLoad` (real onload wiring, real `connectVault` over a fake Pyodide host, real `connectWithRetry`, real banner core),
// recording every panel line, notice and request it makes. The question: what does a person see in the Forge panel at every Obsidian start, and does start-up touch the HTTP engine?
//   in-process engine wired, connect ok -> the one green "vault auto-connected" line, NO request to serverUrl (engine-http-lazy.test.ts measures that against a really closed port)
//   no in-process engine (a dev workflow) -> nothing posted and no request: the HTTP engine is contacted when an operation first needs it
//   connectVault failing -> the terminal failure: a notice AND a red panel line, unchanged
// (The cases where the engine's HTTP /connect was unreachable or non-2xx are gone: start-up no longer sends that request. They used to leave one console line each; the new test pins that none does.)
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
  // onload starts its OWN auto-connect (3 attempts, 1 s apart; here it fails: the real host is not hydrated in a test). Let it finish so its late notice cannot leak into a test's recorder.
  await new Promise((r) => setTimeout(r, 2600));
});
afterEach(() => { real.setPyodideHost(null); (globalThis as any).__shimFns = {}; });

/** Run the real `_autoConnectOnLoad` and return everything it did. */
async function run(mode: 'ok' | 'noPyodide' | 'inventoryThrows') {
  const panel: Array<[string, string]> = []; const notices: string[] = []; const info: string[] = []; const errors: string[] = []; const requests: string[] = [];
  plugin.target.app = base(); plugin.target.settings = { ...(plugin.target.settings ?? {}), serverUrl: 'http://localhost:8000' };
  plugin.target.forgeOutput = async (t: string, k: string) => { panel.push([t, k]); };
  plugin.target.notice = (t: string) => { notices.push(t); };
  (globalThis as any).__shimFns = { requestUrl: async (o: { url: string }) => { requests.push(o.url); return { status: 200, json: { snippets: {} } }; } };
  if (mode === 'noPyodide') real.setPyodideHost(null);
  else real.setPyodideHost({ getInstance: async () => ({ getConnectInventory: async () => { if (mode === 'inventoryThrows') throw new Error('inventory exploded'); return { snippets: {}, warnings: [] }; } }) } as any);
  const saved = { info: console.info, error: console.error, warn: console.warn, log: console.log };
  console.info = (...a: unknown[]) => { info.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  console.warn = console.log = () => {};
  try { await plugin.target._autoConnectOnLoad(); await new Promise((r) => setTimeout(r, 20)); } finally { Object.assign(console, saved); }
  return { panel, notices, info, errors, requests };
}

test('UNCHANGED: a connected in-process engine posts the one green success line to the panel (exactly the old message and kind), no notice, no request, nothing at info level', async () => {
  const r = await run('ok');
  assert.deepEqual(r.panel, [['Forge: vault auto-connected to http://localhost:8000.', 'success']]);
  assert.deepEqual(r.notices, []); assert.deepEqual(r.info, []); assert.deepEqual(r.requests, []);
});

test('no in-process engine (dev workflow): start-up posts NOTHING, sends NO request, and says once at info level that the HTTP engine is contacted only when an operation needs it', async () => {
  const r = await run('noPyodide');
  assert.deepEqual(r.requests, [], 'start-up did not contact the HTTP engine');
  assert.deepEqual(r.panel, []); assert.deepEqual(r.notices, []);
  assert.deepEqual(r.info, ['Forge: no in-process engine wired; http://localhost:8000 is contacted only when an operation needs it.']);
});

test('UNCHANGED: a terminal connect failure (3 attempts) still posts the notice AND the red panel line — a real failure is never hidden', async () => {
  const r = await run('inventoryThrows');
  assert.equal(r.notices.length, 1, JSON.stringify(r.notices));
  assert.match(r.notices[0], /^Forge: vault auto-connect failed after 3 attempts — check that the engine is running \(see Forge panel for details\)\.$/);
  assert.deepEqual(r.panel, [['Forge auto-connect: http://localhost:8000 — inventory exploded', 'error']]);
  assert.deepEqual(r.info, []); assert.deepEqual(r.requests, []);
});
