// 2026-11-19-0991 - the NAME of a new phrase / arrangement / composition, the pure part: the spelling rules, the vault-wide rule, the default name, the messages (a full truth table), and the three create flows when they are given a name.
// Imports only cores (no obsidian, no DOM). The dialog is new-note-name-dom.test.ts; the real wiring (the three commands) is new-note-name-wiring.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FORBIDDEN_NAME_CHARS, basenameOfPath, nameSpellingProblem, nameTakenMessage, noteWithName } from './note-name-rules-core.ts';
import { NEW_NOTE_KINDS, checkNewNoteName, defaultNewNoteName, type NewNoteKind } from './new-note-name-core.ts';
import { nextArrangementName, arrangementPath } from './arrangement-core.ts';
import { nextCompositionName, compositionPath } from './composition-core.ts';
import { nextPhraseName, planNewEmptyPhrase, createNewEmptyPhrase, phrasePath } from './phrase-core.ts';
import { createEmptyArrangement } from './kit-arrangement-flow-core.ts';
import { createEmptyComposition } from './composition-flow-core.ts';
import { emptyArrangementNote, emptyCompositionNote, emptyPhraseNote, isEmptyNote } from './empty-note-core.ts';

const KINDS: NewNoteKind[] = ['phrase', 'arrangement', 'composition'];

// ===== 1. the spelling rules: a truth table ================================================================================================================================================
const SPELLING: Array<[string, string, string | null]> = [
  // [tag, typed, reason (null = fine)]
  ['plain', 'intro', null],
  ['default shape', 'phrase_007', null],
  ['spaces inside', 'my first piece', null],
  ['a dot inside', 'take 1.2', null],
  ['a dot at the end', 'v1.', null],
  ['unicode', 'Étude № 3', null],
  ['digits only', '2026', null],
  ['spaces at the ends are not part of the name', '  intro  ', null],
  ['empty', '', 'empty'],
  ['only spaces', '   ', 'empty'],
  ['only a tab', '\t', 'empty'],
  ['a slash', 'a/b', 'chars'],
  ['a backslash', 'a\\b', 'chars'],
  ['a colon', 'a:b', 'chars'],
  ['a star', 'a*b', 'chars'],
  ['a question mark', 'a?b', 'chars'],
  ['a double quote', 'a"b', 'chars'],
  ['a less-than', 'a<b', 'chars'],
  ['a greater-than', 'a>b', 'chars'],
  ['a bar', 'a|b', 'chars'],
  ['a slash at the start (a folder path)', '/intro', 'chars'],
  ['a folder path', 'phrases/intro', 'chars'],
  ['a leading dot', '.intro', 'dot'],
  ['only a dot', '.', 'dot'],
  ['two dots', '..', 'dot'],
  ['a leading dot after spaces', '  .hidden', 'dot'],
  ['a leading dot AND a forbidden character: the character is said first', '.a/b', 'chars'],
];
for (const [tag, typed, reason] of SPELLING) {
  test(`spelling: ${tag} (${JSON.stringify(typed)}) -> ${reason ?? 'fine'}`, () => {
    const got = nameSpellingProblem(typed, 'phrase');
    if (reason === null) assert.ok(got === null, `unexpected ${JSON.stringify(got)}`); else { assert.ok(got !== null, 'a problem is expected'); assert.equal(got!.reason, reason); }
  });
}

test('spelling: every forbidden character is covered by the table and listed in the message by name; the message names the ones that were typed', () => {
  assert.deepEqual([...FORBIDDEN_NAME_CHARS], ['/', '\\', ':', '*', '?', '"', '<', '>', '|'], 'the nine characters of the rule');
  for (const c of FORBIDDEN_NAME_CHARS) {
    const p = nameSpellingProblem(`a${c}b`, 'phrase')!;
    assert.equal(p.reason, 'chars'); assert.ok(p.message.includes(`cannot contain ${c} `), `${c}: the message names what was typed (${p.message})`);
  }
  const two = nameSpellingProblem('a?b:c', 'phrase')!;
  assert.deepEqual((two as { found: string[] }).found, [':', '?'], 'both, in the order of the rule');
});

