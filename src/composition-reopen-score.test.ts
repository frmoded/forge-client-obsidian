// 2026-11-19-0990 (BUG, driver 2026-11-19, testing 0960/0970 in the sandbox) - a composition reopened from the file list opened ONLY as a plain note, and its "Open as Score" refused with "...exactly one fenced json block". The driver's steps, on the REAL
// wiring (music-tabs-world.ts: the real ForgePlugin.onload, real leaves that build the real views, the host's own events): (1) New composition (an empty note, named by the plugin), renamed by hand to A; (2) its Recipe edited BY HAND (and, the other
// route, sentences through the composer); (3) a second composition B; (4) A reopened by the file list / a link / a tab restored after a reload. The cause (investigation, see the DIAGNOSIS test): nothing routed a composition or an arrangement note to
// its Score as a phrase's is (phrase-default-view-core.ts knew phrases only), and the Beat Box's "Open as Score" button (a BAR's: rhythm-edit-core.ts extractJsonBlock wants the body to be exactly one json fence) was offered on every `type: data,
// content_type: json` note, which a composition is. The empty note HAS its `# Cache` fence (hypothesis a), the Recipe edit leaves ONE fence and a cache that says the new sections (b), the rename keeps the note (c: but the tab's title went stale),
// and no fence is counted twice (d). Every route opens the Score; the text tab's Open as Score is the family's own; a note with no or two fences says so in plain words. A DOM element is never an assert operand (a failure would format the tree).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { musicTabsWorld, realMusicPlugin, type MusicTabsWorld } from './test-support/music-tabs-world.ts';
import type { RealPlugin } from './test-support/bundle-real-plugin.ts';
import { COMPOSITION_VIEW_TYPE, newCompositionNote } from './composition-core.ts';
import { ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { NEW_COMPOSITION_COMMAND_ID } from './composition-flow-core.ts';
import { NEW_ARRANGEMENT_COMMAND_ID } from './kit-arrangement-flow-core.ts';

let real: RealPlugin;
before(async () => { real = await realMusicPlugin(); });
after(() => { /* the bundle is per process */ });

const FENCE_WORDS = /fenced|exactly one|json block/i;
const fences = (t: string): number => (t.match(/^```json/gm) ?? []).length;
const shown = (w: MusicTabsWorld, leaf: any): string => String(leaf.view.contentEl?.textContent ?? '');
const titles = (leaf: any): string[] => (leaf.view.actions ?? []).map((a: any) => a.title);
const recipeOf = (t: string): string => /# Recipe\n+([\s\S]*?)\n+# Python/.exec(t)?.[1]?.trim() ?? '';
const withRecipe = (t: string, recipe: string): string => t.replace(/(# Recipe\n+)[\s\S]*?(\n+# Python)/, (_m, a, c) => `${a}${recipe}\n${c}`);
/** the person types a line of their own into the Recipe (an arrangement's Recipe ends with `Together.`: the line goes before it) */
const addLine = (recipe: string, line: string): string => (/\nTogether\.$/.test(recipe) ? recipe.replace(/\nTogether\.$/, `\n${line}\nTogether.`) : `${recipe}\n${line}`);
const closeAll = (w: MusicTabsWorld, p: string): void => { for (const l of [...w.leaves]) if (l.view.file?.path === p) l.detach(); };

interface Family { name: string; type: string; newId: string; made: string; a: string; b: string; first: string; second: string; asked: (w: MusicTabsWorld, n: number) => boolean }
const FAMILIES: Family[] = [
  { name: 'composition', type: COMPOSITION_VIEW_TYPE, newId: NEW_COMPOSITION_COMMAND_ID, made: 'compositions/comp_001.md', a: 'compositions/A.md', b: 'compositions/B.md', first: 'Play [[phrase_001]].', second: 'Then play [[phrase_002]] for 4 bars.',
    asked: (w, n) => w.asked.some((a) => a.params.kind === 'composition' && (a.data.sections ?? []).length === n) },
  { name: 'arrangement', type: ARRANGEMENT_VIEW_TYPE, newId: NEW_ARRANGEMENT_COMMAND_ID, made: 'arrangements/arr_001.md', a: 'arrangements/A.md', b: 'arrangements/B.md', first: 'Play [[phrase_001]] on the [[rock]] kit.', second: 'Play [[phrase_002]] on the [[latin]] kit.',
    asked: (w, n) => w.asked.some((a) => a.params.kind === 'arrangement' && (a.data.tracks ?? []).length === n) },
];

/** 2026-11-22-1016 (deliberate): a hand-edited Recipe that reads is HELD, not applied by itself (11i): the strip says the list no longer matches the script, and the driver asks for `Rewrite the list from the script`. The rest of each test is what it always was. */
async function askRewrite(w: MusicTabsWorld, tab: any): Promise<void> {
  const button = tab.view.contentEl.querySelector('[data-action="update-recipe"]') as HTMLElement | null;
  assert.ok(button, 'the strip offers the rewrite of the list from the script');
  button.click(); await w.settle(800);
}

/** steps 1 to 3: New <family> (an empty note, opened by the plugin), renamed to A in the file list, its content written (by hand in the Recipe, or through the composer), a second note B made and renamed. */
async function driverSteps(w: MusicTabsWorld, f: Family, how: 'hand' | 'composer'): Promise<{ aText: string }> {
  await w.newNote(f.newId);                                                      // 2026-11-19-0991 (deliberate): the command asks for the NAME first; the person presses Enter on the default (what it chose before: comp_001 / arr_001)
  assert.ok(w.store.has(f.made), `New ${f.name} made ${f.made}`);
  await w.rename(f.made, f.a);
  const tab = w.leaves.find((l) => w.typeOf(l) === f.type)!;
  if (how === 'composer') {
    await w.say(tab.view, f.first); await w.say(tab.view, f.second);
  } else {
    await w.say(tab.view, f.first);                                              // the Recipe the controls wrote, then the person types a line of their own into it
    await w.handEdit(f.a, (t) => withRecipe(t, addLine(recipeOf(t), f.second)));
    await askRewrite(w, tab);
  }
  const aText = w.store.get(f.a)!;
  await w.newNote(f.newId);                                                      // B
  if (w.store.has(f.made)) await w.rename(f.made, f.b);
  return { aText };
}

for (const f of FAMILIES) {
  test(`[music] DIAGNOSIS (${f.name}): the empty note has its Cache fence, the hand edit of the Recipe leaves ONE fence and a cache that says the new content, and the Description list is made again from the Recipe (what the person sees)`, async () => {
    const w = await musicTabsWorld(real);
    try {
      await w.newNote(f.newId);                                                  // 2026-11-19-0991 (deliberate): through the name dialog, Enter on the default
      assert.equal(fences(w.store.get(f.made)!), 1, 'hypothesis (a): the new empty note has exactly ONE json fence (the Cache), so it is not the missing fence');
      await w.rename(f.made, f.a);
      const tab = w.leaves.find((l) => w.typeOf(l) === f.type)!;
      await w.say(tab.view, f.first);
      await w.handEdit(f.a, (t) => withRecipe(t, addLine(recipeOf(t), f.second)));
      await askRewrite(w, tab);
      const text = w.store.get(f.a)!;
      assert.equal(fences(text), 1, 'hypothesis (b)/(d): after the hand edit there is still exactly one json fence');
      assert.match(text, /source_facet: recipe/, 'the Recipe is the source facet now');
      assert.ok(f.asked(w, 2), 'the cache says the two parts: the engine was asked for them');
      const list = /# Description\n+([\s\S]*?)\n+# Recipe/.exec(text)![1];
      assert.match(list, /^1\. .*\n2\. /, `the Description is still a numbered list (made again from the Recipe): ${JSON.stringify(list)}`);
    } finally { w.done(); }
  });

  for (const how of ['hand', 'composer'] as const) {
    test(`[music] (${f.name}, ${how}) the driver's steps: New, renamed to A, written (${how === 'hand' ? 'Recipe by hand' : 'composer'}), B made in between; A reopened from the FILE LIST opens as its Score (not as a plain note), nothing in A or B changes, no fence-count sentence`, async () => {
      const w = await musicTabsWorld(real);
      try {
        const { aText } = await driverSteps(w, f, how);
        const bBefore = w.store.get(f.b);
        closeAll(w, f.a);
        const n = w.asked.length;
        const leaf = await w.openFromList(f.a);
        assert.equal(w.typeOf(leaf), f.type, `A opened as the ${f.name} Score`);
        assert.ok(w.asked.length > n && f.asked(w, 2), 'the Score drew the two parts of A');
        assert.equal(w.store.get(f.a), aText, 'A is byte for byte what it was (P3: opening writes nothing)');
        assert.equal(w.store.get(f.b), bBefore, 'B was not touched by A being reopened');
        assert.ok(!(w.notices.some((x) => FENCE_WORDS.test(x))), `no fence-count sentence: ${JSON.stringify(w.notices)}`);
        assert.ok(!FENCE_WORDS.test(shown(w, leaf)), 'nothing on the tab speaks of fences');
      } finally { w.done(); }
    });
  }

  test(`[music] (${f.name}) a LINK (a new tab) opens A as its Score too, and the tab already open is not left as text`, async () => {
    const w = await musicTabsWorld(real);
    try {
      await driverSteps(w, f, 'hand');
      closeAll(w, f.a);
      const leaf = await w.openFromList(f.a, { newTab: true });
      assert.equal(w.typeOf(leaf), f.type);
      assert.equal(w.leaves.filter((l) => l.view.file?.path === f.a).length, 1, 'one tab shows A');
    } finally { w.done(); }
  });

  test(`[music] (${f.name}) a tab RESTORED after a reload: the Score tab is still the Score, and a text tab of the note comes up as its Score (a phrase's text tab restored stays text: unchanged)`, async () => {
    let aText = '';
    { const x = await musicTabsWorld(real); try { await driverSteps(x, f, 'hand'); aText = x.store.get(f.a)!; } finally { x.done(); } }
    const w = await musicTabsWorld(real, { [f.a]: aText }, { restoredText: [f.a, 'phrases/phrase_001.md'] });
    try {
      const a = w.leaves.find((l) => l.view.file?.path === f.a)!;
      const p = w.leaves.find((l) => l.view.file?.path === 'phrases/phrase_001.md')!;
      assert.equal(w.typeOf(a), f.type, `the restored text tab of ${f.a} is its Score`);
      assert.equal(w.typeOf(p), 'markdown', 'a phrase\'s restored text tab keeps its text (unchanged)');
      const r = await w.restoreTab(f.type, f.a);
      assert.equal(w.typeOf(r), f.type);
    } finally { w.done(); }
  });

    test(`[music] (${f.name}) after a reload the NOTES PANE of a pair (the note in reading mode, restored with the layout) stays the note: it is not turned into a second Score, and the Score tab beside it is untouched`, async () => {
    let aText = '';
    { const x = await musicTabsWorld(real); try { await driverSteps(x, f, 'hand'); aText = x.store.get(f.a)!; } finally { x.done(); } }
    const w = await musicTabsWorld(real, { [f.a]: aText }, { restoredText: [{ path: f.a, mode: 'preview' }] });
    try {
      const pane = w.leaves.find((l) => l.view.file?.path === f.a)!;
      assert.equal(w.typeOf(pane), 'markdown', 'the notes pane is still the note');
      const score = await w.restoreTab(f.type, f.a);
      assert.equal(w.typeOf(score), f.type);
      assert.equal(w.typeOf(pane), 'markdown', 'and still is, with the Score beside it');
      assert.equal(w.leaves.length, 2, 'no tab was closed or added by the router');
    } finally { w.done(); }
  });

  test(`[music] (${f.name}) Open as Forge note keeps the text through every event; the text tab carries ONE "Open as Score" (the Score's own), no Beat Box button, and clicking it shows the Score without a word about fences`, async () => {
    const w = await musicTabsWorld(real);
    try {
      await driverSteps(w, f, 'hand');
      closeAll(w, f.a);
      const leaf = await w.restoreTab(f.type, f.a);                                  // a Score tab however it came (the command, a restored layout): the route under test starts at its "Open as Forge note"
      assert.equal(w.typeOf(leaf), f.type);
      const asJson = leaf.view.actions.find((a: any) => a.title === 'Open as Forge note');
      assert.ok(asJson, 'the Score tab carries Open as Forge note');
      asJson.cb(); await w.settle(800);
      for (let i = 0; i < 3; i++) { w.fire.ws('file-open'); w.fire.ws('active-leaf-change', leaf); w.fire.ws('layout-change'); await w.settle(800); }
      assert.equal(w.typeOf(leaf), 'markdown', 'the person chose the text: it stays text');
      assert.deepEqual(titles(leaf).filter((t) => /Open as/.test(t)), ['Open as Score'], 'one Open as Score, no Beat Box button');
      leaf.view.actions.find((a: any) => a.title === 'Open as Score').cb(); await w.settle(800);
      assert.equal(w.typeOf(leaf), f.type, 'the Score is back');
      assert.ok(!w.notices.some((x) => FENCE_WORDS.test(x)), `no fence-count sentence: ${JSON.stringify(w.notices)}`);
    } finally { w.done(); }
  });

  test(`[music] (${f.name}) the tab follows a manual rename: the next Score is asked for under the NEW title (the tab used to keep the old name it was opened with)`, async () => {
    const w = await musicTabsWorld(real);
    try {
      await w.newNote(f.newId);                                                  // 2026-11-19-0991 (deliberate): through the name dialog, Enter on the default
      const tab = w.leaves.find((l) => w.typeOf(l) === f.type)!;
      await w.say(tab.view, f.first);
      await w.rename(f.made, f.a);
      const n = w.asked.length;
      await w.say(tab.view, f.second);
      const titlesAsked = w.asked.slice(n).filter((a) => a.params.kind === f.name).map((a) => a.title);
      assert.ok(titlesAsked.length > 0 && titlesAsked.every((t) => t === 'A'), `the Score is asked for under the new name: ${JSON.stringify(titlesAsked)}`);
    } finally { w.done(); }
  });
}

