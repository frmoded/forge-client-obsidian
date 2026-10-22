// score_first M5 (drain 2026-10-22-1850) — P3 for the phrase surface, proved on the REAL wiring: the real `ForgePlugin.prototype.onload` from the real bundle (both editions), against a vault whose
// forge.toml does or does not declare `profile = "score_first"`.
//   * score-first vault: "New phrase from this bar" and "Open phrase as Score" exist and are offered ONLY on a bar / a phrase; the phrase view type is registered.
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
    real.messageDelivery.setScoreFirst(false);
    return { plugin, touched: a.touched, app: a.app };
  };
  const offered = (p: LoadedPlugin, id: string) => p.commands.get(id)?.checkCallback?.(true) ?? false;

  test(`[${edition}] a score-first vault: both phrase commands exist, the phrase view is registered, and each is offered only where it makes sense`, async () => {
    const onBar = await load(SCORE_FIRST_TOML, 'bars/bar_005.md');
    assert.equal(onBar.plugin.commands.get(NEW_PHRASE)?.name, 'New phrase from this bar');
    assert.equal(onBar.plugin.commands.get(OPEN_PHRASE)?.name, 'Open phrase as Score');
    assert.ok(onBar.plugin.views.has(PHRASE_VIEW_TYPE), 'the phrase view type is registered');
    assert.equal(offered(onBar.plugin, NEW_PHRASE), true, 'on a bar: "New phrase from this bar" is offered');
    assert.equal(offered(onBar.plugin, OPEN_PHRASE), false, 'on a bar: "Open phrase as Score" is not');
    const onPhrase = await load(SCORE_FIRST_TOML, 'phrases/phrase_001.md');
    assert.equal(offered(onPhrase.plugin, NEW_PHRASE), false);
    assert.equal(offered(onPhrase.plugin, OPEN_PHRASE), true);
    for (const active of [null, 'percussion_lab/peak.md', 'bars/README.md', 'phrases/README.md']) {
      const other = await load(SCORE_FIRST_TOML, active);
      assert.equal(offered(other.plugin, NEW_PHRASE), false, `${active}: not a bar`);
      assert.equal(offered(other.plugin, OPEN_PHRASE), false, `${active}: not a phrase`);
    }
  });

  for (const [label, toml] of [['the tutorial vault (no profile)', TUTORIAL_TOML], ['music-theory (no profile)', MUSIC_THEORY_TOML], ['a vault with no forge.toml', null]] as const) {
    test(`[${edition}] P3 — ${label}: no phrase command, no phrase view, and nothing looks at bars/ or phrases/`, async () => {
      const { plugin, touched } = await load(toml, 'bars/bar_005.md');
      assert.equal(plugin.commands.has(NEW_PHRASE), false);
      assert.equal(plugin.commands.has(OPEN_PHRASE), false);
      assert.equal(plugin.views.has(PHRASE_VIEW_TYPE), false);
      assert.deepEqual(touched.filter((t) => /bars|phrases/.test(t)), [], 'no phrases/ handling runs');
      assert.ok(![...plugin.commands.keys()].some((k) => /phrase/i.test(k)), 'no command mentions a phrase');
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
    states.length = 0;
    plugin.commands.get(OPEN_PHRASE)!.checkCallback!(false);
    await tick();
    assert.deepEqual(states.map((s) => [s.how, s.state.type, s.state.state.file]), [['this-tab', PHRASE_VIEW_TYPE, 'phrases/phrase_001.md']]);
  });

  test(`[${edition}] non-vacuity: the same onload in a score-first vault DOES register them (so the P3 assertions above can fail)`, async () => {
    const { plugin } = await load(SCORE_FIRST_TOML, 'bars/bar_005.md');
    assert.equal(plugin.commands.has(NEW_PHRASE), true);
  });
}
