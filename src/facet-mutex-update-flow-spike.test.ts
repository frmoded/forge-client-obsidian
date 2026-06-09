// v0.2.85 — second spike test. Simulates the FULL ViewPlugin update
// flow (not just the foldedRanges read) to verify the gesture-flip
// happens end-to-end when the host adapter behaves correctly.
//
// What this catches:
//   - Full pipeline: prevFold initialized → state changes via
//     foldEffect → update() detects delta → decideOnFoldChange returns
//     a flip → applyFoldDelta dispatches the OTHER heading's fold →
//     setEditModeForFile mock fires with the new mode.
//   - If this test PASSES: the ViewPlugin pure logic is correct;
//     regression is in Obsidian-side integration (host adapter, file
//     association, or Obsidian's fold mechanism differing from
//     @codemirror/language).
//   - If this test FAILS: the bug is in my ViewPlugin's update() flow
//     — fixable from this codebase alone.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EditorState } from '@codemirror/state';
import { codeFolding, foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language';
import {
  decideInitialState,
  decideOnFoldChange,
  type SnippetHeadings,
  type FoldState,
} from './facet-mutex-core.ts';

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

/** Replicates facet-mutex-view-plugin.ts's logic in a state-only
 *  form (no EditorView needed). Returns the trace of decisions made
 *  + setEditModeForFile calls. */
class SimulatedFacetMutexViewPlugin {
  private state: EditorState;
  private prevFold: FoldState = { englishFolded: false, pythonFolded: false };
  private ignoreFoldEventsUntil = 0;
  private mode: 'english' | 'python';
  setEditModeForFileCalls: Array<{ mode: 'english' | 'python'; at: number }> = [];
  appliedFoldEffectsLog: Array<{ effects: any[]; at: number }> = [];
  // Per-tick log for tracing what update() saw.
  decisionLog: Array<{
    prevFold: FoldState;
    newFold: FoldState;
    mode: 'english' | 'python';
    headings: SnippetHeadings;
    decision: ReturnType<typeof decideOnFoldChange>;
  }> = [];

  constructor(initialState: EditorState, mode: 'english' | 'python') {
    this.state = initialState;
    this.mode = mode;
    // applyInitialState equivalent.
    const headings = this.readHeadings();
    const desired = decideInitialState(mode, headings);
    this.state = this.applyFoldDelta(this.state, headings, this.readFoldState(), desired);
    this.prevFold = this.readFoldState();
    this.ignoreFoldEventsUntil = now() + 300;
  }

  /** Dispatch a transaction (e.g. user's fold click) and run the
   *  update() logic. Returns the new EditorState. */
  dispatchAndUpdate(tx: { effects?: any | any[] }, simulatedNow: number = now()): EditorState {
    // Apply the transaction.
    this.state = this.state.update(tx).state;
    // Now run update() equivalent.
    const newFold = this.readFoldState();
    if (simulatedNow < this.ignoreFoldEventsUntil) {
      // Inside debounce window — update prevFold + return without flip.
      this.prevFold = newFold;
      return this.state;
    }
    if (newFold.englishFolded === this.prevFold.englishFolded
        && newFold.pythonFolded === this.prevFold.pythonFolded) {
      return this.state;
    }
    const headings = this.readHeadings();
    const decision = decideOnFoldChange(this.prevFold, newFold, this.mode, headings);
    this.decisionLog.push({
      prevFold: { ...this.prevFold }, newFold, mode: this.mode,
      headings, decision,
    });
    if (decision.newEditMode !== null) {
      this.ignoreFoldEventsUntil = simulatedNow + 300;
      this.state = this.applyFoldDelta(this.state, headings, newFold, decision);
      this.setEditModeForFileCalls.push({
        mode: decision.newEditMode, at: simulatedNow,
      });
      // Simulate: setEditModeForFile changes the mode in our world.
      this.mode = decision.newEditMode;
    }
    this.prevFold = this.readFoldState();
    return this.state;
  }

  getMode(): 'english' | 'python' { return this.mode; }
  getState(): EditorState { return this.state; }
  readFoldStatePublic(): FoldState { return this.readFoldState(); }

  // --- private helpers, mirrors of view-plugin --------------------

  private readHeadings(): SnippetHeadings {
    const doc = this.state.doc;
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

  private sectionEnd(headingLine: number): number {
    const doc = this.state.doc;
    for (let i = headingLine + 1; i <= doc.lines; i++) {
      const text = doc.line(i).text.trim();
      if (/^#{1,6}\s+\S/.test(text)) {
        return doc.line(i - 1).to;
      }
    }
    return doc.length;
  }

  private posInFoldedSet(folded: any, pos: number): boolean {
    const it = folded.iter();
    while (it.value !== null) {
      if (pos >= it.from && pos <= it.to) return true;
      if (it.from > pos) return false;
      it.next();
    }
    return false;
  }

  private readFoldState(): FoldState {
    const headings = this.readHeadings();
    const folded = foldedRanges(this.state);
    const out = { englishFolded: false, pythonFolded: false };
    if (headings.englishLine !== null) {
      const ln = this.state.doc.line(headings.englishLine);
      out.englishFolded = this.posInFoldedSet(folded, ln.to);
    }
    if (headings.pythonLine !== null) {
      const ln = this.state.doc.line(headings.pythonLine);
      out.pythonFolded = this.posInFoldedSet(folded, ln.to);
    }
    return out;
  }

  private applyFoldDelta(
    state: EditorState,
    headings: SnippetHeadings,
    current: FoldState,
    desired: { englishFolded: boolean; pythonFolded: boolean },
  ): EditorState {
    const effects: any[] = [];
    if (headings.englishLine !== null
        && current.englishFolded !== desired.englishFolded) {
      const ln = state.doc.line(headings.englishLine);
      const range = { from: ln.to, to: this.sectionEnd(headings.englishLine) };
      effects.push(
        desired.englishFolded ? foldEffect.of(range) : unfoldEffect.of(range));
    }
    if (headings.pythonLine !== null
        && current.pythonFolded !== desired.pythonFolded) {
      const ln = state.doc.line(headings.pythonLine);
      const range = { from: ln.to, to: this.sectionEnd(headings.pythonLine) };
      effects.push(
        desired.pythonFolded ? foldEffect.of(range) : unfoldEffect.of(range));
    }
    if (effects.length > 0) {
      this.appliedFoldEffectsLog.push({ effects, at: now() });
      return state.update({ effects }).state;
    }
    return state;
  }
}

let nowCounter = 0;
function now(): number { return ++nowCounter * 1000; }

test('flow: english-mode initial state folds # Python', () => {
  nowCounter = 0;
  const state = EditorState.create({ doc: DOC, extensions: [codeFolding()] });
  const sim = new SimulatedFacetMutexViewPlugin(state, 'english');
  const fs = sim.readFoldStatePublic();
  assert.deepEqual(fs, { englishFolded: false, pythonFolded: true },
    'Initial state for english mode must fold # Python.');
});

test('flow: user expands # Python (past debounce) → flip to python mode', () => {
  nowCounter = 0;
  const state = EditorState.create({ doc: DOC, extensions: [codeFolding()] });
  const sim = new SimulatedFacetMutexViewPlugin(state, 'english');
  assert.equal(sim.getMode(), 'english');
  // Advance time past the debounce window.
  const after = now() + 500;  // way past 300ms
  // Simulate the user click: find the python range that the initial
  // state folded, and dispatch unfoldEffect on it.
  const pyLn = sim.getState().doc.lineAt(
    sim.getState().doc.toString().indexOf('# Python'));
  // posInFoldedSet considers ln.to as inside the fold; same end-of-line.
  const pyLineNum = pyLn.number;
  const range = {
    from: sim.getState().doc.line(pyLineNum).to,
    to: sim.getState().doc.length,
  };
  sim.dispatchAndUpdate({ effects: unfoldEffect.of(range) }, after);
  assert.equal(sim.getMode(), 'python',
    'After user expands # Python (outside debounce window), the mode ' +
    'must flip to python.');
  // And the OTHER heading (English) must now be folded by the controller.
  const fs = sim.readFoldStatePublic();
  assert.equal(fs.englishFolded, true,
    'Mutex must fold # English when user expands # Python.');
  assert.equal(fs.pythonFolded, false,
    '# Python must remain unfolded after the gesture (user expanded it).');
});

test('flow: user gesture INSIDE debounce window is correctly suppressed', () => {
  // This is the "self-induced apply" suppression: when initial state
  // apply dispatches a fold, the resulting update() must NOT treat
  // that as a user gesture. Inside the debounce window, no flip.
  nowCounter = 0;
  const state = EditorState.create({ doc: DOC, extensions: [codeFolding()] });
  const sim = new SimulatedFacetMutexViewPlugin(state, 'english');
  // Simulate another fold-change WITHIN 300ms of construction.
  const insideWindow = 100;  // 100ms — well inside debounce
  const pyLn = sim.getState().doc.line(11);
  const range = { from: pyLn.to, to: sim.getState().doc.length };
  sim.dispatchAndUpdate({ effects: unfoldEffect.of(range) }, insideWindow);
  // Mode should NOT have flipped (debounce suppressed it).
  assert.equal(sim.getMode(), 'english',
    'Gesture inside debounce window must NOT flip edit_mode.');
  assert.equal(sim.setEditModeForFileCalls.length, 0,
    'setEditModeForFile must NOT have been called inside debounce window.');
});

test('flow: full sequence — open english snippet, expand python, flip mode', () => {
  // The end-to-end success case the cohort smoke wants.
  nowCounter = 0;
  const state = EditorState.create({ doc: DOC, extensions: [codeFolding()] });
  const sim = new SimulatedFacetMutexViewPlugin(state, 'english');

  // Initial state: english visible, python folded.
  assert.deepEqual(sim.readFoldStatePublic(),
    { englishFolded: false, pythonFolded: true },
    'Initial state must hide # Python.');

  // User clicks fold-triangle on # Python to expand it.
  const later = now() + 1000;  // 1s after open
  const pyLn = sim.getState().doc.line(11);
  const range = { from: pyLn.to, to: sim.getState().doc.length };
  sim.dispatchAndUpdate({ effects: unfoldEffect.of(range) }, later);

  // Verify the gestural mutex behavior.
  assert.equal(sim.getMode(), 'python',
    'After user expands # Python: mode flips to python.');
  assert.deepEqual(sim.readFoldStatePublic(),
    { englishFolded: true, pythonFolded: false },
    'After user expands # Python: # English auto-folds, # Python stays open.');
  assert.equal(sim.setEditModeForFileCalls.length, 1);
  assert.equal(sim.setEditModeForFileCalls[0].mode, 'python');
});

test('flow: reverse — open python snippet, expand english, flip back', () => {
  // Symmetric path: python mode → user expands english → flip to english.
  nowCounter = 0;
  const state = EditorState.create({ doc: DOC, extensions: [codeFolding()] });
  const sim = new SimulatedFacetMutexViewPlugin(state, 'python');

  // Initial state: english folded, python visible.
  assert.deepEqual(sim.readFoldStatePublic(),
    { englishFolded: true, pythonFolded: false });

  // User clicks fold-triangle on # English to expand it.
  const later = now() + 1000;
  const enLn = sim.getState().doc.line(6);
  // sectionEnd for english = line right before python heading.
  // English content runs lines 6 (heading) -> 10 (blank), python at 11.
  // So fold range is [line6.to, line10.to].
  const range = { from: enLn.to, to: sim.getState().doc.line(10).to };
  sim.dispatchAndUpdate({ effects: unfoldEffect.of(range) }, later);

  assert.equal(sim.getMode(), 'english',
    'Reverse mutex: python mode + expand english → flips to english.');
});
