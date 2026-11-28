// 2026-11-27-1050 (prompt stack stage 2) - the NOTE side of the prompt stack: the front matter key `groups:` (a YAML list of one-line JSON strings), read and written without touching anything else; every writer of the list carries it through; an old
// plugin ignores it; content under that key that is not Forge's is never touched.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { LIST_MODEL_SENTINEL_GROUP_NOTE_CORE, carryGroups, dropGroups, readGroups, writeGroups, writeNoteGroups } from './group-note-core.ts';
import { pushGroup, type Group } from './group-core.ts';
import { PHRASE_DEFAULTS, applyPhraseWrite, noteContentFor, readPhraseNote, refreshPhraseNoteText, type PhraseParams } from './phrase-core.ts';
import { listOfNote, writeListNote, writePhraseStrip } from './sentence-list-note-core.ts';
import { replayGrammar } from './sentence-list-core.ts';
import { applyDescriptionText, customNoteText, revertDescriptionText } from './description-apply-core.ts';
import { copyListNote } from './duplicate-note-core.ts';
import { repairForOpen } from './note-open-repair-core.ts';
import { forgeText } from './script-edit-core.ts';
import { withRoot } from './composition-root-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';
import { isCustomNote } from './phrase-notes-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { PHRASE_VAULT, asListNote } from './test-support/phrase-list-fixtures.ts';

const YAML = createRequire(import.meta.url)('yaml') as { parse(t: string): any; stringify(v: unknown, o?: unknown): string };
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', ...PHRASE_DEFAULTS, bars: 4 };
const NOTE = (): string => asListNote(noteContentFor('phrase_001', EXTEND), 'phrase_001');
const HEAD = listOfNote(NOTE(), 'phrase', PHRASE_VAULT).list[0];
const listOf = (t: string): string[] => listOfNote(t, 'phrase', PHRASE_VAULT).list;
const written = (note: string, list: string[]): string => { const w = writeListNote(note, 'phrase_001', 'phrase', replayGrammar(list, 'phrase', { vault: PHRASE_VAULT })); assert.equal(w.ok, true); return w.ok ? w.text : ''; };
const frontYaml = (t: string): any => YAML.parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(t)![1]);
/** A note with one group: the head pushed, then `Delete bar 2.`. */
function pushed(words = 'lose bar two'): { text: string; groups: Group[] } {
  const after = [HEAD, 'Delete bar 2.'];
  const groups = pushGroup([], [HEAD], after, { words, who: 'service', ts: 5 });
  return { text: writeGroups(written(NOTE(), after), groups), groups };
}

test('the sentinel names this core', () => { assert.equal(LIST_MODEL_SENTINEL_GROUP_NOTE_CORE, 'forge-list-model-core:group-note-core'); });

test('a note without `groups:` reads as no stack; writing an empty stack changes not one byte; the other writers change nothing about it', () => {
  const n = NOTE();
  assert.deepEqual(readGroups(n), { state: 'none', groups: [] });
  assert.equal(writeGroups(n, []), n);
  assert.equal(dropGroups(n), n);
  assert.equal(carryGroups(n, 'phrase'), n);
  assert.equal(written(n, listOf(n)), n);
});

test('the key is a YAML list of one-line JSON strings, after the other keys; everything else in the note is byte for byte', () => {
  const plain = written(NOTE(), [HEAD, 'Delete bar 2.']);
  const { text, groups } = pushed();
  const added = text.split('\n').filter((l) => !plain.split('\n').includes(l));
  assert.equal(added.length, 2); assert.equal(added[0], 'groups:'); assert.match(added[1], /^ {2}- '\{"p":"lose bar two",.*\}'$/);
  assert.equal(text.replace(`${added.join('\n')}\n`, ''), plain);
  const y = frontYaml(text);
  assert.equal(y.groups.length, 1); assert.deepEqual(JSON.parse(y.groups[0]), JSON.parse(JSON.stringify(groups[0])));
  assert.deepEqual(readGroups(text), { state: 'ours', groups: JSON.parse(JSON.stringify(groups)) });
});

