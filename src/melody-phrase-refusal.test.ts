// 2026-11-23-1030 (pitch in bars, Stage 1a): no phrase verb takes a melody bar yet. A phrase sentence that NAMES a melody bar is refused AT SENTENCE TIME, in one plain sentence about melodies, never at draw time in the Beat Box's words
// (`Not rhythm data: missing required field "channels"`). The grammar knows a melody bar by the vault's `melody` list (names, as the others are); a vault without the list (every vault of today, the lean edition) is read exactly as it was.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parse, type GrammarVault } from './phrase-grammar-core.ts';
import { parseRecipe } from './recipe-grammar-core.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { VAULT } from './test-support/sentence-list-fixtures.ts';

const WORDS = 'A melody bar cannot be used in a phrase yet.';
const MELODY_VAULT: GrammarVault = { ...VAULT, bars: [...(VAULT.bars as string[]), 'bar_021'], melody: ['bar_021'] };
const say = (text: string, vault: GrammarVault = MELODY_VAULT): string => { const r = parse(text, vault); return r.ok ? 'ok' : r.error.message; };

test('every phrase verb that takes a bar refuses a melody bar in the one plain sentence, naming nothing of the Beat Box', () => {
  for (const s of ['Extend [[bar_021]] to 4 bars, repeating with fills.', 'Mix [[bar_001]] and [[bar_021]], 50 percent [[bar_001]], as a vote.', 'Mix [[bar_021]] and [[bar_001]], 50 percent [[bar_021]], as a vote.', 'Morph [[bar_021]] into [[bar_001]] over 4 bars, in musical order.', 'Morph [[bar_001]] into [[bar_021]] over 4 bars, in musical order.']) {
    const m = say(s);
    assert.match(m, new RegExp(WORDS.replace(/\./g, '\\.')), s);
    assert.doesNotMatch(m, /rhythm data|channels|Beat Box|Rhythm Box/i, s);
  }
  const fork = parse('Extend [[bar_001]] to 4 bars, repeating with fills. Bar 2 is replaced by [[bar_021]].', MELODY_VAULT);
  assert.equal(fork.ok, false); if (!fork.ok) assert.match(fork.error.message, /melody bar cannot be used in a phrase yet/);
});

test('the sentence is the same in a recipe (a phrase\'s Recipe is read by the same grammar)', () => {
  const r = parseRecipe('Take [[bar_021]]. Repeat it for 4 bars with fills.', MELODY_VAULT);
  assert.equal(r.ok, false); if (!r.ok) assert.match(JSON.stringify(r), /melody bar cannot be used in a phrase yet/);
});

test('NOTHING ELSE CHANGES: a rhythm bar is read as it was, the same sentences parse the same with and without a melody list, and a vault with no list reads a melody bar\'s name as any bar\'s', () => {
  const sentences = ['Extend [[bar_001]] to 4 bars, repeating with fills.', 'Mix [[bar_001]] and [[bar_003]], 50 percent [[bar_001]], as a vote.', 'Morph [[bar_003]] into [[bar_001]] over 4 bars, in musical order.', 'Extend [[bar_001]] to 4 bars, repeating with fills. Bar 2 is replaced by [[bar_003]].', 'Extend [[bar_999]] to 4 bars, repeating with fills.', 'Take [[bar_001]].'];
  for (const s of sentences) {
    assert.deepEqual(parse(s, { ...VAULT, melody: [] }), parse(s, VAULT), s);
    assert.deepEqual(parse(s, { ...VAULT, melody: ['bar_021'] }), parse(s, VAULT), `${s}: a melody list that names no bar of the sentence changes nothing`);
  }
  assert.equal(say('Extend [[bar_021]] to 4 bars, repeating with fills.', { ...VAULT, bars: [...(VAULT.bars as string[]), 'bar_021'] }), 'ok');
});

test('the vault of the composer says which bars are melody bars (the metadata mark `melody: true` of the note, read synchronously), and says nothing when the port is not given', () => {
  const env = { read: async () => '', process: async () => {}, basenamesIn: (f: string) => (f === 'bars' ? ['bar_001', 'bar_021'] : []), setTimer: () => 0, clearTimer: () => {}, trace: () => {}, warn: () => {}, panes: () => [] } as never;
  const plain = descriptionPortsFor(env, {} as never).vault();
  assert.equal('melody' in plain, false, 'no port, no key: a vault is exactly what it was');
  const marked = descriptionPortsFor({ ...(env as object), melodyIn: (folder: string) => (folder === 'bars' ? ['bar_021'] : []) } as never, {} as never).vault();
  assert.deepEqual(marked.melody, ['bar_021']);
});

test('the real plugin builds that list from the vault\'s metadata cache: a bar whose front matter says `melody: true`', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/score-first.ts'), 'utf8');
  assert.match(src, /melodyIn: \(folder\) => app\.vault\.getFiles\(\)[^\n]*frontmatter\?\.melody === true/);
});
