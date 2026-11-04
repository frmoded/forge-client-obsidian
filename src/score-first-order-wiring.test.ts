// 2026-11-03-1155-93 (score_first polish R6) - "in Score mode the Score is always the first thing in the tab", on the REAL wiring, both editions: the real ForgePlugin.onload from the real bundle, the real PhraseView, ArrangementView and
// CompositionView built by the factories it registered, over an in-memory vault, with an engine that NEVER answers (so what is measured is the tab as it is built, before any Score exists). What this proves: in every score-first tab kind the Score
// panel (the lean edition's one line in its place) is the first child, the parts that used to be above it (the controls, the chips, the header, the tree, the bracket, the notebook) come after it; the description banner is the one thing that may
// stand above it, and stays above it when it comes and goes and when a phrase rebuilds itself for a new kind; a comparator that said "first" for the old order would fail its CONTROL. It pins the MECHANISM (every attachScoreArea call asks for `first`;
// the Score slot is found by the banner's class); if the design moves this SHOULD go red - reassess, do not just rewrite. The Beat Box tab is built by RhythmEditView (not buildable under happy-dom: a blob-URL iframe); its order is pinned at the
// slot (live-score-dom.test.ts: a parent that already holds the iframe gets the Score before it) and measured in real Chrome (scripts/dev/measure-score-order.ts).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { installHostClock, iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { ARRANGEMENT_VIEW_TYPE, newArrangementNote, type ArrangementParams } from './arrangement-core.ts';
import { COMPOSITION_VIEW_TYPE, newCompositionNote } from './composition-core.ts';
import { PHRASE_VIEW_TYPE, noteContentFor } from './phrase-core.ts';
import { asCustom, pythonTextOf } from './phrase-notes-core.ts';
import { newKitNote } from './kit-core.ts';
import { mountDescriptionBar } from './description-bar-dom.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first/music-playground.forge.toml'), 'utf8');
const barText = (n: string): string => fs.readFileSync(path.join(ROOT, 'test/fixtures/score-first', `${n}.md`), 'utf8');
const extend = (source: string, bars: number): any => ({ kind: 'extend', source, bars, style: 'repeat_with_fills', tempo_change_pct: 0 });
const MIX: any = { kind: 'mix', a: 'bar_007', b: 'bar_008', weight: 0.5, threshold: 0.5, ghost: false };
const PHRASE = 'phrases/phrase_003.md', ARR = 'arrangements/arr_001.md', COMP = 'compositions/comp_001.md';
const ARR_CUSTOM = 'arrangements/arr_900.md', PHRASE_CUSTOM = 'phrases/phrase_900.md';
const customOf = (text: string): string => { const py = pythonTextOf(text) as string; return asCustom(text.replace(py, `${py}\n  # the person's own line`)); };
const FILES: Record<string, string> = {
  'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': barText('bar_008'),
  'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] } as any), 'kits/latin.md': newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] } as any),
  [PHRASE]: noteContentFor('phrase_003', extend('bar_007', 4)), 'phrases/phrase_009.md': noteContentFor('phrase_009', extend('bar_008', 2)),
  [ARR]: newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] } as ArrangementParams),
  [ARR_CUSTOM]: customOf(newArrangementNote('arr_900', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] } as ArrangementParams)),
  [PHRASE_CUSTOM]: customOf(noteContentFor('phrase_900', extend('bar_007', 4))),
  [COMP]: newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_003' }, { source: 'phrases/phrase_009' }] } as any),
};

/** The role of one direct child of a tab's pane. Anything that is none of these is reported as `other:<class>` so a new part cannot hide. */
const ROLES: Array<[string, string]> = [
  ['banner', 'forge-description-bar'], ['score', 'forge-rhythm-edit-score'], ['bracket', 'forge-phrase-bracket'], ['controls', 'forge-phrase-controls'], ['arrangement-controls', 'forge-arr-controls'],
  ['chips', 'forge-structure-strip'], ['tree', 'forge-composition-tree'], ['notebook', 'forge-notebook'], ['arrangement-header', 'forge-arrangement-header'], ['composition-header', 'forge-composition-header'], ['pin', 'forge-arrangement-pin'],
];
const rolesOf = (el: any): string[] => [...el.children].map((c: any) => ROLES.find(([, cls]) => c.classList.contains(cls))?.[0] ?? `other:${String(c.className)}`);
/** The comparator: the Score is above every other part, and only the banner may stand above it. */
const scoreFirst = (roles: string[]): boolean => roles.includes('score') && roles.slice(0, roles.indexOf('score')).every((r) => r === 'banner');

