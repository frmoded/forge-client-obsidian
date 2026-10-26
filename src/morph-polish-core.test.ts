// score_first (drain 2026-10-26-1100, CCQA smoke 5) — morph polish, the pure parts: (2) the refusal trap: a fork on a bar past Bars is a refusal that names the way out, and the strip stays live for it (the phrase WITHOUT
// the faulty overrides is what the strip shows, the raw overrides ride along on every write so raising Bars loses nothing); (3) steps count from 1, said once in the Inspector's legend; (4) the zoom a person chose is
// remembered across redraws of a tab; (1) the playback follower's evidence line (the morph's cursor could not be reproduced headless, so the next smoke must carry the facts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { formatPhraseJson, salvageOverrideRefusal, validatePhrase, type ExtendPhrase, type MorphPhrase } from './phrase-core.ts';
import { morphLegend } from './morph-lineage-core.ts';
import { createZoomMemory } from './zoom-memory-core.ts';
import { followerEvidence } from './score-follower-trace-core.ts';

const note = (json: object) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n`;
const EXTEND = { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 };
const MORPH = { kind: 'morph', a: 'bar_007', b: 'bar_008', bars: 5, order: 'musical', seed: 0 };

// ---- (2) the refusal names the way out ------------------------------------------------------------------------------------------------------------------------------------------------------

test('a fork on a bar past Bars is refused naming the way out, for a morph and for an extend phrase alike', () => {
  const morph = validatePhrase({ ...MORPH, overrides: { '9': 'bars/bar_010' } });
  assert.deepEqual(morph, { ok: false, message: 'overrides: "9" is not a bar of this phrase (bars 1 to 5); raise Bars, or remove the override with Revert to generated.' });
  const extend = validatePhrase({ ...EXTEND, overrides: { '9': 'bars/bar_010' } });
  assert.deepEqual(extend, { ok: false, message: 'overrides: "9" is not a bar of this phrase (bars 1 to 4); raise Bars, or remove the override with Revert to generated.' });
});

test('a key that is not a bar number at all (raising Bars cannot help) keeps the plain line; the other override refusals are untouched', () => {
  assert.deepEqual(validatePhrase({ ...MORPH, overrides: { x: 'bars/bar_010' } }), { ok: false, message: 'overrides: "x" is not a bar of this phrase (bars 1 to 5).' });
  assert.deepEqual(validatePhrase({ ...MORPH, overrides: { '0': 'bars/bar_010' } }), { ok: false, message: 'overrides: "0" is not a bar of this phrase (bars 1 to 5).' });
  assert.deepEqual(validatePhrase({ ...MORPH, overrides: { '3': 'bar_010' } }), { ok: false, message: 'overrides: bar 3 must name a bar note like bars/bar_009 (no .md), got "bar_010".' });
  assert.deepEqual(validatePhrase({ ...MORPH, overrides: [] }), { ok: false, message: 'overrides must be an object of bar number to bar note, like {"3": "bars/bar_009"}, got [].' });
  assert.equal(validatePhrase({ ...MORPH, overrides: { '5': 'bars/bar_010' } }).ok, true, 'bar 5 of 5 is a bar of this phrase');
});

// ---- (2) the strip stays live ---------------------------------------------------------------------------------------------------------------------------------------------------------------

test('salvageOverrideRefusal: a morph whose ONLY problem is a fork past Bars gives the phrase without it (what the strip shows) and the phrase with it (what a write keeps)', () => {
  const s = salvageOverrideRefusal(note({ ...MORPH, bars: 5, overrides: { '3': 'bars/bar_009', '9': 'bars/bar_010' } }));
  assert.ok(s);
  assert.deepEqual(s!.shown, { ...MORPH, bars: 5 } satisfies MorphPhrase);
  assert.deepEqual(s!.keep, { ...MORPH, bars: 5, overrides: { '3': 'bars/bar_009', '9': 'bars/bar_010' } } satisfies MorphPhrase);
  assert.match(s!.message, /^overrides: "9" is not a bar of this phrase \(bars 1 to 5\); raise Bars/);
  const e = salvageOverrideRefusal(note({ ...EXTEND, overrides: { '9': 'bars/bar_010' } }));
  assert.deepEqual(e!.shown, { ...EXTEND } satisfies ExtendPhrase);
  assert.deepEqual((e!.keep as ExtendPhrase).overrides, { '9': 'bars/bar_010' });
});

test('writing the kept phrase back with a raised Bars is valid again and loses no override', () => {
  const s = salvageOverrideRefusal(note({ ...MORPH, bars: 5, overrides: { '9': 'bars/bar_010' } }))!;
  const written = formatPhraseJson({ ...s.keep, bars: 17 } as MorphPhrase);
  const back = validatePhrase(JSON.parse(written));
  assert.equal(back.ok, true);
  assert.deepEqual(back.ok && (back.value as MorphPhrase).overrides, { '9': 'bars/bar_010' });
});

test('salvageOverrideRefusal says null for everything else: a valid phrase, a bad Bars, a bad value, a key that is not a bar number, another kind, no JSON', () => {
  assert.equal(salvageOverrideRefusal(note({ ...MORPH, overrides: { '3': 'bars/bar_009' } })), null, 'valid');
  assert.equal(salvageOverrideRefusal(note({ ...MORPH, bars: 99, overrides: { '9': 'bars/bar_010' } })), null, 'Bars is wrong too: not ONLY the override');
  assert.equal(salvageOverrideRefusal(note({ ...MORPH, overrides: { '9': 'bar_010' } })), null, 'the value is wrong');
  assert.equal(salvageOverrideRefusal(note({ ...MORPH, overrides: { x: 'bars/bar_010' } })), null, 'raising Bars cannot fix a key that is not a bar number');
  assert.equal(salvageOverrideRefusal(note({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 3 })), null, 'a mix');
  assert.equal(salvageOverrideRefusal('no frontmatter here'), null);
  assert.equal(salvageOverrideRefusal(note({ ...MORPH, overrides: { '9': 'bars/bar_010' }, extra: 1 })), null, 'an unknown field is another problem');
});

// ---- (3) steps count from 1 -------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the morph legend says once that steps count from 1 (it rides on every stack: a bar\'s and a hit\'s)', () => {
  const legend = morphLegend('bar_005', 'bar_006');
  assert.equal(legend.text, '▲ only bar_005 (not changed yet) · ■ only bar_006 (already changed) · ● both bars · # steps count from 1: step 1 is the first position of the bar');
  assert.equal(legend.legend!.filter((l) => /counting|count from 1/.test(l.text)).length, 1, 'exactly once');
});

// ---- (4) the zoom a person chose ---------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the zoom memory holds the chosen level index for a tab: new tabs start at 100%, a level is clamped to the levels that exist, and one memory per tab', () => {
  const levels = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];
  const a = createZoomMemory(levels, 1.0), b = createZoomMemory(levels, 1.0);
  assert.equal(a.get(), 2, 'index of 100%');
  a.set(4);
  assert.equal(a.get(), 4);
  assert.equal(b.get(), 2, 'another tab is untouched');
  a.set(99); assert.equal(a.get(), 6, 'clamped to the largest level');
  a.set(-5); assert.equal(a.get(), 0, 'and to the smallest');
  a.set(Number.NaN); assert.equal(a.get(), 0, 'junk changes nothing');
  a.reset(); assert.equal(a.get(), 2, 'reset is 100%');
});

// ---- (1) the follower's evidence -----------------------------------------------------------------------------------------------------------------------------------------------------------------

test('followerEvidence: says how many time points the Score has, how many of their ids exist in the Score on screen, and the first and last time; a morph with ids that are not on screen is visible at once', () => {
  const buckets = [{ ms: 0, ids: ['a', 'b'] }, { ms: 300, ids: ['c'] }, { ms: 12000, ids: ['d'] }];
  assert.equal(followerEvidence({ buckets, found: (id) => id !== 'c' }), '[forge-score] follower attached: 3 time points, 3 of 4 note ids are in this Score (first at 0 ms, last at 12000 ms)');
  assert.equal(followerEvidence({ buckets: [], found: () => true }), '[forge-score] follower attached: no time points: nothing will light while it plays');
  assert.match(followerEvidence({ buckets, found: () => false }), /0 of 4 note ids are in this Score/);
});

test('followerEvidence for the first start: the player\'s time, the ids it expects now and how many of them are on screen; in the lead-in nothing is expected', () => {
  const buckets = [{ ms: 0, ids: ['a', 'b'] }, { ms: 300, ids: ['c'] }];
  assert.equal(followerEvidence({ buckets, found: (id) => id === 'a', start: { currentSec: 1.5, leadInSecs: 1 } }),
    '[forge-score] follower started: player at 1.50 s (0.50 s into the Score), expecting 1 note ids now, 0 of them in this Score');
  assert.equal(followerEvidence({ buckets, found: () => true, start: { currentSec: 0.2, leadInSecs: 1 } }),
    '[forge-score] follower started: player at 0.20 s (still in the lead-in), expecting 0 note ids now, 0 of them in this Score');
  assert.equal(followerEvidence({ buckets, found: (id) => id !== 'b', start: { currentSec: 1, leadInSecs: 1 } }),
    '[forge-score] follower started: player at 1.00 s (0.00 s into the Score), expecting 2 note ids now, 1 of them in this Score');
});

// ---- wiring pins ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const SRC = import.meta.dirname;
const code = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('MECHANISM PIN (the real-Chrome study scripts/dev/measure-polish.ts is the behavioural proof; if the design moves this SHOULD go red — reassess, do not just rewrite): the renderer reads the zoom memory at the start of a render and writes it on every zoom click; the phrase tab gives each tab ONE memory and the trace; no other surface does', () => {
  const full = code('music-edition.full.ts');
  assert.match(full, /let zoomIdx = opts\.zoom \? opts\.zoom\.get\(\) : ZOOM_LEVELS\.indexOf\(1\.0\);/);
  assert.equal((full.match(/opts\.zoom\?\.set\(zoomIdx\)/g) ?? []).length, 2, 'zoom out and zoom in write it');
  assert.match(full, /opts\.zoom\?\.reset\(\)/, 'the reset button too');
  assert.match(full, /attachScoreFollower\(scoreWrap, player, timeMap, opts\.trace\)/);
  const view = code('phrase-view.ts');
  assert.match(view, /private readonly zoom = createZoomMemory\(SCORE_ZOOM_LEVELS, 1\.0\);/);
  assert.match(view, /zoom: this\.zoom, trace:/);
  for (const f of ['rhythm-edit-view.ts', 'rhythm-embed-view.ts', 'rhythm-score-view.ts', 'output-view.ts']) assert.ok(!/zoom: /.test(code(f)), `${f} is unchanged: no zoom memory (P3)`);
});
