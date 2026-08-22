// TDD failing-test-first — drain 2026-08-22-2300 (Forge panel F1).
//
// The strip renders the ACTIVE note's inputs, and it must render them
// the way the Run dialog already does — same dropdowns, same pre-fill,
// same required-input handling. §8 of the prompt: "Don't fork the
// input-rendering logic."
//
// The pure cores (resolveInputRendering, initialEnumValue,
// initialDerivedEnumValue, initialInputValue, enumOptions) were already
// shared. What was NOT shared is the LOOP over them inside
// ForgeRunModal.onOpen — the part that decides, per input, which kind of
// control appears and what value it starts on. Re-writing that loop for
// the strip is exactly the fork §8 forbids, and it is the part that
// would drift: every future input feature lands in one loop and not the
// other. So it moves out here, and both callers consume it.
//
// These tests describe the extracted model + the strip's own state
// machine (permanence: the strip never vanishes) + per-note value
// memory.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildInputFieldModels,
  deriveStripState,
  stripHeaderText,
  rememberPanelValues,
  recallPanelValues,
  forgetPanelValues,
  submitStrip,
  type InputFieldModel,
} from './forge-panel-strip-core.ts';

const NO_SOURCES = {
  cached: {}, enums: {}, widgets: {}, defaults: {}, derivedEnums: {},
};

function field(models: InputFieldModel[], name: string): InputFieldModel {
  const f = models.find(m => m.name === name);
  assert.ok(f, `no field model for '${name}'`);
  return f!;
}

// ------------------------------------------------- the extracted loop

test('a plain input becomes a text field pre-filled from its declared default', () => {
  const models = buildInputFieldModels({
    ...NO_SOURCES, inputs: ['word'], defaults: { word: 'hooray' },
  });
  const f = field(models, 'word');
  assert.equal(f.kind, 'text');
  assert.equal(f.kind === 'text' && f.value, 'hooray');
  assert.equal(f.kind === 'text' && f.placeholder, 'hooray');
});

test('the last run beats the declared default, and a blank memory does not', () => {
  const withMemory = buildInputFieldModels({
    ...NO_SOURCES, inputs: ['word'],
    defaults: { word: 'hooray' }, cached: { word: 'yay' },
  });
  assert.equal(field(withMemory, 'word').kind === 'text'
    && (field(withMemory, 'word') as { value: string }).value, 'yay');

  // Clearing the box once must not blank the field forever — the whole
  // point of showing the default is that the user can see it.
  const clearedMemory = buildInputFieldModels({
    ...NO_SOURCES, inputs: ['word'],
    defaults: { word: 'hooray' }, cached: { word: '' },
  });
  assert.equal((field(clearedMemory, 'word') as { value: string }).value, 'hooray');
});

test('a frontmatter enum becomes a dropdown of bare values, first one selected', () => {
  const models = buildInputFieldModels({
    ...NO_SOURCES, inputs: ['mood'], enums: { mood: ['happy', 'sad'] },
  });
  const f = field(models, 'mood');
  assert.equal(f.kind, 'enum');
  if (f.kind !== 'enum') return;
  assert.equal(f.source, 'frontmatter');
  assert.deepEqual(f.options, [
    { value: 'happy', label: 'happy' },
    { value: 'sad', label: 'sad' },
  ]);
  assert.equal(f.value, 'happy');
  assert.equal(f.blankOption, false);
});

test('a type-derived enum submits JSON text and starts blank when the input is required', () => {
  const models = buildInputFieldModels({
    ...NO_SOURCES, inputs: ['mood'], derivedEnums: { mood: ['happy', 'sad'] },
  });
  const f = field(models, 'mood');
  assert.equal(f.kind, 'enum');
  if (f.kind !== 'enum') return;
  assert.equal(f.source, 'derived');
  assert.deepEqual(f.options, [
    { value: '"happy"', label: 'happy' },
    { value: '"sad"', label: 'sad' },
  ]);
  // No declared default => required => must not be silently satisfied.
  assert.equal(f.value, '');
  assert.equal(f.blankOption, true);
});

