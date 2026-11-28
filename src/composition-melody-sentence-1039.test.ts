// 2026-11-24-1039 Part A (the driver's run in `bwv1007-mock`: "In a new composition `Play [[phrase_101]].` then `Then play [[phrase_001]] for 2 bars.` The second should be refused at sentence time (`A composition plays beats or notes, not both`), the service never asked. I got
// `The sentence service is not set up` and `Kept as line 1, waiting for a translation`"). Through the REAL plugin (the real ForgePlugin.onload from the real music bundle, the real composition view, controller, composer and dialog, a vault whose metadata cache reads the notes' front
// matter), in the vault's own shape: a rhythm phrase `phrase_001`, a melody phrase `phrase_101` (`melody: true`), a NEW empty composition per case. FOUND (no code was wrong here): the composition composer's vault lists DO carry `melodyPhrases` (description-wiring.ts `vault()`
// through score-first.ts `melodyIn`, the same lists the phrase composer has), `phrase_001` IS read as a rhythm phrase, and the refusal IS a `head` refusal that never reaches the service in all four orders. What the driver typed was ONE entry that held the word "then" from the
// instructions: `Play [[phrase_101]]. then Then play [[phrase_001]] for 2 bars` - the note he left (`compositions/comp_002.md`) reads `1. Waiting: Play phrase_101 . then Then play phrase_001 for 2 bars`, the words this test makes byte for byte. The grammar cannot read `then Then play`
// (it said so, in the long line under the composer he could not select: Part B), so it is an UNREADABLE sentence, which is the one case the service is asked about. These tests PIN that (written after the investigation, green at the first run: nothing here was red).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';
import { emptyCompositionNote, emptyPhraseNote } from './empty-note-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { dialogEntries } from './test-support/dialog-view.ts';
import { musicTabsWorld, realMusicPlugin } from './test-support/music-tabs-world.ts';

