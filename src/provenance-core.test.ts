// score_first M3 (drain 2026-10-21-1230) — the provenance map's PURE core, on hand-made MusicXML (the real engine + real Verovio run in provenance-engine.test.ts).
// The tests that matter most are the ones that would catch a SHUFFLED channel order or a guessed step: ids must follow the data, and anything unverifiable is refused.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CANONICAL_CHANNELS, annotateRhythmXml, attachProvenance, beatLabel, hitId, hitSteps, provenanceFor, scanParts, type RhythmDataLike } from './provenance-core.ts';

type N = { dur: number; pitch?: string; rest?: boolean; tieStop?: boolean; chord?: boolean };
const note = (n: N) => `<note>${n.chord ? '<chord/>' : ''}${n.rest ? '<rest/>' : `<pitch><step>${n.pitch![0]}</step><octave>${n.pitch!.slice(1)}</octave></pitch>`}<duration>${n.dur}</duration>${n.tieStop ? '<tie type="stop"/>' : ''}</note>`;
/** divisions = 4 per quarter, so in 4/4 with 16 steps one step is exactly 1 division. A part is a list of voices (a second voice is preceded by a <backup>). */
const part = (id: string, voices: N[][], bars = 1) => {
  const measure = (i: number) => `<measure number="${i + 1}"><attributes><divisions>4</divisions></attributes>${voices.map((v, k) => (k ? `<backup><duration>16</duration></backup>` : '') + v.map(note).join('')).join('')}</measure>`;
  return `<part id="${id}">${Array.from({ length: bars }, (_, i) => measure(i)).join('')}</part>`;
};
const score = (...parts: string[]) => `<score-partwise>${parts.join('')}</score-partwise>`;
/** a voice from hit steps in a 16-step bar: each hit rings until the next hit (or the bar end), rests fill the gap before the first. */
function voice(pitch: string, hits: number[], steps = 16): N[] {
  const out: N[] = [];
  if (hits.length === 0) return [{ dur: steps, rest: true }];
  if (hits[0] > 0) out.push({ dur: hits[0], rest: true });
  hits.forEach((h, i) => out.push({ dur: (hits[i + 1] ?? steps) - h, pitch }));
  return out;
}
const data = (channels: Record<string, unknown[]>, over: Partial<RhythmDataLike> = {}): RhythmDataLike => ({ time_signature: '4/4', steps: 16, group_size: 4, channels, ...over });
const cells = (hits: Array<number | [number, number]>, steps = 16) => Array.from({ length: steps }, (_, i) => { const h = hits.find((x) => (Array.isArray(x) ? x[0] : x) === i); return h === undefined ? false : Array.isArray(h) ? h[1] : true; });

const KS = data({ kick: cells([0, 8]), snare: cells([4, 12]) });
const KS_XML = score(part('P1', [voice('F4', [0, 8])]), part('P2', [voice('C5', [4, 12])]));

test('beat labels: group 4 -> beat N, e, and, a; group 2 and 3 have their own; anything else is +k', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6, 13].map((s) => beatLabel(s, 4)), ['beat 1', 'beat 1 e', 'beat 1 and', 'beat 1 a', 'beat 2', 'beat 2 and', 'beat 4 e']);
  assert.deepEqual([0, 1, 2].map((s) => beatLabel(s, 3)), ['beat 1', 'beat 1 trip', 'beat 1 let']);
  assert.deepEqual([0, 1, 5].map((s) => beatLabel(s, 2)), ['beat 1', 'beat 1 and', 'beat 3 and']);
  assert.equal(beatLabel(5, 6), 'beat 1 +5');
});

test('hitSteps: true and positive ints are hits; false, 0 and junk are not', () => {
  assert.deepEqual(hitSteps([true, false, 0, 100, null, 'x', 1.5, -3, 127]), [0, 3, 8]);
});