test('words and replaced lines with quotes, colons, #, backslashes, line breaks and unusual characters survive the YAML, and the front matter stays valid', () => {
  const nasty = 'a "quote", it\'s: here # not a comment \\ {x} - [y] | > & * ! % @ ` \u2028 \u0085 \u007f é 🎵\nsecond line\r\n---\nfoo: bar';
  const base: Group = { ...pushed().groups[0], p: nasty, rep: [{ i: 0, t: 'x "y": # \'z\' \u2028 end' }] };
  const text = writeGroups(NOTE(), [base]);
  const y = frontYaml(text);
  assert.equal(y.type, 'data'); assert.equal(typeof y.description_hash, 'string');
  assert.deepEqual(JSON.parse(y.groups[0]), JSON.parse(JSON.stringify(base)));
  assert.deepEqual(readGroups(text).groups, [JSON.parse(JSON.stringify(base))]);
  assert.equal(extractDescription(text), extractDescription(NOTE()), 'the body is not touched');
});

test('the groups survive another serialiser (as the Properties editor may rewrite them): double quoted and re-ordered keys', () => {
  const { text, groups } = pushed('say "so": # now');
  const m = /^---\n([\s\S]*?)\n---/.exec(text)!;
  for (const options of [{ lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' }, { lineWidth: 0 }]) {
    const re = `---\n${YAML.stringify(YAML.parse(m[1]), options).replace(/\n$/, '')}\n---${text.slice(m[0].length)}`;
    assert.deepEqual(readGroups(re), { state: 'ours', groups: JSON.parse(JSON.stringify(groups)) });
  }
});

test('a `groups:` that is not Forge\'s is FOREIGN: never read, never changed, never dropped, and a push records nothing in it', () => {
  const foreign = ['groups: [a, b]', 'groups: mine', 'groups:\n  - mine\n  - yours', 'groups:\n  name: x', 'groups: |\n  text', 'groups:\n- \'{"p":"a","n":0,"at":1,"rep":[],"len":0,"h":""}\'\n- my own', '"groups":\n  - x', 'groups:\n  - a\n# a comment\n  - b',
    'groups:\n  - "{\\"p\\": 1"\ngroups:\n  - x', 'groups:\n  - \'{"p":"a",\n    "n":1}\''];
  for (const g of foreign) {
    const n = NOTE().replace(/^---\n/, `---\n${g}\n`);
    assert.deepEqual(readGroups(n), { state: 'foreign', groups: [] }, g);
    assert.equal(writeGroups(n, pushed().groups), n, g);
    assert.equal(dropGroups(n), n, g);
    assert.equal(carryGroups(n, 'phrase'), n, g);
    const after = written(n, [HEAD, 'Delete bar 2.']);
    assert.ok(after.includes(g), g);
    const w = writeNoteGroups(n, after, listOf(n), 'phrase', { push: { words: 'x', who: 'typed', ts: 1 } })!;
    assert.equal(w.text, after, g); assert.equal(w.undo, undefined);
  }
});

test('a broken entry of Forge\'s own ends the stack there; an empty `groups:` is an empty stack', () => {
  const { text, groups } = pushed();
  const item = text.split('\n').find((l) => l.startsWith('  - \'{"p"'))!;
  for (const broken of ['  - \'{"p":"x","n":1\'', '  - \'{"p":"x","n":"1","at":1,"rep":[],"len":1,"h":"a"}\'', '  - \'{"p":"x"}\'']) {
    assert.deepEqual(readGroups(text.replace(item, `${item}\n${broken}\n${item}`)), { state: 'ours', groups: JSON.parse(JSON.stringify(groups)) }, broken);
    assert.deepEqual(readGroups(text.replace(item, broken)), { state: 'ours', groups: [] }, broken);
  }
  for (const empty of ['groups:', 'groups: []']) {
    const n = NOTE().replace(/^---\n/, `---\n${empty}\n`);
    assert.deepEqual(readGroups(n), { state: 'ours', groups: [] });
    assert.equal(writeGroups(n, []), NOTE());
  }
});

test('writing the stack the note has changes nothing; the last group gone takes the key away; CRLF stays CRLF; a note without front matter is left', () => {
  const { text, groups } = pushed();
  assert.equal(writeGroups(text, groups), text);
  assert.equal(writeGroups(text, []), written(NOTE(), [HEAD, 'Delete bar 2.']));
  const crlf = NOTE().replace(/\n/g, '\r\n');
  const w = writeGroups(crlf, groups);
  assert.equal(w.replace(/\r\n/g, ''), w.replace(/[\r\n]/g, ''), 'no bare line feed');
  assert.deepEqual(readGroups(w).groups.length, 1);
  assert.equal(writeGroups(w, []), crlf);
  assert.equal(writeGroups('# no front matter', groups), '# no front matter');
});

test('zero-indented items and a key in the middle of the front matter: the block alone is replaced', () => {
  const { groups } = pushed();
  const n = NOTE().replace(/^---\n/, '---\naliases:\n- one\ngroups:\n- \'{"p":"old","n":0,"at":1,"rep":[],"len":0,"h":"z"}\'\ncssclasses:\n- two\n');
  const w = writeGroups(n, groups);
  const y = frontYaml(w);
  assert.deepEqual([y.aliases, y.cssclasses, y.groups.length], [['one'], ['two'], 1]);
  assert.equal(writeGroups(n, []), NOTE().replace(/^---\n/, '---\naliases:\n- one\ncssclasses:\n- two\n'));
});

test('writeNoteGroups: a push records one group over the list on disk; the expected stack and the exact list are conditions of a pop', () => {
  const cur = NOTE();
  const after = written(cur, [HEAD, 'Delete bar 2.']);
  const w = writeNoteGroups(cur, after, [HEAD], 'phrase', { push: { words: 'lose bar two', who: 'typed', ts: 2 } })!;
  assert.equal(readGroups(w.text).groups.length, 1); assert.deepEqual(w.undo!.before, []); assert.equal(w.undo!.after.length, 1);
  assert.equal(writeNoteGroups(w.text, cur, listOf(w.text), 'phrase', { set: [], expect: '[]' }), null, 'the stack is not the one expected: nothing');
  assert.equal(writeNoteGroups(w.text, after, listOf(w.text), 'phrase', { set: [], list: [HEAD] }), null, 'the note would not say the popped list: nothing');
});

// ---- every writer of the list carries the stack ------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the list writers carry the key: a write of the same list keeps it byte for byte, the Forge replay keeps it, refreshing the links keeps it, a root mark keeps it', () => {
  const { text } = pushed();
  assert.equal(written(text, listOf(text)), text);
  const f = forgeText(text, 'phrase_001', 'phrase', PHRASE_VAULT); assert.equal(f.ok && f.same, true);
  const r = refreshPhraseNoteText(text, 'phrase_001'); assert.equal(r.ok === false ? r.message : readGroups(r.text).groups.length, 1);
  assert.equal(readGroups(withRoot(text, true)).groups.length, 1);
});