test('the comparator: the OLD order of every tab kind is "not first", and a banner above the Score is allowed (the CONTROL: it can say no)', () => {
  assert.equal(scoreFirst(['controls', 'bracket', 'chips', 'score', 'notebook']), false, 'phrase, old');
  assert.equal(scoreFirst(['arrangement-header', 'pin', 'chips', 'arrangement-controls', 'score']), false, 'arrangement, old');
  assert.equal(scoreFirst(['composition-header', 'tree', 'score']), false, 'composition, old');
  assert.equal(scoreFirst(['banner', 'controls', 'score']), false, 'a banner does not excuse the controls above');
  assert.equal(scoreFirst(['score', 'bracket', 'controls', 'chips', 'notebook']), true);
  assert.equal(scoreFirst(['banner', 'score', 'controls']), true, 'the banner may stand above the Score');
  assert.equal(scoreFirst(['controls']), false, 'no Score at all is not "first"');
});

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  let win: any;

  async function world() {
    win ??= new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
    real ??= await bundleRealPlugin(ROOT, edition);
    const clock = installHostClock(win);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const store = new Map<string, string>(Object.entries(FILES));
    const handlers = new Map<string, Array<(f: any) => void>>();
    const leaves: any[] = [];
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml', read: async () => SCORE_FIRST_TOML }, on: (name: string, cb: (f: any) => void) => { (handlers.get(name) ?? handlers.set(name, []).get(name)!).push(cb); return {}; }, configDir: '.obsidian',
        getFiles: () => [...store.keys()].map(tf), getMarkdownFiles: () => [...store.keys()].map(tf),
        getAbstractFileByPath: (p: string) => (store.has(p) ? tf(p) : null), read: async (f: any) => { const t = store.get(f.path); if (t === undefined) throw new Error('File not found'); return t; },
        process: async (f: any, fn: (t: string) => string) => { store.set(f.path, fn(store.get(f.path) ?? '')); },
      },
      workspace: { rootSplit: {}, leftSplit: {}, rightSplit: {}, onLayoutReady: (cb: () => void) => { cb(); }, iterateAllLeaves: iterateAllLeavesLikeObsidian<any>(() => ({ root: leaves })), on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getMostRecentLeaf: () => null, getActiveFile: () => null },
      metadataCache: { resolvedLinks: {}, on: () => ({}) }, plugins: {},
    };
    const savedInfo = console.info, savedError = console.error, savedDebug = console.debug;
    console.info = () => {}; console.error = () => {}; console.debug = () => {};
    const HP = win.HTMLElement.prototype;
    const saved = ['createEl', 'createDiv', 'createSpan', 'setText', 'empty', 'addClass', 'removeClass'].map((k) => [k, HP[k]] as const);
    HP.createEl = function (tag: string, o: any = {}) { const e = win.document.createElement(tag); if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; if (o.attr) for (const [k, v] of Object.entries(o.attr)) e.setAttribute(k, String(v)); this.appendChild(e); return e; };
    HP.createDiv = function (o: any = {}) { return this.createEl('div', o); };
    HP.createSpan = function (o: any = {}) { return this.createEl('span', o); };
    HP.setText = function (t: string) { this.textContent = t; };
    HP.empty = function () { this.textContent = ''; };
    HP.addClass = function (c: string) { this.classList.add(c); };
    HP.removeClass = function (c: string) { this.classList.remove(c); };
    const bases = [Object.getPrototypeOf(real.PhraseView.prototype)];                                   // the three views share the one stand-in base class
    const savedBases = bases.map((b: any) => ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose'].map((k) => [b, k, b[k]] as const));
    for (const b of bases) for (const m of ['onLoadFile', 'onUnloadFile', 'onOpen', 'onClose']) b[m] = b[m] ?? (async function () {});
    (Object.prototype as any).addAction = function () { return { remove() {} }; };
    const g: any = globalThis; const savedRaf = g.requestAnimationFrame; g.requestAnimationFrame = (fn: () => void) => setImmediate(fn);
    const plugin = await loadRealOnload(real, app);
    await clock.advance(60);
    real.setPyodideHostSingleton({ getInstance: async () => ({ computePhraseScore: () => new Promise(() => {}) }) });         // the engine never answers: no Score is ever drawn, the tab is as it was built
    const open = async (type: string, file: string) => {
      const leaf: any = { getViewState: () => ({ type, state: { file } }), getRoot: () => ({}) };
      const view: any = plugin.views.get(type)!(leaf);
      const el = win.document.createElement('div'); win.document.body.appendChild(el);
      view.app = app; view.file = tf(file); view.leaf = leaf; view.registerEvent = (e: unknown) => e; view.contentEl = el; leaf.view = view; leaves.push(leaf);
      await view.onOpen(); await view.onLoadFile(view.file); await clock.advance(20);
      return { view, el };
    };
    return {
      open, store, handlers, clock,
      modify: async (p: string, text: string) => { store.set(p, text); for (const cb of handlers.get('modify') ?? []) cb(tf(p)); for (let i = 0; i < 10; i++) await Promise.resolve(); await clock.advance(20); },
      done: () => {
        console.info = savedInfo; console.error = savedError; console.debug = savedDebug;
        for (const [k, v] of saved) { if (v === undefined) delete HP[k]; else HP[k] = v; }
        for (const list of savedBases) for (const [b, k, v] of list) { if (v === undefined) delete b[k]; }
        delete (Object.prototype as any).addAction; g.requestAnimationFrame = savedRaf; if (savedRaf === undefined) delete g.requestAnimationFrame; real.setPyodideHostSingleton(null); clock.restore();
      },
    };
  }

  test(`[${edition}] the phrase tab: the Score is the first child, then its bracket, the controls and the rest (nothing the tab had above the Score is above it any more)`, async () => {
    const w = await world();
    try {
      const { el } = await w.open(PHRASE_VIEW_TYPE, PHRASE);
      const roles = rolesOf(el);
      assert.ok(scoreFirst(roles), roles.join(' > '));
      assert.equal(roles[0], 'score');
      assert.equal(roles[1], 'bracket', 'the bracket sits directly under the Score it brackets');
      assert.equal(roles[2], 'controls');
      assert.ok(roles.length >= 3, 'non-vacuity: the tab has parts besides the Score, so "first" says something: ' + roles.join(' > '));
      assert.deepEqual(roles.filter((r) => r.startsWith('other:')), [], 'every part of the tab is a known role');
      if (edition === 'lean') assert.ok(el.children[0].classList.contains('forge-rhythm-edit-score-lean'), 'the lean edition\'s one line is what stands first');
    } finally { w.done(); }
  });

  test(`[${edition}] the arrangement tab: the Score is the first child; the sentence, the pin line, the strip, the controls and the status line keep their order under it`, async () => {
    const w = await world();
    try {
      const { el } = await w.open(ARRANGEMENT_VIEW_TYPE, ARR);
      const roles = rolesOf(el);
      assert.ok(scoreFirst(roles), roles.join(' > '));
      assert.equal(roles[0], 'score');
      assert.deepEqual(roles.filter((r) => r !== 'score' && !r.startsWith('other:')).slice(0, 2), ['arrangement-header', 'pin'], 'the parts under the Score keep the order they had: ' + roles.join(' > '));
      assert.ok(roles.indexOf('arrangement-controls') > roles.indexOf('pin'), 'the kit controls are still under the pin line');
      assert.ok(roles.length >= 5, 'non-vacuity: ' + roles.join(' > '));
    } finally { w.done(); }
  });

  test(`[${edition}] the composition tab: the Score is the first child, then the header and the tree`, async () => {
    const w = await world();
    try {
      const { el } = await w.open(COMPOSITION_VIEW_TYPE, COMP);
      const roles = rolesOf(el);
      assert.ok(scoreFirst(roles), roles.join(' > '));
      assert.equal(roles[0], 'score');
      assert.equal(roles[1], 'composition-header');
      assert.ok(roles.length >= 2, 'non-vacuity: ' + roles.join(' > '));
    } finally { w.done(); }
  });

  test(`[${edition}] the description banner is the one thing above the Score: it is put above it when it comes, a phrase that rebuilds itself for a new kind (extend -> mix) keeps the Score under the banner and ahead of its new strip, and a mix tab is Score, strip too`, async () => {
    const w = await world();
    try {
      const { el } = await w.open(PHRASE_VIEW_TYPE, PHRASE);
      assert.ok(scoreFirst(rolesOf(el)));
      const bar = mountDescriptionBar(el, () => {});                      // what the description controller does when a note has something to say (insertBefore firstChild)
      bar.show({ message: 'The Description changed; update the note from it.', actions: ['update', 'revert'] });
      let roles = rolesOf(el);
      assert.equal(roles[0], 'banner', roles.join(' > '));
      assert.equal(roles[1], 'score', 'the Score is right under the banner');
      assert.ok(scoreFirst(roles));
      await w.modify(PHRASE, noteContentFor('phrase_003', MIX));            // the note becomes a mix: the tab tears its surface down and builds the mix's
      roles = rolesOf(el);
      assert.equal(roles[0], 'banner', 'the banner is still on top after the rebuild: ' + roles.join(' > '));
      assert.equal(roles[1], 'score', 'and the Score is first under it, not last: ' + roles.join(' > '));
      assert.equal(roles[2], 'controls', 'then the mix strip');
      assert.equal(roles.includes('bracket'), false, 'a mix has no bracket');
      bar.dispose();
      roles = rolesOf(el);
      assert.equal(roles[0], 'score', 'the banner goes: the Score is first: ' + roles.join(' > '));
    } finally { w.done(); }
  });

  // ---- 2026-11-03-1160 (c): the controls of a CUSTOM note are off, on the arrangement tab (kits) and the phrase tab (strip), with the banner's sentence as tooltip ----
  const TIP = 'Custom Python: the controls are off for this note.';
  test(`[${edition}] a CUSTOM arrangement: the kit controls are drawn DISABLED with the tooltip; a plain arrangement's are enabled (the CONTROL: the check can fail)`, async () => {
    const w = await world();
    try {
      const { el } = await w.open(ARRANGEMENT_VIEW_TYPE, ARR_CUSTOM);
      const controls = [...el.querySelectorAll('.forge-arr-controls button, .forge-arr-controls input')];
      assert.ok(controls.length >= 6, `non-vacuity: two kits x (Mute, Solo, volume) = ${controls.length} controls`);
      assert.ok(controls.every((c: any) => c.disabled === true && c.getAttribute('title') === TIP), 'every control is disabled and says why');
      assert.equal(el.querySelector('.forge-arr-controls').getAttribute('aria-disabled'), 'true');
      const plain = await w.open(ARRANGEMENT_VIEW_TYPE, ARR);
      const on = [...plain.el.querySelectorAll('.forge-arr-controls button, .forge-arr-controls input')];
      assert.ok(on.length >= 6 && on.every((c: any) => c.disabled === false && !c.hasAttribute('title')), 'CONTROL: a note that is not custom has its controls on');
    } finally { w.done(); }
  });

  test(`[${edition}] a CUSTOM phrase: the strip is off with the same tooltip (one helper), a plain phrase's strip is on`, async () => {
    const w = await world();
    try {
      const { el } = await w.open(PHRASE_VIEW_TYPE, PHRASE_CUSTOM);
      const strip = el.querySelector('.forge-phrase-controls');
      const fields = [...strip.querySelectorAll('input, select, button')];
      assert.ok(fields.length >= 3, 'non-vacuity');
      assert.ok(fields.every((c: any) => c.disabled === true && c.getAttribute('title') === TIP), 'disabled, with the sentence');
      const plain = await w.open(PHRASE_VIEW_TYPE, PHRASE);
      const on = [...plain.el.querySelectorAll('.forge-phrase-controls input, .forge-phrase-controls select')];
      assert.ok(on.length >= 3 && on.every((c: any) => c.disabled === false && !c.hasAttribute('title')), 'CONTROL: not custom, on');
    } finally { w.done(); }
  });

  test(`[${edition}] the composition tab has NO write control to switch off: its only buttons are the chips of the tree, which open notes`, async () => {
    const w = await world();
    try {
      const { el } = await w.open(COMPOSITION_VIEW_TYPE, COMP);
      const buttons = [...el.querySelectorAll('button, input, select, textarea')];
      assert.ok(buttons.length > 0, 'non-vacuity: the tree has chips');
      assert.ok(buttons.every((b: any) => b.classList.contains('forge-structure-chip')), 'every control is a chip: ' + buttons.map((b: any) => b.className).join(' | '));
    } finally { w.done(); }
  });
}