test('scanParts: onsets are the sum of the durations before; <backup> rewinds a second voice; a <chord> note shares its predecessor\'s onset', () => {
  const xml = score(part('P1', [[{ dur: 4, pitch: 'F4' }, { dur: 4, pitch: 'G4' }, { dur: 8, rest: true }], [{ dur: 2, pitch: 'C5' }, { dur: 2, pitch: 'E5', chord: true }, { dur: 14, rest: true }]]));
  const p = scanParts(xml)!;
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].notes.map((n) => [n.onset, n.rest, n.pitch]), [[0, false, 'F4'], [4, false, 'G4'], [8, true, null], [0, false, 'C5'], [0, false, 'E5'], [2, true, null]]);
  assert.equal(scanParts('<nothing/>'), null);
});

test('a two-channel bar: every hit gets the id of ITS channel and step, in the MusicXML, and the map says so', () => {
  const r = attachProvenance('bars/bar_001', KS, { multi_staff_content: KS_XML });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(Object.keys(r.map).sort(), ['a_kick_0', 'a_kick_8', 'a_snare_12', 'a_snare_4']);
  const xml = r.payload.multi_staff_content as string;
  const kickPart = /<part id="P1">[\s\S]*?<\/part>/.exec(xml)![0], snarePart = /<part id="P2">[\s\S]*?<\/part>/.exec(xml)![0];
  assert.deepEqual([...kickPart.matchAll(/<note id="([^"]+)"/g)].map((m) => m[1]), ['a_kick_0', 'a_kick_8']);
  assert.deepEqual([...snarePart.matchAll(/<note id="([^"]+)"/g)].map((m) => m[1]), ['a_snare_4', 'a_snare_12']);
  assert.deepEqual(r.map.a_snare_4, { noteId: 'bars/bar_001', role: 'hit', params: { channel: 'snare', step: 4, beat: 'beat 2' } });
  assert.equal(xml.replace(/<note id="[^"]+"/g, '<note'), KS_XML, 'the ONLY change to the MusicXML is the ids');
});

test('SHUFFLED ORDER: the parts follow the canonical channel order, NOT the JSON key order; a Score whose parts are in another order is refused, never mapped by position', () => {
  const reversedKeys = data({ snare: cells([4, 12]), kick: cells([0, 8]) });
  assert.deepEqual(attachProvenance('n', reversedKeys, { multi_staff_content: KS_XML }).problems, [], 'JSON key order is irrelevant');
  assert.ok('a_snare_4' in attachProvenance('n', reversedKeys, { multi_staff_content: KS_XML }).map);
  const swapped = score(part('P1', [voice('C5', [4, 12])]), part('P2', [voice('F4', [0, 8])]));
  const r = attachProvenance('n', KS, { multi_staff_content: swapped });
  assert.ok(r.problems.length > 0 && Object.keys(r.map).length === 0, 'kick\'s part holds snare\'s hits: refused');
  assert.equal(r.payload.multi_staff_content, swapped, 'and untouched');
  assert.deepEqual([...CANONICAL_CHANNELS], ['kick', 'snare', 'hihat', 'bell', 'claves', 'conga_high', 'conga_low']);
});

test('the all-channels order: with five channels present the third part is hihat, the fourth bell, the fifth claves', () => {
  const d = data({ claves: cells([1]), kick: cells([0]), bell: cells([3]), hihat: cells([2]), snare: cells([4]) });
  const xml = score(part('P1', [voice('F4', [0])]), part('P2', [voice('C5', [4])]), part('P3', [voice('G5', [2])]), part('P4', [voice('A5', [3])]), part('P5', [voice('D6', [1])]));
  const r = attachProvenance('n', d, { multi_staff_content: xml });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(Object.keys(r.map).sort(), ['a_bell_3', 'a_claves_1', 'a_hihat_2', 'a_kick_0', 'a_snare_4']);
  for (const [i, ch] of ['kick', 'snare', 'hihat', 'bell', 'claves'].entries()) {
    const p = new RegExp(`<part id="P${i + 1}">[\\s\\S]*?</part>`).exec(r.payload.multi_staff_content as string)![0];
    assert.ok(p.includes(`id="a_${ch}_`), `part ${i + 1} carries ${ch}'s ids`);
  }
});

test('an empty channel is a part of rests: no ids; a bar with every step on gets sixteen ids; two channels on one step each get their own', () => {
  const e = attachProvenance('n', data({ kick: cells([0]), bell: cells([]) }), { multi_staff_content: score(part('P1', [voice('F4', [0])]), part('P2', [voice('A5', [])])) });
  assert.deepEqual(Object.keys(e.map), ['a_kick_0']);
  const all = Array.from({ length: 16 }, (_, i) => i);
  const full = attachProvenance('n', data({ kick: cells(all) }), { multi_staff_content: score(part('P1', [voice('F4', all)])) });
  assert.equal(Object.keys(full.map).length, 16);
  const two = attachProvenance('n', data({ kick: cells([0]), snare: cells([0]) }), { multi_staff_content: score(part('P1', [voice('F4', [0])]), part('P2', [voice('C5', [0])])) });
  assert.deepEqual(Object.keys(two.map).sort(), ['a_kick_0', 'a_snare_0']);
});

test('an 8-step 4/4 bar and a 12-step 3/4 bar: the step is the onset over (divisions x bar quarters / steps)', () => {
  const d = data({ kick: cells([0, 4], 8) }, { time_signature: '4/4', steps: 8 });
  const xml = score(part('P1', [[{ dur: 8, pitch: 'F4' }, { dur: 8, pitch: 'F4' }]]));
  assert.deepEqual(Object.keys(attachProvenance('n', d, { multi_staff_content: xml }).map).sort(), ['a_kick_0', 'a_kick_4']);
  const waltz = data({ kick: cells([0, 6], 12) }, { time_signature: '3/4', steps: 12 });
  const wx = score(part('P1', [[{ dur: 6, pitch: 'F4' }, { dur: 6, pitch: 'F4' }]]));
  assert.deepEqual(Object.keys(attachProvenance('n', waltz, { multi_staff_content: wx }).map).sort(), ['a_kick_0', 'a_kick_6']);
});

test('tied tails are the same hit: own element id, same provenance, never a hit of their own', () => {
  const d = data({ kick: cells([0, 10]) });
  const xml = score(part('P1', [[{ dur: 8, pitch: 'F4' }, { dur: 2, pitch: 'F4', tieStop: true }, { dur: 6, pitch: 'F4' }]]));
  const r = attachProvenance('n', d, { multi_staff_content: xml });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(Object.keys(r.map), ['a_kick_0', 'a_kick_0_t1', 'a_kick_10']);
  assert.deepEqual(r.map.a_kick_0_t1.params, { channel: 'kick', step: 0, beat: 'beat 1', tiedFrom: 'a_kick_0' });
  assert.ok(!('tiedFrom' in r.map.a_kick_0.params));
});

test('velocity: an authored int is carried, a plain true is not; a loud hit and a soft hit are both hits', () => {
  const d = data({ kick: cells([[0, 100], 8, [12, 40]]) });
  const r = attachProvenance('n', d, { multi_staff_content: score(part('P1', [voice('F4', [0, 8, 12])])) });
  assert.equal(r.map.a_kick_0.params.velocity, 100);
  assert.equal(r.map.a_kick_12.params.velocity, 40);
  assert.ok(!('velocity' in r.map.a_kick_8.params));
});

test('REFUSED, with the reason, and nothing touched: a hit the data lacks, a hit the Score lacks, a second bar, an unknown channel, a part count that differs, no MusicXML, a bad time signature', () => {
  const cases: Array<[string, RhythmDataLike, Record<string, unknown>, RegExp]> = [
    ['extra hit in the Score', data({ kick: cells([0]), snare: cells([4, 12]) }), { multi_staff_content: KS_XML }, /kick: the Score's hits \[0,8\] are not the data's \[0\]/],
    ['hit missing from the Score', data({ kick: cells([0, 8, 9]), snare: cells([4, 12]) }), { multi_staff_content: KS_XML }, /kick/],
    ['two bars', KS, { multi_staff_content: score(part('P1', [voice('F4', [0, 8])], 2), part('P2', [voice('C5', [4, 12])], 2)) }, /single bar/],
    ['unknown channel', data({ kick: cells([0, 8]), cowbell: cells([1]) }), { multi_staff_content: KS_XML }, /cowbell/],
    ['part count', data({ kick: cells([0, 8]) }), { multi_staff_content: KS_XML }, /2 part\(s\) but the data has 1/],
    ['no xml', KS, { midi: 'x' }, /no MusicXML/],
    ['time signature', data({ kick: cells([0, 8]), snare: cells([4, 12]) }, { time_signature: 'C' }), { multi_staff_content: KS_XML }, /not N\/D/],
  ];
  for (const [name, d, payload, why] of cases) {
    const r = attachProvenance('n', d, payload);
    assert.ok(r.problems.some((p) => why.test(p)), `${name}: ${r.problems.join(' | ')}`);
    assert.deepEqual(r.map, {}, name);
    assert.equal(r.payload, payload, `${name}: the same payload object`);
  }
});

test('the Kit view: one part, two voices, channels told apart by notehead position; mapped when it agrees with the data, refused (multi-staff map unaffected) when not', () => {
  const kit = score(part('K', [voice('G5', [4, 12]), voice('F4', [0, 8])]));
  const ok = annotateRhythmXml(KS_XML, kit, KS);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  // the Kit view's pitch positions differ from the multi-staff ones, so the signature (taken from the multi-staff view) cannot match them: refused with a reason
  assert.equal(ok.kitXml, null);
  assert.ok(ok.kitProblems.length > 0);
  const sameSigKit = score(part('K', [voice('C5', [4, 12]), voice('F4', [0, 8])]));
  const good = annotateRhythmXml(KS_XML, sameSigKit, KS);
  assert.ok(good.ok && good.kitProblems.length === 0 && good.kitXml !== null);
  if (good.ok) assert.deepEqual([...good.kitXml!.matchAll(/<note id="([^"]+)"/g)].map((m) => m[1]).sort(), ['a_kick_0', 'a_kick_8', 'a_snare_12', 'a_snare_4']);
  const unfaithful = score(part('K', [voice('C5', [4, 12, 14]), voice('F4', [0, 8])]));
  const bad = annotateRhythmXml(KS_XML, unfaithful, KS);
  assert.ok(bad.ok && bad.kitXml === null && bad.kitProblems.some((p) => /snare: the Kit view's hits/.test(p)));
  if (bad.ok) assert.equal(bad.hits.length, 4, 'the multi-staff map is unaffected by a bad Kit view');
});

test('the Kit view may tie a note where the multi-staff view does not (it ends a note at its voice\'s next onset): the Kit tail is in the map too, with the same provenance', () => {
  const d = data({ kick: cells([0, 8]) });
  const multi = score(part('P1', [voice('F4', [0, 8])]));                                              // two half notes: no ties
  const kit = score(part('K', [[{ dur: 5, pitch: 'F4' }, { dur: 3, pitch: 'F4', tieStop: true }, { dur: 8, pitch: 'F4' }]]));
  const r = attachProvenance('n', d, { multi_staff_content: multi, kit_content: kit });
  assert.deepEqual(r.problems, []); assert.deepEqual(r.kitProblems, []);
  assert.deepEqual(Object.keys(r.map).sort(), ['a_kick_0', 'a_kick_0_t1', 'a_kick_8']);
  assert.deepEqual(r.map.a_kick_0_t1.params, { channel: 'kick', step: 0, beat: 'beat 1', tiedFrom: 'a_kick_0' });
  assert.deepEqual([...(r.payload.kit_content as string).matchAll(/<note id="([^"]+)"/g)].map((m) => m[1]), ['a_kick_0', 'a_kick_0_t1', 'a_kick_8']);
  assert.ok(!/id="a_kick_0_t1"/.test(r.payload.multi_staff_content as string), 'the multi-staff view has no such note');
});

test('provenanceFor + hitId: the id is scope_channel_step, an XML NCName', () => {
  assert.equal(hitId('a', 'conga_high', 7), 'a_conga_high_7');
  assert.match(hitId('a', 'conga_high', 7), /^[A-Za-z_][\w.-]*$/);
  assert.deepEqual(provenanceFor('n', KS, [{ id: 'a_kick_0', channel: 'kick', step: 0 }]).a_kick_0.params, { channel: 'kick', step: 0, beat: 'beat 1' });
});
