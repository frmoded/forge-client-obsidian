// 2026-11-04-1170 (Scale Explorer 1 of 4) — P3 for the Scale Explorer, proved on the REAL wiring: the real `ForgePlugin.prototype.onload` from the real bundle, in both editions (card 12).
//   * music edition: the `forge-scale` code-block processor, the side view type and the command "Open Scale Explorer" are registered.
//   * lean edition: NONE of the three. Everything else onload registers is the same in both (a control: the `html-embed` processor and the Forge panel view are there in lean).
//   * the sources: the lean edition's module graph never reaches the explorer's files (the lean implementation of the seam is a no-op; only music-edition.full.ts imports scale-explorer-view.ts).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { iterateAllLeavesLikeObsidian } from './test-support/host-workspace.ts';
import { loadRealOnload } from './test-support/real-onload.ts';
import { SCALE_EXPLORER_COMMAND_ID, SCALE_EXPLORER_LANGUAGE, SCALE_EXPLORER_VIEW_TYPE } from './scale-explorer-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const MUSIC_THEORY_TOML = 'name = "music-theory"\nversion = "0.1.0"\ndescription = "x"\ndomains = ["music"]\n';
const tick = () => new Promise((r) => setTimeout(r, 60));

function app() {
  return {
    vault: {
      adapter: { exists: async (p: string) => p === 'forge.toml', read: async (p: string) => (p === 'forge.toml' ? MUSIC_THEORY_TOML : '') },
      on: () => ({}), getMarkdownFiles: () => [], getFiles: () => [], getAbstractFileByPath: () => null, create: async () => {}, createFolder: async () => {}, configDir: '.obsidian',
    },
    workspace: { onLayoutReady: (cb: () => void) => { cb(); }, iterateAllLeaves: iterateAllLeavesLikeObsidian<unknown>(() => ({})), on: () => ({}), getLeavesOfType: () => [], getActiveViewOfType: () => null, getActiveFile: () => null },
    metadataCache: { on: () => ({}) }, plugins: {},
  };
}

for (const edition of ['lean', 'music'] as const) {
  let real: RealPlugin;
  before(async () => {
    const win: any = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  });
  const load = async () => {
    real ??= await bundleRealPlugin(ROOT, edition);
    const p = await loadRealOnload(real, app());
    await tick();
    return p;
  };

  if (edition === 'music') {
    test('[music] the forge-scale processor, the Scale Explorer view and the command "Open Scale Explorer" are registered', async () => {
      const p = await load();
      assert.equal(typeof p.processors.get(SCALE_EXPLORER_LANGUAGE), 'function', 'the forge-scale code-block processor');
      assert.equal(SCALE_EXPLORER_LANGUAGE, 'forge-scale');
      assert.equal(typeof p.views.get(SCALE_EXPLORER_VIEW_TYPE), 'function', 'the side view');
      assert.equal(p.commands.get(SCALE_EXPLORER_COMMAND_ID)?.name, 'Open Scale Explorer');
      assert.equal(typeof p.commands.get(SCALE_EXPLORER_COMMAND_ID)?.callback, 'function');
    });
  } else {
    test('[lean] no forge-scale processor, no Scale Explorer view, no command; the rest of onload is unchanged (html-embed and the Forge panel are still registered)', async () => {
      const p = await load();
      assert.equal(p.processors.has(SCALE_EXPLORER_LANGUAGE), false);
      assert.equal(p.views.has(SCALE_EXPLORER_VIEW_TYPE), false);
      assert.equal(p.commands.has(SCALE_EXPLORER_COMMAND_ID), false);
      assert.equal([...p.commands.values()].some((c) => /scale/i.test(c.name ?? '')), false, 'no command with "scale" in its name');
      assert.ok(p.processors.has('html-embed'), 'control: the recording sees the processors that ARE registered');
      assert.ok(p.views.size > 0, 'control: the recording sees the views that ARE registered');
    });
  }
}

test('only the music implementation of the seam reaches the Scale Explorer files (the lean one and main.ts do not import them)', () => {
  const src = (f: string) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').replace(/\/\/.*$/gm, '');
  assert.match(src('music-edition.full.ts'), /from '\.\/scale-explorer-view\.ts'/);
  for (const f of ['music-edition.lean.ts', 'music-edition.ts', 'main.ts', 'music-edition-selected.ts']) assert.doesNotMatch(src(f), /scale-explorer/, `${f} must not import the explorer`);
  assert.match(src('main.ts'), /musicEdition\.registerScaleExplorer\(this\)/, 'main.ts goes through the seam');
});
