// 2026-11-12-1203 - the prompt box's wiring in score-first.ts, pinned as a MECHANISM (the panes the controller sees say which are score tabs of the music edition; a command focuses the box): if the design moves this SHOULD go
// red - reassess, don't just rewrite. The behaviour itself is tested in prompt-box-controller.test.ts and phrase-prompt-box-dom.test.ts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const src = fs.readFileSync(path.resolve(import.meta.dirname, 'score-first.ts'), 'utf8');

test('the controller\'s panes mark a SCORE TAB (phrase, arrangement, composition view types) of the music edition only: the lean edition, the text view and the notes pane get no box (P3)', () => {
  assert.match(src, /tab: plan === 'score' && SCORE_VIEW_TYPES\.includes\(leaf\.view\.getViewType\(\)\)/);
  // 2026-11-19-0990 (deliberate, was: a local const in score-first.ts): the three Score view types are ONE list in note-score-core.ts, which the default-view router, the pair's linker and these panes all read; same three types
  assert.match(src, /import \{ SCORE_VIEW_TYPES, isScoreNotePath, scoreViewTypeOf \} from '\.\/note-score-core\.ts';/);
  assert.match(fs.readFileSync(path.resolve(import.meta.dirname, 'note-score-core.ts'), 'utf8'), /export const SCORE_VIEW_TYPES: readonly string\[\] = \[PHRASE_VIEW_TYPE, ARRANGEMENT_VIEW_TYPE, COMPOSITION_VIEW_TYPE\];/);
});

test('"Focus prompt box" is a command for the active note of the three families, calling the controller\'s focusBox (reachable without the mouse)', () => {
  const i = src.indexOf("id: 'focus-prompt-box'");
  assert.ok(i > 0, 'the command exists');
  const block = src.slice(i, i + 500);
  assert.match(block, /name: 'Focus prompt box'/);
  assert.match(block, /familyOfPath\(file\.path\) === null\) return false/);
  assert.match(block, /descriptions\.focusBox\(file\.path\)/);
});
