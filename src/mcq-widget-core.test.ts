// Tests for the MCQ display widget. Drain 2026-08-05-1300.
//
// The load-bearing property is NOT that MCQ output renders as a card —
// it is that everything else does NOT. This parser runs against every
// string a Recipe returns, so a false positive replaces someone's
// ordinary output with a quiz card. The rejection tests outnumber the
// acceptance tests on purpose.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  parseMcqOutput,
  renderMcqCard,
  extractWikilinks,
  splitExplanation,
  type McqDocument,
  type McqElement,
} from './mcq-widget-core.ts';

// Verbatim from the engine's f-strings (forge/core/lib.py). Kept as
// literals rather than rebuilt, because the point of the test is to
// pin agreement with what the engine actually emits.
const CORRECT = '✓ Correct — major.';
const WRONG = "✗ Not quite. You picked 'minor'; the correct answer is 'major'.";
const WRONG_WITH_EXPLANATION =
  "✗ Not quite. You picked 'minor'; the correct answer is 'major'. "
  + 'The W-W-H-W-W-W-H pattern is the definition of the major scale — '
  + 'see [[music_theory/scales/scale]].';

// ---------------------------------------------------------------- DOM

function fakeDoc(): McqDocument {
  const make = (tag: string): McqElement => {
    const attrs: Record<string, string> = {};
    const el: McqElement & { attrs: Record<string, string> } = {
      tagName: tag.toUpperCase(),
      className: '',
      textContent: '',
      children: [],
      attrs,
      appendChild(child: McqElement) { (this.children as McqElement[]).push(child); },
      setAttribute(name: string, value: string) { attrs[name] = value; },
    };
    return el;
  };
  return { createElement: make };
}

function attrsOf(el: McqElement): Record<string, string> {
  return (el as unknown as { attrs: Record<string, string> }).attrs;
}

function findByClass(root: McqElement, cls: string): McqElement | null {
  if (root.className.split(/\s+/).includes(cls)) return root;
  for (const child of root.children) {
    const hit = findByClass(child, cls);
    if (hit) return hit;
  }
  return null;
}

function allText(el: McqElement): string {
  if (el.children.length === 0) return el.textContent ?? '';
  return el.children.map(allText).join('');
}

// ------------------------------------------------------------- parser

describe('parseMcqOutput — accepts real engine output', () => {
  test('correct branch', () => {
    assert.deepEqual(parseMcqOutput(CORRECT), {
      verdict: 'correct',
      guessText: 'major',
      correctText: 'major',
      explanation: '',
      wikilinks: [],
    });
  });

  test('wrong branch, no explanation', () => {
    assert.deepEqual(parseMcqOutput(WRONG), {
      verdict: 'wrong',
      guessText: 'minor',
      correctText: 'major',
      explanation: '',
      wikilinks: [],
    });
  });

  test('wrong branch with explanation + wikilink', () => {
    const got = parseMcqOutput(WRONG_WITH_EXPLANATION);
    assert.equal(got?.verdict, 'wrong');
    assert.equal(got?.guessText, 'minor');
    assert.equal(got?.correctText, 'major');
    assert.match(got?.explanation ?? '', /^The W-W-H-W-W-W-H pattern/);
    assert.deepEqual(got?.wikilinks, ['music_theory/scales/scale']);
  });

  test('double-quoted values — the apostrophe case', () => {
    // Python's !r switches to double quotes when the value contains a
    // single quote. A parser hardcoding ' would silently reject this,
    // and "it's major" is an entirely plausible choice label.
    const s = '✗ Not quite. You picked "it\'s minor"; '
      + 'the correct answer is "it\'s major".';
    const got = parseMcqOutput(s);
    assert.equal(got?.guessText, "it's minor");
    assert.equal(got?.correctText, "it's major");
  });

  test('a choice containing a period does not truncate', () => {
    const got = parseMcqOutput('✓ Correct — Bach, J.S.');
    assert.equal(got?.guessText, 'Bach, J.S');
    // Honest about the limitation: the engine's format ends the
    // sentence with '.', so a value with a trailing period is
    // ambiguous and the last one is treated as the terminator. Pinned
    // so the behaviour is a known quantity rather than a surprise.
  });

  test('leading/trailing whitespace tolerated', () => {
    assert.equal(parseMcqOutput(`\n  ${CORRECT}  \n`)?.verdict, 'correct');
  });
});

describe('parseMcqOutput — rejects everything else', () => {
  const REJECTED: Array<[string, unknown]> = [
    ['empty string', ''],
    ['whitespace only', '   \n '],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an object', { verdict: 'correct' }],
    ['an array', ['✓ Correct — major.']],
    ['ordinary prose', 'Hello, world.'],
    ['a checkmark alone', '✓'],
    ['✓ Correct without a value', '✓ Correct'],
    ['✓ Correct with em-dash but no value', '✓ Correct — '],
    ['✓ Correct missing the final period', '✓ Correct — major'],
    ['a hyphen instead of an em-dash', '✓ Correct - major.'],
    ['✗ prefix with no diagnosis', '✗ Not quite.'],
    ['wrong branch with unbalanced quotes', "✗ Not quite. You picked 'minor\"; the correct answer is 'major'."],
    ['wrong branch missing second value', "✗ Not quite. You picked 'minor'; the correct answer is ."],
    ['the check mark mid-sentence', 'The test passed ✓ Correct — major.'],
    ['an error string', "SnippetExecError: Empty or missing Python code for 'x'."],
    ['a stack trace', 'Traceback (most recent call last):\n  File "x.py"'],
  ];

  for (const [name, input] of REJECTED) {
    test(name, () => {
      assert.equal(parseMcqOutput(input), null);
    });
  }

  test('prose that merely mentions the words does not match', () => {
    assert.equal(
      parseMcqOutput('You picked the wrong answer; the correct answer is obvious.'),
      null,
    );
  });
});

