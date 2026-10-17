// Drain 2026-10-15-2100 §2 — a persisted strip value must not outlive the note it was typed into.
//
// CCQA: a note was deleted and re-created at the same path; the strip's remembered `quality = "minor"` (from the OLD note, where the
// input was an enum dropdown) turned the NEW note's `quality` input into a free-text box showing `"minor"`. Mechanism: the strip's
// memory is keyed by snippet id only, and a derived enum's options come from the TRANSPILED `# Python` signature — a freshly
// re-created note has none yet, so the input renders as text, and the cached string fills it. Three defences, each its own test:
//   (a1) the memory forgets a note when it is deleted, and follows it when it is renamed;
//   (a2) a remembered value is dropped when the note's input SIGNATURE (names + the enum options / widget that shape the control) is not
//        the one it was remembered under — which also covers a note replaced while the plugin was not running (git, Finder);
//   (b)  a remembered value that is not among an enum's choices never reaches a free-text box: the dropdown falls back to its default.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  buildInputFieldModels, forgetPanelNote, recallValidPanelValues, recallPanelValues, renamePanelNote,
  rememberPanelValuesWithSignature, stripInputSignature,
} from './forge-panel-strip-core.ts';

const ENUM_NOTE = { inputs: ['quality'], derivedEnums: { quality: ['major', 'minor'] } };
const RECREATED = { inputs: ['quality'], derivedEnums: {} };

test('the founding incident: with the bare id-keyed memory, a re-created note shows the old value in a FREE-TEXT box', () => {
  // Characterization of the pre-fix path (recallPanelValues + buildInputFieldModels). Kept as the incident's record: it is the
  // behaviour the signature check exists to prevent, and it must stay reproducible so the guard cannot go vacuous.
  const memory = { quiz: { quality: '"minor"' } };
  const [field] = buildInputFieldModels({ ...RECREATED, cached: recallPanelValues(memory, 'quiz') });
  assert.equal(field.kind, 'text');
  assert.equal(field.kind === 'text' && field.value, '"minor"');
});

test('(a2) the signature check: the same memory, recalled under the re-created note\'s signature, is empty', () => {
  const sigOld = stripInputSignature(ENUM_NOTE);
  const sigNew = stripInputSignature(RECREATED);
  assert.notEqual(sigOld, sigNew, 'dropdown options are part of the signature');
  const { memory, signatures } = rememberPanelValuesWithSignature({}, {}, 'quiz', { quality: '"minor"' }, sigOld);
  assert.deepEqual(recallValidPanelValues(memory, signatures, 'quiz', sigOld), { quality: '"minor"' }, 'unchanged note: remembered');
  assert.deepEqual(recallValidPanelValues(memory, signatures, 'quiz', sigNew), {}, 're-created note: dropped');
  const [field] = buildInputFieldModels({ ...RECREATED, cached: recallValidPanelValues(memory, signatures, 'quiz', sigNew) });
  assert.equal(field.kind === 'text' && field.value, '', 'an empty text box, not "minor"');
});

test('(a2) every part of the signature matters: names, enum options, widget — and order of options does not', () => {
  const base = stripInputSignature({ inputs: ['a', 'b'], derivedEnums: { a: ['x', 'y'] } });
  assert.notEqual(base, stripInputSignature({ inputs: ['a', 'c'], derivedEnums: { a: ['x', 'y'] } }), 'a renamed input');
  assert.notEqual(base, stripInputSignature({ inputs: ['a', 'b'], derivedEnums: { a: ['x', 'z'] } }), 'a changed option');
  assert.notEqual(base, stripInputSignature({ inputs: ['a', 'b'], enums: { a: ['x', 'y'] } }), 'frontmatter enum vs derived is a different control source');
  assert.notEqual(base, stripInputSignature({ inputs: ['a', 'b'], derivedEnums: { a: ['x', 'y'] }, widgets: { b: 'piano' } }), 'a widget');
  assert.equal(base, stripInputSignature({ inputs: ['a', 'b'], derivedEnums: { a: ['x', 'y'] }, cached: { a: 'x' }, defaults: { a: 'x' } } as never), 'values and defaults are NOT part of it');
});

