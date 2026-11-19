// 2026-11-19-0992a (part 3, 0992b, R2) - THE NOTICE AND THE UNDO OF A COPY, in the REAL plugin (the real ForgePlugin.onload from the real bundle, the real PhraseView, the real description controller, composer, dialog and the plugin's own
// dialog store, an in-memory vault that delivers `create`, `modify` and `delete` as Obsidian does and whose `trash` NO-OPS on a note a leaf still shows, as Obsidian's does (L12)): type `Duplicate [[bar_007]].`, Enter, Enter, and read what
// the DIALOG of THAT TAB shows (the driver's two sessions saw "Created , a copy of ." and then nothing; the unit rigs and the Chrome measure had drawn it). Then Cmd/Ctrl+Z in the empty composer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { musicTabsWorld, realMusicPlugin } from './test-support/music-tabs-world.ts';

const dialog = (view: any): Array<{ kind: string; text: string; links: string[] }> => [...view.contentEl.querySelectorAll('.forge-chat-msg')].map((m: any) => ({ kind: m.getAttribute('data-kind'), text: (m.querySelector('.forge-chat-text')?.textContent ?? '').replace(/^✓\s*/, ''), links: [...m.querySelectorAll('.forge-chat-link')].map((b: any) => b.textContent) }));
const PHRASE = 'phrases/phrase_001.md';

test('[real plugin] a phrase tab: Duplicate [[bar_007]]. then Enter, Enter: the dialog of the tab says "Created bar_009, a copy of bar_007." with both names as visible text in two link buttons; no "does not take a copy back" line', async () => {
  const real = await realMusicPlugin(); const w = await musicTabsWorld(real);
  try {
    const leaf = await w.restoreTab(PHRASE_VIEW_TYPE, PHRASE); const tab = w.viewOf(leaf);
    assert.ok(w.field(tab) !== null, 'the composer is in the tab');
    const n0 = dialog(tab).length;                                                                        // the world keeps the dialog history of earlier worlds (one data.json object): only what THIS say added counts
    await w.say(tab, 'Duplicate [[bar_007]].');
    assert.ok(w.store.has('bars/bar_009.md'), `the copy was made: ${[...w.store.keys()].join(',')}`);
    const said = dialog(tab).slice(n0); const line = said.find((e) => e.kind === 'applied');
    assert.ok(line !== undefined, `the dialog has an applied line: ${JSON.stringify(said)}`);
    assert.equal(line!.text, 'Created bar_009, a copy of bar_007.'); assert.deepEqual(line!.links, ['bar_009', 'bar_007']);
    assert.ok(!said.some((e) => /does not take a copy back/.test(e.text)), JSON.stringify(said));
  } finally { w.done(); }
});

test('[real plugin] the same in a phrase tab that was RENAMED after it opened (the "Note title" dialog of a new phrase renames it): the dialog still shows the line', async () => {
  const real = await realMusicPlugin(); const w = await musicTabsWorld(real);
  try {
    const leaf = await w.restoreTab(PHRASE_VIEW_TYPE, PHRASE); const tab = w.viewOf(leaf);
    await w.rename(PHRASE, 'phrases/bridge.md');
    const n0 = dialog(tab).length;
    await w.say(tab, 'Duplicate [[bar_007]].');
    assert.ok(w.store.has('bars/bar_009.md'));
    const line = dialog(tab).slice(n0).find((e) => e.kind === 'applied');
    assert.equal(line?.text, 'Created bar_009, a copy of bar_007.');
  } finally { w.done(); }
});

test('[real plugin] Cmd/Ctrl+Z in the empty composer takes a fresh copy back: through vault.trash (the system trash), never the adapter\'s hard delete; "Removed bar_009 (moved to the trash)."; the phrase is not written', async () => {
  const real = await realMusicPlugin(); const w = await musicTabsWorld(real);
  try {
    const leaf = await w.restoreTab(PHRASE_VIEW_TYPE, PHRASE); const tab = w.viewOf(leaf);
    await w.say(tab, 'Duplicate [[bar_007]].'); const writes = w.writes.length, phraseBefore = w.store.get(PHRASE);
    await w.press(tab, { key: 'z', metaKey: true }); await w.settle(300);
    assert.deepEqual(w.trashed, ['bars/bar_009.md']); assert.equal(w.store.has('bars/bar_009.md'), false); assert.deepEqual(w.removed, [], 'no hard delete');
    assert.equal(dialog(tab).filter((e) => e.kind === 'notice').pop()?.text, 'Removed bar_009 (moved to the trash).');
    assert.equal(w.writes.length, writes); assert.equal(w.store.get(PHRASE), phraseBefore);
  } finally { w.done(); }
});

