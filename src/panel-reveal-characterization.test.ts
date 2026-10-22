// score_first M4 (drain 2026-10-21-2010) — P3, the tutorial-vault regression test of design-doc 4.4: outside a score-first vault the Forge output panel behaves EXACTLY as before.
//
// This runs the REAL `forgeNotice` and the REAL (private) `ForgePlugin.prototype.getOutputView` (bundled from src/ with a generated stand-in for `obsidian`; see test-support/bundle-real-plugin.ts)
// against a fake workspace and records every call they make on it. The expected traces below were produced by the SAME harness against a worktree of commit 1300d14 (the build before this
// milestone; the two functions are byte-identical there and at 5ad7ba2) and pasted here: they are the "before", a pinned fixture, never the moving tree.
// It pins the MECHANISM (which workspace calls, in which order); if the panel's open/reveal design moves, this SHOULD go red — reassess, don't just rewrite.
import assert from 'node:assert/strict';
import { test, before } from 'node:test';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { runGetOutputView, world } from './test-support/fake-panel-world.ts';

let real: RealPlugin;
before(async () => { real = await bundleRealPlugin(); });

const BEFORE: Record<string, string[]> = {
  'getOutputView/none': ['ws.getLeavesOfType(forge-output)', 'ws.getRightLeaf(false)', 'leaf.setViewState(forge-output,active=true)', 'ws.revealLeaf(fresh)', 'plugin.refreshForgePanelStrip', 'returned the panel view'],
  'getOutputView/collapsed': ['ws.getLeavesOfType(forge-output)', 'leaf.getRoot', 'root.expand', 'ws.revealLeaf(existing)', 'plugin.refreshForgePanelStrip', 'returned the panel view'],
  'getOutputView/expanded': ['ws.getLeavesOfType(forge-output)', 'leaf.getRoot', 'ws.revealLeaf(existing)', 'plugin.refreshForgePanelStrip', 'returned the panel view'],
  'forgeNotice/none': ['ws.getLeavesOfType(forge-output)', 'ws.getRightLeaf(false)', 'leaf.setViewState(forge-output,active=true)', 'view.appendMessage(Forge,hello,info)', 'ws.revealLeaf(fresh)'],
  'forgeNotice/collapsed': ['ws.getLeavesOfType(forge-output)', 'view.appendMessage(Forge,hello,info)', 'ws.revealLeaf(existing)'],
  'forgeNotice/expanded': ['ws.getLeavesOfType(forge-output)', 'view.appendMessage(Forge,hello,info)', 'ws.revealLeaf(existing)'],
};

for (const kind of ['none', 'collapsed', 'expanded'] as const) {
  test(`P3 (not score-first): getOutputView with ${kind === 'none' ? 'no panel yet (opens one)' : kind === 'collapsed' ? 'a panel in a COLLAPSED sidebar (expands it)' : 'a panel in an open sidebar'}: the very workspace calls of commit 1300d14, in order`, async () => {
    const w = world(real, kind);
    await runGetOutputView(real, w);
    assert.deepEqual(w.calls, BEFORE[`getOutputView/${kind}`]);
  });
  test(`P3 (not score-first): forgeNotice with ${kind === 'none' ? 'no panel yet' : kind === 'collapsed' ? 'a collapsed sidebar' : 'an open sidebar'}: the very workspace calls of commit 1300d14, in order — it appends THEN reveals`, async () => {
    const w = world(real, kind);
    await real.forgeNotice({ workspace: w.ws } as never, 'hello', 'info', 'Forge');
    assert.deepEqual(w.calls, BEFORE[`forgeNotice/${kind}`]);
  });
}

test('P3: the fresh default is "not score-first" — nothing in a session that never sets the profile can reach the silent path', () => {
  assert.equal(real.messageDelivery.isScoreFirst(), false);
});