test('a writer that applies edited lines drops the groups they no longer match (Update from Description, Forge, Revert, a copy); the lines are never taken away', () => {
  const { text } = pushed();
  const edit = (to: string) => text.replace('2. Delete bar 2.', to);
  const edited = edit('2. Delete bar 3.');
  const u = applyDescriptionText(edited, 'phrase_001', 'phrase', PHRASE_VAULT, extractDescription(edited));
  const f = forgeText(edited, 'phrase_001', 'phrase', PHRASE_VAULT);
  for (const w of [u, f]) { assert.equal(w.ok, true); if (w.ok) { assert.equal(readGroups(w.text).state, 'none'); assert.deepEqual(listOf(w.text), [HEAD, 'Delete bar 3.']); } }
  const added = forgeText(edit('2. Delete bar 2.\n3. Delete bar 1.'), 'phrase_001', 'phrase', PHRASE_VAULT);
  assert.equal(added.ok && readGroups(added.text).groups.length, 1, 'a line added keeps the group below it');
  const back = revertDescriptionText(edited, 'phrase_001', 'phrase');          // Revert writes the lines the json cache says: the ones the group describes
  assert.equal(back.ok && readGroups(back.text).groups.length, 1);
  const strip = writePhraseStrip(text, 'phrase_001', { ...EXTEND, source: 'bar_007', ops: [{ op: 'delete', runs: [[2, 2]] }] } as PhraseParams, PHRASE_VAULT);          // (the strip's tab carries it after: phrase-view)
  assert.equal(strip.ok && readGroups(carryGroups(strip.text, 'phrase')).state, 'none');
});

