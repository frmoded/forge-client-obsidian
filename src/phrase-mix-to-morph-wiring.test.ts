// score_first (drain 2026-10-25-1000) — "Turn this mix into a morph" on the REAL wiring: the real `ForgePlugin.prototype.onload` from the real bundle (both editions), a score-first vault, the real `PhraseView` class
// and a stand-in vault whose files are a map. What it proves: the command is offered only on a mix phrase (its Score tab or its text tab) and never in another vault; running it makes ONE new morph note with the mix's
// bars and Bars = d + 1 (d is the engine's: a fake host answers 4) and opens it in a phrase tab; the mix is never written; the strip button's action runs on the view's OWN note; an engine that is not there is a Notice.
// It pins the MECHANISM that the command reads the kind from the active view (`getActiveViewOfType`, never a leaf lookup): if that design moves this SHOULD go red — reassess, do not just rewrite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { PHRASE_VIEW_TYPE, readPhraseNote } from './phrase-core.ts';
import { readRhythmNote } from './rhythm-edit-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FX = path.join(ROOT, 'test/fixtures/score-first');
const SCORE_FIRST_TOML = fs.readFileSync(path.join(FX, 'music-playground.forge.toml'), 'utf8');
const TUTORIAL_TOML = 'name = "forge-tutorial"\nversion = "0.1.0"\ndescription = "x"\ndomains = []\n';
const MUSIC_THEORY_TOML = 'name = "music-theory"\nversion = "0.1.0"\ndescription = "x"\ndomains = ["music"]\n';
const TURN = 'turn-mix-into-morph';
const MIX_PATH = 'phrases/phrase_002.md';
const note = (p: Record<string, unknown>) => `---\ntype: data\ncontent_type: json\ndescription: "phrase_002 — a mix."\n---\n\n\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\`\n`;
const MIX = note({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0, threshold: 0.65, ghost: true });
const EXTEND = note({ kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 });
const MORPH = note({ kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 });
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  before(async () => {
    const win: any = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });

  async function world(toml: string | null, opts: { phrase?: string } = {}) {
    real ??= await bundleRealPlugin(ROOT, edition);
    const files = new Map<string, string>([[MIX_PATH, opts.phrase ?? MIX], ['bars/bar_005.md', fs.readFileSync(path.join(FX, 'bar_005.md'), 'utf8')], ['bars/bar_006.md', fs.readFileSync(path.join(FX, 'bar_006.md'), 'utf8')]]);
    const tf = (p: string) => Object.assign(new real.TFile(), { path: p, extension: 'md', basename: path.basename(p, '.md') });
    const asked: unknown[][] = []; const created: string[] = []; const states: Array<{ how: string; state: any }> = []; const folders: string[] = [];
    const lines: string[] = []; const notices: string[] = [];
    let active: { phrase?: any; text?: any } = {};
    const app: any = {
      vault: {
        adapter: { exists: async (p: string) => p === 'forge.toml' && toml !== null, read: async (p: string) => (p === 'forge.toml' && toml !== null ? toml : '') },
        on: () => ({}), getMarkdownFiles: () => [], configDir: '.obsidian',
        getFiles: () => [...files.keys()].map(tf),
        getAbstractFileByPath: (p: string) => (p === 'phrases' ? {} : files.has(p) ? tf(p) : null),
        read: async (f: any) => { const t = files.get(f.path); if (t === undefined) throw new Error('File not found'); return t; },
        create: async (p: string, content: string) => { files.set(p, content); created.push(p); return tf(p); },
        createFolder: async (p: string) => { folders.push(p); },
      },
      workspace: {
        onLayoutReady: (cb: () => void) => { cb(); }, iterateAllLeaves: iterateAllLeavesLikeObsidian<unknown>(() => ({})), on: () => ({}), getLeavesOfType: () => [], getActiveFile: () => null,
        getActiveViewOfType: (cls: unknown) => (cls === real.PhraseView ? active.phrase ?? null : cls === real.MarkdownView ? active.text ?? null : null),
        getLeaf: (newTab: boolean) => ({ setViewState: async (state: any) => { states.push({ how: newTab ? 'new-tab' : 'this-tab', state }); } }),
        revealLeaf: () => {},
      },
      metadataCache: { on: () => ({}) }, plugins: {},
    };
    const plugin = await loadRealOnload(real, app);
    await tick();
    // AFTER onload: onload puts its own (unhydrated) host in the singleton. The fake answers d = 4 for any pair.
    real.setPyodideHostSingleton({ getInstance: async () => ({ morphChanges: async (a: unknown, b: unknown, order: string, seed: number) => { asked.push([a, b, order, seed]); return 4; } }) });
    (Object.prototype as any).addAction = function () { return { remove() {} }; };       // the stand-in view base has no addAction
    const phraseView = (kind: string | null, file = MIX_PATH) => { const v: any = plugin.views.get(PHRASE_VIEW_TYPE)!({}); v.file = tf(file); v.handle = { kind: () => kind }; return v; };
    const textView = (file: string, text: string) => { const v: any = new real.MarkdownView(); v.file = tf(file); v.editor = { getValue: () => text }; return v; };
    const savedInfo = console.info; console.info = (...a: unknown[]) => { if (String(a[0]).startsWith('[forge-morph]')) lines.push(String(a[0])); };
    const savedConstructed = (globalThis as any).__shimConstructed; (globalThis as any).__shimConstructed = [];
    const noticesNow = () => ((globalThis as any).__shimConstructed as Array<[string, unknown[]]>).filter(([n]) => n === 'Notice').map(([, a]) => String(a[0]));
    return {
      plugin, app, files, asked, created, states, folders, lines, notices, phraseView, textView, noticesNow,
      setActive: (a: typeof active) => { active = a; },
      offered: () => plugin.commands.get(TURN)?.checkCallback?.(true) ?? false,
      done: () => { console.info = savedInfo; (globalThis as any).__shimConstructed = savedConstructed; delete (Object.prototype as any).addAction; real.setPyodideHostSingleton(null); },
    };
  }

  test(`[${edition}] a score-first vault: "Turn this mix into a morph" exists and is offered ONLY while the active tab shows a mix phrase (its Score tab or its text tab)`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      assert.equal(w.plugin.commands.get(TURN)?.name, 'Turn this mix into a morph');
      assert.equal(w.offered(), false, 'no active phrase');
      w.setActive({ phrase: w.phraseView('mix') }); assert.equal(w.offered(), true, 'a mix Score tab');
      for (const kind of ['extend', 'morph', null]) { w.setActive({ phrase: w.phraseView(kind) }); assert.equal(w.offered(), false, `a ${kind} Score tab`); }
      w.setActive({ text: w.textView(MIX_PATH, MIX) }); assert.equal(w.offered(), true, 'a mix phrase as its JSON text');
      w.setActive({ text: w.textView('phrases/phrase_001.md', EXTEND) }); assert.equal(w.offered(), false, 'an extend phrase as text');
      w.setActive({ text: w.textView('phrases/phrase_003.md', MORPH) }); assert.equal(w.offered(), false, 'a morph phrase as text');
      w.setActive({ text: w.textView('bars/bar_005.md', MIX) }); assert.equal(w.offered(), false, 'a bar (even one whose text looks like a mix) is not a phrase');
      w.setActive({ text: w.textView('notes/plain.md', MIX) }); assert.equal(w.offered(), false, 'a note outside phrases/');
    } finally { w.done(); }
  });

  for (const [label, toml] of [['the tutorial vault (no profile)', TUTORIAL_TOML], ['music-theory (no profile)', MUSIC_THEORY_TOML], ['a vault with no forge.toml', null]] as const) {
    test(`[${edition}] P3 — ${label}: no "Turn this mix into a morph" command, nothing asked of the engine, nothing created`, async () => {
      const w = await world(toml);
      try {
        assert.equal(w.plugin.commands.has(TURN), false);
        assert.ok(![...w.plugin.commands.values()].some((c) => /morph/i.test(String(c.name))), 'no command is named for a morph');
        assert.deepEqual(w.asked, []); assert.deepEqual(w.created.filter((p) => /^(phrases|bars)\//.test(p)), [], 'nothing under phrases/ or bars/');
      } finally { w.done(); }
    });
  }

  test(`[${edition}] running it on a mix Score tab: ONE new morph note (the mix's bars, musical order, seed 0, Bars = d + 1 = 5), opened in a phrase tab; the engine was asked for d on the two bars; the mix is byte-unchanged; the evidence line`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      w.setActive({ phrase: w.phraseView('mix') });
      w.plugin.commands.get(TURN)!.checkCallback!(false);
      await tick();
      assert.deepEqual(w.created, ['phrases/phrase_003.md']);
      const made = readPhraseNote(w.files.get('phrases/phrase_003.md')!);
      assert.deepEqual(made.ok && made.value, { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 });
      assert.deepEqual(w.states.map((s) => [s.how, s.state.type, s.state.state.file]), [['new-tab', PHRASE_VIEW_TYPE, 'phrases/phrase_003.md']], 'opened as a Score in a new phrase tab');
      assert.equal(w.asked.length, 1);
      assert.deepEqual([w.asked[0][2], w.asked[0][3]], ['musical', 0]);
      const dataOf = (n: string) => { const r = readRhythmNote(fs.readFileSync(path.join(FX, `${n}.md`), 'utf8')); if (r.ok === false) throw new Error(r.message); return r.value.data; };
      assert.deepEqual(w.asked[0][0], dataOf('bar_005'), 'bar a (the mix\'s a) was read from the vault and given first');
      assert.deepEqual(w.asked[0][1], dataOf('bar_006'), 'bar b second');
      assert.equal(w.files.get(MIX_PATH), MIX, 'the mix is byte-unchanged');
      assert.deepEqual(w.lines, ['[forge-morph] turned phrase_002 (mix) into phrase_003 (morph, bars 5, d 4)']);
      assert.deepEqual(w.noticesNow(), []);
    } finally { w.done(); }
  });

  test(`[${edition}] running it on a mix's JSON text tab does the same; running it twice makes two different morph notes`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      w.setActive({ text: w.textView(MIX_PATH, MIX) });
      w.plugin.commands.get(TURN)!.checkCallback!(false); await tick();
      w.plugin.commands.get(TURN)!.checkCallback!(false); await tick();
      assert.deepEqual(w.created, ['phrases/phrase_003.md', 'phrases/phrase_004.md']);
    } finally { w.done(); }
  });

  test(`[${edition}] the strip's "Morph this mix" button runs the same action on the view's OWN note, whatever tab is active at that moment`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      const view = w.phraseView('mix');
      w.setActive({ text: w.textView('phrases/phrase_009.md', EXTEND) });            // another tab is active when the button is clicked
      assert.equal(typeof view.morphThis, 'function', 'the view was given the action (the mix strip button asks it)');
      view.morphThis(view.file); await tick();
      assert.deepEqual(w.created, ['phrases/phrase_003.md']);
      assert.equal((readPhraseNote(w.files.get('phrases/phrase_003.md')!) as any).value.a, 'bar_005');
    } finally { w.done(); }
  });

  test(`[${edition}] END TO END on the real view: the phrase tab's own strip (mounted by the real PhraseView.onLoadFile) shows **Morph this mix** on a mix, a click on it makes the morph; an extend's strip has none`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    try {
      Object.getPrototypeOf(real.PhraseView.prototype).onLoadFile = async () => {};      // the stand-in base class has no onLoadFile
      const open = async (phrase: string) => {
        w.files.set(MIX_PATH, phrase);
        const v: any = w.plugin.views.get(PHRASE_VIEW_TYPE)!({});
        v.app = w.app; v.file = w.files.has(MIX_PATH) ? v.file : null;
        const host = (globalThis as any).document.createElement('div'); host.addClass = () => {}; host.empty = () => { host.textContent = ''; };
        v.contentEl = host; v.registerEvent = () => {};
        const tfile = Object.assign(new real.TFile(), { path: MIX_PATH, extension: 'md', basename: 'phrase_002' }); v.file = tfile;
        await v.onLoadFile(tfile); await tick(120);
        return { v, host };
      };
      const mix = await open(MIX);
      const button = mix.host.querySelector('.forge-mix-morph');
      assert.ok(button, 'the mix strip has the button');
      assert.equal(button.textContent, 'Morph this mix');
      button.click(); await tick();
      assert.deepEqual(w.created, ['phrases/phrase_003.md']);
      assert.equal((readPhraseNote(w.files.get('phrases/phrase_003.md')!) as any).value.kind, 'morph');
      mix.v.release?.();
      const extend = await open(EXTEND);
      assert.equal(extend.host.querySelector('.forge-mix-morph'), null, 'an extend phrase has no such button');
      assert.equal(w.created.length, 1, 'nothing else was made');
    } finally { w.done(); }
  });

  test(`[${edition}] when the engine cannot be asked the command says why in ONE Notice: nothing is created or opened, no evidence line (never a silent failure)`, async () => {
    const w = await world(SCORE_FIRST_TOML);
    const quiet = console.error; console.error = () => {};
    try {
      real.setPyodideHostSingleton(null);
      w.setActive({ phrase: w.phraseView('mix') });
      w.plugin.commands.get(TURN)!.checkCallback!(false); await tick();
      assert.deepEqual(w.created, []); assert.deepEqual(w.states, []); assert.deepEqual(w.lines, []);
      const n = w.noticesNow();
      assert.equal(n.length, 1, JSON.stringify(n));
      assert.match(n[0], /Could not turn this mix into a morph: .*engine/);
    } finally { console.error = quiet; w.done(); }
  });
}
