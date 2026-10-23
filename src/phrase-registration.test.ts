// score_first M5 (drain 2026-10-22-1850; M7 Phase A 2026-10-22-2330 adds "New mix from this bar") — P3 for the phrase surface, proved on the REAL wiring: the real `ForgePlugin.prototype.onload` from the real bundle (both editions), against a vault whose
// forge.toml does or does not declare `profile = "score_first"`.
//   * score-first vault: "New phrase from this bar", "New mix from this bar" and "Open phrase as Score" exist and are offered ONLY on a bar / a phrase; the phrase view type is registered.
//   * every other vault (the tutorial's forge.toml, music-theory's, none at all): NEITHER command, NO phrase view, and nothing touches `phrases/` or `bars/`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { loadRealOnload, type LoadedPlugin } from './test-support/real-onload.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const NEW_PHRASE = 'new-phrase-from-bar';
const OPEN_PHRASE = 'open-phrase-as-score';
const NEW_MIX = 'new-mix-from-bar';
const tick = () => new Promise((r) => setTimeout(r, 60));

function appFor(toml: string | null, active: string | null) {
  const touched: string[] = [];
  const note = (op: string) => (...a: unknown[]) => { touched.push(`${op}(${a.map(String).join(',')})`); };
  return {
    touched,
    app: {
      vault: {
        adapter: { exists: async (p: string) => (p === 'forge.toml' ? toml !== null : false), read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: () => ({}), getMarkdownFiles: () => [], getFiles: () => { note('getFiles')(); return []; },
        getAbstractFileByPath: (p: string) => { note('getAbstractFileByPath')(p); return null; },
        create: async (...a: unknown[]) => { note('create')(...a); }, createFolder: async (...a: unknown[]) => { note('createFolder')(...a); },
        configDir: '.obsidian',
      },
      workspace: { onLayoutReady: (cb: () => void) => { cb(); }, on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getActiveFile: () => (active === null ? null : { path: active }) },
      metadataCache: { on: () => ({}) }, plugins: {},
    },
  };
}

const FIXTURE_BAR = path.join(ROOT, 'test/fixtures/score-first/bar_005.md');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const MUSIC_THEORY_TOML = 'name = "music-theory"\nversion = "0.1.0"\ndescription = "x"\ndomains = ["music"]\n';

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  before(async () => {
    const win: any = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });
  const load = async (toml: string | null, active: string | null) => {
    real ??= await bundleRealPlugin(ROOT, edition);
    const a = appFor(toml, active);
    const plugin: LoadedPlugin = await loadRealOnload(real, a.app);
    await tick();
    real.messageDelivery.resetForTests();
    return { plugin, touched: a.touched, app: a.app };
  };
  const offered = (p: LoadedPlugin, id: string) => p.commands.get(id)?.checkCallback?.(true) ?? false;

  test(`[${edition}] a score-first vault: both phrase commands exist, the phrase view is registered, and each is offered only where it makes sense`, async () => {
    const onBar = await load(SCORE_FIRST_TOML, 'bars/bar_005.md');
    assert.equal(onBar.plugin.commands.get(NEW_PHRASE)?.name, 'New phrase from this bar');
    assert.equal(onBar.plugin.commands.get(OPEN_PHRASE)?.name, 'Open phrase as Score');
    assert.equal(onBar.plugin.commands.get(NEW_MIX)?.name, 'New mix from this bar');
    assert.ok(onBar.plugin.views.has(PHRASE_VIEW_TYPE), 'the phrase view type is registered');
    assert.equal(offered(onBar.plugin, NEW_PHRASE), true, 'on a bar: "New phrase from this bar" is offered');
    assert.equal(offered(onBar.plugin, NEW_MIX), true, 'on a bar: "New mix from this bar" is offered');
    assert.equal(offered(onBar.plugin, OPEN_PHRASE), false, 'on a bar: "Open phrase as Score" is not');
    const onPhrase = await load(SCORE_FIRST_TOML, 'phrases/phrase_001.md');
    assert.equal(offered(onPhrase.plugin, NEW_PHRASE), false);
    assert.equal(offered(onPhrase.plugin, NEW_MIX), false, 'on a phrase: no new mix');
    assert.equal(offered(onPhrase.plugin, OPEN_PHRASE), true);
    for (const active of [null, 'percussion_lab/peak.md', 'bars/README.md', 'phrases/README.md']) {
      const other = await load(SCORE_FIRST_TOML, active);
      assert.equal(offered(other.plugin, NEW_PHRASE), false, `${active}: not a bar`);
      assert.equal(offered(other.plugin, NEW_MIX), false, `${active}: not a bar, no new mix`);
      assert.equal(offered(other.plugin, OPEN_PHRASE), false, `${active}: not a phrase`);
    }
  });

  for (const [label, toml] of [['the tutorial vault (no profile)', TUTORIAL_TOML], ['music-theory (no profile)', MUSIC_THEORY_TOML], ['a vault with no forge.toml', null]] as const) {
    test(`[${edition}] P3 — ${label}: no phrase command, no phrase view, and nothing looks at bars/ or phrases/`, async () => {
      const { plugin, touched } = await load(toml, 'bars/bar_005.md');
      assert.equal(plugin.commands.has(NEW_PHRASE), false);
      assert.equal(plugin.commands.has(OPEN_PHRASE), false);
      assert.equal(plugin.commands.has(NEW_MIX), false, 'P3: "New mix from this bar" is absent here too');
      assert.equal(plugin.views.has(PHRASE_VIEW_TYPE), false);
      assert.deepEqual(touched.filter((t) => /bars|phrases/.test(t)), [], 'no phrases/ handling runs');
      assert.ok(![...plugin.commands.keys()].some((k) => /phrase|mix/i.test(k)), 'no command mentions a phrase or a mix');
      assert.ok(![...plugin.commands.values()].some((c) => /phrase|mix/i.test(String(c.name))), 'no command is NAMED for a phrase or a mix');
    });
  }

  test(`[${edition}] running the commands on the real wiring: "New phrase from this bar" creates phrases/phrase_001.md naming the bar and opens it in a phrase tab; "Open phrase as Score" switches the note's own tab`, async () => {
    const { plugin, app } = await load(SCORE_FIRST_TOML, 'bars/bar_005.md');
    const created: Array<{ path: string; content: string }> = []; const folders: string[] = []; const states: Array<{ how: string; state: any }> = [];
    const leaf = (how: string) => ({ setViewState: async (state: any) => { states.push({ how, state }); } });
    Object.assign(app.vault, {
      createFolder: async (p: string) => { folders.push(p); },
      create: async (p: string, content: string) => { created.push({ path: p, content }); return { path: p, basename: path.basename(p, '.md') }; },
    });
    Object.assign(app.workspace, { getLeaf: (newTab: boolean) => leaf(newTab ? 'new-tab' : 'this-tab'), revealLeaf: () => {} });
    plugin.commands.get(NEW_PHRASE)!.checkCallback!(false);
    await tick();
    assert.deepEqual(folders, ['phrases']);
    assert.equal(created.length, 1);
    assert.equal(created[0].path, 'phrases/phrase_001.md');
    assert.match(created[0].content, /"source": "bar_005"/);
    assert.match(created[0].content, /"bars": 4,\n  "style": "repeat_with_fills",\n  "tempo_change_pct": 0/);
    assert.deepEqual(states.map((s) => [s.how, s.state.type, s.state.state.file]), [['new-tab', PHRASE_VIEW_TYPE, 'phrases/phrase_001.md']]);
    // "Open phrase as Score" on a phrase note: the same tab.
    (app.workspace as any).getActiveFile = () => ({ path: 'phrases/phrase_001.md' });
    const phraseFile = Object.assign(new real.TFile(), { path: 'phrases/phrase_001.md', extension: 'md', basename: 'phrase_001' });
    (app.vault as any).getAbstractFileByPath = (p: string) => (p === 'phrases/phrase_001.md' ? phraseFile : null);   // the active file is a real file of the vault, as in Obsidian
    states.length = 0;
    plugin.commands.get(OPEN_PHRASE)!.checkCallback!(false);
    await tick();
    assert.deepEqual(states.map((s) => [s.how, s.state.type, s.state.state.file]), [['this-tab', PHRASE_VIEW_TYPE, 'phrases/phrase_001.md']]);
  });

  test(`[${edition}] running "New mix from this bar" on the real wiring: it creates phrases/phrase_001.md as a mix of THIS bar and the first other bar, and opens it in a phrase tab; with one bar it says so`, async () => {
    const { plugin, app } = await load(SCORE_FIRST_TOML, 'bars/bar_005.md');
    const created: Array<{ path: string; content: string }> = []; const folders: string[] = []; const states: Array<{ how: string; state: any }> = [];
    const leaf = (how: string) => ({ setViewState: async (state: any) => { states.push({ how, state }); } });
    const file = (p: string) => ({ path: p, basename: path.basename(p, '.md') });
    let bars = ['bars/bar_005.md', 'bars/bar_006.md', 'bars/bar_002.md', 'bars/README.md'];
    Object.assign(app.vault, {
      getFiles: () => bars.map(file),
      createFolder: async (p: string) => { folders.push(p); },
      create: async (p: string, content: string) => { created.push({ path: p, content }); return file(p); },
    });
    Object.assign(app.workspace, { getLeaf: (newTab: boolean) => leaf(newTab ? 'new-tab' : 'this-tab'), revealLeaf: () => {} });
    plugin.commands.get(NEW_MIX)!.checkCallback!(false);
    await tick();
    assert.deepEqual(folders, ['phrases']);
    assert.equal(created.length, 1);
    assert.equal(created[0].path, 'phrases/phrase_001.md');
    assert.match(created[0].content, /"kind": "mix",\n  "a": "bar_005",\n  "b": "bar_002",\n  "weight": 0.5,\n  "threshold": 0.5,\n  "ghost": false/);
    assert.deepEqual(states.map((s) => [s.how, s.state.type, s.state.state.file]), [['new-tab', PHRASE_VIEW_TYPE, 'phrases/phrase_001.md']]);
    // only one bar: the same bar twice, and a Notice (the stub Notice records its message)
    bars = ['bars/bar_005.md']; created.length = 0; states.length = 0;
    const notices = () => ((globalThis as any).__shimConstructed ?? []).filter((c: any) => c[0] === 'Notice').map((c: any) => String(c[1][0]));
    const before = notices().length;
    plugin.commands.get(NEW_MIX)!.checkCallback!(false);
    await tick();
    assert.match(created[0].content, /"a": "bar_005",\n  "b": "bar_005"/);
    assert.ok(notices().slice(before).some((n: string) => /only one bar/i.test(n)), 'a Notice says there is only one bar');
  });

  test(`[${edition}] non-vacuity: the same onload in a score-first vault DOES register them (so the P3 assertions above can fail)`, async () => {
    const { plugin } = await load(SCORE_FIRST_TOML, 'bars/bar_005.md');
    assert.equal(plugin.commands.has(NEW_PHRASE), true);
    assert.equal(plugin.commands.has(NEW_MIX), true);
  });
}