test('a type-derived enum WITH a default starts on it and offers no blank', () => {
  const models = buildInputFieldModels({
    ...NO_SOURCES, inputs: ['mood'],
    derivedEnums: { mood: ['happy', 'sad'] }, defaults: { mood: '"sad"' },
  });
  const f = field(models, 'mood');
  if (f.kind !== 'enum') { assert.fail('expected enum'); return; }
  assert.equal(f.value, '"sad"');
  assert.equal(f.blankOption, false);
});

test('a declared widget wins over a declared enum, and says the note contradicted itself', () => {
  const models = buildInputFieldModels({
    ...NO_SOURCES, inputs: ['pitches'],
    widgets: { pitches: 'piano' }, enums: { pitches: ['C4'] },
    cached: { pitches: '["C4"]' },
  });
  const f = field(models, 'pitches');
  assert.equal(f.kind, 'widget');
  if (f.kind !== 'widget') return;
  assert.equal(f.widget, 'piano');
  assert.equal(f.seed, '["C4"]');
  assert.equal(f.conflict, true);
});

test('non-vacuity: the model tracks its declarations rather than shaping everything the same', () => {
  // If buildInputFieldModels returned a constant shape (all text, say),
  // every assertion above could pass for the wrong reason on some future
  // refactor. Same input name, three different declaration sets, three
  // different kinds — and field order follows the declared input order.
  const kinds = (sources: Record<string, unknown>) =>
    buildInputFieldModels({ ...NO_SOURCES, inputs: ['x'], ...sources })[0].kind;
  assert.equal(kinds({}), 'text');
  assert.equal(kinds({ enums: { x: ['a'] } }), 'enum');
  assert.equal(kinds({ widgets: { x: 'piano' } }), 'widget');

  const ordered = buildInputFieldModels({ ...NO_SOURCES, inputs: ['b', 'a', 'c'] });
  assert.deepEqual(ordered.map(m => m.name), ['b', 'a', 'c']);
});

// ------------------------------------------------------- the strip

test('the header names the note and counts its inputs', () => {
  assert.equal(stripHeaderText('mood', 1), '▶ mood — 1 input');
  assert.equal(stripHeaderText('chord', 2), '▶ chord — 2 inputs');
  assert.equal(stripHeaderText('hello', 0), '▶ hello — no inputs');
});

test('an active action note fills the strip and enables the Run button', () => {
  const state = deriveStripState(
    { snippetId: 'mood', fields: buildInputFieldModels({
      ...NO_SOURCES, inputs: ['mood'], enums: { mood: ['happy'] } }) },
    null,
  );
  assert.equal(state.mode, 'active');
  assert.equal(state.snippetId, 'mood');
  assert.equal(state.disabled, false);
  assert.equal(state.header, '▶ mood — 1 input');
  assert.equal(state.hint, null);
  assert.equal(state.fields.length, 1);
});

test('a non-action note greys the LAST action note instead of emptying the strip', () => {
  // Permanence is the product: the strip must never vanish, or the
  // panel goes back to being a log with a hole under it.
  const last = { snippetId: 'mood', fields: buildInputFieldModels({
    ...NO_SOURCES, inputs: ['mood'], enums: { mood: ['happy'] } }) };
  const state = deriveStripState(null, last);
  assert.equal(state.mode, 'stale');
  assert.equal(state.snippetId, 'mood');
  assert.equal(state.disabled, true);
  assert.equal(state.fields.length, 1, 'the last note\'s inputs stay on screen');
  assert.match(state.hint ?? '', /mood/);
  assert.match(state.hint ?? '', /not an action note/i);
});

test('with no action note ever opened the strip still renders, with an invitation', () => {
  const state = deriveStripState(null, null);
  assert.equal(state.mode, 'empty');
  assert.equal(state.snippetId, null);
  assert.equal(state.disabled, true);
  assert.deepEqual(state.fields, []);
  assert.match(state.hint ?? '', /action note/i);
  assert.notEqual(state.header, '');
});

