// Tests for forge-error-core (drain 2026-08-08-1300 structured error
// parity). New-feature discipline: every observable behavior in the
// spec — classifier per migrated class, cause extraction, renderer
// DOM shape (cause + fix visible, details collapsed, no-details omits
// the disclosure), backwards-compat null for unmigrated errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ForgeError, ErrorRenderHost } from './forge-error-core.ts';
import {
  classifyForgeError,
  renderForgeError,
  ENGINEER_DETAILS_LABEL,
  SUGGESTED_FIX_PREFIX,
} from './forge-error-core.ts';

// --- classifier -----------------------------------------------------

// Realistic fixture: the engine's actual message shape from
// snippet_registry.get_bare (drain 2200), wrapped in traceback noise
// the way the plugin receives it via the compute error detail.
const AMBIGUOUS_TRACEBACK = [
  'Traceback (most recent call last):',
  '  File "/lib/python3.12/site-packages/forge/core/snippet_registry.py", line 268, in get_bare',
  '    raise AmbiguousSnippetResolutionError(',
  "forge.core.exceptions.AmbiguousSnippetResolutionError: Two or more notes in vault 'ClaudeQA' share the basename 'construct_c_major_piano': forge-music.legacy/exercises/construct_c_major_piano.md, music-theory/theory_exercises/construct_c_major_piano.md. Forge cannot tell which one you mean. Rename one to disambiguate.",
].join('\n');

test('classifier: AmbiguousSnippetResolutionError → cause is the engine message line, fix mentions rename/qualify', () => {
  const err = classifyForgeError({ errorMsg: AMBIGUOUS_TRACEBACK });
  assert.ok(err);
  assert.ok(err.cause.startsWith("Two or more notes in vault 'ClaudeQA' share the basename"));
  assert.ok(!err.cause.includes('Traceback'));
  assert.ok(err.suggested_fix.includes('Rename'));
  assert.equal(err.details, AMBIGUOUS_TRACEBACK);
});

test('classifier: SnippetExecError → cause is the exec message, details carry traceback + stdout', () => {
  const raw = 'SnippetExecError: Empty or missing Python code';
  const err = classifyForgeError({ errorMsg: raw, stdout: 'partial output' });
  assert.ok(err);
  assert.equal(err.cause, 'Empty or missing Python code');
  assert.ok(err.suggested_fix.includes('# Python'));
  assert.ok(err.details?.includes(raw));
  assert.ok(err.details?.includes('--- stdout ---'));
  assert.ok(err.details?.includes('partial output'));
});

test('classifier: SnippetResolutionError (missing chip / unknown reference)', () => {
  const raw = "forge.core.exceptions.SnippetResolutionError: No snippet named 'chord_buider' in any active vault";
  const err = classifyForgeError({ errorMsg: raw });
  assert.ok(err);
  assert.equal(err.cause, "No snippet named 'chord_buider' in any active vault");
  assert.ok(err.suggested_fix.includes('[[name]]'));
});

test('classifier: exec marker wins over the resolution substring it contains', () => {
  // "SnippetResolutionError" is NOT a substring of "SnippetExecError",
  // but a traceback can mention both (resolution error wrapped by an
  // exec raise). The topmost rule (exec) should win when both appear.
  const raw = 'SnippetExecError: wrapped\ncaused by SnippetResolutionError: inner';
  const err = classifyForgeError({ errorMsg: raw });
  assert.ok(err);
  assert.equal(err.cause, 'wrapped');
});

test('classifier: HTTP 5xx with no recognized exception → service-failure shape', () => {
  const err = classifyForgeError({ status: 502, errorMsg: 'Bad Gateway' });
  assert.ok(err);
  assert.ok(err.cause.includes('HTTP 502'));
  assert.ok(err.suggested_fix.includes('Run again'));
  assert.equal(err.details, 'Bad Gateway');
});

