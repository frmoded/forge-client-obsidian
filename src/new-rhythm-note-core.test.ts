// Drain 2026-10-20-1700 — the "New Forge note" dialog can create a RHYTHM note: a data note that opens in the Beat Box.
//
// What the dialog offered before (read from src/new-note-core.ts and modal.ts, not from memory): Note type Action | Data; for Data a Content type dropdown fed by the
// backend (json, yaml, text, markdown, musicxml, svg, jpeg); the new note lands in the ACTIVE file's folder ("Creates in: …"), or the vault root when that folder is a
// plugin-managed bundled library; "/" in a name and an existing path are refused before anything is written. There was NO way to make a rhythm note: a `json` data
// note is created with the seed `{}`, which the Beat Box refuses ("steps must be…"), so it opened as JSON text.
//
// The data kind the dialog already has is the Content type dropdown, so the new choice is one more entry there — "Rhythm (Beat Box)", right after `json` — not a new
// control. It is NOT a backend content type (the note is `content_type: json`); the dialog maps it to a template. New-feature discipline: every observable behaviour
// has a test and the guards have mutants (see the FEEDBACK).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  FALLBACK_CONTENT_TYPES, RHYTHM_CHOICE, RHYTHM_CHOICE_LABEL, RHYTHM_STARTER, contentChoices, contentTypeDescription, dataNoteContent, dataTemplate,
  isBinaryContentType, isRhythmChoice, planNewNote, rhythmNoteTemplate,
} from './new-note-core.ts';
import { applySave, isRhythmEditCandidate, readRhythmNote, formatRhythmJson } from './rhythm-edit-core.ts';
import { decideDefaultView, type DefaultViewInput } from './rhythm-default-view-core.ts';
import { EDITION_VAULT_NAMES } from './edition-core.ts';
import { loadWidget, skip as widgetSkip } from './test-support/rhythm-widget-harness.ts';

const SRC = path.resolve(import.meta.dirname);
const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');
const LEAN_MANAGED: ReadonlySet<string> = new Set(EDITION_VAULT_NAMES.lean);
const MUSIC_MANAGED: ReadonlySet<string> = new Set(EDITION_VAULT_NAMES.music);
const frontmatter = (note: string) => /^---\n([\s\S]*?)\n---\n/.exec(note)?.[1] ?? '';
const fields = (note: string) => Object.fromEntries(frontmatter(note).split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));

// ---- the choice in the dropdown ------------------------------------------------------------------------------------------------

test('the Content type menu gains "Rhythm (Beat Box)" right after json; every other entry, its value and its order are unchanged; json stays the default', () => {
  const choices = contentChoices(FALLBACK_CONTENT_TYPES);
  assert.deepEqual(choices.map((c) => c.value), ['json', RHYTHM_CHOICE, 'yaml', 'text', 'markdown', 'musicxml', 'svg', 'jpeg']);
  assert.equal(choices[1].label, 'Rhythm (Beat Box)');
  assert.equal(RHYTHM_CHOICE_LABEL, 'Rhythm (Beat Box)');
  for (const c of choices.filter((x) => x.value !== RHYTHM_CHOICE)) assert.equal(c.label, c.value, `${c.value}: the label is the value, as before`);
  assert.equal(choices[0].value, 'json', 'the first entry — the dialog\'s default (contentTypes[0]) — is still json');
});

test('contentChoices: a backend list without json gets the choice at the end; a list that already has it is not doubled; the input is left alone', () => {
  assert.deepEqual(contentChoices(['yaml', 'text']).map((c) => c.value), ['yaml', 'text', RHYTHM_CHOICE]);
  assert.deepEqual(contentChoices(['json', RHYTHM_CHOICE, 'yaml']).map((c) => c.value), ['json', RHYTHM_CHOICE, 'yaml']);
  const input = ['json', 'yaml'];
  contentChoices(input);
  assert.deepEqual(input, ['json', 'yaml']);
});

