// 2026-11-20-1004 - the PERSONAL TABLE offers its lines through 1002's "did you mean" (never applied silently): a resolved sentence typed again is answered with `Did you mean: <its lines>?` before any typo repair; lines the grammar no longer reads
// are not offered; no table = exactly what it was.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { offerRepair, suggestRepair } from './did-you-mean-core.ts';

const sayInto = () => { const said: unknown[] = []; return { said, say: (ev: unknown) => { said.push(ev); } }; };

test('a known sentence is offered as `Did you mean: <its lines>?` with a hint, and handed back as the proposal to apply INSTEAD (never applied by itself)', async () => {
  const { said, say } = sayInto();
  const out = await offerRepair('swap the second and third bars', 'phrase', () => true, say, (t) => (t === 'swap the second and third bars' ? ['Move bar 3 one bar left.', 'Keep bars 1 to 3.'] : null));
  assert.deepEqual(out, { ok: true, proposal: { description: 'Move bar 3 one bar left. Keep bars 1 to 3.', via: 'grammar', instead: 'Move bar 3 one bar left. Keep bars 1 to 3.' } });
  assert.equal((said[0] as { question: string }).question, 'Did you mean: Move bar 3 one bar left. Keep bars 1 to 3? You taught this sentence earlier.'); assert.equal(said.length, 1);
});

test('the table is asked BEFORE the typo repair (a resolved sentence beats a guess); a table that knows nothing leaves the typo repair as it was', async () => {
  const r1 = await suggestRepair('Delet bar 2.', 'phrase', () => true, () => ['Keep bars 1 to 2.']); assert.equal(r1?.sentence, 'Keep bars 1 to 2.');
  const r2 = await suggestRepair('Delet bar 2.', 'phrase', () => true, () => null); assert.equal(r2?.sentence, 'Delete bar 2.');
  const r3 = await suggestRepair('Delet bar 2.', 'phrase', () => true); assert.equal(r3?.sentence, 'Delete bar 2.');
});

test('lines the grammar does not read (the vault changed since) are NOT offered, and the repair after them still is; a throwing table or reader is a no; an empty answer is no answer', async () => {
  const reads = (s: string) => s !== 'Keep bars 1 to 2.';
  assert.equal((await suggestRepair('Delet bar 2.', 'phrase', reads, () => ['Keep bars 1 to 2.']))?.sentence, 'Delete bar 2.');
  assert.equal(await suggestRepair('swap them', 'phrase', () => true, () => { throw new Error('boom'); }), null);
  assert.equal(await suggestRepair('swap them', 'phrase', () => true, () => []), null);
  assert.equal(await suggestRepair('swap them', 'phrase', () => { throw new Error('boom'); }, () => ['Keep bar 1.']), null);
});
