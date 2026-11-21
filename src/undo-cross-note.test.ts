// 2026-11-21-1012 item 1 (CCQA N2): Cmd+Z in phrase_016's composer EMPTIED phrase_015 (history "Removed: Extend [[bar_001]] to 4 bars...", Description and Recipe blank). The undo stacks are keyed by note path, so the stack was not shared; the composer was.
// The finding: syncBoxes mounts a composer after an `await` and keeps the FIRST one that finishes for a pane (`boxes.has(contentEl)` -> return), whatever the pane shows by then. A tab that moves from one note to another while the first mount is
// still reading leaves the composer of the OLD note under the NEW note's tab until the next sync: its Cmd+Z undoes the old note. Real controller, real composer, the two notes' own files.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { dialogLast } from './test-support/dialog-view.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const A = 'phrases/phrase_015.md', B = 'phrases/phrase_016.md';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_001', ...PHRASE_DEFAULTS, bars: 4 };
const settle = async (n = 60) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function rig() {
  const files = new Map<string, string>([[A, noteContentFor('phrase_015', EXTEND)], [B, noteContentFor('phrase_016', { ...EXTEND, bars: 6 })]]);
  const original = new Map(files); const writes: string[] = [], lines: string[] = [], menuRuns: string[] = []; const gone = { on: false };
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const score = win.document.createElement('div'); score.className = 'forge-rhythm-edit-score'; el.appendChild(score);
  const pane = { path: A, contentEl: el as HTMLElement, tab: true };
  const ports: DescriptionPorts = {
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = files.get(p)!; const next = fn(cur); if (next !== cur) { files.set(p, next); writes.push(p); } },
    vault: () => ({ bars: ['bar_001', 'bar_007'], phrases: ['phrase_015', 'phrase_016'], arrangements: [], compositions: [], kits: [] }), barNames: () => ['bar_001', 'bar_007'], phraseNames: () => ['phrase_015', 'phrase_016'],
    setTimer: () => 1, clearTimer: () => {}, trace: (l) => lines.push(l), panes: () => (gone.on ? [] : [pane]), configured: () => false,
    composerMenu: () => ({ items: [{ id: 'new-thing', label: 'New thing' }], run: (id: string) => { menuRuns.push(id); } }),
  };
  const ctl = createDescriptionController(ports);
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const cmdZ = async () => { field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })); await settle(); };
  const mounted = () => lines.filter((l) => /box mounted:/.test(l)).map((l) => /box mounted: (\S+)/.exec(l)![1]);
  const menuItem = async (label: string) => { (el.querySelector('.forge-composer-plus') as HTMLElement).click(); await settle(); const b = [...el.querySelectorAll('.forge-composer-menuitem')].find((x: any) => x.textContent === label) as HTMLElement; b.click(); await settle(); };
  return { ctl, files, original, writes, lines, el: el as HTMLElement, pane, cmdZ, mounted, menuRuns, gone, menuItem };
}

test('N2 (the race): a tab that moves from phrase_015 to phrase_016 while the first composer is still being mounted ends up with phrase_016\'s composer, and Cmd+Z there undoes phrase_016 and leaves phrase_015 alone', async () => {
  const r = rig();
  r.ctl.syncBars();                                                  // the pane shows phrase_015: its composer starts to mount (a read first)
  r.pane.path = B;                                                   // the tab opens phrase_016 in the same pane before that read came back
  r.ctl.syncBars(); await settle();
  assert.equal(r.mounted().pop(), 'phrase_016', `the composer under the pane is the one of the note the pane shows (mounts: ${r.mounted().join(', ')})`);
  await r.cmdZ();
  assert.equal(r.files.get(A), r.original.get(A), 'phrase_015 is untouched');
  assert.deepEqual(r.writes.filter((w) => w === A), [], 'nothing was written to phrase_015');
});
test('N2 (the guard): a composer whose note is no longer the one its pane shows does NOT undo: it says "Nothing to undo in this note." and the pane gets its own composer', async () => {
  const r = rig();
  r.ctl.syncBars(); await settle(); assert.deepEqual(r.mounted(), ['phrase_015']);
  r.pane.path = B;                                                   // the pane moved to another note and no sync has run yet
  await r.cmdZ();
  assert.equal(r.files.get(A), r.original.get(A), 'phrase_015 is untouched'); assert.deepEqual(r.writes, [], 'no note was written');
  assert.equal(dialogLast(r.el), 'Nothing to undo in this note.');
  await settle(); assert.equal(r.mounted().pop(), 'phrase_016', 'the pane was given the composer of the note it shows');
});
test('control: in the ordinary case (the pane shows the note whose composer has focus) Cmd+Z still undoes that note\'s last sentence', async () => {
  const r = rig(); r.ctl.syncBars(); await settle(); await r.cmdZ();
  assert.deepEqual(r.writes, [A], 'phrase_015\'s own sentence came off');
});

