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
  "forge.core.exceptions.AmbiguousSnippetResolutionError: Two or more notes in vault 'ClaudeQA' share the basename 'construct_c_major_piano': forge-music.legacy/exercises/construct_c_major_piano.md, music-theory/music_theory/exercises/construct_c_major_piano.md. Forge cannot tell which one you mean. Rename one to disambiguate.",
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
