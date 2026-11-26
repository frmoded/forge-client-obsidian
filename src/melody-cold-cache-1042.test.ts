// 2026-11-25-1042 Part C: the cold-cache gap of 1039. A note made a moment ago has no front matter in Obsidian's metadata cache yet, so a melody phrase made THIS session read as beats and `Play [[phrase_101]].` then `Then play [[phrase_001]] for 2 bars.` was
// WRITTEN (the engine refused the mix only at draw time). Now the session remembers the paths it wrote with `melody: true` (list-model seam: `listModel.melody.mark` at the plugin's own writes, `names` at the four places that list the vault's melody notes) and
// uses that ONLY while the cache has no front matter for the note; a cache that has one is believed (the cache wins).
//   A  the seam, on a fake app: cold + written = a melody note; cold + never written = not; warm = the cache's word, written or not; a write without the mark takes it back; the lean edition keeps the cache-only reading (byte for byte what it was)
//   B  the REAL plugin, the real tabs: the melody phrase is MADE in the session (a sentence in a phrase tab writes its `melody: true`; its cache is held cold the whole time), then the composition's sentences are refused at once, in the 1031 words
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';
import { emptyCompositionNote, emptyPhraseNote } from './empty-note-core.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { listModel as full } from './list-model.full.ts';
import { listModel as lean } from './list-model.lean.ts';
import { melodyNoteTemplate } from './melody-bar-core.ts';
import { dialogEntries } from './test-support/dialog-view.ts';
import { musicTabsWorld, realMusicPlugin } from './test-support/music-tabs-world.ts';