// ---- drain 2026-10-22-2100: the way back from a phrase's JSON to its Score, on the REAL wiring (both editions) --------------------------------------------------------------------------------
for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  before(async () => { real ??= await bundleRealPlugin(ROOT, edition); });
  /** A real onload in a vault with/without the profile and ONE markdown tab showing `path` as text; returns the header buttons every code path put on that tab. */
  async function headerFor(toml: string | null, path: string, opts: { startPath?: string; only?: string } = {}) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const handlers = new Map<string, Array<() => void>>();
    const actions: Array<{ icon: string; title: string; cb: () => void; removed: boolean }> = [];
    const states: any[] = [];
    const view = new real.MarkdownView();
    view.file = { path: opts.startPath ?? path, extension: 'md' };
    const el = (globalThis as any).document.createElement('div');
    el.removeClass = (c: string) => el.classList.remove(c); el.addClass = (c: string) => el.classList.add(c);
    view.containerEl = el;
    view.addAction = (icon: string, title: string, cb: () => void) => {
      const a: any = (globalThis as any).document.createElement('div');       // a real element: main.ts's own header code calls addClass / classList on what addAction returns
      a.addClass = (c: string) => a.classList.add(c); a.removeClass = (c: string) => a.classList.remove(c); a.setText = (t: string) => { a.textContent = t; };
      Object.assign(a, { icon, title, cb, removed: false });
      const realRemove = a.remove.bind(a); a.remove = () => { a.removed = true; realRemove(); };
      actions.push(a); return a;
    };
    view.leaf = { setViewState: async (s: any) => { states.push(s); }, view, getRoot: () => null };
    const a = appFor(toml, path);
    const app: any = a.app;
    app.workspace.on = (name: string, cb: () => void) => { (handlers.get(name) ?? handlers.set(name, []).get(name)!).push(cb); return {}; };
    app.workspace.getLeavesOfType = (t: string) => (t === 'markdown' ? [view.leaf] : []);
    app.workspace.revealLeaf = () => {};
    const tfile = Object.assign(new real.TFile(), { path, extension: 'md', basename: path });
    app.vault.getAbstractFileByPath = (p: string) => (p === path ? tfile : null);
    app.metadataCache = { on: () => ({}), getFileCache: () => ({ frontmatter: { type: 'data', content_type: 'json' } }) };
    await loadRealOnload(real, app);
    await tick();
    if (opts.startPath) view.file = { path, extension: 'md' };               // the tab navigates to the note under test after load: only an EVENT can notice
    for (const name of opts.only ? [opts.only] : ['file-open', 'active-leaf-change', 'layout-change']) handlers.get(name)?.forEach((f) => f());
    await tick();
    const titles = actions.filter((x) => !x.removed).map((x) => `${x.icon}:${x.title}`);
    real.messageDelivery.resetForTests();       // reset AFTER reading: the answer changing re-syncs the header (2200), which is exactly what must not leak into the next test
    return { titles, actions, states };
  }

  test(`[${edition}] THE WAY BACK: a phrase shown as text in a score-first vault has ONE "Open as Score" in its header, and clicking it switches THAT tab to the phrase view`, async () => {
    const h = await headerFor(SCORE_FIRST_TOML, 'phrases/phrase_001.md');
    assert.deepEqual(h.titles.filter((t) => /Score|Beat Box/.test(t)), ['list-music:Open as Score'], 'one button, no rhythm-note buttons that would refuse');
    h.actions.find((x) => !x.removed && x.title === 'Open as Score')!.cb();
    await tick();
    assert.deepEqual(h.states.map((s) => [s.type, s.state.file]), [[PHRASE_VIEW_TYPE, 'phrases/phrase_001.md']]);
  });

  for (const event of ['file-open', 'active-leaf-change', 'layout-change']) {
    test(`[${edition}] a tab that navigates from a bar to a phrase gets the button from the "${event}" event alone`, async () => {
      const h = await headerFor(SCORE_FIRST_TOML, 'phrases/phrase_001.md', { startPath: 'bars/bar_001.md', only: event });
      assert.ok(h.titles.includes('list-music:Open as Score'), h.titles.join(' | '));
      assert.ok(!h.titles.some((t) => /Beat Box/.test(t)), 'and the rhythm buttons are gone with it');
    });
  }

  test(`[${edition}] P3: a bar's text tab in a score-first vault, and the same path in a vault without the profile, have EXACTLY the header they had before (the rhythm note buttons); no phrase button anywhere else`, async () => {
    const bar = await headerFor(SCORE_FIRST_TOML, 'bars/bar_001.md');
    const barElsewhere = await headerFor(TUTORIAL_TOML, 'bars/bar_001.md');
    assert.deepEqual(bar.titles, barElsewhere.titles, 'a bar is the same with and without the profile');
    assert.ok(bar.titles.some((t) => /Open as Beat Box/.test(t)), 'non-vacuity: the rhythm buttons really are there for a bar');
    const phraseNamedNoteElsewhere = await headerFor(TUTORIAL_TOML, 'phrases/phrase_001.md');
    assert.deepEqual(phraseNamedNoteElsewhere.titles, barElsewhere.titles, 'outside a score-first vault a note named like a phrase is just a note: the same buttons a bar gets');
  });
}

