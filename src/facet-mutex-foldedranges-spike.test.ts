// v0.2.85 — spike test for the facet-mutex regression.
//
// Goal: run @codemirror/language's foldEffect / foldedRanges roundtrip
// in a vanilla CM6 EditorState (no Obsidian) + replicate my
// ViewPlugin's readFoldState logic. If this test PASSES, my fold-
// detection logic is correct in isolation, which narrows the
// regression to:
//   (a) Obsidian uses a different fold mechanism than
//       @codemirror/language (heading-fold dispatched via a custom
//       extension that doesn't surface through foldedRanges), OR
//   (b) ViewPlugin's update() fires before foldedRanges has been
//       updated (timing race).
//
// If this test FAILS, the bug is in my posInFoldedSet / range
// computation / readFoldState logic — fixable from this codebase
// alone without driver smoke output.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EditorState } from '@codemirror/state';
import { codeFolding, foldEffect, foldedRanges } from '@codemirror/language';

const DOC = [
  '---',
  'type: action',
  'inputs: []',
  '---',
  '',
  '# English',
  '',
  'Set greeting to "hello".',
  'Do [[print]](greeting).',
  '',
  '# Python',
  '',
  '```python',
  'def compute(context):',
  '    greeting = "hello"',
  '    print(greeting)',
  '```',
  '',
].join('\n');

/** Locate the 1-based line numbers of `# English` and `# Python` in
 *  the document. Mirrors facet-mutex-view-plugin.ts's readHeadings. */
function readHeadings(state: EditorState): {
  englishLine: number | null;
  pythonLine: number | null;
} {
  const doc = state.doc;
  let englishLine: number | null = null;
  let pythonLine: number | null = null;
  for (let i = 1; i <= doc.lines; i++) {
    const text = doc.line(i).text.trim();
    if (/^#{1,6}\s+english\s*$/i.test(text) && englishLine === null) {
      englishLine = i;
    } else if (/^#{1,6}\s+python\s*$/i.test(text) && pythonLine === null) {
      pythonLine = i;
    }
  }
  return { englishLine, pythonLine };
}

/** End-of-section position for the heading at headingLine. */
function sectionEnd(state: EditorState, headingLine: number): number {
  const doc = state.doc;
  for (let i = headingLine + 1; i <= doc.lines; i++) {
    const text = doc.line(i).text.trim();
    if (/^#{1,6}\s+\S/.test(text)) {
      return doc.line(i - 1).to;
    }
  }
  return doc.length;
}

/** Mirrors facet-mutex-view-plugin.ts's posInFoldedSet. */
function posInFoldedSet(folded: any, pos: number): boolean {
  const it = folded.iter();
  while (it.value !== null) {
    if (pos >= it.from && pos <= it.to) return true;
    if (it.from > pos) return false;
    it.next();
  }
  return false;
}

/** Mirrors facet-mutex-view-plugin.ts's readFoldState (read-only;
 *  no EditorView needed since we just consult state-fields). */
function readFoldState(state: EditorState): {
  englishFolded: boolean;
  pythonFolded: boolean;
} {
  const headings = readHeadings(state);
  const folded = foldedRanges(state);
  const out = { englishFolded: false, pythonFolded: false };
  if (headings.englishLine !== null) {
    const ln = state.doc.line(headings.englishLine);
    out.englishFolded = posInFoldedSet(folded, ln.to);
  }
  if (headings.pythonLine !== null) {
    const ln = state.doc.line(headings.pythonLine);
    out.pythonFolded = posInFoldedSet(folded, ln.to);
  }
  return out;
}

test('spike: foldedRanges is empty on a fresh state', () => {
  const state = EditorState.create({ doc: DOC, extensions: [codeFolding()] });
  const folded = foldedRanges(state);
  let count = 0;
  const it = folded.iter();
  while (it.value !== null) { count++; it.next(); }
  assert.equal(count, 0,
    `Expected zero folded ranges initially, got ${count}.`);
});

test('spike: readHeadings finds both # English and # Python', () => {
  const state = EditorState.create({ doc: DOC, extensions: [codeFolding()] });
  const headings = readHeadings(state);
  assert.notEqual(headings.englishLine, null,
    'readHeadings must locate # English line.');
  assert.notEqual(headings.pythonLine, null,
    'readHeadings must locate # Python line.');
  // English is line 6, Python is line 11 in the DOC fixture above.
  assert.equal(headings.englishLine, 6);
  assert.equal(headings.pythonLine, 11);
});