// ---- A: the seam -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const FILES = ['phrases/phrase_101.md', 'phrases/phrase_001.md', 'bars/bar_070.md', 'phrases/README.md'];
const appWith = (cache: Record<string, Record<string, unknown> | undefined>) => ({
  vault: { getFiles: () => FILES.map((path) => ({ path, basename: path.replace(/^.*\//, '').replace(/\.md$/, '') })) },
  metadataCache: { getFileCache: (f: { path: string }) => (f.path in cache ? { frontmatter: cache[f.path] } : null) },
});
const withMelody = (text = ''): string => `---\ntype: data\nmelody: true\n---\n${text}`;

test('A: cold cache: a note this session wrote with `melody: true` is a melody note; a note it never wrote is not; the other folder is not looked at', () => {
  full.melody.mark('phrases/phrase_101.md', withMelody());
  const app = appWith({});
  assert.deepEqual(full.melody.names(app, 'phrases'), ['phrase_101']); assert.deepEqual(full.melody.names(app, 'bars'), []);
  full.melody.mark('bars/bar_070.md', melodyNoteTemplate('bar_070')); assert.deepEqual(full.melody.names(app, 'bars'), ['bar_070'], 'a NEW melody bar (the template) is marked the same way');
});
test('A: a cache that HAS the front matter is believed: it says melody (written or not) or it does not (even if the session once wrote the mark)', () => {
  full.melody.mark('phrases/phrase_101.md', withMelody());
  assert.deepEqual(full.melody.names(appWith({ 'phrases/phrase_101.md': { type: 'data' } }), 'phrases'), [], 'the cache has the front matter and no melody line: the cache wins over the session');
  assert.deepEqual(full.melody.names(appWith({ 'phrases/phrase_101.md': { melody: true }, 'phrases/phrase_001.md': { melody: true } }), 'phrases'), ['phrase_101', 'phrase_001'], 'the cache says melody for a note the session never wrote');
  assert.deepEqual(full.melody.names(appWith({ 'phrases/phrase_001.md': { melody: 'true' } }), 'phrases'), ['phrase_101'], 'only the boolean true counts in the cache, as before (phrase_001 has front matter: not melody); phrase_101 is cold: the session decides');
});
test('A: a later write WITHOUT the mark takes it back (the note became beats again), and a text with the line in its body only is not a mark', () => {
  full.melody.mark('phrases/phrase_101.md', withMelody()); full.melody.mark('phrases/phrase_101.md', '---\ntype: data\n---\n');
  assert.deepEqual(full.melody.names(appWith({}), 'phrases'), []);
  full.melody.mark('phrases/phrase_101.md', '---\ntype: data\n---\nmelody: true\n'); assert.deepEqual(full.melody.names(appWith({}), 'phrases'), [], 'a line of the body is not front matter');
  full.melody.mark('phrases/phrase_101.md', '---\r\nmelody: true\r\n---\r\n'); assert.deepEqual(full.melody.names(appWith({}), 'phrases'), ['phrase_101'], 'a note with Windows line ends');
  full.melody.mark('phrases/phrase_101.md', '');
});
test('A: a host with no metadata cache has no melody note (as before); a file of another kind is not listed; the lean edition reads the cache only (a cold note is not melody there: byte for byte the old reading)', () => {
  full.melody.mark('phrases/phrase_101.md', withMelody());
  assert.deepEqual(full.melody.names({ vault: appWith({}).vault }, 'phrases'), ['phrase_101'], 'no cache at all = cold: the session still knows what it wrote');
  lean.melody.mark('phrases/phrase_101.md', withMelody());
  assert.deepEqual(lean.melody.names(appWith({}), 'phrases'), [], 'lean: cache only'); assert.deepEqual(lean.melody.names(appWith({ 'phrases/phrase_101.md': { melody: true } }), 'phrases'), ['phrase_101']);
  full.melody.mark('phrases/phrase_101.md', '');
});

// ---- B: the real plugin ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const BEATS_AND_NOTES = (n: string, said: 'beats' | 'notes'): string => (said === 'beats' ? `A composition plays beats or notes, not both: ${n} plays beats, and an earlier section plays notes.` : `A composition plays beats or notes, not both: ${n} is a melody phrase, and an earlier section plays beats.`);
const listOf = (note: string): string[] => (/# Description\n([\s\S]*?)# Recipe/.exec(note)?.[1] ?? '').split('\n').map((l) => l.replace(/^\d+\.\s+/, '').trim()).filter((l) => l !== '');

async function run(name: string, sentences: string[]) {
  const real = await realMusicPlugin(); const path = `compositions/${name}.md`;
  const w = await musicTabsWorld(real, { 'bars/bar_070.md': melodyNoteTemplate('bar_070'), 'phrases/phrase_101.md': emptyPhraseNote('phrase_101'), [path]: emptyCompositionNote(name) });
  const app = w.plugin.target.app; const warm = app.metadataCache.getFileCache; app.metadataCache.getFileCache = (f: any) => (f.path === 'phrases/phrase_101.md' ? { frontmatter: undefined } : warm(f));          // the cache never catches up with phrase_101 (a note made a moment ago)
  const enter = async (leaf: any, s: string) => { const tab = w.viewOf(leaf); const field = w.field(tab)!; field.value = s; field.dispatchEvent(new (tab.contentEl.ownerDocument.defaultView as any).Event('input', { bubbles: true })); await w.press(tab, { key: 'Enter' }); await w.settle(400); };
  const made = await w.restoreTab(PHRASE_VIEW_TYPE, 'phrases/phrase_101.md'); await enter(made, 'Repeat [[bar_070]] for 4 bars.');          // the melody phrase is MADE here: the plugin writes its `melody: true`
  const phraseNote = w.store.get('phrases/phrase_101.md')!;
  const leaf = await w.restoreTab(COMPOSITION_VIEW_TYPE, path); const tab = w.viewOf(leaf);
  for (const s of sentences) await enter(leaf, s);
  const result = { phraseNote, dialog: dialogEntries(tab.contentEl).map((e) => `${e.kind}: ${e.text}`), list: listOf(w.store.get(path)!), note: w.store.get(path)!, under: String(tab.contentEl.querySelector('.forge-composer-error')?.textContent ?? '') };
  w.done(); return result;
}
const noService = (r: { dialog: string[]; under: string }): void => { for (const l of [...r.dialog, r.under]) assert.doesNotMatch(l, /service/i, `a beats-and-notes refusal never says "service": ${l}`); };

test('B [real plugin] COLD cache, the melody phrase made in this session: `Play [[phrase_101]].` then `Then play [[phrase_001]] for 2 bars.` is refused AT SENTENCE TIME (the 1031 words), nothing written, the service is never mentioned (this was the KNOWN LIMIT of 1039: both lines were written)', async () => {
  const r = await run('comp_g', ['Play [[phrase_101]].', 'Then play [[phrase_001]] for 2 bars.']);
  assert.match(r.phraseNote, /^melody: true$/m, 'precondition: the plugin wrote the melody mark into phrase_101 (and the test holds its cache cold)');
  assert.deepEqual(r.list, ['Play [[phrase_101]].']); noService(r);
  assert.deepEqual(r.dialog.slice(-2), ['you: Then play [[phrase_001]] for 2 bars.', `notice: ${BEATS_AND_NOTES('phrase_001', 'beats')}`]);
  assert.equal(r.under, BEATS_AND_NOTES('phrase_001', 'beats')); assert.doesNotMatch(r.note, /Waiting:/);
});
test('B [real plugin] COLD cache, the other orders: both sentences in ONE entry (nothing written), and the beats phrase first then the melody phrase (the melody phrase is the one named)', async () => {
  const one = await run('comp_h', ['Play [[phrase_101]]. Then play [[phrase_001]] for 2 bars.']);
  assert.deepEqual(one.list, []); noService(one); assert.equal(one.dialog.at(-1), `notice: ${BEATS_AND_NOTES('phrase_001', 'beats')}`); assert.doesNotMatch(one.note, /Waiting:/);
  const rev = await run('comp_i', ['Play [[phrase_001]].', 'Then play [[phrase_101]] for 2 bars.']);
  assert.deepEqual(rev.list, ['Play [[phrase_001]].']); noService(rev); assert.equal(rev.dialog.at(-1), `notice: ${BEATS_AND_NOTES('phrase_101', 'notes')}`);
});
test('B [real plugin] P3: a composition of two beats phrases, and of a melody phrase alone, is written as before even while the cache is cold', async () => {
  const beats = await run('comp_j', ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 2 bars.']); assert.deepEqual(beats.list, ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 2 bars.']);
  const notes = await run('comp_k', ['Play [[phrase_101]].', 'Then play [[phrase_101]] for 2 bars.']); assert.deepEqual(notes.list, ['Play [[phrase_101]].', 'Then play [[phrase_101]] for 2 bars.']);
});

// ---- C: the four places that list the vault's melody notes all ask the seam, through ONE reading (DRY; the lean edition keeps the cache-only one) ------------------------------------------------------------------------
import fs from 'node:fs';
test('C: the four sites ask `listModel.melody.names` (the shared `vaultListsOf` and the plugin\'s `melodyIn`); none reads the cache\'s front matter on its own any more, and the plugin marks its three kinds of write', () => {
  const src = (f: string): string => fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
  for (const f of ['score-first.ts', 'phrase-view.ts', 'failed-prompt-view.ts', 'description-wiring.ts']) assert.doesNotMatch(src(f), /frontmatter\?\.melody/, f);
  assert.equal((src('description-wiring.ts').match(/listModel\.melody\.names\(/g) ?? []).length, 1, 'the one shared reading'); assert.equal((src('score-first.ts').match(/listModel\.melody\.names\(/g) ?? []).length, 1, 'melodyIn');
  for (const [f, re] of [['score-first.ts', /vaultListsOf\(app\)/], ['phrase-view.ts', /vaultListsOf\(this\.app\)/], ['failed-prompt-view.ts', /vaultListsOf\(app, true\)/]] as const) assert.match(src(f), re, f);
  assert.equal((src('score-first.ts').match(/listModel\.melody\.mark\(/g) ?? []).length, 3, 'a new melody bar, the controller\'s process and its create');
});
test('C: the shared reading lists what the three sites listed (bars, phrases, arrangements, compositions, kits without README; `mdOnly` drops a file that is not a note), melody lists from the seam', async () => {
  const { vaultListsOf } = await import('./description-wiring.ts');
  const files = ['bars/bar_001.md', 'bars/README.md', 'bars/picture.png', 'phrases/phrase_001.md', 'phrases/phrase_101.md', 'kits/rock.md', 'arrangements/arr_001.md', 'compositions/comp_001.md', 'other/x.md'].map((path) => ({ path, basename: path.replace(/^.*\//, '').replace(/\.[^.]+$/, ''), extension: path.replace(/^.*\./, '') }));
  full.melody.mark('phrases/phrase_101.md', withMelody());
  const app = { vault: { getFiles: () => files }, metadataCache: { getFileCache: (f: { path: string }) => (f.path === 'bars/bar_001.md' ? { frontmatter: { melody: true } } : null) } };
  assert.deepEqual(vaultListsOf(app), { bars: ['bar_001', 'picture'], phrases: ['phrase_001', 'phrase_101'], arrangements: ['arr_001'], compositions: ['comp_001'], kits: ['rock'], melody: ['bar_001'], melodyPhrases: ['phrase_101'] });
  assert.deepEqual(vaultListsOf(app, true).bars, ['bar_001']); full.melody.mark('phrases/phrase_101.md', '');
});
