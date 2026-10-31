// 2026-10-30-1050 (M15b) - the synchronous facet hash is the async one: the same SHA-256 over the same normalized text. A phrase note is written in one `vault.process` callback (which cannot await), so its Forge hash
// fields come from this; if it ever drifted from `computeFacetHash`, every phrase would read as edited by hand the moment the stale-facet plugin looked at it.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { computeFacetHash } from './facet-hash-core.ts';
import { facetHashSync, sha256HexOfBytes, writeBitLength } from './facet-sync-hash-core.ts';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

test('SHA-256 known answers: the empty input, "abc", and the 56-byte message that needs a second block', () => {
  assert.equal(sha256HexOfBytes(bytes('')), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256HexOfBytes(bytes('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256HexOfBytes(bytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
});

test('every length around a block boundary (0 to 130 bytes) equals node:crypto', () => {
  for (let n = 0; n <= 130; n++) {
    const data = new Uint8Array(n).map((_, i) => (i * 31 + n) & 0xff);
    assert.equal(sha256HexOfBytes(data), createHash('sha256').update(data).digest('hex'), `length ${n}`);
  }
});

test('a long message (2 MB of a repeating pattern) equals node:crypto: the bit length uses both halves of the length field', () => {
  const data = new Uint8Array(2 * 1024 * 1024).map((_, i) => (i * 7) & 0xff);
  assert.equal(sha256HexOfBytes(data), createHash('sha256').update(data).digest('hex'));
});

const TEXTS: Array<[string, string | null | undefined]> = [
  ['empty', ''],
  ['null', null],
  ['undefined', undefined],
  ['one sentence', 'Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.'],
  ['two sentences', 'Take [[phrase_006]]. Thin out bars 3 to 5, kick row, by half, keeping the downbeat.'],
  ['trailing blanks on a line', 'Together.   \n'],
  ['leading and trailing blank lines', '\n\n  indented first line\n\nsecond\n\n\n'],
  ['internal blank lines kept', 'a\n\nb\n\n\nc'],
  ['tabs and a non-breaking space at the end of a line', 'x\t  \ny'],
  ['a byte order mark at the end of a line', 'abc﻿\ndef'],
  ['unicode', 'Mix [[bar_005]] — 70 % — café ☕ 日本語 😀'],
  ['code', "def compute(context):\n  base = bar_005()\n  bars = extend_rhythm(data=base, bars=4, style='repeat_with_fills', tempo_change_pct=0)\n  return bars\n"],
  ['a long text', 'x '.repeat(5000)],
];

test('facetHashSync equals computeFacetHash (the async hash every Forge note uses) over a table of texts', async () => {
  for (const [what, text] of TEXTS) assert.equal(facetHashSync(text), await computeFacetHash(text), what);
});

test('the normalization is the async hash\'s: trailing whitespace and the blank lines around a facet do not change the hash, a changed word does', () => {
  assert.equal(facetHashSync('Together.   \n\n'), facetHashSync('\nTogether.'));
  assert.notEqual(facetHashSync('Together.'), facetHashSync('Together'));
});

// P3 through the EVERYWHERE consumer (card 14): `computeDescriptionHash` / `computeFacetHash` hash every Forge note of every vault, and M15b moved their normalization into a shared function. The expected values below were computed
// with Python's hashlib over a normalization written out again, BEFORE the move, and are PINNED (a fixed table, never the moving tree): the hash of an ordinary Forge note's facets did not change by a bit.
const PINNED: Array<[string, string, string]> = [
  ['a moda Description', 'Tell every particle to do its per-tick work in order:\n\n1. [[move]] forward one tick along its heading.\n', '23c5efe7829d3207e9ab3315e8fafe6ff3c44661f9bdd6be4199ce65fe3044f7'],
  ['a Recipe with blank margins and trailing blanks', '  \n\nLet state = Call [[move]] with state=state, dt=dt.\nReturn state.   \n\n', 'eaba8e61122b7a13fc53b3d548acc6b08539b913ff89d560473f76808ea6ec6f'],
  ['a Python body', 'def compute(context, state, dt):\n  state = move(state=state, dt=dt)\n  return state\n', 'aaf6aabf1cdcaef4292a6e231f7f651ea8d65a9e21a592cb2ef042b70d278ed9'],
  ['nothing', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
];
test('P3 (through the everywhere consumer): the async hash every Forge note uses gives the pinned values it gave before the normalization was shared, and so does the synchronous one', async () => {
  const { computeDescriptionHash } = await import('./description-hash-core.ts');
  for (const [what, text, hash] of PINNED) {
    assert.equal(await computeDescriptionHash(text), hash, `${what}: async description hash`);
    assert.equal(await computeFacetHash(text), hash, `${what}: async facet hash`);
    assert.equal(facetHashSync(text), hash, `${what}: sync facet hash`);
  }
});

test('the length field is two words, high first: a message of 512 MiB or more (too big to hash in a test) is written right, byte counts around 2^29 and 2^30 and the largest 32-bit one', () => {
  const field = (bytes: number): [number, number] => { const v = new DataView(new ArrayBuffer(8)); writeBitLength(v, 0, bytes); return [v.getUint32(0), v.getUint32(4)]; };
  assert.deepEqual(field(0), [0, 0]);
  assert.deepEqual(field(1), [0, 8]);
  assert.deepEqual(field(0x1fffffff), [0, 0xfffffff8], '512 MiB - 1 byte: still one word');
  assert.deepEqual(field(0x20000000), [1, 0], '512 MiB: 2^32 bits');
  assert.deepEqual(field(0x20000001), [1, 8]);
  assert.deepEqual(field(0x40000000), [2, 0]);
  assert.deepEqual(field(0xffffffff), [7, 0xfffffff8]);
  const offset = new DataView(new ArrayBuffer(12)); writeBitLength(offset, 4, 3);
  assert.deepEqual([offset.getUint32(0), offset.getUint32(4), offset.getUint32(8)], [0, 0, 24], 'written at the offset it is given');
});