test('switching notes re-renders the strip for the new note', () => {
  // The acceptance line from the plan: mood -> dropdown; factorial ->
  // n as a text field.
  const mood = deriveStripState({ snippetId: 'mood', fields: buildInputFieldModels({
    ...NO_SOURCES, inputs: ['mood'], enums: { mood: ['happy', 'sad'] } }) }, null);
  const factorial = deriveStripState({ snippetId: 'factorial', fields: buildInputFieldModels({
    ...NO_SOURCES, inputs: ['n'], defaults: { n: '5' } }) }, mood.note);
  assert.equal(factorial.header, '▶ factorial — 1 input');
  assert.equal(factorial.fields[0].kind, 'text');
  assert.equal((factorial.fields[0] as { value: string }).value, '5');
});

// ------------------------------------------------ per-note memory

test('values are remembered per note and pre-filled on return', () => {
  let memory = {};
  memory = rememberPanelValues(memory, 'mood', { mood: 'sad' });
  memory = rememberPanelValues(memory, 'factorial', { n: '9' });
  assert.deepEqual(recallPanelValues(memory, 'mood'), { mood: 'sad' });
  assert.deepEqual(recallPanelValues(memory, 'factorial'), { n: '9' });
  // A note never run has no memory — not another note's values.
  assert.deepEqual(recallPanelValues(memory, 'never-run'), {});

  const models = buildInputFieldModels({
    ...NO_SOURCES, inputs: ['n'],
    defaults: { n: '5' }, cached: recallPanelValues(memory, 'factorial'),
  });
  assert.equal((models[0] as { value: string }).value, '9');
});

test('remembering does not mutate the memory it was handed', () => {
  // It lands in plugin data via saveData; a mutated-in-place record is
  // how a stale reference silently persists the wrong note's values.
  const before = { mood: { mood: 'happy' } };
  const after = rememberPanelValues(before, 'mood', { mood: 'sad' });
  assert.deepEqual(before, { mood: { mood: 'happy' } });
  assert.deepEqual(after, { mood: { mood: 'sad' } });
});

test('reset-to-defaults drops the note\'s memory so declared defaults show again', () => {
  const memory = rememberPanelValues({}, 'factorial', { n: '9' });
  const reset = forgetPanelValues(memory, 'factorial');
  assert.deepEqual(recallPanelValues(reset, 'factorial'), {});
  const models = buildInputFieldModels({
    ...NO_SOURCES, inputs: ['n'],
    defaults: { n: '5' }, cached: recallPanelValues(reset, 'factorial'),
  });
  assert.equal((models[0] as { value: string }).value, '5');
});

// --------------------------------------------- the don't-fork guard

test('the Run dialog and the strip share the extracted loop', () => {
  // §8: "Don't fork the input-rendering logic." A future edit that
  // re-inlines the per-input decision into either caller fails here.
  const modal = readFileSync(join(import.meta.dirname, 'modal.ts'), 'utf8');
  assert.match(modal, /buildInputFieldModels/,
    'ForgeRunModal must consume the shared field-model loop, not its own');
  assert.doesNotMatch(modal, /resolveInputRendering/,
    'a second per-input decision loop has reappeared inside modal.ts');

  const view = readFileSync(join(import.meta.dirname, 'output-view.ts'), 'utf8');
  assert.match(view, /buildInputFieldModels/,
    'the strip must render from the shared field-model loop');
  assert.doesNotMatch(view, /resolveInputRendering/,
    'the strip has grown its own per-input decision loop');
});

// ------------------------------------------- the rename guard (term)

/**
 * Extract the STRING LITERALS from TypeScript source.
 *
 * Comments are not user-facing, and a comment recording what the panel
 * used to be called is worth keeping — so the guard must be able to
 * tell the two apart. A naive /(['"`])...\1/ regex cannot: the
 * apostrophe in a comment like "the snippet's result" opens a literal
 * that then swallows everything up to the next quote, several comments
 * later. That mis-scan is how a guard starts flagging prose it should
 * ignore, so this walks the source properly instead.
 */
