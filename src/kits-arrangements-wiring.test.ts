// 2026-10-29-0820 (M10 slice 1) - kits and arrangements on the REAL wiring: the real `ForgePlugin.prototype.onload` from the real bundle (both editions), the real commands, the real dialogs and the real flows, over a vault that records what the plugin writes
// (host-faithful, card 12: a create on a path that exists throws, the workspace walk is the shared one, Modal gets open/close the way Obsidian's does). The decisions are proven in kit-core / arrangement-core / kit-arrangement-flow-core and the dialogs in
// kit-arrangement-dom; this proves they are CONNECTED: only in a score-first vault (P3), "New kit" makes kits/<name>.md and opens it, "New arrangement" makes arrangements/arr_001.md and opens it in the arrangement tab, "Open arrangement as Score"
// switches an arrangement note to the tab, and "Refresh note links" reaches kits and arrangements.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { ARRANGEMENT_VIEW_TYPE, newArrangementNote, readArrangementNote } from './arrangement-core.ts';
import { newKitNote, readKitNote } from './kit-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const MUSIC_THEORY_TOML = 'name = "music-theory"\nversion = "0.1.0"\ndescription = "x"\ndomains = ["music"]\n';
const [NEW_KIT, NEW_ARR, OPEN_ARR, REFRESH] = ['new-kit', 'new-arrangement', 'open-arrangement-as-score', 'refresh-note-links'];

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  let win: any;
  before(async () => {
    win = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });

  async function world(toml: string | null, files: Record<string, string> = {}, active: string | null = null) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const doc = win.document;
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const store = new Map<string, string>(Object.entries({ 'bars/bar_005.md': '', 'bars/README.md': '', 'kits/README.md': 'Kits.', ...files }));
    const folders = new Set(['bars', 'phrases', 'kits']);
    const created: Array<[string, string]> = [];
    const madeFolders: string[] = [];
    const touched: string[] = [];
    const leaves: any[] = [];
    const makeLeaf = () => { const l: any = { states: [] as any[], opened: [] as string[], setViewState: async (s: any) => { l.states.push(s); }, openFile: async (f: any) => { l.opened.push(f.path); } }; leaves.push(l); return l; };
    let activeFile: string | null = active;
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml' && toml !== null, read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: () => ({}), configDir: '.obsidian',
        getFiles: () => [...store.keys()].map(tf),
        getMarkdownFiles: () => [...store.keys()].map(tf),
        getAbstractFileByPath: (p: string) => { if (/kits|arrangements/.test(p)) touched.push(p); return store.has(p) || folders.has(p) ? tf(p) : null; },
        read: async (f: any) => store.get(f.path) ?? '',
        process: async (f: any, fn: (t: string) => string) => { store.set(f.path, fn(store.get(f.path) ?? '')); },
        createFolder: async (p: string) => { madeFolders.push(p); folders.add(p); },
        create: async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); created.push([p, c]); return tf(p); },
      },
      workspace: {
        rootSplit: {}, leftSplit: {}, rightSplit: {},
        onLayoutReady: (cb: () => void) => { cb(); },
        iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })),
        on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getMostRecentLeaf: () => null,
        getActiveFile: () => (activeFile === null ? null : tf(activeFile)),
        getLeaf: () => makeLeaf(), revealLeaf: () => {}, setActiveLeaf: () => {},
      },
      metadataCache: { resolvedLinks: {}, on: () => ({}) }, plugins: {},
    };
    const plugin = await loadRealOnload(real, app);
    await clock.advance(60);
    // the stand-in Modal: open() builds the content element and calls onOpen, close() calls onClose, as Obsidian does
    const modals: any[] = [];
    const proto = real.Modal.prototype;
    const saved = { open: proto.open, close: proto.close };
    proto.open = function () { this.contentEl = doc.createElement('div'); this.contentEl.empty = function () { this.textContent = ''; }; doc.body.appendChild(this.contentEl); modals.push(this); this.onOpen(); };
    proto.close = function () { this.closed = true; this.onClose(); this.contentEl.remove(); };
    const lines: string[] = [];
    const savedInfo = console.info, savedError = console.error;
    console.info = (...a: unknown[]) => { if (/^\[forge-/.test(String(a[0]))) lines.push(String(a[0])); };
    console.error = () => {};
    const flush = () => clock.advance(5);
    const q = (sel: string) => modals.at(-1)?.contentEl.querySelector(sel) as any;
    const click = (e: any) => e.dispatchEvent(new win.Event('click', { bubbles: true }));
    return {
      plugin, app, store, created, madeFolders, touched, modals, lines, leaves, q, click, flush,
      setActive: (p: string | null) => { activeFile = p; },
      offered: (id: string) => plugin.commands.get(id)?.checkCallback?.(true) ?? false,
      run: async (id: string) => { plugin.commands.get(id)!.checkCallback!(false); await flush(); },
      done: () => { clock.restore(); proto.open = saved.open; proto.close = saved.close; console.info = savedInfo; console.error = savedError; delete (globalThis as any).__shimFns; real.messageDelivery.resetForTests(); },
    };
  }

  test(`[${edition}] a score-first vault: the three commands and the arrangement view are registered; "New kit" is offered, "New arrangement" only when there is a kit AND a phrase, "Open arrangement as Score" only on an arrangement note`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      assert.equal(w.plugin.commands.get(NEW_KIT)?.name, 'New kit');
      assert.equal(w.plugin.commands.get(NEW_ARR)?.name, 'New arrangement');
      assert.equal(w.plugin.commands.get(OPEN_ARR)?.name, 'Open arrangement as Score');
      assert.ok(w.plugin.views.has(ARRANGEMENT_VIEW_TYPE), 'the arrangement view type is registered');
      assert.equal(w.offered(NEW_KIT), true);
      assert.equal(w.offered(NEW_ARR), false, 'no kit and no phrase yet: nothing to arrange');
      assert.equal(w.offered(OPEN_ARR), false);
      w.setActive('arrangements/arr_001.md');
      assert.equal(w.offered(OPEN_ARR), true, 'on an arrangement note');
      for (const p of ['arrangements/README.md', 'phrases/phrase_001.md', 'kits/rock.md', null]) { w.setActive(p); assert.equal(w.offered(OPEN_ARR), false, String(p)); }
    } finally { w.done(); }
    const some = await world(SCORE_FIRST_TOML, { 'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick'] }), 'phrases/phrase_001.md': 'p' });
    try { assert.equal(some.offered(NEW_ARR), true, 'a kit and a phrase: offered'); } finally { some.done(); }
  });

  for (const [label, toml] of [['the tutorial vault (no profile)', TUTORIAL_TOML], ['music-theory (no profile)', MUSIC_THEORY_TOML], ['a vault with no forge.toml', null]] as const) {
    test(`[${edition}] P3 - ${label}: no kit or arrangement command, no arrangement view, nothing looks at kits/ or arrangements/, nothing is written`, async () => {
      const w = await world(toml, { 'kits/rock.md': 'x', 'phrases/phrase_001.md': 'p' }, 'arrangements/arr_001.md');
      try {
        for (const id of [NEW_KIT, NEW_ARR, OPEN_ARR]) assert.equal(w.plugin.commands.has(id), false, id);
        assert.ok(![...w.plugin.commands.values()].some((c) => /\b(kit|arrangement)\b/i.test(String(c.name))), 'no command is named for a kit or an arrangement');
        assert.equal(w.plugin.views.has(ARRANGEMENT_VIEW_TYPE), false);
        assert.deepEqual(w.touched, [], 'nothing asks the vault about kits/ or arrangements/');
        assert.deepEqual(w.created.filter(([p]) => /^(kits|arrangements)\//.test(p)), []);
        assert.deepEqual(w.madeFolders, []);
        assert.deepEqual(w.modals, []);
      } finally { w.done(); }
    });
  }

  test(`[${edition}] "New kit" on the real wiring: the dialog opens, the Rock preset and Create write kits/rock.md (a kit that reads back), print the evidence line and open the note in a tab; the dialog closes`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      await w.run(NEW_KIT);
      assert.equal(w.modals.length, 1);
      assert.equal(w.q('h3').textContent, 'New kit');
      w.click(w.q('[data-preset="rock"]'));
      w.click(w.q('.forge-kit-create')); await w.flush();
      assert.deepEqual(w.created.map(([p]) => p), ['kits/rock.md']);
      const read = readKitNote(w.created[0][1]);
      assert.ok(read.ok);
      if (read.ok) assert.deepEqual(read.value, { kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] });
      assert.deepEqual(w.madeFolders, [], 'kits/ exists already: not made again');
      assert.deepEqual(w.lines.filter((l) => l.startsWith('[forge-kit]')), ['[forge-kit] created kits/rock.md channels=kick,snare,hihat']);
      assert.deepEqual(w.leaves.map((l) => l.opened), [['kits/rock.md']]);
      assert.equal(w.modals[0].closed, true, 'a successful Create closes the dialog');
    } finally { w.done(); }
  });

  test(`[${edition}] "New kit" refuses in one sentence on the dialog and writes nothing: no channel ticked`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      await w.run(NEW_KIT);
      w.q('.forge-kit-name').value = 'empty';
      w.click(w.q('.forge-kit-create')); await w.flush();
      assert.equal(w.q('.forge-kit-message').textContent, 'New kit: A kit needs at least one channel.');
      assert.deepEqual(w.created, []);
      assert.notEqual(w.modals[0].closed, true, 'the dialog stays open');
    } finally { w.done(); }
  });

  test(`[${edition}] "New arrangement" on the real wiring: arrangements/ is made, arr_001 reads back to the two tracks, the evidence line is printed and the note opens in the ARRANGEMENT tab`, async () => {
    const rock = newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] });
    const latin = newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] });
    const w = await world(SCORE_FIRST_TOML, { 'kits/rock.md': rock, 'kits/latin.md': latin, 'phrases/phrase_003.md': 'p', 'phrases/phrase_009.md': 'p', 'phrases/README.md': 'x' });
    try {
      await w.run(NEW_ARR);
      assert.equal(w.q('h3').textContent, 'New arrangement');
      const phraseOptions = [...w.q('.forge-arr-phrase').options].map((o: any) => o.value);
      assert.deepEqual(phraseOptions, ['phrase_003', 'phrase_009'], 'the vault\'s phrases, never README');
      w.click(w.q('.forge-arr-add'));
      const rows = [...w.modals[0].contentEl.querySelectorAll('.forge-arr-track')];
      rows[0].querySelector('.forge-arr-phrase').value = 'phrase_003';
      rows[1].querySelector('.forge-arr-phrase').value = 'phrase_009';
      w.click(w.q('.forge-arr-create')); await w.flush();
      assert.deepEqual(w.madeFolders, ['arrangements']);
      assert.deepEqual(w.created.map(([p]) => p), ['arrangements/arr_001.md']);
      const read = readArrangementNote(w.created[0][1]);
      assert.ok(read.ok);
      if (read.ok) assert.deepEqual(read.value.tracks, [{ kit: 'latin', phrase: 'phrase_003' }, { kit: 'rock', phrase: 'phrase_009' }]);
      assert.deepEqual(w.lines.filter((l) => l.startsWith('[forge-arrangement]')), ['[forge-arrangement] created arrangements/arr_001.md tracks=phrase_003@latin,phrase_009@rock']);
      assert.deepEqual(w.leaves.flatMap((l) => l.states).map((s: any) => [s.type, s.state.file]), [[ARRANGEMENT_VIEW_TYPE, 'arrangements/arr_001.md']]);
      assert.equal(w.modals[0].closed, true);
    } finally { w.done(); }
  });

  test(`[${edition}] "Open arrangement as Score" switches an arrangement note to the arrangement tab; "Refresh note links" reaches kits and arrangements (stale derived text regenerated, current notes not written)`, async () => {
    const arr = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] });
    const stale = { 'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick'] }).replace('Add the kick.', 'typed here'), 'arrangements/arr_001.md': arr.replace('# Recipe\n\nPlay', '# Recipe\n\ntyped here\nPlay'), 'phrases/phrase_003.md': 'p' };
    const w = await world(SCORE_FIRST_TOML, stale, 'arrangements/arr_001.md');
    try {
      await w.run(OPEN_ARR);
      assert.deepEqual(w.leaves.flatMap((l) => l.states).map((s: any) => [s.type, s.state.file]), [[ARRANGEMENT_VIEW_TYPE, 'arrangements/arr_001.md']]);
      await w.run(REFRESH);
      assert.ok(!w.store.get('kits/rock.md')!.includes('typed here') && !w.store.get('arrangements/arr_001.md')!.includes('typed here'));
      assert.ok(w.lines.some((l) => /^\[forge-notes\] refresh note links: .*, kits 1 \(1 updated, 0 already current\), arrangements 1 \(1 updated, 0 already current\), 2 skipped$/.test(l)), w.lines.join(' | '));      // the 2 skipped are this fixture's stub phrase and bar, which are not notes the refresh can read
    } finally { w.done(); }
  });

  // ---- 2026-10-29-0910 (M10 slice 2): the controls' write, on the REAL ArrangementView of the real bundle -------------------------------------------------------------------------------
  test(`[${edition}] the arrangement tab's controls write the note through the real view: the changes are applied to the CURRENT text in one process() call, the result is the note New arrangement would have made, an undone change restores the note, and a note that is not an arrangement is refused in a sentence and left alone`, async () => {
    const ARR = { kind: 'arrangement' as const, tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] };
    const fresh = newArrangementNote('arr_001', ARR);
    const w = await world(SCORE_FIRST_TOML, { 'arrangements/arr_001.md': fresh, 'arrangements/arr_002.md': 'just some text' });
    try {
      (Object.prototype as any).addAction = function () { return { remove() {} }; };          // the stand-in view base has no addAction (as in linked-panes-wiring.test.ts)
      const view: any = w.plugin.views.get(ARRANGEMENT_VIEW_TYPE)!(w.leaves[0] ?? {});
      view.app = w.app; view.disposed = false;
      const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
      view.file = tf('arrangements/arr_001.md');
      let processed = 0;
      const realProcess = w.app.vault.process;
      w.app.vault.process = async (f: any, fn: (t: string) => string) => { processed++; return realProcess(f, fn); };
      await view.writeSettings([[1, { mute: true }], [0, { volume: 60 }]]);
      assert.equal(processed, 1, 'ONE atomic read-modify-write for the whole batch');
      assert.equal(w.store.get('arrangements/arr_001.md'), newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003', volume: 60 }, { kit: 'latin', phrase: 'phrase_009', mute: true }] }));
      const back = readArrangementNote(w.store.get('arrangements/arr_001.md')!);
      assert.deepEqual(back.ok && back.value.tracks.map((t) => [t.kit, t.mute, t.volume]), [['rock', undefined, 60], ['latin', true, undefined]]);
      await view.writeSettings([[1, { mute: false }], [0, { volume: 100 }]]);
      assert.equal(w.store.get('arrangements/arr_001.md'), fresh, 'undone = the note as it was, byte for byte');
      await view.writeSettings([]);
      assert.equal(processed, 2, 'an empty batch asks the vault for nothing');
      view.file = tf('arrangements/arr_002.md');
      await view.writeSettings([[0, { mute: true }]]);
      assert.equal(w.store.get('arrangements/arr_002.md'), 'just some text', 'not an arrangement: left alone');
      view.disposed = true; view.file = tf('arrangements/arr_001.md');
      await view.writeSettings([[0, { mute: true }]]);
      assert.equal(w.store.get('arrangements/arr_001.md'), fresh, 'a closed tab writes nothing');
    } finally { delete (Object.prototype as any).addAction; w.done(); }
  });

  test(`[${edition}] the view mounts the row of controls between the strip and the Score, hands changes to writeSettings, and takes it down with the tab (a mechanism pin of the wiring that cannot run without Obsidian)`, () => {
    const ka = fs.readFileSync(path.join(ROOT, 'src/kits-arrangements.ts'), 'utf8');
    const strip = ka.indexOf('mountArrangementStrip(this.contentEl'), controls = ka.indexOf('mountArrangementControls(this.contentEl'), score = ka.indexOf('attachScoreArea(this.contentEl');
    assert.ok(strip > 0 && controls > strip && score > controls, 'strip, then controls, then the Score');
    assert.match(ka, /commit: \(patches\) => \{ void this\.writeSettings\(patches\); \}/);
    assert.match(ka, /const file = this\.file;\n    if \(!file \|\| this\.disposed \|\| patches\.length === 0\) return;/, 'the file is captured before the await (L59)');
    assert.match(ka, /this\.controls\?\.dispose\(\);\n    this\.controls = null;/);
    assert.match(ka, /this\.showControls\(text\); this\.strip\?\.show\(text\); this\.area\?\.update\(text\);/, 'a redraw of the note refreshes the rows too (before the strip and the Score, which the 0830 pin keeps adjacent)');
  });
}