test('the choice is not a binary kind (no asset drop zone) and is recognised only by its exact value', () => {
  assert.equal(isBinaryContentType(RHYTHM_CHOICE), false);
  assert.equal(isRhythmChoice(RHYTHM_CHOICE), true);
  for (const other of ['json', 'Rhythm', 'rhythm ', 'RHYTHM', '', 'rhythm_note']) assert.equal(isRhythmChoice(other), false, JSON.stringify(other));
});

test('wording: choosing Rhythm says what will be made and where it opens; every other choice keeps the dialog\'s original sentence', () => {
  assert.match(contentTypeDescription(RHYTHM_CHOICE), /Beat Box/);
  assert.match(contentTypeDescription(RHYTHM_CHOICE), /kick/i);
  assert.equal(contentTypeDescription('json'), 'Format of the data payload (only used for Data notes)');
  assert.equal(contentTypeDescription('yaml'), contentTypeDescription('json'));
});

// ---- the starter note: valid, byte-stable, a real groove --------------------------------------------------------------------------

test('THE SHAPE the prompt asks for: type data, content_type json, a description, ONE json block — 4/4, 16 steps, groups of 4, swing 0, 100 BPM, kick and snare', () => {
  const note = rhythmNoteTemplate('my_beat');
  const f = fields(note);
  assert.equal(f.type, 'data');
  assert.equal(f.content_type, 'json');
  assert.ok(f.description && f.description.length > 3, 'a description');
  assert.deepEqual(Object.keys(f), ['type', 'content_type', 'description'], 'exactly these frontmatter keys, in this order (the existing data-note order)');
  assert.equal((note.match(/```/g) ?? []).length, 2, 'exactly one fenced block');
  assert.match(note, /```json\n\{[\s\S]*\}\n```\n$/);
  const r = readRhythmNote(note);
  assert.equal(r.ok, true, r.ok ? '' : r.message);
  if (r.ok === false) return;
  const d = r.value.data;
  assert.equal(d.time_signature, '4/4');
  assert.equal(d.steps, 16);
  assert.equal(d.group_size, 4);
  assert.equal(d.swing_pct, 0);
  assert.equal(d.tempo_bpm, 100);
  assert.deepEqual(Object.keys(d.channels), ['kick', 'snare']);
});

test('PLAYS SOMETHING: a plain one-bar groove — kick on beats 1 and 3, snare on 2 and 4, every cell strictly true/false, both rows have hits', () => {
  assert.deepEqual(RHYTHM_STARTER.channels.kick.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [0, 8]);
  assert.deepEqual(RHYTHM_STARTER.channels.snare.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [4, 12]);
  for (const row of Object.values(RHYTHM_STARTER.channels)) {
    assert.equal(row.length, 16);
    for (const cell of row) assert.equal(typeof cell, 'boolean', 'a plain hit is true, a rest false — never an invented velocity');
  }
});

test('VALIDATOR: the generated note goes through the Beat Box\'s own validation (readRhythmNote) for any name, and what comes out is exactly the starter', () => {
  for (const name of ['my_beat', 'Tresillo 2', 'a "quoted" beat', 'back\\slash', 'hash # tag', 'colon-free: not allowed in a file, but a description may hold it', 'naïve ☕ beat', "it's mine"]) {
    const r = readRhythmNote(rhythmNoteTemplate(name));
    assert.equal(r.ok, true, `${name}: ${r.ok ? '' : r.message}`);
    if (r.ok) assert.deepEqual(r.value.data, RHYTHM_STARTER, name);
  }
});

test('NON-VACUITY: the plain json data note the dialog made before (seed {}) is NOT valid rhythm data — so the validator test above can fail', () => {
  const old = dataTemplate('my_beat', 'json');
  const r = readRhythmNote(old);
  assert.equal(r.ok, false);
});

test('BYTE-STABLE: the json block is exactly what the Beat Box\'s own writer produces, so the first autosave rewrites ONLY the cell that changed (git diff: one line)', () => {
  const note = rhythmNoteTemplate('my_beat');
  assert.ok(note.includes('```json\n' + formatRhythmJson(RHYTHM_STARTER) + '\n```\n'), 'the block is formatRhythmJson(starter), byte for byte');
  const r = readRhythmNote(note);
  assert.equal(r.ok, true);
  if (r.ok === false) return;
  const edited = JSON.parse(JSON.stringify(r.value.data));
  edited.channels.kick[1] = true;                                       // one cell click
  const saved = applySave(note, r.value.fingerprint, edited);
  assert.equal(saved.ok, true);
  if (saved.ok === false) return;
  const a = note.split('\n'), b = saved.text.split('\n');
  assert.equal(a.length, b.length);
  assert.equal(a.filter((l, i) => l !== b[i]).length, 1, 'exactly ONE line differs after one cell click');
  assert.equal(frontmatter(saved.text), frontmatter(note), 'the frontmatter is untouched');
});

test('the description is valid YAML for ANY name (quotes, backslashes, # and unicode survive) and names the note', () => {
  for (const name of ['my_beat', 'a "quoted" beat', 'back\\slash', 'hash # tag', 'naïve ☕ beat', "it's mine", '  padded  ']) {
    const line = frontmatter(rhythmNoteTemplate(name)).split('\n').find((l) => l.startsWith('description:'))!;
    const value = JSON.parse(line.slice('description:'.length).trim());   // a double-quoted JSON string IS a YAML double-quoted scalar
    assert.equal(typeof value, 'string');
    assert.ok(value.includes(name), `${JSON.stringify(name)} appears in ${JSON.stringify(value)}`);
  }
});

// ---- it OPENS IN THE BEAT BOX (the Phase 5c allow-list) -----------------------------------------------------------------------------

function leafShowing(note: string, over: Partial<DefaultViewInput> = {}): DefaultViewInput {
  const f = fields(note);
  const r = readRhythmNote(note);
  return {
    location: 'main', viewType: 'markdown', isPlainMarkdownView: true, filePath: 'my_beat.md', extension: 'md',
    frontmatterIsCandidate: isRhythmEditCandidate({ type: f.type, content_type: f.content_type }),
    settingOn: true, edition: 'lean', bodyIsRhythm: r.ok, mark: null, swapInProgress: false, ...over,
  };
}

test('DEFAULT VIEW: a leaf that opens the new note is swapped to the BEAT BOX (not left as markdown) — in both editions', () => {
  const note = rhythmNoteTemplate('my_beat');
  for (const edition of ['lean', 'music'] as const) {
    assert.deepEqual(decideDefaultView(leafShowing(note, { edition })), { swap: true, reason: 'swap', target: 'beatbox' }, edition);
  }
});

test('DEFAULT VIEW, non-vacuity: the same decision refuses what the dialog made before, a note with the setting off, and a leaf marked "stay in JSON"', () => {
  const old = dataTemplate('my_beat', 'json');
  assert.equal(decideDefaultView(leafShowing(old)).swap, false, 'the old {} note is not rhythm data');
  assert.equal(decideDefaultView(leafShowing(old)).reason, 'invalid-rhythm');
  const note = rhythmNoteTemplate('my_beat');
  assert.equal(decideDefaultView(leafShowing(note, { settingOn: false })).swap, false);
  assert.equal(decideDefaultView(leafShowing(note, { mark: 'markdown' })).swap, false);
});

// ---- end to end, headless: the real widget on the new note ----------------------------------------------------------------------------

test('END TO END (headless, the REAL widget): the new note loads in the Beat Box, one cell click posts a save, and applying that save changes exactly ONE line — the kick row', { skip: widgetSkip }, async () => {
  const note = rhythmNoteTemplate('my_beat');
  const r = readRhythmNote(note);
  assert.equal(r.ok, true);
  if (r.ok === false) return;
  const h = await loadWidget(true);
  await h.send({ type: 'forge-rhythm-load', data: r.value.data, noteName: 'my_beat' });
  assert.equal(h.doc.querySelectorAll('.channel-row').length, 2, 'two rows: kick and snare');
  assert.equal(h.cell('kick', 0).classList.contains('on'), true, 'the groove is drawn');
  assert.equal(h.cell('kick', 1).classList.contains('on'), false);
  h.posted.length = 0;
  h.cell('kick', 1).click();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const saves = h.posted.filter((m: { type?: string }) => m && m.type === 'forge-rhythm-save');
  assert.equal(saves.length, 1, 'ONE click, ONE save');
  const saved = applySave(note, r.value.fingerprint, saves[0].data);
  assert.equal(saved.ok, true, saved.ok ? '' : saved.message);
  if (saved.ok === false) return;
  const a = note.split('\n'), b = saved.text.split('\n');
  const changed = a.map((l, i) => (l === b[i] ? -1 : i)).filter((i) => i >= 0);
  assert.equal(changed.length, 1, 'exactly one line of the note differs (git diff: one line)');
  assert.match(b[changed[0]], /"kick"/);
  assert.equal(frontmatter(saved.text), frontmatter(note));
});

// ---- location, naming, no overwrite: the SAME rules as every new note ----------------------------------------------------------------

const never = () => false;

test('LOCATION: the rhythm note lands in the active file\'s folder, like every new note', () => {
  const p = planNewNote({ activeFilePath: 'beats/set/intro.md', name: 'groove', type: 'data', choice: RHYTHM_CHOICE, managedTopLevelDirs: LEAN_MANAGED, exists: never });
  assert.equal(p.ok, true);
  if (p.ok) assert.equal(p.path, 'beats/set/groove.md');
  const root = planNewNote({ activeFilePath: null, name: 'groove', type: 'data', choice: RHYTHM_CHOICE, managedTopLevelDirs: LEAN_MANAGED, exists: never });
  assert.equal(root.ok && root.path, 'groove.md');
});

test('LIBRARY DIRECTORY: from inside a plugin-managed bundled library the rhythm note goes to the vault ROOT, never into the library — for every managed folder of both editions', () => {
  for (const [managed, dirs] of [[LEAN_MANAGED, EDITION_VAULT_NAMES.lean], [MUSIC_MANAGED, EDITION_VAULT_NAMES.music]] as const) {
    assert.ok(dirs.length >= 2);
    for (const dir of dirs) {
      const p = planNewNote({ activeFilePath: `${dir}/some/deep/note.md`, name: 'groove', type: 'data', choice: RHYTHM_CHOICE, managedTopLevelDirs: managed, exists: never });
      assert.equal(p.ok, true, dir);
      if (p.ok) assert.equal(p.path, 'groove.md', `${dir}: root, not inside the library`);
    }
  }
  // NON-VACUITY: a folder that is merely named like a note is not managed
  const user = planNewNote({ activeFilePath: 'my-music-theory/x.md', name: 'groove', type: 'data', choice: RHYTHM_CHOICE, managedTopLevelDirs: MUSIC_MANAGED, exists: never });
  assert.equal(user.ok && user.path, 'my-music-theory/groove.md');
});

test('NO OVERWRITE: an existing path is refused with the existing message — naming the path — and nothing is planned', () => {
  const seen: string[] = [];
  const p = planNewNote({ activeFilePath: 'beats/a.md', name: 'groove', type: 'data', choice: RHYTHM_CHOICE, managedTopLevelDirs: LEAN_MANAGED, exists: (x) => { seen.push(x); return true; } });
  assert.equal(p.ok, false);
  if (p.ok === false) {
    assert.match(p.message, /already exists at beats\/groove\.md/);
    assert.match(p.message, /Choose a different name/);
  }
  assert.deepEqual(seen, ['beats/groove.md'], 'only the exact path is checked');
});

test('NAMING: "/" is refused BEFORE any vault lookup, with Obsidian\'s wording; an empty name is refused; both for the rhythm choice', () => {
  let looked = 0;
  const exists = () => { looked++; return false; };
  const slash = planNewNote({ activeFilePath: null, name: 'a/b', type: 'data', choice: RHYTHM_CHOICE, managedTopLevelDirs: LEAN_MANAGED, exists });
  assert.equal(slash.ok, false);
  if (slash.ok === false) assert.match(slash.message, /cannot contain any of the following characters/);
  const empty = planNewNote({ activeFilePath: null, name: '', type: 'data', choice: RHYTHM_CHOICE, managedTopLevelDirs: LEAN_MANAGED, exists });
  assert.equal(empty.ok, false);
  assert.equal(looked, 0, 'no vault lookup for a name that is already refused');
});

test('CONTENT: data + rhythm -> the starter note; data + any other choice -> the plain data template as before; an action note plans a path and leaves its content to the dialog', () => {
  const r = planNewNote({ activeFilePath: null, name: 'groove', type: 'data', choice: RHYTHM_CHOICE, managedTopLevelDirs: LEAN_MANAGED, exists: never });
  assert.equal(r.ok && r.content, rhythmNoteTemplate('groove'));
  for (const ct of ['json', 'yaml', 'text']) {
    const d = planNewNote({ activeFilePath: null, name: 'n', type: 'data', choice: ct, managedTopLevelDirs: LEAN_MANAGED, exists: never });
    assert.equal(d.ok && d.content, dataTemplate('n', ct), ct);
  }
  const a = planNewNote({ activeFilePath: null, name: 'n', type: 'action', choice: RHYTHM_CHOICE, managedTopLevelDirs: LEAN_MANAGED, exists: never });
  assert.equal(a.ok && a.content, null, 'an ACTION note is never a rhythm note, whatever the (hidden) content choice says');
  assert.equal(dataNoteContent('n', RHYTHM_CHOICE), rhythmNoteTemplate('n'));
  assert.equal(dataNoteContent('n', 'json'), dataTemplate('n', 'json'));
});

// ---- the dialog and the plugin call it (mechanism pins) ------------------------------------------------------------------------------

// These pin the MECHANISM (the modal builds its menu from contentChoices, decides with planNewNote and hands a created rhythm note to the Beat Box opener); if the dialog is
// restructured they SHOULD go red — reassess, don't just rewrite. The behaviour is pinned above; what only a real Obsidian can show is in the FEEDBACK's checklist.
test('mechanism pin: the modal uses the one choice list, the one plan, and opens a created rhythm note in the Beat Box through the plugin\'s opener', () => {
  const m = read('modal.ts');
  assert.match(m, /for \(const c of contentChoices\(this\.contentTypes\)\) drop\.addOption\(c\.value, c\.label\);/);
  assert.match(m, /this\.contentTypeSetting\?\.setDesc\(contentTypeDescription\(v\)\);/);
  assert.match(m, /const plan = planNewNote\(\{/);
  assert.doesNotMatch(m, /\bnewNotePath\(/, 'the non-binary path no longer plans by hand');
  assert.match(m, /const isRhythm = this\.snippetType === 'data' && isRhythmChoice\(this\.contentType\);/);
  assert.match(m, /if \(isRhythm\) await this\.hooks\.openRhythmNote\?\.\(file, leaf\);/);
});

test('mechanism pin: the plugin gives the dialog the Beat Box opener (registerRhythmEdit returns it; createNewSnippet passes it)', () => {
  const main = read('main.ts');
  assert.match(main, /this\.rhythmEdit = registerRhythmEdit\(this, \{/);
  assert.match(main, /openRhythmNote: \(file, leaf\) => this\.rhythmEdit\?\.openRhythmNote\(file, leaf\) \?\? Promise\.resolve\(\)/);
  const view = read('rhythm-edit-view.ts');
  assert.match(view, /return \{ openRhythmNote: \(file: TFile, from\?: WorkspaceLeaf \| null\) => openRhythmEditor\(app, file, hooks, from\), markAsText: /);   // 2026-10-26-1250 (M12), deliberate: the handle also carries markAsText
});

test('the binary branch is untouched by the choice: a rhythm choice never reaches submitBinary', () => {
  const m = read('modal.ts');
  assert.match(m, /this\.snippetType === 'data' && isBinaryContentType\(this\.contentType\)/);
  assert.equal(isBinaryContentType(RHYTHM_CHOICE), false);
});