test('spike: readFoldState returns both-unfolded on fresh state', () => {
  const state = EditorState.create({ doc: DOC, extensions: [codeFolding()] });
  const fs = readFoldState(state);
  assert.deepEqual(fs, { englishFolded: false, pythonFolded: false });
});

test('spike: dispatch foldEffect → foldedRanges sees the new range', () => {
  // Simulate the user expanding # English by folding # Python via
  // foldEffect.of({from, to}). This is exactly what
  // FacetMutexViewPlugin.applyFoldDelta dispatches when it wants to
  // fold the python section.
  const state = EditorState.create({ doc: DOC, extensions: [codeFolding()] });
  const headings = readHeadings(state);
  assert.notEqual(headings.pythonLine, null);
  const pyLn = state.doc.line(headings.pythonLine as number);
  const range = { from: pyLn.to, to: sectionEnd(state, headings.pythonLine as number) };

  // Apply the foldEffect via a transaction.
  const tx = state.update({ effects: foldEffect.of(range) });
  const newState = tx.state;

  // Now foldedRanges of the new state must include our range.
  const folded = foldedRanges(newState);
  let foundRange: { from: number; to: number } | null = null;
  const it = folded.iter();
  while (it.value !== null) {
    foundRange = { from: it.from, to: it.to };
    it.next();
  }
  assert.notEqual(foundRange, null,
    'foldedRanges must include the dispatched range. ' +
    'If null, the @codemirror/language fold mechanism is not seeing ' +
    'our foldEffect — H1 confirmed.');
  assert.deepEqual(foundRange, range,
    `foldedRanges range must equal dispatched range. ` +
    `Dispatched ${JSON.stringify(range)}, got ${JSON.stringify(foundRange)}.`);
});

test('spike: readFoldState reports python-folded after dispatch', () => {
  // The end-to-end probe: dispatch a foldEffect for python heading,
  // then verify readFoldState (which uses posInFoldedSet) returns
  // pythonFolded=true. If THIS test fails but the previous one passes,
  // the bug is in my posInFoldedSet logic.
  const state = EditorState.create({ doc: DOC, extensions: [codeFolding()] });
  const headings = readHeadings(state);
  const pyLn = state.doc.line(headings.pythonLine as number);
  const range = { from: pyLn.to, to: sectionEnd(state, headings.pythonLine as number) };

  const tx = state.update({ effects: foldEffect.of(range) });
  const newState = tx.state;

  const fs = readFoldState(newState);
  assert.equal(fs.englishFolded, false,
    'English section was NOT folded; readFoldState must report false.');
  assert.equal(fs.pythonFolded, true,
    'Python section WAS folded via foldEffect. readFoldState must ' +
    'report pythonFolded=true. If false, posInFoldedSet is broken — ' +
    'the position math in v0.2.84 facet-mutex-view-plugin.ts is ' +
    'the regression.');
});

test('spike: simulated user click sequence — fold python, then read', () => {
  // Most-realistic simulation of v0.2.84's regression scenario:
  // initial state has both unfolded; user clicks fold-triangle on
  // # Python (which would dispatch foldEffect from Obsidian's
  // fold-gutter handler — assuming Obsidian uses @codemirror/language
  // here); my ViewPlugin's update() reads foldedRanges and computes
  // prevFold vs newFold.
  let state = EditorState.create({ doc: DOC, extensions: [codeFolding()] });
  const prevFold = readFoldState(state);
  assert.deepEqual(prevFold, { englishFolded: false, pythonFolded: false });

  // Simulate the click: user folds # Python.
  const headings = readHeadings(state);
  const pyLn = state.doc.line(headings.pythonLine as number);
  const range = { from: pyLn.to, to: sectionEnd(state, headings.pythonLine as number) };
  state = state.update({ effects: foldEffect.of(range) }).state;

  const newFold = readFoldState(state);
  assert.deepEqual(newFold, { englishFolded: false, pythonFolded: true },
    'After dispatching foldEffect for # Python, readFoldState must ' +
    'differ from prevFold. If equal, the ViewPlugin would conclude ' +
    '"no delta" and NOT fire the mutex — exactly the v0.2.84 bug shape.');
  // Verify the diff IS detected (this is what the ViewPlugin checks).
  const foldsDiffer =
    newFold.englishFolded !== prevFold.englishFolded
    || newFold.pythonFolded !== prevFold.pythonFolded;
  assert.equal(foldsDiffer, true,
    'foldsDiffer must be true after the simulated fold click. ' +
    'If false, the ViewPlugin\'s diff check would mask the gesture.');
});