test('[real plugin] L12: the copy is OPEN in a tab (the dialog\'s link opened it): the tab is detached first, THEN the trash, and it is gone; an edited, open copy is left alone and its tab stays open', async () => {
  const real = await realMusicPlugin(); const w = await musicTabsWorld(real);
  try {
    const leaf = await w.restoreTab(PHRASE_VIEW_TYPE, PHRASE); const tab = w.viewOf(leaf);
    await w.say(tab, 'Duplicate [[bar_007]].');
    const open = await w.openFromList('bars/bar_009.md', { newTab: true });
    assert.ok(w.leaves.includes(open), 'the copy is shown by a tab');
    await w.press(tab, { key: 'z', metaKey: true }); await w.settle(300);
    assert.equal(w.store.has('bars/bar_009.md'), false, 'gone although a tab showed it'); assert.ok(!w.leaves.some((l: any) => l.view?.file?.path === 'bars/bar_009.md'), 'its tab is closed');
    assert.deepEqual(w.removed, [], 'moved to the trash, not deleted for good');
    await w.say(tab, 'Duplicate [[bar_007]].');                                                          // a new copy (the number is one past the HIGHEST: bar_009 again), opened, then edited by hand
    assert.ok(w.store.has('bars/bar_009.md'));
    const open2 = await w.openFromList('bars/bar_009.md', { newTab: true }); assert.ok(w.leaves.includes(open2));
    await w.handEdit('bars/bar_009.md', (t) => `${t}\nedited\n`);
    await w.press(tab, { key: 'z', metaKey: true }); await w.settle(300);
    assert.equal(w.store.has('bars/bar_009.md'), true, 'an edited copy stays'); assert.ok(w.leaves.includes(open2), 'and its tab stays open'); assert.deepEqual(w.trashed, ['bars/bar_009.md'], 'only the first copy was ever sent to the trash');
    assert.equal(dialog(tab).filter((e) => e.kind === 'notice').pop()?.text, 'bar_009 was edited since, so it was left in place. Delete it in the file list if you want it gone.');
  } finally { w.done(); }
});

test('[real plugin] the name buttons are wired to the plugin\'s REAL opener (score-first.ts openNote): a click on the copy\'s name finds the note the moment it was created (no "not in this vault" notice); after the copy is taken back the same button says so (the control: the notice channel works)', async () => {
  const real = await realMusicPlugin(); const w = await musicTabsWorld(real);
  try {
    const leaf = await w.restoreTab(PHRASE_VIEW_TYPE, PHRASE); const tab = w.viewOf(leaf);
    await w.say(tab, 'Duplicate [[bar_007]].');
    const buttons = () => ([...tab.contentEl.querySelectorAll('.forge-chat-log .forge-chat-link')] as HTMLElement[]).slice(-2);       // the newest line's two names
    assert.equal(buttons().length, 2); const before = w.notices.length;
    buttons()[0].click(); await w.settle(100);
    assert.equal(w.notices.slice(before).filter((n: string) => /Could not open/.test(n)).length, 0, JSON.stringify(w.notices.slice(before)));
    await w.press(tab, { key: 'z', metaKey: true }); await w.settle(300);
    assert.equal(w.store.has('bars/bar_009.md'), false);
    const mid = w.notices.length; buttons()[0].click(); await w.settle(100);
    assert.ok(w.notices.slice(mid).some((n: string) => /Could not open bars\/bar_009: that note is not in this vault/.test(n)), JSON.stringify(w.notices.slice(mid)));
  } finally { w.done(); }
});

test('MECHANISM PIN: score-first.ts hands the controller a trash port that closes every tab showing the note FIRST (L12), then vault.trash(file, true) (the system trash), checks the note is gone, and never calls adapter.remove for a copy', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, 'score-first.ts'), 'utf8');
  const at = src.indexOf('trash: async (p) =>'); assert.ok(at > 0, 'the port is registered');
  const body = src.slice(at, at + 1600);
  assert.ok(body.indexOf('detach()') > 0 && body.indexOf('detach()') < body.indexOf('vault.trash('), 'leaves are detached before the trash');
  assert.match(body, /vault\.trash\(f, true\)/); assert.match(body, /getAbstractFileByPath\(p\) !== null/); assert.ok(!/adapter\.remove/.test(body), 'no hard delete');
});