test('(a2) legacy memory (no signature stored) is kept, but only for inputs the note still declares', () => {
  const memory = { quiz: { quality: '"minor"', gone: '"1"' } };
  assert.deepEqual(recallValidPanelValues(memory, {}, 'quiz', stripInputSignature(ENUM_NOTE), ['quality']), { quality: '"minor"' });
});

test('(a1) deleting a note forgets its values and its signature; renaming moves both; other notes are untouched', () => {
  const m = {
    memory: { quiz: { quality: '"minor"' }, other: { q: '1' } },
    signatures: { quiz: 'sig-quiz', other: 'sig-other' } as Record<string, string>,
  };
  const deleted = forgetPanelNote(m.memory, m.signatures, 'quiz');
  assert.deepEqual(Object.keys(deleted.memory), ['other']);
  assert.deepEqual(Object.keys(deleted.signatures), ['other']);
  const renamed = renamePanelNote(m.memory, m.signatures, 'quiz', 'quiz2');
  assert.deepEqual(renamed.memory.quiz2, { quality: '"minor"' });
  assert.equal(renamed.signatures.quiz2, 'sig-quiz');
  assert.ok(!('quiz' in renamed.memory) && !('quiz' in renamed.signatures));
  assert.deepEqual(renamed.memory.other, { q: '1' });
  // non-mutating: the maps the plugin holds are not edited in place
  assert.deepEqual(Object.keys(m.memory).sort(), ['other', 'quiz']);
  // renaming a note with nothing remembered is a no-op, not a crash
  assert.deepEqual(renamePanelNote({}, {}, 'a', 'b'), { memory: {}, signatures: {} });
});

test('(b) a remembered value that is not among the choices never reaches a free-text box — frontmatter enum and derived enum alike', () => {
  const fm = buildInputFieldModels({ inputs: ['q'], enums: { q: ['major', 'minor'] }, cached: { q: 'dorian' } });
  assert.equal(fm[0].kind, 'enum');
  assert.equal(fm[0].kind === 'enum' && fm[0].value, 'major', 'frontmatter enum: the first choice');
  const derived = buildInputFieldModels({ inputs: ['q'], derivedEnums: { q: ['major', 'minor'] }, cached: { q: '"dorian"' }, defaults: { q: '"major"' } });
  assert.equal(derived[0].kind, 'enum');
  assert.equal(derived[0].kind === 'enum' && derived[0].value, '"major"', 'derived enum: the declared default');
  const noDefault = buildInputFieldModels({ inputs: ['q'], derivedEnums: { q: ['major', 'minor'] }, cached: { q: '"dorian"' } });
  assert.equal(noDefault[0].kind === 'enum' && noDefault[0].value, '', 'derived enum, no default: the blank entry (a required input stays required)');
  assert.equal(noDefault[0].kind === 'enum' && noDefault[0].blankOption, true);
});

const read = (f: string) => fs.readFileSync(path.resolve(import.meta.dirname, f), 'utf8');

test('wiring (pins the MECHANISM): the strip recalls through the signature check, remembers with the signature, and the vault delete/rename events reach the memory', () => {
  const main = read('main.ts');
  assert.match(main, /recallValidPanelValues\(/);
  assert.match(main, /rememberPanelValuesWithSignature\(/);
  assert.match(main, /vault\.on\('delete'[\s\S]{0,900}?forgetPanelNote\(/, 'a deleted note takes its remembered values with it');
  assert.match(main, /vault\.on\('rename'[\s\S]{0,900}?renamePanelNote\(/, 'a renamed note keeps them under the new id');
  assert.ok(!/recallPanelValues\(this\.settings\.panelStripValues/.test(main), 'the unvalidated recall is gone from the strip build');
  assert.match(read('settings.ts'), /panelStripSignatures: Record<string, string>/);
});
