// 2026-11-20-1005 (CCQA weekly F3, F7, F9) - the REAL plugin methods (the real bundle, a stand-in `obsidian`, an in-memory vault): 
//   F7  a note that vanishes under an open tab: the four file-open / modify handlers say it ONCE, as an info line, never as a red error; a failure that is NOT a vanished file stays red.
//   F3  the status bar's source-layer label follows the last active NOTE while a panel (not a markdown view) is the active leaf; it empties only when there is no note (or the file is not a note).
//   F9  a renamed note's generated description follows the new name (one write); a person's own words, a note that is not ours and a note with nothing to change are not written.
// Written RED first against the methods of HEAD.
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { Window } from 'happy-dom';

import { bundleRealPlugin, type RealPlugin } from './test-support/bundle-real-plugin.ts';
import { computeFacetHash } from './facet-hash-core.ts';

let real: RealPlugin; let win: any;
before(async () => {
  win = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, { document: win.document, window: win, HTMLElement: win.HTMLElement });
  real = await bundleRealPlugin(process.cwd(), 'music');
});

const tfile = (path: string): any => Object.assign(new real.TFile(), { path, extension: path.replace(/^.*\./, ''), basename: path.replace(/^.*\//, '').replace(/\.[^.]+$/, '') });
function spyConsole() {
  const errors: unknown[][] = [], infos: unknown[][] = []; const e = console.error, i = console.info;
  console.error = (...a: unknown[]) => { errors.push(a); }; console.info = (...a: unknown[]) => { infos.push(a); };
  return { errors, infos, restore: () => { console.error = e; console.info = i; } };
}
const enoent = (p: string) => Object.assign(new Error(`ENOENT: no such file or directory, open '/vault/${p}'`), { code: 'ENOENT' });

/** A real ForgePlugin whose every read of the note fails the way a deleted file does (or another way). */
function pluginReading(read: (f: any) => Promise<string>, extra: Record<string, unknown> = {}) {
  const t: any = Object.create(real.ForgePlugin.prototype);
  t.libraryDirNames = () => []; t._v113BackfillSeen = new Set(); t._programmaticWriteInFlight = new Set(); t._facetHashCache = new Map();
  t.app = { vault: { read, getAbstractFileByPath: (p: string) => (/^gone/.test(p) ? null : tfile(p)) }, metadataCache: { getFileCache: () => ({ frontmatter: { type: 'data', content_type: 'json' } }) }, workspace: {} };
  Object.assign(t, extra);
  return t;
}

// ---- F7 -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('F7: a note deleted from outside while open: the four handlers log NO red error, and ONE info line says it', async () => {
  const spy = spyConsole();
  try {
    const t = pluginReading(async (f) => { throw enoent(f.path); }); const f = tfile('gone.md');
    await t.maybeBackfillV113Shape(f); await t.maybeStampTypedLetsInputs(f); await t.captureFacetHashCacheForFile(f); await t.maybePreviewDataSnippet(f);
    assert.deepEqual(spy.errors, [], 'no red line'); assert.equal(spy.infos.length, 1, 'one quiet line'); assert.match(String(spy.infos[0][0]), /gone\.md is gone \(deleted outside Obsidian\); skipped maybeBackfillV113Shape/);
  } finally { spy.restore(); }
});

test('F7: a file that is no longer in the vault is "vanished" even when the error has other words', async () => {
  const spy = spyConsole();
  try {
    const t = pluginReading(async () => { throw new Error('Something odd happened'); }); const f = tfile('gone2.md');
    await t.maybeStampTypedLetsInputs(f); await t.captureFacetHashCacheForFile(f);
    assert.deepEqual(spy.errors, []); assert.equal(spy.infos.length, 1);
  } finally { spy.restore(); }
});

test('F7: a failure that is NOT a vanished file stays loud (red), once per handler, as before', async () => {
  const spy = spyConsole();
  try {
    const t = pluginReading(async () => { throw new Error('disk on fire'); }); const f = tfile('there.md');
    await t.maybeBackfillV113Shape(f); await t.maybeStampTypedLetsInputs(f); await t.captureFacetHashCacheForFile(f); await t.maybePreviewDataSnippet(f);
    assert.equal(spy.errors.length, 4); assert.deepEqual(spy.infos, []);
    assert.match(String(spy.errors[0][0]), /maybeBackfillV113Shape failed/); assert.match(String(spy.errors[1][0]), /maybeStampTypedLetsInputs failed/);
    assert.match(String(spy.errors[2][0]), /captureFacetHashCacheForFile: failed for 'there\.md'/); assert.match(String(spy.errors[3][0]), /maybePreviewDataSnippet: could not read data snippet for preview/);
  } finally { spy.restore(); }
});

// ---- F3 -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const RECIPE = 'Return "hello".';
const SYNCED = async (): Promise<string> => { const r = await computeFacetHash(RECIPE); const py = 'def compute(context):\n    return "hello"'; return `---\ntype: action\nsource_facet: recipe\nrecipe_hash: ${r}\npython_hash: ${await computeFacetHash(py)}\npython_derived_from_recipe_hash: ${r}\n---\n\n# Description\n\nSay hello.\n\n# Recipe\n\n${RECIPE}\n\n# Python\n\n\`\`\`python\n${py}\n\`\`\`\n`; };
function labelPlugin(opts: { view: { file: any } | null; active: any; read: (f: any) => Promise<string> }) {
  const t: any = Object.create(real.ForgePlugin.prototype); const item = { text: 'unset', title: 'unset', setText(x: string) { this.text = x; } };
  t.sourceLayerStatusBarItem = item; t.app = { workspace: { getActiveViewOfType: () => opts.view, getActiveFile: () => opts.active }, vault: { read: opts.read } };
  return { t, item };
}

test('F3: with a PANEL as the active leaf (no markdown view) the label still says the state of the last active note', async () => {
  const body = await SYNCED(); const note = tfile('notes/hello.md');
  const { t, item } = labelPlugin({ view: null, active: note, read: async () => body });
  await t.refreshSourceLayerStatusBar(); assert.equal(item.text, 'Forge: synced');
  const md = labelPlugin({ view: { file: note }, active: note, read: async () => body }); await md.t.refreshSourceLayerStatusBar(); assert.equal(md.item.text, 'Forge: synced', 'with a markdown view it is exactly as before');
});

test('F3: no note at all, or a file that is not a note (an image), empties the label and reads nothing; a read that fails is said once in red as before', async () => {
  let reads = 0; const read = async () => { reads++; return 'x'; };
  const none = labelPlugin({ view: null, active: null, read }); await none.t.refreshSourceLayerStatusBar(); assert.equal(none.item.text, ''); assert.equal(none.item.title, '');
  const png = labelPlugin({ view: null, active: tfile('pics/a.png'), read }); await png.t.refreshSourceLayerStatusBar(); assert.equal(png.item.text, ''); assert.equal(reads, 0);
  const spy = spyConsole();
  try { const bad = labelPlugin({ view: null, active: tfile('notes/a.md'), read: async () => { throw new Error('boom'); } }); await bad.t.refreshSourceLayerStatusBar(); assert.equal(bad.item.text, ''); assert.equal(spy.errors.length, 1); } finally { spy.restore(); }
});

// ---- F9 -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function renamePlugin(files: Map<string, string>) {
  const t: any = Object.create(real.ForgePlugin.prototype); const processed: string[] = [];
  t.app = { vault: { read: async (f: any) => files.get(f.path) ?? '', process: async (f: any, fn: (c: string) => string) => { const cur = files.get(f.path)!; const next = fn(cur); processed.push(f.path); files.set(f.path, next); return next; } } };
  return { t, processed };
}
const PHRASE = (desc: string) => `---\ntype: data\ncontent_type: json\n${desc}\n---\n\n# Description\n\n1. Extend [[bar_005]] to 4 bars, repeating with fills.\n`;