test('classifier: unmigrated error → null (caller keeps legacy plain-text path)', () => {
  assert.equal(classifyForgeError({ errorMsg: 'ParseError: Recipe line 3' }), null);
  assert.equal(classifyForgeError({ status: 422, errorMsg: 'validation failed' }), null);
  assert.equal(classifyForgeError({ errorMsg: '' }), null);
});

// --- renderer -------------------------------------------------------

interface FakeEl extends ErrorRenderHost {
  tag: string;
  text: string;
  classes: string[];
  children: FakeEl[];
}

function makeFakeEl(tag = 'div', text = ''): FakeEl {
  const el: FakeEl = {
    tag,
    text,
    classes: [],
    children: [],
    addClass(cls: string) { el.classes.push(cls); },
    createEl(childTag: string, opts?: { text?: string; cls?: string }) {
      const child = makeFakeEl(childTag, opts?.text ?? '');
      if (opts?.cls) child.classes.push(opts.cls);
      el.children.push(child);
      return child;
    },
  };
  return el;
}

const FULL_ERROR: ForgeError = {
  cause: 'Two notes share the basename X.',
  suggested_fix: 'Rename one to disambiguate.',
  details: 'Traceback ...\nlong dump',
};

test('renderer: cause + suggested fix render always-visible, in order, with panel classes', () => {
  const host = makeFakeEl();
  renderForgeError(host, FULL_ERROR);
  assert.ok(host.classes.includes('is-error'));
  const [causeEl, fixEl] = host.children;
  assert.equal(causeEl.tag, 'p');
  assert.equal(causeEl.text, FULL_ERROR.cause);
  assert.ok(causeEl.classes.includes('forge-output-error'));
  assert.equal(fixEl.tag, 'p');
  assert.equal(fixEl.text, `${SUGGESTED_FIX_PREFIX}${FULL_ERROR.suggested_fix}`);
  assert.ok(fixEl.classes.includes('forge-output-message'));
});

test('renderer: details render behind a native <details> disclosure (collapsed by default in the browser)', () => {
  const host = makeFakeEl();
  renderForgeError(host, FULL_ERROR);
  const disclosure = host.children[2];
  // A <details> element with a <summary> is the expandable chevron —
  // collapse/expand is native HTML behavior (no `open` attribute set).
  assert.equal(disclosure.tag, 'details');
  assert.equal(disclosure.children[0].tag, 'summary');
  assert.equal(disclosure.children[0].text, ENGINEER_DETAILS_LABEL);
  assert.equal(disclosure.children[1].tag, 'pre');
  assert.equal(disclosure.children[1].text, FULL_ERROR.details);
});

test('renderer: no details → no disclosure element at all', () => {
  const host = makeFakeEl();
  renderForgeError(host, { cause: 'c', suggested_fix: 'f' });
  assert.equal(host.children.length, 2);
  assert.ok(host.children.every((c) => c.tag !== 'details'));
});

test('renderer: whitespace-only details treated as absent', () => {
  const host = makeFakeEl();
  renderForgeError(host, { cause: 'c', suggested_fix: 'f', details: '  \n ' });
  assert.equal(host.children.length, 2);
});

// --- /generate refusal envelope (drain 2026-08-10-1840) --------------

import { forgeErrorFromGenerateRefusal } from './forge-error-core.ts';

test('forgeErrorFromGenerateRefusal: structured envelope maps cause/suggested_fix, attempts folds into details', () => {
  const err = forgeErrorFromGenerateRefusal({
    error: 'The Description does not describe any computable action or value. Revise the Description to specify what the Recipe should compute or return.',
    error_structured: {
      cause: 'The Description does not describe any computable action or value.',
      suggested_fix: 'Revise the Description to specify what the Recipe should compute or return.',
    },
    attempts: 1,
  });
  assert.equal(err.cause, 'The Description does not describe any computable action or value.');
  assert.equal(err.suggested_fix, 'Revise the Description to specify what the Recipe should compute or return.');
  assert.match(err.details ?? '', /^attempts: 1\b/);   // + server envelope, per drain 1840 spec line 65
});

