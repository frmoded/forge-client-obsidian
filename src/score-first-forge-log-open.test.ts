// score_first M4 follow-up (drain 2026-10-22-1610) — "Forge log (N)" and the deliberate Forge (hammer) click must OPEN the Forge panel in a score-first vault, and a click that cannot open it must say so.
//
// Driver evidence (real Obsidian, music-playground): with the panel closed, "Forge log (0)" did nothing; the hammer left no panel to Run from. These tests run the REAL wiring: the real
// `ForgePlugin.prototype.onload` (which registers the open-log handler and the commands), the real `mountScoreMessages` button wired to the bundle's own `messageDelivery`, the real
// `getOutputView` / `landAfterForge`, against the fake workspace of panel-reveal-characterization.test.ts. A regex over main.ts is NOT a behaviour test (the M4 pins were exactly that, and did not catch this).
// The P3 half (the tutorial vault's hammer path) is pinned to traces recorded from a worktree of commit 1300d14.
import assert from 'node:assert/strict';
import { test, before, afterEach } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { world } from './test-support/fake-panel-world.ts';
import { loadRealOnload, type LoadedPlugin } from './test-support/real-onload.ts';

let real: RealPlugin; let plugin: LoadedPlugin; let doc: any;
const baseApp = () => ({
  vault: { adapter: { exists: async () => false, read: async () => '' }, on: () => ({}), getMarkdownFiles: () => [], getAbstractFileByPath: () => null, configDir: '.obsidian' },
  workspace: { onLayoutReady: () => {}, on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getActiveFile: () => null },
  metadataCache: { on: () => ({}) }, plugins: {},
});
before(async () => {
  const win: any = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  doc = win.document;
  real = await bundleRealPlugin();
  plugin = await loadRealOnload(real, baseApp());
});
afterEach(() => { real.messageDelivery.setScoreFirst(false); (globalThis as any).__shimConstructed = []; });