// ---- a note with no fence, a note with two (plain words, never a fence count; zero fences is a valid empty note) ----------------------------------------------------------------------------------------------------------------------------------
const frontmatter = 'type: data\ncontent_type: json';
const noFence = `---\n${frontmatter}\n---\n\n# Description\n\n1. Play [[phrase_001]].\n\n# Recipe\n\nPlay [[phrase_001]].\n\n# Python\n\n\`\`\`python\n\`\`\`\n`;
const cacheBlock = (j: string) => `\n# Cache\n\n\`\`\`json\n${j}\n\`\`\`\n`;
const twoFences = `---\n${frontmatter}\n---\n\n# Description\n\n\`\`\`json\n{"kind": "composition", "sections": []}\n\`\`\`\n\n# Cache\n${cacheBlock('{"kind": "composition", "sections": [{"source": "phrases/phrase_001"}]}')}`;

test('[music] a composition with NO json fence opens as its Score (valid and empty or computed from its sentences): no fence-count sentence anywhere, and its cache is computed from the Description it has', async () => {
  const w = await musicTabsWorld(real, { 'compositions/nofence.md': noFence, 'compositions/bare.md': `---\n${frontmatter}\n---\n\n# Description\n\n` });
  try {
    for (const p of ['compositions/nofence.md', 'compositions/bare.md']) {
      const n = w.asked.length;
      const leaf = await w.openFromList(p, { newTab: true });
      assert.equal(w.typeOf(leaf), COMPOSITION_VIEW_TYPE, `${p} opened as the Score`);
      assert.ok(!FENCE_WORDS.test(shown(w, leaf)), `${p}: nothing on the tab speaks of fences: ${JSON.stringify(shown(w, leaf).slice(0, 200))}`);
      assert.ok(!w.notices.some((x) => FENCE_WORDS.test(x)), `${p}: ${JSON.stringify(w.notices)}`);
      const real_errors = w.errors.filter((e) => !/MEMFS sync on modify|Verovio render failed/.test(String(e[0])));          // the rig has no engine file system: those lines are the rig's (no engine file system, a stand-in musicxml), not the open's
      assert.ok(real_errors.length === 0, `${p}: no console.error: ${JSON.stringify(real_errors.map((e) => String(e[0])))}`);
      if (p.endsWith('nofence.md')) {
        assert.equal(fences(w.store.get(p)!), 1, 'the cache was computed: the note now has exactly one json fence');
        assert.ok(w.asked.length > n && w.asked.some((a) => a.params.kind === 'composition' && a.data.sections.length === 1), 'and the Score draws it');
      }
    }
  } finally { w.done(); }
});

