// 2026-11-23-1023 PART B - a plain click on a bar of an ARRANGEMENT's or a COMPOSITION's Score, while the composer holds text, writes the link of the note that bar comes from (`[[phrase_001]]`) at the caret and keeps the focus in the composer: it
// opens nothing and pins nothing (the phrase Score already did this: 0992/0996b). With an empty composer, or a Shift or Ctrl/Cmd click, the click is what it always was. The driver's case: a click on bar 2 of comp_001 opened phrase_001. For a bar
// that comes through a nested composition or arrangement the link is the IMMEDIATE child the Description names (the note its section plays), never a note deeper down.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Window } from 'happy-dom';

import { musicTabsWorld, realMusicPlugin, type MusicTabsWorld } from './test-support/music-tabs-world.ts';
import type { RealPlugin } from './test-support/bundle-real-plugin.ts';
import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';
import { NEW_COMPOSITION_COMMAND_ID } from './composition-flow-core.ts';
import { ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';
import { NEW_ARRANGEMENT_COMMAND_ID } from './kit-arrangement-flow-core.ts';
import { attachArtifactInspector } from './artifact-inspector-core.ts';
import { linkClickPort, registerBarSelectionHost } from './bar-selection-bus.ts';
import { pinnedNoteFor } from './linked-panes-core.ts';
import { COMPOSITION_BAR_ROLE } from './composition-nav-core.ts';

let real: RealPlugin;
before(async () => { real = await realMusicPlugin(); });
after(() => { /* the bundle is per process */ });

const COMP = 'compositions/comp_001.md';
const type = async (w: MusicTabsWorld, view: any, text: string) => { const f = w.field(view)!; f.value = text; f.dispatchEvent(new (f.ownerDocument.defaultView as any).Event('input', { bubbles: true })); await w.settle(100); };

async function tabOf(w: MusicTabsWorld, kind: 'composition' | 'arrangement') {
  if (kind === 'composition') { await w.newNote(NEW_COMPOSITION_COMMAND_ID); return w.leaves.find((l) => w.typeOf(l) === COMPOSITION_VIEW_TYPE)!; }
  await w.newNote(NEW_ARRANGEMENT_COMMAND_ID); return w.leaves.find((l) => w.typeOf(l) === ARRANGEMENT_VIEW_TYPE)!;
}

for (const kind of ['composition', 'arrangement'] as const) {
  test(`B1 [${kind}] with text in the composer a click on a bar writes [[phrase_001]] at the caret, the focus stays in the composer, nothing is written to the note, nothing is opened`, async () => {
    const w = await musicTabsWorld(real);
    try {
      const tab = await tabOf(w, kind); const path = tab.view.file.path; const host = real.barSelectionHost()!;
      assert.equal(host.duplicateArmed?.(path), false, 'an empty composer: a click is a pin as ever');
      await type(w, tab.view, 'Then play ');
      assert.equal(host.duplicateArmed?.(path), true, 'the composer holds text: the next plain click is a link click');
      const before = w.store.get(path)!; const writes = w.writes.length;
      const r = await host.duplicateClick!(path, 'phrases/phrase_001', 2);
      assert.deepEqual([r.ok, r.message], [true, 'Added [[phrase_001]] to the composer.']);
      const f = w.field(tab.view)!; assert.match(f.value, /^Then play \[\[phrase_001\]\]/, `the composer says: ${f.value}`);
      assert.equal(f.ownerDocument.activeElement, f, 'the focus is in the composer');
      assert.equal(w.store.get(path), before, 'the note is not written'); assert.equal(w.writes.length, writes);
      const bad = await host.duplicateClick!(path, null, 2); assert.equal(bad.ok, false, 'a bar whose note cannot be told says so');
    } finally { w.done(); }
  });
}

test('B2 the click is a pure port: it asks the host whether the composer holds text, and hands the note its section plays (the IMMEDIATE child: a nested composition or arrangement is the note named, never one deeper)', async () => {
  const calls: Array<[string, string | null]> = [];
  const off = registerBarSelectionHost({ appendLine: async () => ({ ok: true, message: '' }), makePhrase: async () => ({ ok: false, message: '' } as never), duplicateArmed: (p) => p === 'compositions/comp_001.md', duplicateClick: async (p, id) => { calls.push([p, id]); return { ok: true, message: '' }; } });
  try {
    const port = linkClickPort(() => 'compositions/comp_001.md');
    assert.equal(port.armed(), true); assert.equal(linkClickPort(() => 'compositions/other.md').armed(), false); assert.equal(linkClickPort(() => null).armed(), false);
    const bar = (source: string, section: number) => ({ id: `comp_bar_${section}`, prov: { noteId: 'compositions/comp_001', role: COMPOSITION_BAR_ROLE, params: { bar: section, section, source } } });
    port.onBar(bar('phrases/phrase_001', 1) as never); port.onBar(bar('compositions/comp_002', 2) as never); port.onBar(bar('arrangements/arr_001', 3) as never);
    assert.deepEqual(calls.map((c) => c[1]), ['phrases/phrase_001', 'compositions/comp_002', 'arrangements/arr_001'], 'each bar gives the note its section plays');
    assert.equal(pinnedNoteFor(bar('compositions/comp_002', 2).prov as never)?.noteId, 'compositions/comp_002');
  } finally { off(); }
});

test('B3 Shift and Ctrl/Cmd clicks are what they were even when the composer holds text and the Score has no selection gestures of its own: they do not write a link, the plain click does', () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const root = win.document.createElement('div'); win.document.body.appendChild(root);
  root.innerHTML = '<svg><g class="measure" id="b1"><g class="staff"><path class="line" d="M0 0"/></g><g class="notehead"><use/></g></g></svg>';
  (root.querySelector('#b1') as any).getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 60, width: 100, height: 60, x: 0, y: 0 });
  const links: string[] = []; const pins: Array<string | null> = [];
  attachArtifactInspector({ root, map: { b1: { noteId: 'compositions/comp_001', role: COMPOSITION_BAR_ROLE, params: { bar: 1, section: 1, source: 'phrases/phrase_001' } } }, onHover: () => {}, onPin: (e) => { pins.push(e ? e.id : null); }, pointIds: ['b1'], copyClick: { armed: () => true, onBar: (e) => { links.push(e.id); } } } as never);
  const click = (extra: Record<string, unknown>) => { const t = root.querySelector('.notehead') as any; for (const type of ['mousedown', 'mouseup', 'click']) t.dispatchEvent(new win.MouseEvent(type, { bubbles: true, clientX: 50, clientY: 30, button: 0, ...extra })); };
  click({ shiftKey: true }); click({ ctrlKey: true }); click({ metaKey: true });
  assert.deepEqual(links, [], 'a modified click is never a link click'); assert.deepEqual(pins, ['b1'], 'the first modified click pinned the bar, as it always did (the others find it pinned already)');
  click({}); assert.deepEqual(links, ['b1'], 'the plain click is the link click');
});