test('MECHANISM PIN 2026-11-03-1155-93 (if the design moves this SHOULD go red - reassess, do not just rewrite): every production call of attachScoreArea asks for `first`, and the Score slot is found by the banner\'s class (never by position)', () => {
  const code = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const callers = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'live-score-dom.ts' && /\battachScoreArea\(/.test(code(`src/${f}`)));
  assert.deepEqual(callers.sort(), ['compositions.ts', 'kits-arrangements.ts', 'phrase-dom.ts', 'rhythm-edit-view.ts'], 'the four tab kinds are the callers (a fifth must decide its place and be listed here)');
  for (const f of callers) {
    const src = code(`src/${f}`);
    const at = src.search(/\battachScoreArea\(/);
    assert.match(src.slice(at, at + 400), /\bfirst: true\b/, `${f}: its attachScoreArea call asks for the first place`);
  }
  const dom = code('src/live-score-dom.ts');
  assert.match(dom, /deps\.first \? scoreSlot\(parent\) : null/, 'the panel is inserted at the slot the helper finds');
  assert.match(dom, /classList\.contains\(DESCRIPTION_BAR_CLASS\)/, 'the slot skips the banner by its class');
  assert.doesNotMatch(dom, /firstElementChild\s*===|children\[0\]/, 'no lookup by position in the slot');
});