// ---- drain 2026-10-22-2105: the COMMAND acts on the tab that shows the phrase, and a failure is never silent ------------------------------------------------------------------------------------
for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  before(async () => { real ??= await bundleRealPlugin(ROOT, edition); });
  /** A score-first vault with TWO main-area leaves: `shows` (a markdown tab on the phrase, the one the person clicked from the explorer) and `other` (what getLeaf(false) returns here: another tab). */
  async function runCommand(opts: { activeView: 'markdown' | 'none'; setViewStateThrows?: boolean; fileMissing?: boolean }) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const states: Array<{ leaf: string; state: any }> = [];
    const path = 'phrases/phrase_001.md';
    const mk = (name: string, throws = false) => ({ name, setViewState: async (s: any) => { if (throws) throw new Error('boom: setViewState failed'); states.push({ leaf: name, state: s }); }, getRoot: () => null });
    const shows: any = mk('shows', opts.setViewStateThrows); const other: any = mk('other');
    const view = new real.MarkdownView(); view.file = { path, extension: 'md' }; view.leaf = shows; shows.view = view;
    const el = (globalThis as any).document.createElement('div'); el.removeClass = () => {}; el.addClass = () => {}; view.containerEl = el;
    view.addAction = () => { const a: any = (globalThis as any).document.createElement('div'); a.addClass = () => {}; a.removeClass = () => {}; return a; };
    const a = appFor(SCORE_FIRST_TOML, path); const app: any = a.app;
    const tfile = Object.assign(new real.TFile(), { path, extension: 'md', basename: 'phrase_001' });
    app.vault.getAbstractFileByPath = (p: string) => (p === path && !opts.fileMissing ? tfile : null);
    app.workspace.getActiveViewOfType = (cls: unknown) => (opts.activeView === 'markdown' && cls === real.MarkdownView ? view : null);
    app.workspace.getLeavesOfType = (t: string) => (t === 'markdown' ? [other, shows] : []);
    let getLeafCalls = 0;
    app.workspace.getLeaf = () => { getLeafCalls++; return other; };   // Obsidian's getLeaf(false): NOT necessarily the tab that shows the note, and it can CREATE a leaf
    app.workspace.revealLeaf = () => {};
    app.metadataCache = { on: () => ({}), getFileCache: () => ({ frontmatter: { type: 'data', content_type: 'json' } }) };
    const plugin = await loadRealOnload(real, app);
    await tick();
    const notices: unknown[] = []; (globalThis as any).__shimConstructed = [];
    const saved = { error: console.error }; console.error = () => {};
    try { plugin.commands.get(OPEN_PHRASE)!.checkCallback!(false); await tick(); } finally { console.error = saved.error; }
    for (const [n, args] of (globalThis as any).__shimConstructed ?? []) if (n === 'Notice') notices.push(args[0]);
    real.messageDelivery.resetForTests();
    const before = getLeafCalls;
    const offered = plugin.commands.get(OPEN_PHRASE)!.checkCallback!(true);        // the palette asking "is this offered?"
    return { states, notices, offered, leafCallsWhileAsking: getLeafCalls - before, leafCallsInTotal: getLeafCalls };
  }

  test(`[${edition}] "Open phrase as Score" switches the tab that SHOWS the phrase (the active markdown view's leaf), not the leaf getLeaf(false) returns`, async () => {
    const r = await runCommand({ activeView: 'markdown' });
    assert.deepEqual(r.states.map((s) => [s.leaf, s.state.type, s.state.state.file]), [['shows', PHRASE_VIEW_TYPE, 'phrases/phrase_001.md']]);
    assert.equal(r.offered, true);
    assert.equal(r.leafCallsInTotal, 0, 'a tab shows the phrase, so Obsidian is never asked for a leaf');
  });

  test(`[${edition}] merely ASKING whether the command is offered never calls getLeaf (it can create a leaf)`, async () => {
    const r = await runCommand({ activeView: 'none' });
    assert.equal(r.leafCallsWhileAsking, 0);
  });

  test(`[${edition}] with the focus somewhere that is not a markdown view (the explorer), it still finds the tab that shows the active file`, async () => {
    const r = await runCommand({ activeView: 'none' });
    assert.deepEqual(r.states.map((s) => s.leaf), ['shows']);
  });

  test(`[${edition}] a phrase that is not in the vault is a Notice naming it, not nothing`, async () => {
    const r = await runCommand({ activeView: 'markdown', fileMissing: true });
    assert.deepEqual(r.states, []);
    assert.equal(r.notices.length, 1);
    assert.match(String(r.notices[0]), /^Open phrase as Score failed: phrases\/phrase_001\.md is not in this vault\.$/);
  });

  test(`[${edition}] a failure is NEVER silent: when switching the tab throws, one Notice names the command and the reason`, async () => {
    const r = await runCommand({ activeView: 'markdown', setViewStateThrows: true });
    assert.equal(r.notices.length, 1, JSON.stringify(r.notices));
    assert.match(String(r.notices[0]), /^Open phrase as Score failed: boom: setViewState failed/);
  });
}