const MELODY_PHRASE = emptyPhraseNote('phrase_101').replace(/\n---\n/, '\nmelody: true\n---\n');
const BEATS_AND_NOTES = (n: string, said: 'beats' | 'notes'): string => (said === 'beats' ? `A composition plays beats or notes, not both: ${n} plays beats, and an earlier section plays notes.` : `A composition plays beats or notes, not both: ${n} is a melody phrase, and an earlier section plays beats.`);
const listOf = (note: string): string[] => (/# Description\n([\s\S]*?)# Recipe/.exec(note)?.[1] ?? '').split('\n').map((l) => l.replace(/^\d+\.\s+/, '').trim()).filter((l) => l !== '');

async function run(name: string, sentences: string[], opts: { cold?: boolean } = {}) {
  const real = await realMusicPlugin(); const path = `compositions/${name}.md`;
  const w = await musicTabsWorld(real, { 'phrases/phrase_101.md': MELODY_PHRASE, [path]: emptyCompositionNote(name) });
  if (opts.cold) { const app = w.plugin.target.app; const warm = app.metadataCache.getFileCache; app.metadataCache.getFileCache = (f: any) => (f.path === 'phrases/phrase_101.md' ? { frontmatter: undefined } : warm(f)); }
  const leaf = await w.restoreTab(COMPOSITION_VIEW_TYPE, path); const tab = w.viewOf(leaf);
  const field = w.field(tab)!;
  for (const s of sentences) { field.value = s; field.dispatchEvent(new (tab.contentEl.ownerDocument.defaultView as any).Event('input', { bubbles: true })); await w.press(tab, { key: 'Enter' }); await w.settle(400); }
  const dialog = dialogEntries(tab.contentEl).map((e) => `${e.kind}: ${e.text}`);
  const result = { dialog, list: listOf(w.store.get(path)!), note: w.store.get(path)!, under: String(tab.contentEl.querySelector('.forge-composer-error')?.textContent ?? '') };
  w.done(); return result;
}
const noService = (r: { dialog: string[]; under: string }): void => { for (const l of [...r.dialog, r.under]) assert.doesNotMatch(l, /service/i, `a beats-and-notes refusal never says "service": ${l}`); };

test('[real plugin] (a) `Play [[phrase_101]].` alone in a NEW composition is accepted: line 1 of the list, applied, no refusal, no service', async () => {
  const r = await run('comp_a', ['Play [[phrase_101]].']);
  assert.deepEqual(r.list, ['Play [[phrase_101]].']); assert.deepEqual(r.dialog, ['you: Play [[phrase_101]].', 'applied: ✓ Applied. Play [[phrase_101]].']); noService(r);
});

test('[real plugin] (b) then `Then play [[phrase_001]] for 2 bars.` (two entries): refused at sentence time in the 1031 words, line 1 stays the only line, the service is never mentioned', async () => {
  const r = await run('comp_b', ['Play [[phrase_101]].', 'Then play [[phrase_001]] for 2 bars.']);
  assert.deepEqual(r.list, ['Play [[phrase_101]].']); noService(r);
  assert.deepEqual(r.dialog, ['you: Play [[phrase_101]].', 'applied: ✓ Applied. Play [[phrase_101]].', 'you: Then play [[phrase_001]] for 2 bars.', `notice: ${BEATS_AND_NOTES('phrase_001', 'beats')}`]);
  assert.equal(r.under, BEATS_AND_NOTES('phrase_001', 'beats'), 'the line under the composer says the same words');
  assert.doesNotMatch(r.note, /Waiting:/);
});

test('[real plugin] (c) both sentences in ONE entry: the whole entry is refused (nothing written, no waiting line), same words', async () => {
  const r = await run('comp_c', ['Play [[phrase_101]]. Then play [[phrase_001]] for 2 bars.']);
  assert.deepEqual(r.list, []); noService(r);
  assert.deepEqual(r.dialog, ['you: Play [[phrase_101]]. Then play [[phrase_001]] for 2 bars.', `notice: ${BEATS_AND_NOTES('phrase_001', 'beats')}`]);
  assert.doesNotMatch(r.note, /Waiting:/);
});

test('[real plugin] (d) the reverse order: `Play [[phrase_001]].` then `Then play [[phrase_101]] for 2 bars.` (two entries, and in one): the melody phrase is the one named, refused the same way; phrase_001 is read as a rhythm phrase', async () => {
  const two = await run('comp_d', ['Play [[phrase_001]].', 'Then play [[phrase_101]] for 2 bars.']);
  assert.deepEqual(two.list, ['Play [[phrase_001]].']); noService(two);
  assert.deepEqual(two.dialog.slice(-2), ['you: Then play [[phrase_101]] for 2 bars.', `notice: ${BEATS_AND_NOTES('phrase_101', 'notes')}`]);
  const one = await run('comp_e', ['Play [[phrase_001]]. Then play [[phrase_101]] for 2 bars.']);
  assert.deepEqual(one.list, []); noService(one);
  assert.deepEqual(one.dialog, ['you: Play [[phrase_001]]. Then play [[phrase_101]] for 2 bars.', `notice: ${BEATS_AND_NOTES('phrase_101', 'notes')}`]);
});

// 2026-11-25-1042 (deliberate): this was the driver's entry read as ONE unreadable sentence (`found "then"`, the service asked, `Kept as line 1, waiting for a translation`). `then` between two sentences is read now (src/then-connective-1042.test.ts): the entry is
// the two sentences `Play [[phrase_101]].` and `Then play [[phrase_001]] for 2 bars.`, and with the melody phrase and the beats phrase of this table it is the beats-and-notes refusal AT SENTENCE TIME (row (c) of the 1039 table), the service never mentioned; with two
// beats phrases it is two lines.
test('[real plugin] the driver\'s ENTRY: `Play [[phrase_101]]. then Then play [[phrase_001]] for 2 bars` (the word "then" typed in the middle) is read as the two sentences: a melody phrase then a beats phrase is the beats-and-notes refusal at sentence time, nothing written, no waiting line, no service', async () => {
  const r = await run('comp_f', ['Play [[phrase_101]]. then Then play [[phrase_001]] for 2 bars']);
  assert.deepEqual(r.list, [], 'nothing written, not even a waiting line'); noService(r);
  assert.deepEqual(r.dialog, ['you: Play [[phrase_101]]. then Then play [[phrase_001]] for 2 bars', `notice: ${BEATS_AND_NOTES('phrase_001', 'beats')}`]);
  assert.equal(r.under, BEATS_AND_NOTES('phrase_001', 'beats')); assert.doesNotMatch(r.note, /Waiting:|then Then/);
});
test('[real plugin] the same entry with two BEATS phrases is two lines, written canonically (the connective is not part of either)', async () => {
  const r = await run('comp_f2', ['Play [[phrase_001]]. then Then play [[phrase_002]] for 2 bars']);
  assert.deepEqual(r.list, ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 2 bars.']); noService(r); assert.doesNotMatch(extractDescription(r.note), /Waiting:|then Then/);          // 2026-11-27-1050 (deliberate): the front matter keeps the typed words of the push (`groups:`), so the claim is about the Description (it was the whole note)
  assert.deepEqual(r.dialog.map((l) => l.split(':')[0]), ['you', 'applied']);
});

// 2026-11-25-1042 (deliberate): the 1031 caveat is closed for a note THIS SESSION wrote (src/melody-cold-cache-1042.test.ts: the plugin remembers the paths it wrote with `melody: true` while the cache has no front matter for them, and the same two sentences are
// refused at sentence time). What stays, measured: a melody phrase that ARRIVES from outside the session (a sync, another editor, a note copied in by hand) and whose front matter the cache has not read yet: the plugin never wrote it, so it cannot know; both
// phrases read as beats, both lines are written, and the engine refuses the mix at draw time. It is also the CONTROL of the tests above (they turn red if the lists lose `melodyPhrases`).
test('[real plugin] COLD cache, a melody phrase that did NOT come from this session (it arrived with the note on disk; its front matter is not in the cache yet): both sentences are written as beats; nothing says "service" (the remaining limit)', async () => {
  const r = await run('comp_g', ['Play [[phrase_101]].', 'Then play [[phrase_001]] for 2 bars.'], { cold: true });
  assert.deepEqual(r.list, ['Play [[phrase_101]].', 'Then play [[phrase_001]] for 2 bars.']); noService(r);
});