test('a duplicate copies the stack with the list', () => {
  const { text, groups } = pushed();
  const c = copyListNote(text, 'phrase_009', 'phrase', PHRASE_VAULT, 'phrase_001');
  assert.equal(c.ok, true);
  if (c.ok) assert.deepEqual(readGroups(c.text).groups, JSON.parse(JSON.stringify(groups)));
});

test('the open-time repair keeps the key; Detach takes it away (a custom note has no stack) and keeps a foreign one', () => {
  const { text } = pushed();
  const noFence = text.slice(0, text.indexOf('# Cache'));
  assert.equal(readGroups(repairForOpen(noFence, 'phrase_001', 'phrase', PHRASE_VAULT)).groups.length, 1);
  const d = customNoteText(text, 'phrase_001');
  assert.equal(isCustomNote(d), true); assert.equal(readGroups(d).state, 'none');
  const theirs = NOTE().replace(/^---\n/, '---\ngroups: [a]\n');
  assert.ok(customNoteText(theirs, 'phrase_001').includes('groups: [a]'));
});

test('a plain old reader ignores the key: the same list, the same Score data, and its writer (which knows nothing of groups) appends and keeps every line of the key', () => {
  const { text } = pushed();
  const plain = writeGroups(text, []);
  assert.deepEqual(listOf(text), listOf(plain));
  assert.deepEqual(readPhraseNote(text), readPhraseNote(plain));
  assert.equal(parseFrontmatter(text)!.fields.content_type, 'json');
  const list = [...listOf(text), 'Delete bar 1.'];
  const rp = replayGrammar(list, 'phrase', { vault: PHRASE_VAULT });
  const sentence = list.map((l, i) => `${i + 1}. ${l}`).join('\n');
  const old = applyPhraseWrite(text, rp.params as PhraseParams, 'phrase_001', true, sentence);          // the writer as it was before this prompt
  const oldPlain = applyPhraseWrite(plain, rp.params as PhraseParams, 'phrase_001', true, sentence);
  assert.equal(old.ok && oldPlain.ok, true);
  if (old.ok && oldPlain.ok) {
    assert.deepEqual(listOf(old.text), list);
    const block = text.split('\n').filter((l, i, all) => l === 'groups:' || all[i - 1] === 'groups:').join('\n');
    assert.ok(old.text.includes(block)); assert.equal(old.text.replace(`${block}\n`, ''), oldPlain.text);
    assert.equal(readGroups(old.text).groups.length, 1, 'and the group below the new line still holds');
  }
});

// ---- 2026-11-27-1050 (mutation pass) ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('2026-11-27-1050 (mutation pass): an item written WITHOUT quotes is a YAML mapping, not a string Forge wrote: foreign, left to the letter', () => {
  for (const g of ['groups:\n  - {"p":"mine","keep":true}', `groups:\n  - ${JSON.stringify(pushed().groups[0])}`]) {
    const n = NOTE().replace(/^---\n/, `---\n${g}\n`);
    assert.equal(typeof frontYaml(n).groups[0], 'object', 'YAML reads it as a mapping');
    assert.deepEqual(readGroups(n), { state: 'foreign', groups: [] }, g);
    assert.equal(writeGroups(n, pushed().groups), n, g);
    assert.equal(dropGroups(n), n, g);
    assert.equal(carryGroups(n, 'phrase'), n, g);
    const after = written(n, [HEAD, 'Delete bar 2.']);
    const w = writeNoteGroups(n, after, listOf(n), 'phrase', { push: { words: 'x', who: 'typed', ts: 1 } })!;
    assert.equal(w.text, after, g); assert.ok(w.text.includes(g), g); assert.equal(w.undo, undefined);
  }
});