/** A markdown tab on `path` in a score-first vault (real onload) with its header buttons recorded; see the tests below. */
async function lateProfileFor(real: RealPlugin, path = 'phrases/phrase_001.md') {
  const actions: any[] = []; const states: any[] = [];
  const handlers = new Map<string, Array<() => void>>(); const metaHandlers = new Map<string, Array<() => void>>(); const vaultHandlers = new Map<string, Array<(f: any) => void>>(); const profileReadable = { on: true };
  const view = new real.MarkdownView(); view.file = { path, extension: 'md' };
  const mkEl = () => { const a: any = (globalThis as any).document.createElement('div'); a.addClass = (c: string) => a.classList.add(c); a.removeClass = (c: string) => a.classList.remove(c); a.setText = (t: string) => { a.textContent = t; }; return a; };
  view.containerEl = mkEl();
  view.addAction = (icon: string, title: string, cb: () => void) => { const a = mkEl(); Object.assign(a, { icon, title, cb, removed: false }); const r = a.remove.bind(a); a.remove = () => { a.removed = true; r(); }; actions.push(a); return a; };
  view.leaf = { setViewState: async (s: any) => { states.push(s); }, view, getRoot: () => null };
  const a = appFor(SCORE_FIRST_TOML, path); const app: any = a.app;
  app.workspace.on = (name: string, cb: () => void) => { (handlers.get(name) ?? handlers.set(name, []).get(name)!).push(cb); return {}; };
  app.vault.on = (name: string, cb: (f: any) => void) => { (vaultHandlers.get(name) ?? vaultHandlers.set(name, []).get(name)!).push(cb); return {}; };
  app.vault.adapter = { exists: async (p: string) => p === 'forge.toml' && profileReadable.on, read: async (p: string) => (p === 'forge.toml' && profileReadable.on ? SCORE_FIRST_TOML : '') };   // the profile read can be made to come back empty (mid-write / unreadable)
  app.workspace.getLeavesOfType = (t: string) => (t === 'markdown' ? [view.leaf] : []);
  app.workspace.revealLeaf = () => {};
  const tfile = Object.assign(new real.TFile(), { path, extension: 'md', basename: 'phrase_001' });
  app.vault.getAbstractFileByPath = (p: string) => (p === path ? tfile : null);
  app.vault.read = async () => fs.readFileSync(path.startsWith('bars/') ? FIXTURE_BAR : '/dev/null', 'utf8');
  app.metadataCache = { on: (name: string, cb: () => void) => { (metaHandlers.get(name) ?? metaHandlers.set(name, []).get(name)!).push(cb); return {}; }, getFileCache: () => ({ frontmatter: { type: 'data', content_type: 'json' } }) };
  await loadRealOnload(real, app);
  await tick();
  const live = () => actions.filter((x) => !x.removed).map((x) => `${x.icon}:${x.title}`);
  return {
    live, actions, states,
    answerUnknown: async () => { real.messageDelivery.resetForTests(); handlers.get('layout-change')?.forEach((f) => f()); await tick(); },
    answerFlipsFalseLater: async () => {          // the REAL path: forge.toml reads back without the profile (mid-write, a read error) -> refresh() answers false for BOTH the shared flag and score-first.ts's own variable
        profileReadable.on = false;
        vaultHandlers.get('modify')?.forEach((f) => f({ path: 'forge.toml' }));
        await tick();
        handlers.get('layout-change')?.forEach((f) => f()); await tick();
      },
    silentlyNavigateTo: (p: string) => { view.file = { path: p, extension: 'md' }; },
    fire: async (kind: 'workspace' | 'metadata', name: string) => { (kind === 'workspace' ? handlers : metaHandlers).get(name)?.forEach((f) => f()); await tick(); },
    answerArrives: async () => { real.messageDelivery.setScoreFirst(true); await tick(); },
    cleanup: () => real.messageDelivery.setScoreFirst(false),
  };
}


