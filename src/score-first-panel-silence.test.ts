// score_first M4 (drain 2026-10-21-2010) — the OTHER half of the panel test: in a score-first vault the REAL `forgeNotice` and the REAL `ForgePlugin.getOutputView` / `forgeOutput` never open,
// reveal or expand the Forge output panel, every message still reaches it (now, or when it is first opened), and a person's own gesture opens it exactly as before. Same harness and
// fake workspace as panel-reveal-characterization.test.ts (the P3 half). Pins the MECHANISM (which workspace calls are made); if the design moves this SHOULD go red — reassess.
import assert from 'node:assert/strict';
import { test, before, afterEach } from 'node:test';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { runGetOutputView, world } from './test-support/fake-panel-world.ts';

let real: RealPlugin;
before(async () => { real = await bundleRealPlugin(); });
afterEach(() => { real.messageDelivery.setScoreFirst(false); real.messageDelivery.drain({ append() {}, appendError() {}, appendForgeError() {}, appendMessage() {}, appendLlmRecipeRejection() {}, appendSlotCacheNotFound() {}, previewBinarySnippet() {}, previewDataSnippet() {} }); real.messageDelivery.markOpened(); });
const scoreFirst = () => real.messageDelivery.setScoreFirst(true);
const REVEALING = /ws\.revealLeaf|root\.expand|leaf\.setViewState|ws\.getRightLeaf|ws\.getLeaf\(|leaf\.getRoot/;

test('getOutputView, no panel yet: it asks whether one exists and does NOTHING else — no leaf created, no reveal, no expand — and hands back a sink', async () => {
  scoreFirst(); const w = world(real, 'none');
  const v = await runGetOutputView(real, w);
  assert.deepEqual(w.calls, ['ws.getLeavesOfType(forge-output)', 'returned something else']);
  assert.notEqual(v, w.view);
  v.appendMessage('Forge', 'kept', 'info'); v.append('snip', 'out', { ok: 1 });
  assert.equal(real.messageDelivery.backlogSize(), 2, 'the calls are kept for when the panel is first opened');
  assert.equal(real.messageDelivery.unreadCount(), 2);
});

test('getOutputView, a panel in a COLLAPSED sidebar: the existing view is returned and the sidebar stays collapsed (no getRoot, no expand, no reveal)', async () => {
  scoreFirst(); const w = world(real, 'collapsed');
  const v = await runGetOutputView(real, w);
  assert.deepEqual(w.calls, ['ws.getLeavesOfType(forge-output)', 'returned the panel view']);
  assert.equal(v, w.view);
});

test('getOutputView, a panel in an open sidebar: the same — returned as it is, nothing revealed', async () => {
  scoreFirst(); const w = world(real, 'expanded');
  await runGetOutputView(real, w);
  assert.ok(!w.calls.some((c) => REVEALING.test(c)), w.calls.join(' | '));
});

test('a PERSON\'S gesture ("Open Forge panel", "Forge log (N)") takes the old path exactly: expand, reveal, and the same call order as outside a score-first vault', async () => {
  scoreFirst();
  const none = world(real, 'none'); await runGetOutputView(real, none, [{ userInitiated: true }]);
  assert.deepEqual(none.calls, ['ws.getLeavesOfType(forge-output)', 'ws.getRightLeaf(false)', 'leaf.setViewState(forge-output,active=true)', 'ws.revealLeaf(fresh)', 'plugin.refreshForgePanelStrip', 'returned the panel view']);
  const collapsed = world(real, 'collapsed'); await runGetOutputView(real, collapsed, [{ userInitiated: true }]);
  assert.deepEqual(collapsed.calls, ['ws.getLeavesOfType(forge-output)', 'leaf.getRoot', 'root.expand', 'ws.revealLeaf(existing)', 'plugin.refreshForgePanelStrip', 'returned the panel view']);
});

test('forgeNotice, no panel yet: nothing is created, revealed or expanded; the message is kept (and counted) for the panel\'s first opening', async () => {
  scoreFirst(); const w = world(real, 'none');
  await real.forgeNotice({ workspace: w.ws } as never, 'Forge: vault updated.', 'info', 'Forge');
  assert.deepEqual(w.calls, ['ws.getLeavesOfType(forge-output)']);
  assert.equal(real.messageDelivery.backlogSize(), 1);
  assert.equal(real.messageDelivery.unreadCount(), 1);
});

test('forgeNotice, a panel in a collapsed sidebar: the message IS appended (the panel is the truth log) and nothing is revealed or expanded', async () => {
  scoreFirst(); const w = world(real, 'collapsed');
  await real.forgeNotice({ workspace: w.ws } as never, 'hello', 'info', 'Forge');
  assert.deepEqual(w.calls, ['ws.getLeavesOfType(forge-output)', 'view.appendMessage(Forge,hello,info)']);
  assert.equal(real.messageDelivery.backlogSize(), 0);
});

test('forgeNotice puts the ranked messages on the Score and leaves the rest panel-only: error (until the next draw), success and LLM (transient), plain info (nothing)', async () => {
  scoreFirst(); const got: Array<[string, string, string]> = [];
  real.messageDelivery.onScoreMessage((m) => got.push([m.text, m.kind, m.line.persistence]));
  for (const [text, kind] of [['Compute failed — boom', 'error'], ['Forge: synced 3 dependencies.', 'success'], ['Forge: /generate needed 3 attempts to produce parseable output.', 'info'], ['Forge: vault updated.', 'info']] as const) {
    await real.forgeNotice({ workspace: world(real, 'none').ws } as never, text, kind, 'Forge');
  }
  assert.deepEqual(got, [['Compute failed — boom', 'error', 'until-next-draw'], ['Forge: synced 3 dependencies.', 'success', 'transient'], ['Forge: /generate needed 3 attempts to produce parseable output.', 'info', 'transient']]);
  assert.equal(real.messageDelivery.backlogSize(), 4, 'every one of the four is in the panel\'s log');
});

test('forgeOutput (the main.ts door every this.notice() goes through): score-first = silent append through the sink and the ranked line on the Score; the sink replays into the panel later', async () => {
  scoreFirst(); const w = world(real, 'none'); const got: string[] = [];
  real.messageDelivery.onScoreMessage((m) => got.push(m.text));
  const self = Object.assign(Object.create(real.ForgePlugin.prototype), { app: { workspace: w.ws }, refreshForgePanelStrip: async () => {} });
  await real.ForgePlugin.prototype.forgeOutput.call(self, 'Compute failed — boom', 'error', 'Forge');
  assert.deepEqual(w.calls, ['ws.getLeavesOfType(forge-output)']);
  assert.deepEqual(got, ['Compute failed — boom']);
  const replayed: string[] = []; real.messageDelivery.drain({ appendMessage: (_i: string, t: string) => { replayed.push(t); } } as never);
  assert.deepEqual(replayed, ['Compute failed — boom']);
});

test('forgeOutput outside a score-first vault: unchanged — it opens the panel and posts nothing to any Score', async () => {
  const w = world(real, 'none'); const got: string[] = [];
  real.messageDelivery.onScoreMessage((m) => got.push(m.text));
  const self = Object.assign(Object.create(real.ForgePlugin.prototype), { app: { workspace: w.ws }, refreshForgePanelStrip: async () => {} });
  await real.ForgePlugin.prototype.forgeOutput.call(self, 'Compute failed — boom', 'error', 'Forge');
  assert.ok(w.calls.includes('ws.revealLeaf(fresh)') && w.calls.includes('leaf.setViewState(forge-output,active=true)'), w.calls.join(' | '));
  assert.deepEqual(got, []);
  assert.equal(real.messageDelivery.backlogSize(), 0);
});

test('MECHANISM PIN: the panel replays what it kept and starts "Forge log (N)" from zero when it OPENS, counts what arrives while it is not on screen, and resets when it becomes the active leaf — all only in a score-first vault', async () => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const body = fs.readFileSync(path.join(process.cwd(), 'src/output-view.ts'), 'utf8');
  assert.match(body, /if \(messageDelivery\.isScoreFirst\(\)\) \{\s*messageDelivery\.drain\(this\);\s*messageDelivery\.markOpened\(\);\s*this\.registerEvent\(this\.app\.workspace\.on\('active-leaf-change'/);
  assert.match(body, /if \(messageDelivery\.isScoreFirst\(\) && !\(this\.containerEl as unknown as \{ isShown\?: \(\) => boolean \}\)\.isShown\?\.\(\)\) messageDelivery\.bump\(\);/);
  const main = fs.readFileSync(path.join(process.cwd(), 'src/main.ts'), 'utf8');
  assert.match(main, /callback: \(\) => \{ void this\.getOutputView\(\{ userInitiated: true \}\); \},/, 'the "Open Forge panel" command is a person\'s gesture');
  assert.match(main, /messageDelivery\.setOpenLog\(\(\) => \{ void this\.getOutputView\(\{ userInitiated: true \}\); \}\);/, '"Forge log (N)" is a person\'s gesture too');
});
