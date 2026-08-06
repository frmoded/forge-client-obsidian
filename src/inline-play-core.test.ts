// [2026-08-06-0000-cw-plugin-inline-action-note-execution-tier-1]
// Headless coverage (L56) for the inline play card: modifier parse,
// Tier-1 input gate, card DOM shape, orchestration chain with a
// stubbed engine, MCQ output delegation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyInlineOutput,
  decideInlinePlay,
  inlineTargetFromHref,
  parseInlineWikilink,
  renderInlinePlayCard,
  runInlinePlay,
} from './inline-play-core.ts';
import type { InlinePlayDeps } from './inline-play-core.ts';

// -- minimal structural DOM stub (mirrors mcq-widget-core tests) ----

type StubEl = {
  tag: string;
  className: string;
  textContent: string | null;
  children: StubEl[];
  attrs: Record<string, string>;
  appendChild(child: StubEl): void;
  setAttribute(k: string, v: string): void;
};

function makeStubDoc() {
  const createElement = (tag: string): StubEl => ({
    tag,
    className: '',
    textContent: null,
    children: [],
    attrs: {},
    appendChild(child: StubEl) { this.children.push(child); },
    setAttribute(k: string, v: string) { this.attrs[k] = v; },
  });
  return { createElement };
}

test('parseInlineWikilink: inline modifier', () => {
  assert.deepEqual(parseInlineWikilink('foo inline'),
    { noteId: 'foo', inline: true });
  assert.deepEqual(parseInlineWikilink('chord_recognition_quiz inline'),
    { noteId: 'chord_recognition_quiz', inline: true });
});

test('parseInlineWikilink: bare link unchanged', () => {
  assert.deepEqual(parseInlineWikilink('foo'),
    { noteId: 'foo', inline: false });
});

test('parseInlineWikilink: ambiguous last word ≠ inline → note id with space', () => {
  assert.deepEqual(parseInlineWikilink('foo bar'),
    { noteId: 'foo bar', inline: false });
  // A link literally named "inline" is a plain link, not a widget.
  assert.deepEqual(parseInlineWikilink('inline'),
    { noteId: 'inline', inline: false });
});

test('inlineTargetFromHref: only modifier hrefs claim a target', () => {
  assert.equal(inlineTargetFromHref('foo inline'), 'foo');
  assert.equal(inlineTargetFromHref('foo'), null);
  assert.equal(inlineTargetFromHref(null), null);
});

test('decideInlinePlay: Tier-1 input gate truth table', () => {
  assert.equal(decideInlinePlay(undefined), 'play');
  assert.equal(decideInlinePlay({}), 'play');
  assert.equal(decideInlinePlay({ inputs: [] }), 'play');
  assert.equal(decideInlinePlay({ inputs: ['guess'] }), 'open-note');
  // Mapping form (input_widgets-era notes declare inputs as list, but
  // guard the non-array shape too).
  assert.equal(decideInlinePlay({ inputs: { notes: 'piano' } }), 'open-note');
});

test('renderInlinePlayCard: DOM structure per drain §Part 2', () => {
  const doc = makeStubDoc();
  const container = doc.createElement('div');
  const refs = renderInlinePlayCard('chord_recognition_quiz', container, doc);
  const card = container.children[0];
  assert.equal(card.className, 'forge-inline-play-card');
  assert.deepEqual(
    card.children.map((c: StubEl) => [c.tag, c.className]),
    [
      ['span', 'forge-inline-title'],
      ['button', 'forge-inline-play-btn'],
      ['div', 'forge-inline-output'],
    ]);
  assert.equal(card.children[0].textContent, 'chord_recognition_quiz');
  assert.equal(card.children[1].textContent, '▶');
  assert.equal(refs.outputEl, card.children[2]);
});

function depsWith(overrides: Partial<InlinePlayDeps>): InlinePlayDeps {
  return {
    resolveNote: async () => ({
      path: 'quiz.md', content: 'body', frontmatter: {},
    }),
    syncToEngine: async () => {},
    snippetIdForPath: (p) => p.replace(/\.md$/, ''),
    compute: async () => '42',
    ...overrides,
  };
}

test('runInlinePlay: missing note → not-found message', async () => {
  const out = await runInlinePlay(
    depsWith({ resolveNote: async () => null }), 'ghost');
  assert.deepEqual(out, { kind: 'not-found', text: 'Note not found: ghost' });
});

test('runInlinePlay: inputs present → open-note fallback, engine untouched', async () => {
  let computed = false;
  const out = await runInlinePlay(depsWith({
    resolveNote: async () => ({
      path: 'quiz.md', content: 'body', frontmatter: { inputs: ['guess'] },
    }),
    compute: async () => { computed = true; return 'x'; },
  }), 'quiz');
  assert.equal(out.kind, 'open-note');
  assert.equal(out.text, 'Open note to run (has inputs).');
  assert.equal(computed, false);
});

test('runInlinePlay: zero-input note → syncs then computes (L29 order)', async () => {
  const calls: string[] = [];
  const out = await runInlinePlay(depsWith({
    syncToEngine: async (path) => { calls.push(`sync:${path}`); },
    compute: async (id) => { calls.push(`compute:${id}`); return 'hello'; },
  }), 'quiz');
  assert.deepEqual(out, { kind: 'output', text: 'hello' });
  assert.deepEqual(calls, ['sync:quiz.md', 'compute:quiz']);
});

test('runInlinePlay: engine throw → error text, no exception escapes', async () => {
  const out = await runInlinePlay(depsWith({
    compute: async () => { throw new Error('boom'); },
  }), 'quiz');
  assert.deepEqual(out, { kind: 'error', text: 'Run failed: boom' });
});

test('hasInputsInRawFrontmatter: cache-miss fallback shapes', async () => {
  const { hasInputsInRawFrontmatter } = await import('./inline-play-core.ts');
  assert.equal(hasInputsInRawFrontmatter('no frontmatter'), false);
  assert.equal(hasInputsInRawFrontmatter('---\ntype: action\n---\nbody'), false);
  assert.equal(
    hasInputsInRawFrontmatter('---\ntype: action\ninputs: []\n---\n'), false);
  assert.equal(
    hasInputsInRawFrontmatter('---\ntype: action\ninputs: [guess]\n---\n'), true);
  // Block-list form: `inputs:` with entries on following lines —
  // conservative has-inputs.
  assert.equal(
    hasInputsInRawFrontmatter('---\ninputs:\n  - notes\n---\n'), true);
});

test('classifyInlineOutput: MCQ verdicts delegate to the MCQ card', () => {
  const wrong = classifyInlineOutput(
    "✗ Not quite. You picked 'minor'; the correct answer is 'major'. " +
    'The third is four semitones up. See [[diatonic_scale]].');
  assert.equal(wrong.kind, 'mcq');
  assert.equal(classifyInlineOutput('plain text output').kind, 'text');
});