// ---- drain 2026-10-22-2200: the ORDER that left the Beat Box's "Open as Score" on a phrase: the rhythm header sync ran while the profile answer was still unknown, and the answer arrived later ---------
for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  before(async () => { real ??= await bundleRealPlugin(ROOT, edition); });
  /** A score-first vault with a markdown tab on the phrase. `answerUnknown()` puts the shared answer back to "not known yet" (false) and fires a workspace event, the way a restored tab or a plugin reload
   *  makes the rhythm sync run before the profile read finishes; `answerArrives()` is the profile read finishing. NO workspace event follows it: that is the point. */
  const lateProfile = (path?: string) => lateProfileFor(real, path);

  test(`[${edition}] BEFORE the profile answer a candidate tab gets the rhythm buttons (today's behaviour everywhere); the moment the answer arrives, with NO workspace event, a phrase's text tab has exactly ONE "Open as Score", the phrase one`, async () => {
    const t = await lateProfile();
    await t.answerUnknown();
    assert.ok(t.live().some((x) => /Open as Beat Box/.test(x)), `non-vacuity: while the answer is unknown the rhythm buttons are on the tab: ${t.live().join(' | ')}`);
    await t.answerArrives();
    assert.deepEqual(t.live().filter((x) => /Open as Score/.test(x)), ['list-music:Open as Score'], `exactly one, after the answer: ${t.live().join(' | ')}`);
    assert.ok(!t.live().some((x) => /Beat Box/.test(x)), 'and no Beat Box button on a phrase');
    t.cleanup();
  });

  test(`[${edition}] P3: on a BAR in a score-first vault the Beat Box button is never refused: it switches the tab to the Beat Box (and no "phrase, not a bar" Notice)`, async () => {
    const t = await lateProfile('bars/bar_005.md');
    await t.answerArrives();
    const btn = t.actions.find((x) => !x.removed && x.title === 'Open as Beat Box');
    assert.ok(btn, 'the rhythm button is on a bar');
    (globalThis as any).__shimConstructed = [];
    btn.cb(); await tick();
    const notices = ((globalThis as any).__shimConstructed ?? []).filter((c: any[]) => c[0] === 'Notice');
    assert.deepEqual(notices, [], 'no Notice');
    assert.equal(t.states.length, 1, 'the tab was switched');
    t.cleanup();
  });

  test(`[${edition}] belt and braces: a stale rhythm button clicked on a phrase in a score-first vault refuses by NAME ("this is a phrase, not a bar") and switches nothing`, async () => {
    const t = await lateProfile();
    await t.answerUnknown();
    const stale = t.actions.find((x) => !x.removed && x.title === 'Open as Beat Box');          // the rhythm sync's button (both editions have it), not the phrase's own
    assert.ok(stale, 'a rhythm button exists while the answer is unknown');
    await t.answerArrives();
    (globalThis as any).__shimConstructed = [];
    stale.cb(); await tick();
    const notices = ((globalThis as any).__shimConstructed ?? []).filter((c: any[]) => c[0] === 'Notice').map((c: any[]) => String(c[1][0]));
    assert.equal(notices.length, 1, JSON.stringify(notices));
    assert.match(notices[0], /this is a phrase, not a bar/i);
    assert.deepEqual(t.states, [], 'nothing was switched');
    t.cleanup();
  });
}

