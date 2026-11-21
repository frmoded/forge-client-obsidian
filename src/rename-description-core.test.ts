// 2026-11-20-1005 (F9) - a renamed note's frontmatter `description:` keeps the OLD name in its words (`phrase_016 — an extend of ...`). The description follows the rename: when it STARTS with the old name and the em dash (the words the plugin
// generates), the name there becomes the new one; a description a person wrote is never touched. Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { followRenamedName } from './rename-description-core.ts';

const note = (desc: string, rest = '# Description\n\n1. Extend [[bar_005]] to 4 bars.\n') => `---\ntype: data\ncontent_type: json\n${desc}\nlinks:\n  - "[[bar_005]]"\n---\n\n${rest}`;

test('a generated description (quoted, as the plugin writes it) takes the new name; the rest of the note is byte for byte the same', () => {
  const before = note('description: "phrase_016 — [[bar_005]] extended to 4 bars: repeating with fills, same tempo."');
  const after = followRenamedName(before, 'phrase_016', 'my groove');
  assert.equal(after, note('description: "my groove — [[bar_005]] extended to 4 bars: repeating with fills, same tempo."'));
});

test('an unquoted description, a name with regex characters, and a new name with a quote or a backslash (YAML-escaped)', () => {
  assert.equal(followRenamedName(note('description: phrase_016 — a copy of [[bar_005]].'), 'phrase_016', 'bridge'), note('description: bridge — a copy of [[bar_005]].'));
  assert.equal(followRenamedName(note('description: "a.b (1) — x"'), 'a.b (1)', 'c'), note('description: "c — x"'));
  assert.equal(followRenamedName(note('description: "phrase_016 — x"'), 'phrase_016', 'say "hi" \\ now'), note('description: "say \\"hi\\" \\\\ now — x"'));
});

test('nothing to do (null): the description does not start with the old name and the dash; a person\'s own words; no description; the same name; an empty name; the name only inside the text', () => {
  for (const [text, from, to] of [
    [note('description: "something else — x"'), 'phrase_016', 'a'], [note('description: "A nice groove I made"'), 'phrase_016', 'a'], [note('description: "phrase_016 is mine"'), 'phrase_016', 'a'],
    ['---\ntype: data\n---\n\nbody\n', 'phrase_016', 'a'], [note('description: "phrase_016 — x"'), 'phrase_016', 'phrase_016'], [note('description: "phrase_016 — x"'), 'phrase_016', ''], [note('description: "phrase_016 — x"'), '', 'a'],
    [note('description: "the phrase_016 — x"'), 'phrase_016', 'a'], ['no frontmatter at all', 'a', 'b'],
  ] as const) assert.equal(followRenamedName(text, from, to), null, `${text.slice(0, 60)} ${from} -> ${to}`);
});

test('only the FRONTMATTER description is changed: the same words in the body (a Description line, a Recipe) stay; a `description:` line in the body is not the frontmatter\'s', () => {
  const body = '# Description\n\n1. phrase_016 — is a line the person typed.\n\ndescription: "phrase_016 — in the body"\n';
  const before = note('description: "phrase_016 — x"', body);
  assert.equal(followRenamedName(before, 'phrase_016', 'b'), note('description: "b — x"', body));
});

// ---- mutation survivors ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
import { LIST_MODEL_SENTINEL_RENAME_DESCRIPTION_CORE } from './rename-description-core.ts';
import { LIST_MODEL_SENTINEL_RENAME_FOLLOW_CORE, followRenamedDescription } from './rename-follow-core.ts';

test('the sentinels; a description that is the FIRST line of the frontmatter is found; an unquoted description that does not start with the old name is left alone; an unquoted description gets QUOTED when the new name needs it', () => {
  assert.equal(LIST_MODEL_SENTINEL_RENAME_DESCRIPTION_CORE, 'forge-list-model-core:rename-description-core'); assert.equal(LIST_MODEL_SENTINEL_RENAME_FOLLOW_CORE, 'forge-list-model-core:rename-follow-core');
  assert.equal(followRenamedName('---\ndescription: "a — x"\ntype: data\n---\n\nbody\n', 'a', 'b'), '---\ndescription: "b — x"\ntype: data\n---\n\nbody\n');
  assert.equal(followRenamedName('---\ndescription: other — x\n---\n', 'a', 'b'), null);
  assert.equal(followRenamedName('---\ndescription: a — he said "no"\n---\n', 'a', 'my: song'), '---\ndescription: "my: song — he said \\"no\\""\n---\n');
  assert.equal(followRenamedName('---\ntype: data\ndescription: a — x\n---', 'a', 'b'), '---\ntype: data\ndescription: b — x\n---', 'a frontmatter that ends the text');
});

const F = (path: string) => ({ path, extension: path.replace(/^.*\./, ''), basename: path.replace(/^.*\//, '').replace(/\.[^.]+$/, '') });
function ports(files: Map<string, string>) {
  const processed: string[] = [], errors: unknown[] = [];
  return { processed, errors, p: { read: async (f: { path: string }) => { const t = files.get(f.path); if (t === undefined) throw new Error('ENOENT'); return t; }, process: async (f: { path: string }, fn: (c: string) => string) => { processed.push(f.path); files.set(f.path, fn(files.get(f.path)!)); }, onError: (_f: unknown, e: unknown) => { errors.push(e); } } };
}
test('rename-follow: a phrase, an arrangement, a composition and a bar still named bar_NNN follow; the same path, a non-note, a note of nobody\'s and a png do not; a read error goes to onError; a change made between the read and the write is re-checked', async () => {
  const d = (n: string) => `---\ntype: data\ndescription: "${n} — x"\n---\n`;
  const files = new Map([['phrases/new.md', d('old')], ['arrangements/new.md', d('old')], ['compositions/new.md', d('old')], ['bars/bar_002.md', d('bar_001')], ['notes/new.md', d('old')], ['phrases/pic.png', d('old')]]);
  const { p, processed, errors } = ports(files);
  for (const [path, from] of [['phrases/new.md', 'phrases/old.md'], ['arrangements/new.md', 'arrangements/old.md'], ['compositions/new.md', 'compositions/old.md'], ['bars/bar_002.md', 'bars/bar_001.md'], ['notes/new.md', 'notes/old.md'], ['phrases/pic.png', 'phrases/old.png'], ['phrases/new.md', 'phrases/new.md']] as const) await followRenamedDescription(F(path), from, p);
  assert.deepEqual(processed, ['phrases/new.md', 'arrangements/new.md', 'compositions/new.md', 'bars/bar_002.md']); assert.equal(errors.length, 0);
  assert.match(files.get('bars/bar_002.md')!, /description: "bar_002 — x"/); assert.match(files.get('notes/new.md')!, /"old — x"/);
  await followRenamedDescription(F('phrases/gone.md'), 'phrases/old.md', p); assert.equal(errors.length, 1);
  const raced = new Map([['phrases/r.md', d('old')]]); const q = ports(raced); const seen: string[] = [];
  await followRenamedDescription(F('phrases/r.md'), 'phrases/old.md', { ...q.p, process: async (f, fn) => { raced.set(f.path, d('someone else wrote this')); seen.push(fn(raced.get(f.path)!)); } });
  assert.equal(seen[0], d('someone else wrote this'), 'the write function re-checks the text it is given: a description changed meanwhile is not overwritten');
});