function useWorld(kind: 'none' | 'collapsed' | 'expanded', opts: { collapsedSidebar?: boolean; setViewStateThrows?: boolean } = {}) {
  const w = world(real, kind, opts);
  if (opts.setViewStateThrows) {
    const orig = w.ws.getRightLeaf;
    w.ws.getRightLeaf = (s: boolean) => { const l = orig(s); l.setViewState = async () => { w.calls.push('leaf.setViewState(throws)'); throw new Error('boom: setViewState failed'); }; return l; };
  }
  plugin.target.app = { ...baseApp(), workspace: w.ws };
  plugin.target.refreshForgePanelStrip = async () => { w.calls.push('plugin.refreshForgePanelStrip'); };
  return w;
}
const tick = () => new Promise((r) => setTimeout(r, 40));
function mountButton() {
  const anchor = doc.createElement('div'); doc.body.appendChild(anchor);
  const m = real.mountScoreMessages(anchor, real.messageDelivery, { setTimer: () => 0, clearTimer: () => {} });
  return { button: doc.querySelector('.forge-rhythm-forge-log') as HTMLButtonElement, dispose: () => { m.dispose(); anchor.remove(); } };
}
function capture<T>(fn: () => Promise<T>) {
  const out = { log: [] as string[], error: [] as string[] };
  const saved = { log: console.log, error: console.error };
  console.log = (...a: unknown[]) => { out.log.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { out.error.push(a.map((x) => (x instanceof Error ? x.message : String(x))).join(' ')); };
  return fn().finally(() => { console.log = saved.log; console.error = saved.error; }).then(() => out);
}
/** score-first, panel closed, a person's gesture: the leaf is created, its sidebar is looked at (and unfolded if collapsed), then revealed. */
const OPENED = ['ws.getLeavesOfType(forge-output)', 'ws.getRightLeaf(false)', 'leaf.setViewState(forge-output,active=true)', 'leaf.getRoot', 'ws.revealLeaf(fresh)', 'plugin.refreshForgePanelStrip'];
/** every other vault: exactly commit 1300d14's creation path (no getRoot, no expand). */
const OPENED_OLD = ['ws.getLeavesOfType(forge-output)', 'ws.getRightLeaf(false)', 'leaf.setViewState(forge-output,active=true)', 'ws.revealLeaf(fresh)', 'plugin.refreshForgePanelStrip'];

test('GUARD: with the real onload wiring, clicking the real "Forge log (N)" button with the panel CLOSED creates and reveals the panel (this passes on the real functions: the fault is not in the wiring)', async () => {
  real.messageDelivery.setScoreFirst(true);
  const w = useWorld('none'); const b = mountButton();
  b.button.click(); await tick();
  assert.deepEqual(w.calls, OPENED);
  b.dispose();
});

test('a person\'s gesture that creates the panel also EXPANDS a collapsed right sidebar (a new leaf in a collapsed sidebar was created but never seen); every other vault keeps the old creation path unchanged', async () => {
  real.messageDelivery.setScoreFirst(true);
  const w = useWorld('none', { collapsedSidebar: true }); const b = mountButton();
  b.button.click(); await tick();
  assert.ok(w.calls.includes('root.expand'), `expected the sidebar to be expanded: ${w.calls.join(' | ')}`);
  assert.ok(w.calls.indexOf('root.expand') < w.calls.indexOf('ws.revealLeaf(fresh)'), 'unfolded BEFORE it is revealed, as the existing-panel path does');
  b.dispose();
  real.messageDelivery.setScoreFirst(false);
  const p3 = useWorld('none', { collapsedSidebar: true });                  // NOT score-first: the creation path is the old one, which never expanded
  await plugin.target.getOutputView({ userInitiated: true });
  assert.deepEqual(p3.calls, OPENED_OLD);
});

test('LOUD FAILURE: when the panel cannot be opened the click says so — console.error naming the gesture and a Notice — it is never a silent no-op', async () => {
  real.messageDelivery.setScoreFirst(true);
  useWorld('none', { setViewStateThrows: true }); const b = mountButton();
  const out = await capture(async () => { b.button.click(); await tick(); });
  assert.ok(out.error.some((l) => /openForgePanelByGesture/.test(l) && /boom: setViewState failed|could not open/i.test(l)), `console.error: ${JSON.stringify(out.error)}`);
  const notices = ((globalThis as any).__shimConstructed as Array<[string, unknown[]]>).filter(([n]) => n === 'Notice');
  assert.ok(notices.some(([, a]) => /Forge panel/i.test(String(a[0])) && /boom: setViewState failed/.test(String(a[0]))), `Notices: ${JSON.stringify(notices)}`);
  b.dispose();
});

test('LOUD FAILURE: a "Forge log" click with NO handler registered (a wiring fault) is an error in the console, not a silent no-op', async () => {
  const { MessageDelivery } = await import('./score-first-messages-core.ts');
  const d = new MessageDelivery();
  const out = await capture(async () => { d.openForgeLog(); });
  assert.ok(out.error.some((l) => /\[forge-log\]/.test(l) && /no handler/i.test(l)), JSON.stringify(out.error));
});

test('THE DRIVER CAN SEPARATE THE HYPOTHESES: a click leaves [forge-log] lines at the click, the handler, getOutputView and its panel steps', async () => {
  real.messageDelivery.setScoreFirst(true);
  const w = useWorld('none', { collapsedSidebar: true }); const b = mountButton();
  const out = await capture(async () => { b.button.click(); await tick(); });
  const lines = out.log.filter((l) => l.startsWith('[forge-log]'));
  for (const needle of [/button clicked/, /openForgePanelByGesture/, /getOutputView.*userInitiated=true/, /no panel yet/, /sidebar collapsed=true/, /revealLeaf/, /panel ready/]) {
    assert.ok(lines.some((l) => needle.test(l)), `missing ${needle}: ${JSON.stringify(lines)}`);
  }
  assert.ok(w.calls.length > 0);
  b.dispose();
});

test('THE "Open Forge panel" COMMAND is the same gesture: the callback onload registered opens the panel through the same helper', async () => {
  const cmd = plugin.commands.get('open-forge-panel');
  assert.ok(cmd?.callback, 'onload registered the command');
  real.messageDelivery.setScoreFirst(true);
  const w = useWorld('none');
  await cmd!.callback!(); await tick();
  assert.deepEqual(w.calls, OPENED);
});

test('THE HAMMER: a deliberate Forge click in a score-first vault OPENS the panel primed for Run (creates it when closed, expands and reveals it when collapsed), and primes the strip for the note', async () => {
  real.messageDelivery.setScoreFirst(true);
  for (const outcome of ['synced', 'no-op']) {
    const none = useWorld('none');
    await plugin.target.landAfterForge({ path: 'bars/bar_001.md' }, outcome);
    assert.deepEqual(none.calls, [...OPENED, 'plugin.refreshForgePanelStrip'], `${outcome}, panel closed (the panel's own strip refresh, then the landing's: the note is primed explicitly)`);
    const collapsed = useWorld('collapsed');
    await plugin.target.landAfterForge({ path: 'bars/bar_001.md' }, outcome);
    assert.deepEqual(collapsed.calls, ['ws.getLeavesOfType(forge-output)', 'leaf.getRoot', 'root.expand', 'ws.revealLeaf(existing)', 'plugin.refreshForgePanelStrip', 'plugin.refreshForgePanelStrip'], `${outcome}, panel in a collapsed sidebar`);
  }
});

const LAND_BEFORE: Record<string, string[]> = {
  'none': ['ws.getLeavesOfType(forge-output)', 'ws.getRightLeaf(false)', 'leaf.setViewState(forge-output,active=true)', 'ws.revealLeaf(fresh)', 'plugin.refreshForgePanelStrip(undefined,a/b.md)'],
  'collapsed': ['ws.getLeavesOfType(forge-output)', 'leaf.getRoot', 'root.expand', 'ws.revealLeaf(existing)', 'plugin.refreshForgePanelStrip(undefined,a/b.md)'],
  'expanded': ['ws.getLeavesOfType(forge-output)', 'leaf.getRoot', 'ws.revealLeaf(existing)', 'plugin.refreshForgePanelStrip(undefined,a/b.md)'],
};
for (const kind of ['none', 'collapsed', 'expanded'] as const) {
  test(`P3 (not score-first): the tutorial vault's hammer landing, panel ${kind}: the very workspace calls of commit 1300d14 (pinned from a worktree of it), for both outcomes`, async () => {
    for (const outcome of ['synced', 'no-op']) {
      const w = useWorld(kind);
      // the panel's own opportunistic refresh (withStrip) names no file and is not part of the pinned trace; the landing's explicit one names the note
      plugin.target.refreshForgePanelStrip = async (a: unknown, f?: { path: string }) => { if (f) w.calls.push(`plugin.refreshForgePanelStrip(${a === undefined ? 'undefined' : 'x'},${f.path})`); };
      await plugin.target.landAfterForge({ path: 'a/b.md' }, outcome);
      assert.deepEqual(w.calls, LAND_BEFORE[kind], `${kind}/${outcome}`);
    }
  });
}

test('AUTOMATIC callers stay silent in a score-first vault (only a person\'s gesture opens the panel): getOutputView() without the flag creates nothing', async () => {
  real.messageDelivery.setScoreFirst(true);
  const w = useWorld('none');
  await plugin.target.getOutputView();
  assert.deepEqual(w.calls, ['ws.getLeavesOfType(forge-output)']);
});