// ---- drain 2026-10-22-2200 (second round): the driver saw the Beat Box pair on a phrase's text tab and NOT the phrase's own ---------------------------------------------------------------------------
for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  before(async () => { real ??= await bundleRealPlugin(ROOT, edition); });
  async function tab(startPath?: string) {
    real ??= await bundleRealPlugin(ROOT, edition);
    return lateProfileFor(real, startPath);
  }
  const oneScoreOnly = (live: string[]) => {
    assert.deepEqual(live.filter((x) => /Open as Score/.test(x)), ['list-music:Open as Score'], live.join(' | '));
    assert.ok(!live.some((x) => /Beat Box/.test(x)), `no Beat Box button: ${live.join(' | ')}`);
  };

  test(`[${edition}] a later answer of "false" (a failed or mid-write re-read of forge.toml) does NOT flip a phrase's text tab: still exactly the phrase's button, never the Beat Box pair`, async () => {
    const t = await tab();
    oneScoreOnly(t.live());                           // the normal state after load
    await t.answerFlipsFalseLater();
    oneScoreOnly(t.live());
    t.cleanup();
  });

  test(`[${edition}] a stale rhythm button clicked AFTER the live answer flipped to false still refuses a phrase by name (the refusal uses the sticky answer, like the header)`, async () => {
    const t = await tab();
    await t.answerUnknown();                              // rhythm buttons are added while the answer is unknown
    const stale = t.actions.find((x) => !x.removed && x.title === 'Open as Beat Box');
    assert.ok(stale, 'a rhythm button exists');
    await t.answerArrives();                              // sticky is now true
    await t.answerFlipsFalseLater();                      // the live answer goes false (an unreadable forge.toml)
    (globalThis as any).__shimConstructed = [];
    stale.cb(); await tick();
    const notices = ((globalThis as any).__shimConstructed ?? []).filter((c: any[]) => c[0] === 'Notice').map((c: any[]) => String(c[1][0]));
    assert.equal(notices.length, 1, JSON.stringify(notices));
    assert.match(notices[0], /this is a phrase, not a bar/i);
    assert.deepEqual(t.states, []);
    t.cleanup();
  });

  test(`[${edition}] "Open as JSON" asks the header syncs directly: a tab that became a phrase with NO workspace event gets the phrase button and loses the rhythm pair at once`, async () => {
    const t = await tab('bars/bar_005.md');           // the tab shows a bar first (rhythm buttons), the way a reused view would
    assert.ok(t.live().some((x) => /Open as Beat Box/.test(x)), 'non-vacuity: the bar has the rhythm buttons');
    t.silentlyNavigateTo('phrases/phrase_001.md');    // setViewState: no file-open, no active-leaf-change
    assert.ok(t.live().some((x) => /Open as Beat Box/.test(x)), 'non-vacuity: nothing has re-decided yet');
    real.headerResync.request('open-as-json');
    oneScoreOnly(t.live());
    t.cleanup();
  });

  test(`[${edition}] the metadata cache's "changed" event alone re-decides the phrase's button too (the rhythm sync always listened to it; the phrase's did not)`, async () => {
    const t = await tab('bars/bar_005.md');
    t.silentlyNavigateTo('phrases/phrase_001.md');
    await t.fire('metadata', 'changed');
    oneScoreOnly(t.live());
    t.cleanup();
  });
}

test('MECHANISM PIN (the Obsidian-coupled half cannot run headless): the phrase tab\'s "Open as JSON" asks the header syncs directly, right after the view switch and again once the view has settled', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/phrase-view.ts'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const body = src.slice(src.indexOf('private async openAsJson'));
  assert.match(body, /await this\.leaf\.setViewState\(\{ type: 'markdown'[^\n]*\);\s*headerResync\.request\('open-as-json'\);\s*window\.setTimeout\(\(\) => headerResync\.request\('open-as-json\+150ms'\), 150\);\s*window\.setTimeout\(\(\) => headerResync\.request\('open-as-json\+600ms'\), 600\);/);
});