test('spelling: the messages are plain words: no colour word, no exclamation mark, no alarm; "empty" names the kind', () => {
  for (const noun of ['phrase', 'arrangement', 'composition']) {
    const m = nameSpellingProblem('', noun)!.message;
    assert.equal(m, `Type a name for the new ${noun}`);
  }
  for (const t of ['', '.x', 'a/b']) { const m = nameSpellingProblem(t, 'phrase')!.message; assert.doesNotMatch(m, /!|error|invalid|red|warning|wrong/i, m); }
});

// ===== 2. the vault-wide rule ================================================================================================================================================================
test('the vault-wide rule: a name that ANY note has is taken, in whatever folder, at the top of the vault too; case does not matter; the sentence names the existing note and its folder', () => {
  const vault = ['bars/bar_001.md', 'phrases/phrase_001.md', 'compositions/Intro.md', 'Welcome.md', 'notes/deep/in/here/Theme.md', 'kits/rock.md'];
  const taken: Array<[string, NewNoteKind, string]> = [
    ['Intro', 'phrase', 'A note called Intro already exists (compositions/Intro)'],          // a COMPOSITION called Intro blocks a PHRASE called Intro
    ['intro', 'arrangement', 'A note called Intro already exists (compositions/Intro)'],      // case-insensitive: the existing name is the one said
    ['rock', 'composition', 'A note called rock already exists (kits/rock)'],
    ['bar_001', 'phrase', 'A note called bar_001 already exists (bars/bar_001)'],
    ['Welcome', 'composition', 'A note called Welcome already exists (at the top of the vault)'],
    ['Theme', 'arrangement', 'A note called Theme already exists (notes/deep/in/here/Theme)'],
    ['phrase_001', 'phrase', 'A note called phrase_001 already exists (phrases/phrase_001)'],
    ['phrase_001', 'composition', 'A note called phrase_001 already exists (phrases/phrase_001)'],
  ];
  for (const [typed, kind, say] of taken) {
    const r = checkNewNoteName(kind, typed, vault);
    assert.equal(r.ok, false, `${kind} ${typed}`); assert.equal((r as { reason: string }).reason, 'exists'); assert.equal(r.message, say);
  }
  for (const [typed, kind] of [['Overture', 'phrase'], ['phrase_002', 'phrase'], ['comp_001', 'composition'], ['arr_001', 'arrangement'], ['Intro 2', 'composition']] as const) {
    const r = checkNewNoteName(kind, typed, vault); assert.equal(r.ok, true, `${kind} ${typed}`);
  }
  assert.equal(nameTakenMessage('X', 'folder/X.md'), 'A note called X already exists (folder/X)', 'the spelling of the prompt');
});

test('the vault-wide rule: with two notes of one name (a broken vault) the sentence names the first by path, the same every time; a name is compared without its .md and without its folder', () => {
  const paths = ['z/dup.md', 'a/dup.md', 'm/dupe.md'];
  assert.equal(noteWithName('dup', paths), 'a/dup.md'); assert.equal(noteWithName('dup', [...paths].reverse()), 'a/dup.md');
  assert.equal(noteWithName('du', paths), null, 'a prefix is not the name'); assert.equal(noteWithName('dup.md', paths), null);
  assert.equal(basenameOfPath('a/b/c.md'), 'c'); assert.equal(basenameOfPath('c.md'), 'c'); assert.equal(basenameOfPath('a/b.c.md'), 'b.c');
});

test('the verdict: the spelling comes first, then the vault; a valid name says what it will be made as; the spaces at the ends are cut; the name is returned as it will be written', () => {
  const vault = ['phrases/phrase_001.md'];
  for (const k of KINDS) {
    const info = NEW_NOTE_KINDS[k];
    const ok = checkNewNoteName(k, '  Sunrise  ', vault);
    assert.deepEqual(ok, { ok: true, name: 'Sunrise', path: `${info.folder}/Sunrise.md`, message: `It will be made as ${info.folder}/Sunrise.md` });
    assert.equal((checkNewNoteName(k, '', vault) as { reason: string }).reason, 'empty');
    assert.equal((checkNewNoteName(k, 'a/phrase_001', vault) as { reason: string }).reason, 'chars', 'spelling before the vault');
    assert.equal((checkNewNoteName(k, '.phrase_001', vault) as { reason: string }).reason, 'dot');
    assert.equal((checkNewNoteName(k, ' phrase_001 ', vault) as { reason: string }).reason, 'exists', 'the cut name is the one compared');
  }
  assert.deepEqual(KINDS.map((k) => [NEW_NOTE_KINDS[k].title, NEW_NOTE_KINDS[k].folder]), [['New phrase', 'phrases'], ['New arrangement', 'arrangements'], ['New composition', 'compositions']]);
});