test('forgeErrorFromGenerateRefusal: falls back to flat error string when error_structured absent (pre-drain-1500 server)', () => {
  const err = forgeErrorFromGenerateRefusal({
    error: 'LLM returned unparseable output after 3 attempts.',
    attempts: 3,
  });
  assert.equal(err.cause, 'LLM returned unparseable output after 3 attempts.');
  assert.ok(err.suggested_fix.length > 0);
  assert.match(err.details ?? '', /^attempts: 3\b/);   // + server envelope, per drain 1840 spec line 65
});

test('forgeErrorFromGenerateRefusal: missing attempts defaults to 1', () => {
  const err = forgeErrorFromGenerateRefusal({
    error_structured: { cause: 'x', suggested_fix: 'y' },
  });
  assert.match(err.details ?? '', /^attempts: 1\b/);   // + server envelope, per drain 1840 spec line 65
});

test('forgeErrorFromGenerateRefusal: details carries the server envelope JSON, not just attempts', () => {
  // Drain 2026-08-13-0155. Drain 1840's spec line 65 said
  // "`attempts`, server envelope JSON -> `details`"; only attempts shipped,
  // so CCQA's batch-6 smoke saw `Engineer details` reading just "attempts: 1".
  const err = forgeErrorFromGenerateRefusal({
    snippet_id: 'nonsense_note',
    parsed_ok: false,
    error: 'The Description does not describe any computable action or value.',
    error_structured: {
      cause: 'The Description does not describe any computable action or value.',
      suggested_fix: 'Revise the Description to specify what the Recipe should compute or return.',
    },
    attempts: 1,
  } as any);
  assert.match(err.details ?? '', /attempts: 1/);
  assert.match(err.details ?? '', /server envelope/i);
  assert.match(err.details ?? '', /nonsense_note/);
  assert.match(err.details ?? '', /"parsed_ok": false/);
});

// ---------------------------------------------------------------------
// Drain 2026-08-24-0920 — the exec-error fix-hint respects source_facet.
//
// The single canned hint told EVERY SnippetExecError victim to "Open the
// note's # Python section and fix the line the details point at". That
// is right for a note whose author wrote the Python and wrong for the
// Description-canonical generated note the driver was running on
// 2026-08-23 — they never wrote that Python and editing it is the wrong
// mental model of the whole D → R → P chain.
// ---------------------------------------------------------------------

import {
  EXEC_FIX_BY_FACET,
  EXEC_FIX_DEFAULT,
} from './forge-error-core.ts';

const EXEC_RAW = 'SnippetExecError: name \'scale\' is not defined';