// ---- item 2 (N1), end to end on the real controller: what the menu's Copy appends is accepted by an Extend phrase's own list --------------------------------------------------------------------------------------
test('N1: the step the selection menu appends ("Copy bars 1 to 2.") is ACCEPTED by an Extend phrase: one write, the head stays the head, Cmd+Z takes the step back', async () => {
  const r = rig(); r.ctl.syncBars(); await settle();
  const done = await r.ctl.appendLine(A, 'Copy bars 1 to 2.'); await settle();
  assert.equal(done.ok, true, done.message); assert.deepEqual(r.writes, [A]);
  assert.match(r.files.get(A)!, /Extend \[\[bar_001\]\] to 4 bars[^\n]*\n[\s\S]*Copy bars 1 to 2\./);
  await r.cmdZ(); assert.doesNotMatch(r.files.get(A)!, /Copy bars 1 to 2\./); assert.match(r.files.get(A)!, /Extend \[\[bar_001\]\]/);
});

// ---- the mutation pass on item 1: every branch of the mount and the guard, seen ------------------------------------------------------------------------------------------------------------------------------------
test('the refusal is TRACED with both names (the console says which composer was under which tab), and a pane that is gone refuses quietly: nothing written, no crash', async () => {
  const r = rig(); r.ctl.syncBars(); await settle(); r.pane.path = B; await r.cmdZ();
  assert.ok(r.lines.includes('[forge-promptbox] undo refused: this composer belongs to phrase_015 but its tab shows phrase_016'), r.lines.join('\n'));
  const errors: unknown[][] = []; const ce = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
  const q = rig(); q.ctl.syncBars(); await settle(); q.gone.on = true; try { await q.cmdZ(); } finally { console.error = ce; }
  assert.deepEqual(errors, [], 'no thrown error behind the quiet refusal');
  assert.ok(q.lines.includes('[forge-promptbox] undo refused: this composer belongs to phrase_015 but its tab shows no note'), q.lines.join('\n')); assert.deepEqual(q.writes, []);
});
test('one mount per request: two syncs for the same note while its composer is still being mounted make ONE composer', async () => {
  const r = rig(); r.ctl.syncBars(); r.ctl.syncBars(); await settle(); assert.deepEqual(r.mounted(), ['phrase_015']);
});
test('a note that cannot be read does not block its composer for ever: when it can be read, the next sync mounts it', async () => {
  const r = rig(); const keep = r.files.get(A)!; r.files.delete(A); r.ctl.syncBars(); await settle(); assert.deepEqual(r.mounted(), []);
  r.files.set(A, keep); r.ctl.syncBars(); await settle(); assert.deepEqual(r.mounted(), ['phrase_015']);
});
test('a pane that moved to another note while its note was being read gets no composer of the old note (even when no newer sync came), and a controller disposed meanwhile mounts nothing', async () => {
  const r = rig(); r.ctl.syncBars(); r.pane.path = B; await settle(); assert.deepEqual(r.mounted(), [], 'nothing for phrase_015 under a tab that shows phrase_016');
  r.ctl.syncBars(); await settle(); assert.deepEqual(r.mounted(), ['phrase_016']);
  const d = rig(); d.ctl.syncBars(); d.ctl.dispose(); await settle(); assert.deepEqual(d.mounted(), []);
});
test('a tab closed and opened again on the same note gets its composer again (a finished mount leaves nothing behind that says "already on its way")', async () => {
  const r = rig(); r.ctl.syncBars(); await settle(); r.gone.on = true; r.ctl.syncBars(); await settle(); r.gone.on = false; r.ctl.syncBars(); await settle();
  assert.deepEqual(r.mounted(), ['phrase_015', 'phrase_015']);
});
test('the composer\'s "+" menu: Undo and Redo run through the guard (the same note, the undo trace says "menu"), and any other item is the host\'s own', async () => {
  const r = rig(); r.ctl.syncBars(); await settle();
  await r.menuItem('New thing'); assert.deepEqual(r.menuRuns, ['new-thing']); assert.deepEqual(r.writes, [], 'another item undoes and redoes nothing');
  await r.menuItem('Undo last sentence'); assert.deepEqual(r.writes, [A]); assert.doesNotMatch(r.files.get(A)!, /Extend \[\[bar_001\]\]/);
  await r.menuItem('Redo'); assert.deepEqual(r.writes, [A, A]); assert.match(r.files.get(A)!, /Extend \[\[bar_001\]\]/, 'put back');
  const trace = (globalThis as any).__forgeUndoTrace as Array<{ via: string; which: string }>; assert.deepEqual(trace.filter((e) => e.via === 'menu').map((e) => e.which), ['undo', 'redo'], JSON.stringify(trace));
  r.pane.path = B; await r.menuItem('Undo last sentence'); assert.deepEqual(r.writes, [A, A], 'the menu of a composer under another note\'s tab undoes nothing');
});
test('a read that fails for a note the pane has left does not take down the NEWER request for that pane', async () => {
  const r = rig(); r.files.delete(A); r.ctl.syncBars(); r.pane.path = B; r.ctl.syncBars(); await settle();
  assert.deepEqual(r.mounted(), ['phrase_016'], 'the composer of the note the pane shows now');
});