// ===== 3. the default name ===================================================================================================================================================================
/** What the actions chose BEFORE this prompt (the numbering rule of 2026-11-19-0960), computed by the plugin's own functions on a listing of one folder. */
function todaysDefault(kind: NewNoteKind, paths: readonly string[]): string {
  const has = new Set(paths);
  if (kind === 'phrase') return nextPhraseName(paths.filter((p) => p.startsWith('phrases/')).map(basenameOfPath));
  if (kind === 'arrangement') return nextArrangementName((p) => has.has(p));
  return nextCompositionName((p) => has.has(p));
}
const FOLDER_ONLY_VAULTS: string[][] = [
  [],
  ['bars/bar_001.md', 'bars/bar_002.md'],
  ['phrases/phrase_001.md'],
  ['phrases/phrase_001.md', 'phrases/phrase_002.md', 'phrases/phrase_003.md'],
  ['phrases/phrase_001.md', 'phrases/phrase_003.md'],                                          // a gap: the phrase rule is one past the HIGHEST
  ['arrangements/arr_001.md', 'arrangements/arr_003.md'],                                       // a gap: the arrangement rule is the FIRST FREE
  ['compositions/comp_002.md', 'compositions/comp_003.md'],
  ['compositions/comp_001.md', 'compositions/comp_002.md', 'compositions/comp_004.md', 'arrangements/arr_001.md', 'phrases/phrase_009.md'],
  ['phrases/README.md', 'arrangements/README.md', 'compositions/README.md', 'phrases/intro.md'],  // names that are not numbered are ignored by the numbering
];
test('the default name IS today\'s default: over a table of vaults whose notes keep to their own folders the field starts on exactly what the action chose before there was a dialog', () => {
  assert.ok(FOLDER_ONLY_VAULTS.length >= 8, 'non-vacuity');
  const seen = new Set<string>();
  for (const v of FOLDER_ONLY_VAULTS) for (const k of KINDS) { const got = defaultNewNoteName(k, v); assert.equal(got, todaysDefault(k, v), `${k} in ${JSON.stringify(v)}`); seen.add(got); }
  assert.deepEqual([defaultNewNoteName('phrase', []), defaultNewNoteName('arrangement', []), defaultNewNoteName('composition', [])], ['phrase_001', 'arr_001', 'comp_001']);
  assert.equal(defaultNewNoteName('phrase', FOLDER_ONLY_VAULTS[4]), 'phrase_004', 'one past the highest');
  assert.equal(defaultNewNoteName('arrangement', FOLDER_ONLY_VAULTS[5]), 'arr_002', 'the first free');
  assert.ok(seen.size >= 5, 'the table reaches several different defaults');
});