test('exec hint: python-canonical keeps the original wording', () => {
  const err = classifyForgeError({ errorMsg: EXEC_RAW, sourceFacet: 'python' });
  assert.equal(err?.suggested_fix, EXEC_FIX_DEFAULT);
  assert.match(err!.suggested_fix, /# Python/);
});

test('exec hint: description-canonical points at the Description, never at Python', () => {
  const err = classifyForgeError({ errorMsg: EXEC_RAW, sourceFacet: 'description' });
  assert.equal(err?.suggested_fix, EXEC_FIX_BY_FACET.description);
  assert.match(err!.suggested_fix, /# Description/);
  assert.ok(!/Open the note's # Python/.test(err!.suggested_fix), err!.suggested_fix);
});

test('exec hint: recipe-canonical points at the Recipe', () => {
  const err = classifyForgeError({ errorMsg: EXEC_RAW, sourceFacet: 'recipe' });
  assert.equal(err?.suggested_fix, EXEC_FIX_BY_FACET.recipe);
  assert.match(err!.suggested_fix, /# Recipe/);
});

test('exec hint: synced has its own wording, distinct from description', () => {
  // Drain 2026-08-24-1700, driver-approved. Drain 0920 mapped `synced`
  // to the description text and flagged it for adjudication; the driver
  // adjudicated it its own string. The DISTINCTNESS is the assertion —
  // sharing the description wording under-tells a synced note's user,
  // who may correctly edit any facet.
  const err = classifyForgeError({ errorMsg: EXEC_RAW, sourceFacet: 'synced' });
  assert.equal(err?.suggested_fix, EXEC_FIX_BY_FACET.synced);
  assert.notEqual(EXEC_FIX_BY_FACET.synced, EXEC_FIX_BY_FACET.description);
  assert.match(err!.suggested_fix, /Every facet of this note is current/);
  // It names all three facets, which is the thing the description
  // wording could not say.
  for (const facet of ['Description', 'Recipe', 'Python']) {
    assert.match(err!.suggested_fix, new RegExp(facet), facet);
  }
});

test('exec hint: the other four strings are untouched', () => {
  // NON-VACUITY / §8 guard. The prompt is explicit that the other four
  // are driver-approved AS SHIPPED; a reword there would be an
  // unapproved change to cohort-facing text, and nothing else in the
  // suite would catch it.
  assert.equal(
    EXEC_FIX_DEFAULT,
    "Open the note's # Python section and fix the line the details point at, then run again.",
  );
  assert.equal(EXEC_FIX_BY_FACET.python, EXEC_FIX_DEFAULT);
  assert.equal(
    EXEC_FIX_BY_FACET.description,
    'This note was generated from its Description. Refine the # Description '
    + 'and run again (\u25B6) to regenerate — or edit the # Recipe if the logic is close.',
  );
  assert.equal(
    EXEC_FIX_BY_FACET.recipe,
    'Edit the # Recipe and run again — Forge re-derives the Python.',
  );
});

test('exec hint: absent facet falls back to the generic wording', () => {
  const err = classifyForgeError({ errorMsg: EXEC_RAW });
  assert.equal(err?.suggested_fix, EXEC_FIX_DEFAULT);
});

test('exec hint: unrecognized facet falls back to the generic wording', () => {
  // NON-VACUITY on the fallback: a lookup that returned undefined for
  // an unknown key would render "Fix: undefined" to the cohort.
  const err = classifyForgeError({
    errorMsg: EXEC_RAW,
    sourceFacet: 'not_a_facet' as never,
  });
  assert.equal(err?.suggested_fix, EXEC_FIX_DEFAULT);
});

test('exec hint: every facet hint is non-empty and names a facet', () => {
  // NON-VACUITY across the table: an empty string would satisfy the
  // "does not say # Python" assertions above while telling the cohort
  // nothing (§8: don't drop the hint for any facet).
  //
  // Drain 2026-08-24-1700 — the facet name no longer has to carry a
  // `#`. This guard was written in drain 0920 when every hint pointed
  // at one facet in heading form, and it baked that FORMATTING in
  // alongside the property it meant to protect. The driver-approved
  // `synced` wording names all three in prose ("Description, Recipe, or
  // Python") and tripped it. The property worth guarding is "the hint
  // names a facet"; how it spells it is the driver's call, not the
  // suite's.
  for (const [facet, hint] of Object.entries(EXEC_FIX_BY_FACET)) {
    assert.ok(hint.trim().length > 20, `${facet}: ${hint}`);
    assert.match(hint, /(Description|Recipe|Python)/, facet);
  }
});

test('exec hint: a hint that names no facet at all still fails the guard', () => {
  // NON-VACUITY for the relaxation above — proof the loosened regex did
  // not loosen it into uselessness.
  assert.ok(!/(Description|Recipe|Python)/.test('Try again later.'));
});

test('facet routing does not touch the other error classes', () => {
  // §8: detection unchanged, and only the exec hint is facet-aware.
  const resolution = classifyForgeError({
    errorMsg: 'SnippetResolutionError: nope',
    sourceFacet: 'description',
  });
  assert.match(resolution!.suggested_fix, /spelled exactly/);
  const ambiguous = classifyForgeError({
    errorMsg: 'AmbiguousSnippetResolutionError: two',
    sourceFacet: 'description',
  });
  assert.match(ambiguous!.suggested_fix, /Rename one of the listed notes/);
});
