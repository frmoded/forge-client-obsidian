// New-feature tests for parseHtmlEmbedSource. Per this repo's test
// discipline for new-feature prompts (cc-prompt-queue.md), failing-
// first ordering isn't mandatory here — coverage is: every observable
// parsing behavior the drain's spec (and the third-party plugin being
// replaced) describes.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHtmlEmbedSource, DEFAULT_HEIGHT_PX } from './html-embed-view-core.ts';

test('parseHtmlEmbedSource: path + explicit height, both lines present', () => {
  const r = parseHtmlEmbedSource('music_instruments/resources/html/piano_keyboard.html\n300');
  assert.equal(r.path, 'music_instruments/resources/html/piano_keyboard.html');
  assert.equal(r.heightPx, 300);
  assert.equal(r.heightWasExplicit, true);
});

test('parseHtmlEmbedSource: matches the exact source of all five shipped widget notes', () => {
  const fixtures: [string, number][] = [
    ['music_instruments/resources/html/monochord.html\n300', 300],
    ['music_instruments/resources/html/piano_keyboard.html\n300', 300],
    ['music_instruments/resources/html/guitar_fretboard.html\n330', 330],
    ['music_instruments/resources/html/lute_fretboard.html\n380', 380],
    ['music_instruments/resources/html/rhythm_box.html\n360', 360],
  ];
  for (const [source, expectedHeight] of fixtures) {
    const r = parseHtmlEmbedSource(source);
    assert.equal(r.path, source.split('\n')[0]);
    assert.equal(r.heightPx, expectedHeight);
    assert.equal(r.heightWasExplicit, true);
  }
});

test('parseHtmlEmbedSource: height with explicit "px" suffix is accepted', () => {
  const r = parseHtmlEmbedSource('a.html\n450px');
  assert.equal(r.heightPx, 450);
  assert.equal(r.heightWasExplicit, true);
});

test('parseHtmlEmbedSource: height matching is case-insensitive on the px suffix', () => {
  const r = parseHtmlEmbedSource('a.html\n450PX');
  assert.equal(r.heightPx, 450);
  assert.equal(r.heightWasExplicit, true);
});

test('parseHtmlEmbedSource: missing second line falls back to DEFAULT_HEIGHT_PX', () => {
  const r = parseHtmlEmbedSource('a.html');
  assert.equal(r.path, 'a.html');
  assert.equal(r.heightPx, DEFAULT_HEIGHT_PX);
  assert.equal(r.heightWasExplicit, false);
});

test('parseHtmlEmbedSource: DEFAULT_HEIGHT_PX matches the third-party plugin\'s own fallback (720)', () => {
  // Pinned so a future edit that changes the constant notices it changed
  // the observable behavior for any note that omits an explicit height.
  assert.equal(DEFAULT_HEIGHT_PX, 720);
});

test('parseHtmlEmbedSource: unparseable second line (not digits/px) falls back to default, does not throw', () => {
  const r = parseHtmlEmbedSource('a.html\nnot-a-height');
  assert.equal(r.heightPx, DEFAULT_HEIGHT_PX);
  assert.equal(r.heightWasExplicit, false);
});

test('parseHtmlEmbedSource: blank lines are filtered before positional path/height assignment', () => {
  // Matches the third-party plugin's own `.filter(Boolean)` behavior —
  // a leading blank line must not shift path/height into the wrong slot.
  const r = parseHtmlEmbedSource('\n\na.html\n\n300\n');
  assert.equal(r.path, 'a.html');
  assert.equal(r.heightPx, 300);
});

test('parseHtmlEmbedSource: surrounding whitespace on each line is trimmed', () => {
  const r = parseHtmlEmbedSource('  a.html  \n  300  ');
  assert.equal(r.path, 'a.html');
  assert.equal(r.heightPx, 300);
});

test('parseHtmlEmbedSource: completely empty source yields null path and default height', () => {
  const r = parseHtmlEmbedSource('');
  assert.equal(r.path, null);
  assert.equal(r.heightPx, DEFAULT_HEIGHT_PX);
  assert.equal(r.heightWasExplicit, false);
});

test('parseHtmlEmbedSource: whitespace-only source yields null path (all lines filtered)', () => {
  const r = parseHtmlEmbedSource('   \n\t\n   ');
  assert.equal(r.path, null);
});

test('parseHtmlEmbedSource: a bare number as the FIRST line is treated as the path (matches third-party positional parsing, not type-sniffed)', () => {
  // Third-party plugin has no type-sniffing either — line[0] is always
  // "the path", however it looks. Documents the behavior rather than
  // asserting it's desirable; an actual vault path is never a bare
  // number, so this only matters for a malformed code block, which the
  // downstream file-not-found error handles.
  const r = parseHtmlEmbedSource('300\na.html');
  assert.equal(r.path, '300');
  assert.equal(r.heightWasExplicit, false);
});
