// 2026-11-12-1203 - the prompt box's wiring in score-first.ts, pinned as a MECHANISM (the panes the controller sees say which are score tabs of the music edition; a command focuses the box): if the design moves this SHOULD go
// red - reassess, don't just rewrite. The behaviour itself is tested in prompt-box-controller.test.ts and phrase-prompt-box-dom.test.ts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const src = fs.readFileSync(path.resolve(import.meta.dirname, 'score-first.ts'), 'utf8');

test('the controller\'s panes mark a SCORE TAB (phrase, arrangement, composition view types) of the music edition only: the lean edition, the text view and the notes pane get no box (P3)', () => {
  assert.match(src, /tab: plan === 'score' && SCORE_VIEW_TYPES\.includes\(leaf\.view\.getViewType\(\)\)/);
  assert.match(src, /const SCORE_VIEW_TYPES: readonly string\[\] = \[PHRASE_VIEW_TYPE, ARRANGEMENT_VIEW_TYPE, COMPOSITION_VIEW_TYPE\];/);
});

test('"Focus prompt box" is a command for the active note of the three families, calling the controller\'s focusBox (reachable without the mouse)', () => {
  const i = src.indexOf("id: 'focus-prompt-box'");
  assert.ok(i > 0, 'the command exists');
  const block = src.slice(i, i + 500);
  assert.match(block, /name: 'Focus prompt box'/);
  assert.match(block, /familyOfPath\(file\.path\) === null\) return false/);
  assert.match(block, /descriptions\.focusBox\(file\.path\)/);
});
