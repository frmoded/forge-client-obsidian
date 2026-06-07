import test from 'node:test';
import assert from 'node:assert/strict';

import { computeEnglishHash } from './english-hash-core.ts';

// v0.2.72 — cross-language hash parity tests for computeEnglishHash.
// Each behavior asserted here MUST hold in parallel in
// forge.core.slot_cache.compute_english_hash (Python).

test('computeEnglishHash: deterministic, 64-hex-char output', async () => {
  const h1 = await computeEnglishHash('Set x to 7.\nDo [[print]](x).');
  const h2 = await computeEnglishHash('Set x to 7.\nDo [[print]](x).');
  assert.strictEqual(h1, h2);
  assert.strictEqual(h1.length, 64);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('computeEnglishHash: distinct text → distinct hash', async () => {
  const h1 = await computeEnglishHash('Set x to 7.\nDo [[print]](x).');
  const h2 = await computeEnglishHash('Set x to 8.\nDo [[print]](x).');
  assert.notStrictEqual(h1, h2);
});

test('computeEnglishHash: trailing whitespace normalized', async () => {
  const h1 = await computeEnglishHash('Set x to 7.\nDo [[print]](x).');
  const h2 = await computeEnglishHash(
    'Set x to 7.   \nDo [[print]](x).   ');
  assert.strictEqual(h1, h2);
});

test('computeEnglishHash: leading + trailing blank lines stripped', async () => {
  const h1 = await computeEnglishHash('Set x to 7.');
  const h2 = await computeEnglishHash('\n\nSet x to 7.\n\n');
  assert.strictEqual(h1, h2);
});

test('computeEnglishHash: internal blank lines preserved', async () => {
  const h1 = await computeEnglishHash('Set x to 7.\n\nDo [[print]](x).');
  const h2 = await computeEnglishHash('Set x to 7.\nDo [[print]](x).');
  assert.notStrictEqual(h1, h2);
});

test('computeEnglishHash: empty input + null + undefined all hash same', async () => {
  const hEmpty = await computeEnglishHash('');
  const hNull = await computeEnglishHash(null);
  const hUndef = await computeEnglishHash(undefined);
  assert.strictEqual(hEmpty, hNull);
  assert.strictEqual(hEmpty, hUndef);
  // sha256("")
  assert.strictEqual(
    hEmpty,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('computeEnglishHash: cross-language parity (pinned value)', async () => {
  // Pinned at drain time; the Python helper produces the same hex for
  // this exact input. If this assertion ever fails on either side, the
  // engine and plugin disagree on english_hash and the B7.3 cache
  // contract breaks.
  const h = await computeEnglishHash(
    'Set greeting to {{a friendly hello}}.\nDo [[print]](greeting).');
  assert.strictEqual(
    h,
    '43415de15a03032addd6f759f30d51718c451c52f3d31e56e00a1526cbc33a54');
});

test('computeEnglishHash: rejects non-string input', async () => {
  await assert.rejects(
    // @ts-expect-error — intentionally wrong type
    () => computeEnglishHash(123),
    TypeError);
});

test('computeEnglishHash: unicode preserved', async () => {
  const text = 'Set greeting to {{a calm blue — pale}}.';
  const h1 = await computeEnglishHash(text);
  const h2 = await computeEnglishHash(text);
  assert.strictEqual(h1, h2);
});

test('computeEnglishHash: idempotent', async () => {
  const text = 'Set x to 7.\nDo [[print]](x).';
  const base = await computeEnglishHash(text);
  for (let i = 0; i < 30; i++) {
    assert.strictEqual(await computeEnglishHash(text), base);
  }
});


// --- v0.2.74 property tests for cross-language parity ----------------
// Each pinned hex MUST equal the Python compute_english_hash output
// for the same input (locked via the parallel test in
// forge/tests/core/test_english_hash.py). Any future normalization
// change that breaks one side without the other will trip these
// assertions.

test('parity pin: slot_demo storybook English (real bundled fixture)', async () => {
  const english = (
    "Set greeting to {{a friendly hello message in the style of a "
    + "children's storybook}}.\n"
    + "Do [[print]](greeting).");
  assert.strictEqual(
    await computeEnglishHash(english),
    'f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db');
});

test('parity pin: Victorian slot text', async () => {
  const english = (
    "Set greeting to {{a formal hello message in the style of a "
    + "Victorian letter}}.\n"
    + "Do [[print]](greeting).");
  assert.strictEqual(
    await computeEnglishHash(english),
    '5fe21a3d85ff8df536854a08a8c22556b249a236858f2d7d5737b98b4b6ccada');
});

test('parity pin: trailing newline normalized', async () => {
  const english =
    'Set greeting to {{a friendly hello}}.\nDo [[print]](greeting).\n';
  assert.strictEqual(
    await computeEnglishHash(english),
    '43415de15a03032addd6f759f30d51718c451c52f3d31e56e00a1526cbc33a54');
});

test('parity pin: leading blank lines stripped', async () => {
  const english =
    '\n\n\nSet greeting to {{a friendly hello}}.\nDo [[print]](greeting).';
  assert.strictEqual(
    await computeEnglishHash(english),
    '43415de15a03032addd6f759f30d51718c451c52f3d31e56e00a1526cbc33a54');
});

test('parity pin: trailing per-line whitespace normalized', async () => {
  const english =
    'Set greeting to {{a friendly hello}}.   \n'
    + 'Do [[print]](greeting).   ';
  assert.strictEqual(
    await computeEnglishHash(english),
    '43415de15a03032addd6f759f30d51718c451c52f3d31e56e00a1526cbc33a54');
});

test('parity pin: paragraph break distinguishes from no-break baseline', async () => {
  const broken =
    'Set greeting to {{a friendly hello}}.\n\nDo [[print]](greeting).';
  const baseline = await computeEnglishHash(
    'Set greeting to {{a friendly hello}}.\nDo [[print]](greeting).');
  const withBreak = await computeEnglishHash(broken);
  assert.notStrictEqual(withBreak, baseline);
});

test('parity pin: unicode em-dash in slot text', async () => {
  const english =
    'Set greeting to {{a calm blue — pale}}.\nDo [[print]](greeting).';
  assert.strictEqual(
    await computeEnglishHash(english),
    '60db14eaad97f67da98197da61bb32db2ffd3a19921e135760f76792f0639bd3');
});