test('[music] a composition with TWO json fences opens as its Score and says in plain words what is wrong and what to do (no fence-count sentence, nothing written)', async () => {
  const w = await musicTabsWorld(real, { 'compositions/two.md': twoFences });
  try {
    const leaf = await w.openFromList('compositions/two.md', { newTab: true });
    assert.equal(w.typeOf(leaf), COMPOSITION_VIEW_TYPE);
    const text = shown(w, leaf);
    assert.ok(/two json blocks|more than one json block/i.test(text), `says what is wrong: ${JSON.stringify(text.slice(0, 300))}`);
    assert.ok(/remove|delete|keep/i.test(text), 'says what to do');
    assert.ok(!/exactly one|fenced/i.test(text), 'and not in the fence-count words');
    assert.equal(w.store.get('compositions/two.md'), twoFences, 'nothing was written');
  } finally { w.done(); }
});

test('[music] an ARRANGEMENT with no json fence opens as its Score without a fence-count sentence', async () => {
  const w = await musicTabsWorld(real, { 'arrangements/nofence.md': noFence.replace('Play [[phrase_001]].', 'Play [[phrase_001]] on the [[rock]] kit.') });
  try {
    const leaf = await w.openFromList('arrangements/nofence.md', { newTab: true });
    assert.equal(w.typeOf(leaf), ARRANGEMENT_VIEW_TYPE);
    assert.ok(!FENCE_WORDS.test(shown(w, leaf)), JSON.stringify(shown(w, leaf).slice(0, 200)));
    assert.ok(!w.notices.some((x) => FENCE_WORDS.test(x)));
  } finally { w.done(); }
});

// ---- P3: what is not a composition or an arrangement is routed as before ---------------------------------------------------------------------------------------------------------------------------------------------------------------
test('[music] P3: a phrase text tab still routes to its phrase Score, a README and a note outside the folders stay text', async () => {
  const w = await musicTabsWorld(real, { 'compositions/README.md': '# compositions\n', 'arrangements/README.md': '# arrangements\n', 'notes/x.md': '# x\n', 'compositions/sub/deep.md': '# nested\n' });
  try {
    const leaf = await w.openFromList('phrases/phrase_001.md');
    assert.equal(w.typeOf(leaf), PHRASE_VIEW_TYPE);
    for (const p of ['compositions/README.md', 'arrangements/README.md', 'notes/x.md', 'compositions/sub/deep.md']) {
      const l = await w.openFromList(p, { newTab: true });
      assert.equal(w.typeOf(l), 'markdown', `${p} stays text`);
    }
  } finally { w.done(); }
});

test('[music] a composition made by the library helper still reads: newCompositionNote has exactly one fence', () => {
  assert.equal(fences(newCompositionNote('x', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] })), 1);
});
