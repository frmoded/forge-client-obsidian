// 2026-11-02-1155 (score_first M16b) - a custom note whose run FAILED keeps the Score that is on screen, dimmed, with the sentence above it (`keep`), and draws the next good one normally; every other failure still clears the Score as before.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createLiveScore } from './live-score-core.ts';
import type { ScoreOutcome } from './rhythm-score-core.ts';

const SCORE: ScoreOutcome = { kind: 'score', payload: { type: 'musicxml', content: '<score-partwise/>' } };
function rig(results: ScoreOutcome[]) {
  const log: string[] = [];
  let i = 0;
  const live = createLiveScore({
    produce: async () => results[i++],
    view: { status: (t) => { log.push(`status:${t}`); }, draw: () => { log.push('draw'); return true; }, clear: () => { log.push('clear'); }, pending: (on) => { log.push(`pending:${on}`); } },
    title: 't', setTimer: (fn) => { queueMicrotask(fn); return 1; }, clearTimer: () => {}, debounceMs: 0,
  });
  const ask = async (n: number): Promise<void> => { live.update({ n }); await new Promise((r) => setTimeout(r, 5)); };
  return { log, ask };
}

test('a failed custom run after a Score: the Score stays (no clear), is dimmed, the sentence is shown; the next good Score undims and draws', async () => {
  const { log, ask } = rig([SCORE, { kind: 'error', message: 'Custom Python, line 3: ZeroDivisionError: division by zero. The last good Score is kept.', keep: true }, SCORE]);
  await ask(1); await ask(2); await ask(3);
  assert.deepEqual(log.filter((l) => l !== 'status:Rendering score…'), ['draw', 'status:', 'pending:true', 'status:Custom Python, line 3: ZeroDivisionError: division by zero. The last good Score is kept.', 'pending:false', 'draw', 'status:']);
  assert.ok(!log.includes('clear'), 'nothing was cleared');
});

test('the same failure with NO Score on screen yet clears and says it (nothing to keep); a failure without `keep` clears the Score as it always did', async () => {
  const first = rig([{ kind: 'error', message: 'Custom Python: x.', keep: true }]);
  await first.ask(1);
  assert.ok(first.log.includes('clear') && first.log.includes('status:Custom Python: x.') && !first.log.includes('pending:true'), first.log.join(' | '));
  const plain = rig([SCORE, { kind: 'refusal', message: 'Phrase: nope' }]);
  await plain.ask(1); await plain.ask(2);
  assert.deepEqual(plain.log.filter((l) => l !== 'status:Rendering score…'), ['draw', 'status:', 'clear', 'status:Phrase: nope']);
});