describe('extractWikilinks', () => {
  test('none', () => assert.deepEqual(extractWikilinks('plain text'), []));

  test('several, in order', () => {
    assert.deepEqual(
      extractWikilinks('see [[a]] and [[b]]'),
      ['a', 'b'],
    );
  });

  test('deduped', () => {
    assert.deepEqual(extractWikilinks('[[a]] then [[a]] again'), ['a']);
  });

  test('alias-stripped — the target is cited, not the display text', () => {
    assert.deepEqual(extractWikilinks('[[scales/major|the major scale]]'), ['scales/major']);
  });
});

describe('splitExplanation', () => {
  test('text only', () => {
    assert.deepEqual(splitExplanation('just words'), [
      { kind: 'text', value: 'just words' },
    ]);
  });

  test('interleaves in document order', () => {
    assert.deepEqual(splitExplanation('a [[x]] b [[y]]'), [
      { kind: 'text', value: 'a ' },
      { kind: 'link', value: 'x' },
      { kind: 'text', value: ' b ' },
      { kind: 'link', value: 'y' },
    ]);
  });

  test('a link at the very start emits no leading empty text run', () => {
    assert.deepEqual(splitExplanation('[[x]] tail'), [
      { kind: 'link', value: 'x' },
      { kind: 'text', value: ' tail' },
    ]);
  });
});

// ----------------------------------------------------------- renderer

describe('renderMcqCard', () => {
  test('correct branch: verdict chip, guess, no answer line', () => {
    const doc = fakeDoc();
    const root = doc.createElement('div');
    renderMcqCard(parseMcqOutput(CORRECT)!, root, doc);

    const card = findByClass(root, 'forge-mcq-card');
    assert.ok(card, 'card rendered');
    assert.ok(card!.className.includes('forge-mcq-correct'));
    assert.equal(findByClass(root, 'forge-mcq-verdict')?.textContent, '✓ Correct');
    assert.equal(findByClass(root, 'forge-mcq-guess')?.textContent, 'major');
    assert.equal(
      findByClass(root, 'forge-mcq-answer'),
      null,
      'the correct branch must NOT repeat the answer — the guess line already is it',
    );
  });

  test('wrong branch shows both the guess and the answer', () => {
    const doc = fakeDoc();
    const root = doc.createElement('div');
    renderMcqCard(parseMcqOutput(WRONG)!, root, doc);

    assert.equal(findByClass(root, 'forge-mcq-guess')?.textContent, 'minor');
    assert.equal(
      findByClass(root, 'forge-mcq-answer')?.textContent,
      'Correct answer: major',
    );
    assert.ok(findByClass(root, 'forge-mcq-card')!.className.includes('forge-mcq-wrong'));
  });

  test('wikilinks render as anchors Obsidian will resolve', () => {
    const doc = fakeDoc();
    const root = doc.createElement('div');
    renderMcqCard(parseMcqOutput(WRONG_WITH_EXPLANATION)!, root, doc);

    const link = findByClass(root, 'forge-mcq-link');
    assert.ok(link, 'anchor rendered');
    assert.equal(link!.tagName, 'A');
    // `internal-link` + `data-href` is what Obsidian's own click
    // handler keys on; without both the link is inert.
    assert.ok(link!.className.includes('internal-link'));
    assert.equal(attrsOf(link!)['data-href'], 'music_theory/scales/scale');
    assert.equal(attrsOf(link!).href, 'music_theory/scales/scale');
  });

  test('explanation text survives around the link', () => {
    const doc = fakeDoc();
    const root = doc.createElement('div');
    renderMcqCard(parseMcqOutput(WRONG_WITH_EXPLANATION)!, root, doc);
    const body = findByClass(root, 'forge-mcq-explanation')!;
    assert.match(allText(body), /W-W-H-W-W-W-H/);
    assert.match(allText(body), /music_theory\/scales\/scale/);
  });

  test('no explanation → no explanation element', () => {
    const doc = fakeDoc();
    const root = doc.createElement('div');
    renderMcqCard(parseMcqOutput(WRONG)!, root, doc);
    assert.equal(findByClass(root, 'forge-mcq-explanation'), null);
  });

  test('render is append-only — it does not disturb existing children', () => {
    const doc = fakeDoc();
    const root = doc.createElement('div');
    const sibling = doc.createElement('p');
    sibling.textContent = 'earlier output';
    root.appendChild(sibling);

    renderMcqCard(parseMcqOutput(CORRECT)!, root, doc);
    assert.equal(root.children.length, 2);
    assert.equal(root.children[0].textContent, 'earlier output');
  });
});