test('the default name is free in the WHOLE vault: a note of that name in another folder moves it on, for each kind; and it is never a refusal of the dialog (a property over many vaults)', () => {
  assert.equal(defaultNewNoteName('phrase', ['phrases/phrase_001.md', 'stray/phrase_002.md']), 'phrase_003', 'phrase_002 exists in stray/');
  assert.equal(defaultNewNoteName('phrase', ['stray/phrase_001.md']), 'phrase_002', 'phrase_001 exists in stray/ and phrases/ has none');
  assert.equal(defaultNewNoteName('arrangement', ['elsewhere/arr_001.md']), 'arr_002');
  assert.equal(defaultNewNoteName('composition', ['x/comp_001.md', 'y/comp_002.md', 'compositions/comp_004.md']), 'comp_003');
  assert.equal(defaultNewNoteName('composition', ['x/COMP_001.md']), 'comp_002', 'case does not matter');
  assert.equal(defaultNewNoteName('composition', ['arr_001.md']), 'comp_001', 'the other kind\'s number does not matter');
  const vaults = [...FOLDER_ONLY_VAULTS, ['stray/phrase_001.md', 'stray/arr_001.md', 'stray/comp_001.md'], ['a/phrase_001.md', 'b/phrase_002.md', 'c/phrase_003.md', 'phrases/phrase_004.md']];
  for (const v of vaults) for (const k of KINDS) {
    const name = defaultNewNoteName(k, v); const r = checkNewNoteName(k, name, v);
    assert.equal(r.ok, true, `${k} default ${name} in ${JSON.stringify(v)} must be valid: ${r.message}`);
  }
});

// ===== 4. the flows given a name ============================================================================================================================================================
interface Rig { ports: any; created: Array<{ path: string; content: string }>; opened: string[]; notes: string[]; traces: string[]; folders: string[]; creates: () => number }
function rig(existing: string[] = [], opts: { raceOn?: string } = {}): Rig {
  const taken = new Set(existing); const created: Array<{ path: string; content: string }> = []; const opened: string[] = [], notes: string[] = [], traces: string[] = [], folders: string[] = []; let creates = 0;
  const ports = {
    folderExists: (f?: string) => (f === undefined ? false : folders.includes(f) || existing.some((p) => p.startsWith(`${f}/`))),
    createFolder: async (f?: string) => { folders.push(f ?? 'phrases'); },
    exists: (p: string) => taken.has(p), listPhraseBasenames: () => [...taken].filter((p) => p.startsWith('phrases/')).map(basenameOfPath),
    create: async (p: string, content: string) => { creates++; if (taken.has(p) || p === opts.raceOn) throw new Error('File already exists.'); taken.add(p); created.push({ path: p, content }); return { path: p }; },
    open: async (f: { path: string }) => { opened.push(f.path); }, notify: (m: string) => { notes.push(m); }, trace: (l: string) => { traces.push(l); }, activePath: () => null,
    isAlreadyExists: (e: unknown) => /already exists/.test(String((e as Error)?.message)),
  };
  return { ports, created, opened, notes, traces, folders, creates: () => creates };
}

test('the three flows make the note with EXACTLY the typed name: empty, in the usual folder, opened; the composition keeps its root mark whatever it is called', async () => {
  const p = rig(); assert.deepEqual(await createNewEmptyPhrase(p.ports, { name: 'Sunrise' }), { ok: true, path: 'phrases/Sunrise.md' });
  assert.deepEqual(p.created, [{ path: 'phrases/Sunrise.md', content: emptyPhraseNote('Sunrise') }]); assert.deepEqual(p.opened, ['phrases/Sunrise.md']); assert.ok(isEmptyNote(p.created[0].content));
  const a = rig(); assert.deepEqual(await createEmptyArrangement(a.ports, { name: 'Drums and bass' }), { ok: true, path: 'arrangements/Drums and bass.md' });
  assert.deepEqual(a.created, [{ path: 'arrangements/Drums and bass.md', content: emptyArrangementNote('Drums and bass') }]); assert.deepEqual(a.opened, ['arrangements/Drums and bass.md']); assert.deepEqual(a.folders, ['arrangements']);
  const c = rig(); assert.deepEqual(await createEmptyComposition(c.ports, { name: 'Overture', root: true }), { ok: true, path: 'compositions/Overture.md', name: 'Overture' });
  assert.deepEqual(c.created, [{ path: 'compositions/Overture.md', content: emptyCompositionNote('Overture', ['root: true']) }], 'the first composition of a vault is the root, named as typed');
  assert.deepEqual(c.opened, ['compositions/Overture.md']); assert.deepEqual(c.traces, ['[forge-composition] created compositions/Overture.md (empty, the root of the piece)'], 'the evidence line is the one it always was');
  const c2 = rig(['compositions/comp_001.md']); await createEmptyComposition(c2.ports, { name: 'Bridge', root: false });
  assert.doesNotMatch(c2.created[0].content, /root:/, 'not the first: no root mark');
});