function stringLiterals(source: string): string[] {
  const out: string[] = [];
  let i = 0;
  // Tracks whether a '/' here starts a regex literal or is division.
  let prevSignificant = '';
  while (i < source.length) {
    const c = source[i];

    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '/' && /[(,=:[!&|?{};+\-*%~^]/.test(prevSignificant)) {
      // Regex literal: skip it, quotes inside are not string literals.
      i++;
      while (i < source.length && source[i] !== '/') {
        if (source[i] === '\\') i++;
        else if (source[i] === '[') { while (i < source.length && source[i] !== ']') i++; }
        i++;
      }
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const start = i;
      i++;
      while (i < source.length && source[i] !== c) {
        if (source[i] === '\\') i++;
        i++;
      }
      i++;
      out.push(source.slice(start, i));
      prevSignificant = c;
      continue;
    }

    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }
  return out;
}

test('no user-facing string still says "Forge Output"', () => {
  const dir = import.meta.dirname;
  const offenders: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
    // bundled-assets.generated.ts is a build artifact: the inlined
    // contents of the bundled vaults and the engine, authored in OTHER
    // repos. Its three remaining hits (two engine docstrings, one
    // music-theory README line) have to be renamed at their source and
    // are reported to forge-core, not patched into a generated file
    // that the next build would overwrite.
    if (name.endsWith('.generated.ts')) continue;
    const source = readFileSync(join(dir, name), 'utf8');
    for (const lit of stringLiterals(source)) {
      if (/forge\s+output/i.test(lit)) offenders.push(`${name}: ${lit}`);
    }
  }
  assert.deepEqual(offenders, [], `user-facing "Forge Output" remains:\n${offenders.join('\n')}`);
});

test('non-vacuity: the term scanner catches literals and leaves comments alone', () => {
  // A scanner that silently matched nothing would pass the test above
  // forever, including after someone reintroduced the old name.
  const lits = stringLiterals(
    'const a = "see the Forge Output panel";\n'
    + '// the snippet\'s Forge Output name, in a comment\n'
    + '/* Forge Output in a block comment */\n'
    + 'const re = /["\']Forge Output/;\n'
    + 'const b = `a Forge Output template`;\n',
  );
  const flagged = lits.filter(l => /forge\s+output/i.test(l));
  assert.deepEqual(flagged, [
    '"see the Forge Output panel"',
    '`a Forge Output template`',
  ], 'the scanner must catch both quote styles and neither comment');
});

test('non-vacuity: an apostrophe in a comment does not swallow the source after it', () => {
  // This is the mis-scan that made the first version of this guard
  // report six comments as user-facing strings.
  const lits = stringLiterals(
    "// the snippet's result renders in the Forge Output panel\n"
    + 'const ok = "plain";\n',
  );
  assert.deepEqual(lits, ['"plain"']);
});

test('the bundled engine + vault content ships no "Forge Output" either', () => {
  // Drain 2026-08-23-1100 — F1's guard above covers strings AUTHORED in
  // this repo. bundled-assets.generated.ts is the other half of what a
  // user can read: the inlined engine sources and bundled vault prose,
  // authored in forge and in the vault repos and rebuilt into this file
  // by scripts/inline-bundled-assets.mjs.
  //
  // Those hits cannot be patched here — the next build overwrites them
  // — so this guard's job is to say WHERE the rename has to happen,
  // and to fail if a vault or engine edit reintroduces the old term.
  const generated = readFileSync(
    join(import.meta.dirname, 'bundled-assets.generated.ts'), 'utf8');
  // One inlined file per line, `"path": "…content…",` — so the line's
  // own leading key names the file the hit belongs to.
  const hits: string[] = [];
  for (const line of generated.split('\n')) {
    if (!/forge\s+output/i.test(line)) continue;
    const key = line.match(/^\s*"([^"]+)":/);
    hits.push(key ? key[1] : '(unknown file)');
  }
  assert.deepEqual([...new Set(hits)].sort(), [],
    'these bundled sources still say "Forge Output" — rename them in their OWN repo, '
    + 'then rebuild; patching bundled-assets.generated.ts would be overwritten');
});