test('F9: a renamed phrase\'s generated description takes the new name, in ONE write; the body is untouched', async () => {
  const files = new Map([['phrases/my groove.md', PHRASE('description: "phrase_016 — [[bar_005]] extended to 4 bars: repeating with fills."')]]);
  const { t, processed } = renamePlugin(files);
  await t.followRenamedDescription(tfile('phrases/my groove.md'), 'phrases/phrase_016.md');
  assert.deepEqual(processed, ['phrases/my groove.md']); assert.equal(files.get('phrases/my groove.md'), PHRASE('description: "my groove — [[bar_005]] extended to 4 bars: repeating with fills."'));
});

test('F9: nothing is written for a person\'s own description, for a note that is not one of ours, for a non-markdown file, or when the name did not change', async () => {
  const mine = new Map([['phrases/b.md', PHRASE('description: "My favourite groove"')], ['notes/x.md', PHRASE('description: "phrase_016 — x"')], ['phrases/c.md', PHRASE('description: "phrase_016 — x"')]]);
  const { t, processed } = renamePlugin(mine);
  await t.followRenamedDescription(tfile('phrases/b.md'), 'phrases/phrase_016.md'); await t.followRenamedDescription(tfile('notes/x.md'), 'notes/phrase_016.md');
  await t.followRenamedDescription(tfile('phrases/c.md'), 'phrases/c.md'); await t.followRenamedDescription(tfile('phrases/pic.png'), 'phrases/phrase_016.png');
  assert.deepEqual(processed, []);
});

test('F9: arrangements and compositions follow too; a bar renamed away from bar_NNN is no longer a bar to the plugin (isBarPath), so it is left alone', async () => {
  const files = new Map([['arrangements/groove.md', PHRASE('description: "arr_002 — rock kit"')], ['compositions/song.md', PHRASE('description: "comp_001 — a song of [[arr_002]]"')], ['bars/kick.md', PHRASE('description: "bar_010 — a copy of [[bar_007]]; edit by hand."')]]);
  const { t, processed } = renamePlugin(files);
  await t.followRenamedDescription(tfile('arrangements/groove.md'), 'arrangements/arr_002.md'); await t.followRenamedDescription(tfile('compositions/song.md'), 'compositions/comp_001.md'); await t.followRenamedDescription(tfile('bars/kick.md'), 'bars/bar_010.md');
  assert.deepEqual(processed, ['arrangements/groove.md', 'compositions/song.md']); assert.match(files.get('arrangements/groove.md')!, /description: "groove — rock kit"/); assert.match(files.get('compositions/song.md')!, /description: "song — a song of/);
});
