// 2026-11-19-0991 - New phrase / New arrangement / New composition ASK FOR THE NAME FIRST, on the REAL wiring: the real `ForgePlugin.prototype.onload` from the real bundle (both editions), the three real commands (the palette entry, and the
// ribbon and the "+ New" menu, which run those same commands by id), the real Modal frame and the real dialog, the real flows, over an in-memory vault that records every write (host-faithful: a create on a path that exists throws; the Modal
// gets open/close the way Obsidian's does). What it proves: the dialog opens for each action and MAKES NOTHING by opening; its field holds today's default, focused and selected; Enter makes exactly that name (empty note, in the usual folder,
// opened in its tab); a typed name is used as typed; Esc, Cancel and Obsidian's own close (a click outside) leave the vault byte for byte as it was (no file, no folder, no tab); a name that any note has, in ANY folder, is refused in words and
// nothing is made; the first composition of a vault is still the root, whatever it is called; the whole thing works from the keyboard; New bar and New kit are as they were. A DOM element is never an assert operand.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { emptyArrangementNote, emptyCompositionNote, emptyPhraseNote, isEmptyNote } from './empty-note-core.ts';
import { isRootNote } from './composition-root-core.ts';
import { newCompositionNote } from './composition-core.ts';
import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';
import { ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { newMenuItems, runNewMenuItem } from './new-menu-core.ts';
import { RHYTHM_STARTER } from './new-note-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
type Kind = 'phrase' | 'arrangement' | 'composition';
const CASES: Array<{ kind: Kind; command: string; title: string; folder: string; first: string; view: string; empty: (n: string) => string }> = [
  { kind: 'phrase', command: 'new-phrase', title: 'New phrase', folder: 'phrases', first: 'phrase_001', view: PHRASE_VIEW_TYPE, empty: emptyPhraseNote },
  { kind: 'arrangement', command: 'new-arrangement', title: 'New arrangement', folder: 'arrangements', first: 'arr_001', view: ARRANGEMENT_VIEW_TYPE, empty: emptyArrangementNote },
  { kind: 'composition', command: 'new-composition', title: 'New composition', folder: 'compositions', first: 'comp_001', view: COMPOSITION_VIEW_TYPE, empty: (n) => emptyCompositionNote(n, ['root: true']) },
];

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  let win: any;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });

  async function world(toml: string | null, files: Record<string, string> = {}) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const doc = win.document;
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const store = new Map<string, string>(Object.entries({ 'bars/bar_005.md': '', 'bars/README.md': '', ...files }));
    const folders = new Set(['bars']);
    for (const p of store.keys()) if (p.includes('/')) folders.add(p.split('/')[0]);
    const created: Array<[string, string]> = [], madeFolders: string[] = [], leaves: any[] = [];
    const makeLeaf = () => { const l: any = { states: [] as any[], setViewState: async (s: any) => { l.states.push(s); }, getViewState: () => ({ type: l.states.at(-1)?.type, state: { file: l.states.at(-1)?.state?.file } }), openFile: async (f: any) => { l.states.push({ type: 'markdown', state: { file: f.path } }); } }; leaves.push(l); return l; };
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml' && toml !== null, read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: () => ({}), configDir: '.obsidian',
        getFiles: () => [...store.keys()].map(tf), getMarkdownFiles: () => [...store.keys()].map(tf),
        getAbstractFileByPath: (p: string) => (store.has(p) || folders.has(p) ? tf(p) : null),
        read: async (f: any) => store.get(f.path) ?? '', process: async (f: any, fn: (t: string) => string) => { store.set(f.path, fn(store.get(f.path) ?? '')); },
        createFolder: async (p: string) => { madeFolders.push(p); folders.add(p); },
        create: async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); created.push([p, c]); return tf(p); },
      },
      workspace: { rootSplit: {}, leftSplit: {}, rightSplit: {}, onLayoutReady: (cb: () => void) => { cb(); }, iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })), on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getMostRecentLeaf: () => null, getActiveFile: () => null, getLeaf: () => makeLeaf(), createLeafBySplit: () => makeLeaf(), revealLeaf: () => {}, setActiveLeaf: () => {} },
      metadataCache: { resolvedLinks: {}, on: () => ({}) }, plugins: {},
    };
    const plugin = await loadRealOnload(real, app);
    await clock.advance(60);
    const modals: any[] = [];
    const proto = real.Modal.prototype;
    const saved = { open: proto.open, close: proto.close };
    proto.open = function () { this.contentEl = doc.createElement('div'); this.contentEl.empty = function () { this.textContent = ''; }; doc.body.appendChild(this.contentEl); modals.push(this); this.onOpen(); };
    proto.close = function () { this.closed = true; this.onClose(); this.contentEl.remove(); };           // what Obsidian does for Esc and for a click outside the dialog too
    const lines: string[] = [];
    const savedInfo = console.info, savedError = console.error;
    console.info = (...a: unknown[]) => { if (/^\[forge-/.test(String(a[0]))) lines.push(String(a[0])); };
    console.error = () => {};
    const flush = async () => { for (let i = 0; i < 6; i++) await clock.advance(5); };
    const q = (sel: string) => modals.at(-1)?.contentEl.querySelector(sel) as any;
    const fire = (el: any, type: string, init: object = {}) => { const ev = type === 'keydown' ? new win.KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }) : new win.Event(type, { bubbles: true, ...init }); el.dispatchEvent(ev); return ev; };
    return {
      plugin, app, real, store, created, madeFolders, modals, lines, leaves, q, flush, doc,
      run: async (id: string) => { const c = plugin.commands.get(id)!; assert.ok(c, `${id} is registered`); assert.equal(c.checkCallback!(true), true, `${id} is offered`); c.checkCallback!(false); await flush(); },
      field: () => q('input') as any,
      type: (text: string) => { const f = q('input'); f.value = text; fire(f, 'input'); },
      key: async (k: string, target?: any) => { const ev = fire(target ?? q('input'), 'keydown', { key: k }); await flush(); return ev; },
      click: async (sel: string) => { fire(q(sel), 'click'); await flush(); },
      message: () => (q('.forge-newnote-message')?.textContent ?? null) as string | null,
      snapshot: () => JSON.stringify({ files: [...store.entries()], folders: [...folders].sort(), created, madeFolders, leaves: leaves.map((l) => l.states) }),
      done: () => { clock.restore(); proto.open = saved.open; proto.close = saved.close; console.info = savedInfo; console.error = savedError; delete (globalThis as any).__shimFns; real.messageDelivery.resetForTests(); },
    };
  }

  for (const c of CASES) {
    test(`[${edition}] "${c.title}" opens the NAME dialog and makes NOTHING by opening it: no file, no folder, no tab; the title is "${c.title}"; the field has today's default, the focus and the whole text selected`, async () => {
      const w = await world(SCORE_FIRST_TOML);
      try {
        const before = w.snapshot();
        await w.run(c.command);
        assert.equal(w.modals.length, 1, 'one dialog');
        assert.equal(w.q('h3').textContent, c.title);
        assert.equal(w.field().value, c.first, 'the default name is the one the action chose before there was a dialog');
        assert.ok(w.doc.activeElement === w.field(), 'the field has the focus');
        assert.equal(w.field().selectionStart, 0); assert.equal(w.field().selectionEnd, c.first.length, 'the whole text is selected');
        assert.equal(w.snapshot(), before, 'opening the dialog changed nothing at all: no note, no folder, no tab');
        assert.deepEqual(w.lines.filter((l) => /^\[forge-newname\]/.test(l)), [`[forge-newname] ${c.title}: the name dialog opened (default ${c.first})`]);
        assert.equal(w.message(), `It will be made as ${c.folder}/${c.first}.md`);
      } finally { w.done(); }
    });

    test(`[${edition}] "${c.title}": ENTER on the default makes exactly that name: an EMPTY note in ${c.folder}/, opened in its tab, the dialog closed, the evidence line printed`, async () => {
      const w = await world(SCORE_FIRST_TOML);
      try {
        await w.run(c.command); await w.key('Enter');
        assert.deepEqual(w.created.map(([p]) => p), [`${c.folder}/${c.first}.md`], 'exactly one note, exactly that name');
        assert.equal(w.created[0][1], c.empty(c.first), c.kind === 'composition' ? 'empty, and the first composition of a vault is the root of its piece' : 'empty');
        assert.ok(isEmptyNote(w.created[0][1]));
        assert.deepEqual(w.madeFolders, [c.folder], 'its folder is made when the vault lacks it (only now, after the name)');
        assert.equal(w.modals[0].closed, true, 'the dialog is closed'); assert.equal(w.modals.length, 1);
        assert.ok(w.leaves.flatMap((l) => l.states).some((s: any) => s.type === c.view && s.state.file === `${c.folder}/${c.first}.md`), `opened in the ${c.kind} tab: ${JSON.stringify(w.leaves.map((l) => l.states))}`);
        assert.ok(w.lines.some((l) => l.startsWith(`[forge-newname] ${c.title}: made ${c.first}`)), w.lines.join(' | '));
        assert.equal(w.lines.filter((l) => /nothing was made/.test(l)).length, 0, 'closing after the note is made is not a cancel');
      } finally { w.done(); }
    });

    test(`[${edition}] "${c.title}": a TYPED name is used exactly as typed (spaces cut at the ends), in ${c.folder}/, and the next default is still the numbered one`, async () => {
      const w = await world(SCORE_FIRST_TOML);
      try {
        await w.run(c.command); w.type('  My first one  '); assert.equal(w.message(), `It will be made as ${c.folder}/My first one.md`); await w.key('Enter');
        assert.deepEqual(w.created.map(([p]) => p), [`${c.folder}/My first one.md`]);
        assert.equal(w.created[0][1], c.empty('My first one'));
        await w.run(c.command); assert.equal(w.field().value, c.first, 'a typed name does not use up a number');
      } finally { w.done(); }
    });

    test(`[${edition}] "${c.title}": ESC, CANCEL and Obsidian's own close leave the vault byte for byte as it was (no file, no folder, no tab), with the default, a typed name or a refused one in the field`, async () => {
      const w = await world(SCORE_FIRST_TOML, { 'Welcome.md': 'hi' });
      try {
        const before = w.snapshot();
        await w.run(c.command); await w.key('Escape'); assert.equal(w.modals.at(-1).closed, true, 'Esc closes'); assert.equal(w.snapshot(), before);
        await w.run(c.command); w.type('Typed but never confirmed'); await w.click('.forge-newnote-cancel'); assert.equal(w.modals.at(-1).closed, true, 'Cancel closes'); assert.equal(w.snapshot(), before);
        await w.run(c.command); w.type('Welcome'); await w.key('Enter'); assert.equal(w.modals.at(-1).closed, undefined, 'a refused name does not close it'); w.modals.at(-1).close(); assert.equal(w.snapshot(), before, 'Obsidian\'s close (Esc on its scope, a click outside)');
        await w.run(c.command); w.modals.at(-1).close(); assert.equal(w.snapshot(), before);
        assert.equal(w.modals.length, 4);
        assert.equal(w.lines.filter((l) => /nothing was made/.test(l)).length, 4, 'each close without a name says so');
        assert.deepEqual(w.created, []); assert.deepEqual(w.madeFolders, []); assert.deepEqual(w.leaves.flatMap((l) => l.states), [], 'no tab was opened');
      } finally { w.done(); }
    });

    test(`[${edition}] "${c.title}": a name that ANY note already has is refused in words, in whatever folder it is, and nothing is made; the default moves past such a name`, async () => {
      const w = await world(SCORE_FIRST_TOML, { 'bars/bar_007.md': '', 'kits/rock.md': 'x', 'deep/er/Theme.md': 'x', 'Welcome.md': 'x', [`other/${c.first}.md`]: 'x' });
      try {
        const before = w.snapshot();
        await w.run(c.command);
        assert.notEqual(w.field().value, c.first, `${c.first} exists in other/: the default is not offered`);
        assert.equal(w.message(), `It will be made as ${c.folder}/${w.field().value}.md`, 'and what is offered is valid');
        for (const [typed, say] of [['rock', 'A note called rock already exists (kits/rock)'], ['THEME', 'A note called Theme already exists (deep/er/Theme)'], ['bar_007', 'A note called bar_007 already exists (bars/bar_007)'], ['Welcome', 'A note called Welcome already exists (at the top of the vault)'], [c.first, `A note called ${c.first} already exists (other/${c.first})`]] as const) {
          w.type(typed); assert.equal(w.message(), say); assert.equal(w.q('.forge-newnote-create').disabled, true);
          await w.key('Enter'); await w.click('.forge-newnote-create');
          assert.equal(w.snapshot(), before, `${typed}: nothing was made`); assert.equal(w.modals.at(-1).closed, undefined, 'the dialog stays open');
        }
        w.type('Theme 2'); assert.equal(w.q('.forge-newnote-create').disabled, false);
      } finally { w.done(); }
    });

    test(`[${edition}] "${c.title}": a name the vault refuses at the LAST moment (a note of that name appeared after the last key) is said in the same line, the dialog stays open, nothing is made`, async () => {
      const w = await world(SCORE_FIRST_TOML);
      try {
        await w.run(c.command);
        const before = w.snapshot();
        w.store.set('arrived/while/open.md', 'x'); w.type('open'); w.store.set('arrived/while/Typed.md', 'x'); w.type('Typed');
        await w.key('Enter');
        assert.equal(w.message(), 'A note called Typed already exists (arrived/while/Typed)'); assert.equal(w.modals.at(-1).closed, undefined, 'still open');
        assert.deepEqual(w.created, []); assert.deepEqual(w.leaves.flatMap((l) => l.states), []); void before;
      } finally { w.done(); }
    });

    test(`[${edition}] "${c.title}": KEYBOARD ONLY - the command, the typing, Enter: no click, no pointer event anywhere`, async () => {
      const w = await world(SCORE_FIRST_TOML);
      try {
        await w.run(c.command);
        w.type('Étude'); await w.key('Enter');
        assert.deepEqual(w.created.map(([p]) => p), [`${c.folder}/Étude.md`]);
        assert.equal(w.modals[0].closed, true);
      } finally { w.done(); }
    });
  }

  test(`[${edition}] the ribbon and the "+ New" menu run the same commands by id: each of the three opens the name dialog and makes nothing; New bar and New kit are not touched by this`, async () => {
    const w = await world(SCORE_FIRST_TOML, { 'kits/README.md': 'Kits.' });
    try {
      const run = (fullId: string): boolean => { const c = w.plugin.commands.get(fullId.replace(/^forge:/, '')); if (!c?.checkCallback || !c.checkCallback(true)) return false; c.checkCallback(false); return true; };
      const before = w.snapshot();
      const said: string[] = [];
      for (const item of newMenuItems()) {
        if (!['new-phrase', 'new-arrangement', 'new-composition'].includes(item.commandId)) continue;
        runNewMenuItem(item, { pluginId: 'forge', runCommand: run, notify: (m) => { said.push(m); } }); await w.flush();
        assert.equal(w.q('h3').textContent, item.title, `the menu entry "${item.title}" opens the dialog of that name`);
      }
      assert.deepEqual(said, [], 'nothing was said to be unavailable'); assert.equal(w.modals.length, 3); assert.equal(w.snapshot(), before, 'and nothing was made');
      // New bar: no name dialog, a bar is made at once (a data note, as it was)
      await w.run('new-bar'); assert.equal(w.modals.length, 3, 'New bar opens no dialog');
      const bar = w.created.find(([p]) => /^bars\/bar_\d+\.md$/.test(p)); assert.ok(bar, 'a bar was made at once'); assert.match(bar![1], /^---\ntype: data/);
      void RHYTHM_STARTER;
      // New kit: its OWN dialog (name and channels), not the name dialog
      await w.run('new-kit'); assert.equal(w.modals.length, 4); assert.ok(w.q('.forge-kit-dialog') !== null && w.q('.forge-newnote-dialog') === null, 'New kit keeps its own dialog');
    } finally { w.done(); }
  });

  test(`[${edition}] the FIRST composition of a vault is the root of its piece whatever it is called; a later one is not; the mark is a line of the note, not part of the name`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      await w.run('new-composition'); w.type('Overture'); await w.key('Enter');
      assert.deepEqual(w.created.map(([p]) => p), ['compositions/Overture.md']); assert.ok(isRootNote(w.created[0][1]), 'the first one is the root');
      await w.run('new-composition'); w.type('Bridge'); await w.key('Enter');
      assert.deepEqual(w.created.map(([p]) => p), ['compositions/Overture.md', 'compositions/Bridge.md']); assert.ok(!isRootNote(w.created[1][1]), 'the second is not');
    } finally { w.done(); }
    const some = await world(SCORE_FIRST_TOML, { 'compositions/comp_001.md': newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_003' }] } as any, ['root: true']) });
    try {
      await some.run('new-composition'); assert.equal(some.field().value, 'comp_002'); await some.key('Enter');
      assert.ok(!isRootNote(some.created[0][1]), 'a vault that has a root: the new one is not');
    } finally { some.done(); }
  });

  test(`[${edition}] the default follows the vault: after phrase_001..phrase_003, arr_001 and comp_001, the dialogs offer phrase_004, arr_002 and comp_002 (today's numbering rule)`, async () => {
    const w = await world(SCORE_FIRST_TOML, { 'phrases/phrase_001.md': 'p', 'phrases/phrase_002.md': 'p', 'phrases/phrase_003.md': 'p', 'arrangements/arr_001.md': 'a', 'compositions/comp_001.md': 'c' });
    try {
      const got: string[] = [];
      for (const c of CASES) { await w.run(c.command); got.push(w.field().value); w.modals.at(-1).close(); }
      assert.deepEqual(got, ['phrase_004', 'arr_002', 'comp_002']);
    } finally { w.done(); }
  });

  test(`[${edition}] P3: a vault that is not score-first has none of the three commands (so no dialog); the name dialog's code is reached only from them`, async () => {
    const w = await world(TUTORIAL_TOML);
    try {
      for (const c of CASES) assert.equal(w.plugin.commands.has(c.command), false, `${c.command} is not registered`);
      assert.equal(w.modals.length, 0);
    } finally { w.done(); }
  });
}