test('a name given to a flow that is TAKEN (the path exists, or the vault says so at the write) is refused in words: nothing is written, no other number is tried, the sentence is the dialog\'s sentence', async () => {
  const sentence = (p: string) => nameTakenMessage(basenameOfPath(p), p);
  const p = rig(['phrases/Sunrise.md']); const rp = await createNewEmptyPhrase(p.ports, { name: 'Sunrise' });
  assert.deepEqual(rp, { ok: false, message: sentence('phrases/Sunrise.md') }); assert.equal(p.creates(), 0, 'phrase: not even tried'); assert.deepEqual(p.opened, []);
  const a = rig(['arrangements/x.md']); const ra = await createEmptyArrangement(a.ports, { name: 'x' });
  assert.deepEqual(ra, { ok: false, message: sentence('arrangements/x.md') }); assert.equal(a.creates(), 0); assert.deepEqual(a.opened, []);
  const c = rig(['compositions/x.md']); const rc = await createEmptyComposition(c.ports, { name: 'x' });
  assert.deepEqual(rc, { ok: false, message: sentence('compositions/x.md') }); assert.equal(c.creates(), 0); assert.deepEqual(c.opened, []);
  // taken between the check and the write: ONE attempt, no retry with another name
  const ar = rig([], { raceOn: 'arrangements/x.md' }); assert.deepEqual(await createEmptyArrangement(ar.ports, { name: 'x' }), { ok: false, message: sentence('arrangements/x.md') }); assert.equal(ar.creates(), 1, 'N attempts are not N different candidates: the name was typed, so there is one candidate');
  const cr = rig([], { raceOn: 'compositions/x.md' }); assert.deepEqual(await createEmptyComposition(cr.ports, { name: 'x' }), { ok: false, message: sentence('compositions/x.md') }); assert.equal(cr.creates(), 1); assert.deepEqual(cr.opened, []);
  const pr = rig([], { raceOn: 'phrases/x.md' }); const rr = await createNewEmptyPhrase(pr.ports, { name: 'x' }); assert.equal(rr.ok, false); assert.deepEqual(pr.opened, []); assert.deepEqual(pr.created, []);
});

test('P3: a flow with NO name does what it did before (the next free numbered name, a retry when another writer takes it); planNewEmptyPhrase with no name is the old plan', async () => {
  const p = rig(['phrases/phrase_001.md', 'phrases/phrase_003.md']); assert.deepEqual(await createNewEmptyPhrase(p.ports), { ok: true, path: 'phrases/phrase_004.md' });
  const a = rig(['arrangements/arr_001.md'], { raceOn: 'arrangements/arr_002.md' }); assert.deepEqual(await createEmptyArrangement(a.ports), { ok: true, path: 'arrangements/arr_003.md' });
  const c = rig(['compositions/comp_001.md']); assert.deepEqual(await createEmptyComposition(c.ports), { ok: true, path: 'compositions/comp_002.md', name: 'comp_002' });
  assert.deepEqual(planNewEmptyPhrase({ existingBasenames: ['phrase_001'], exists: (x) => x === 'phrases/phrase_001.md' }), { ok: true, name: 'phrase_002', path: phrasePath('phrase_002'), content: emptyPhraseNote('phrase_002') });
  assert.equal(arrangementPath('a'), 'arrangements/a.md'); assert.equal(compositionPath('c'), 'compositions/c.md');
});

test('the named plan of a phrase is the typed name or a refusal: no number is substituted (the default is chosen by the dialog, from the whole vault)', () => {
  const plan = planNewEmptyPhrase({ existingBasenames: ['phrase_001'], exists: () => false, name: 'Chorus' });
  assert.deepEqual(plan, { ok: true, name: 'Chorus', path: 'phrases/Chorus.md', content: emptyPhraseNote('Chorus') });
  const taken = planNewEmptyPhrase({ existingBasenames: [], exists: (x) => x === 'phrases/Chorus.md', name: 'Chorus' });
  assert.deepEqual(taken, { ok: false, message: 'A note called Chorus already exists (phrases/Chorus)' });
});
