// score_first M3 (drain 2026-10-21-1230) — the provenance map against the REAL engine and REAL Verovio, on the four playground bars and the awkward ones (test/fixtures/provenance/bars.json).
// The question each test asks: does every engraved note carry the id of the hit that made it, and are the hits exactly the data's? (The map is built from the data and the MusicXML; Verovio is only
// asked "did you keep my ids?".) Skipped (visibly) without the music wheels.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { WHEELS_PRESENT, engine, compute } from './test-support/real-rhythm-engine.ts';
import { CANONICAL_CHANNELS, annotateRhythmXml, attachProvenance, hitId, hitSteps, scanParts, type RhythmDataLike } from './provenance-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const ROOT = path.resolve(import.meta.dirname, '..');
const BARS: Record<string, RhythmDataLike & Record<string, unknown>> = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/provenance/bars.json'), 'utf8'));

let toolkit: any = null;
async function verovio() {
  if (toolkit) return toolkit;
  const v: any = createRequire(path.join(ROOT, 'package.json'))('verovio');
  await new Promise<void>((r) => { if (v.module?.calledRun) r(); else v.module.onRuntimeInitialized = () => r(); });
  toolkit = new v.toolkit();
  toolkit.setOptions({ adjustPageHeight: true, pageWidth: 2000, scale: 40 });
  return toolkit;
}
const svgNoteIds = (svg: string) => [...svg.matchAll(/<g id="([^"]+)" class="note/g)].map((m) => m[1]);
const expectedHits = (d: RhythmDataLike) => CANONICAL_CHANNELS.filter((c) => c in d.channels).flatMap((c) => hitSteps(d.channels[c]).map((s) => hitId('a', c, s))).sort();

test('every fixture bar: the map is built, its hits are EXACTLY the data\'s, and real Verovio keeps every id on exactly one engraved note (multi-staff view)', async () => {
  const py = await engine();
  const tk = await verovio();
  for (const [name, data] of Object.entries(BARS)) {
    const payload = compute(py, data, name);
    const r = attachProvenance(`bars/${name}`, data, payload);
    assert.deepEqual(r.problems, [], `${name}: ${r.problems.join('; ')}`);
    const heads = Object.keys(r.map).filter((k) => r.map[k].params.tiedFrom === undefined);
    assert.deepEqual(heads.sort(), expectedHits(data), `${name}: the map's hits are the data's hits (tied tails are not extra hits)`);
    for (const p of Object.values(r.map)) { assert.equal(p.role, 'hit'); assert.equal(p.noteId, `bars/${name}`); }
    for (const [id, p] of Object.entries(r.map)) if (p.params.tiedFrom !== undefined) assert.ok(id.startsWith(`${p.params.tiedFrom}_t`) && p.params.tiedFrom in r.map, `${name}: ${id} is a tail of a real hit`);
    tk.loadData(r.payload.multi_staff_content as string);
    const ids = svgNoteIds(tk.renderToSVG(1));
    assert.equal(ids.length, Object.keys(r.map).length, `${name}: as many engraved notes as map entries (none lost, none invented)`);
    assert.deepEqual([...ids].sort(), Object.keys(r.map).sort(), `${name}: every engraved note carries the id of its hit`);
  }
});

test('the Kit view: mapped when it can be verified, and REFUSED with a reason (never guessed) when the engine\'s Kit fold is not time-faithful; the multi-staff map is unaffected either way', async () => {
  const py = await engine();
  const tk = await verovio();
  const mapped: string[] = [], refused: string[] = [];
  for (const [name, data] of Object.entries(BARS)) {
    const payload = compute(py, data, name);
    const r = attachProvenance(`bars/${name}`, data, payload);
    assert.equal(r.problems.length, 0, name);
    if (r.kitProblems.length === 0) {
      mapped.push(name);
      tk.loadData(r.payload.kit_content as string);
      const ids = svgNoteIds(tk.renderToSVG(1));
      assert.deepEqual([...ids].sort(), Object.keys(r.map).sort(), `${name}: the Kit view carries the same ids`);
    } else {
      refused.push(name);
      assert.match(r.kitProblems[0], /Kit view's hits|matches no channel|off the step grid|share the notehead/, name);
      assert.equal(r.payload.kit_content, payload.kit_content, `${name}: an unmapped Kit XML is left exactly as the engine made it`);
    }
  }
  assert.ok(mapped.includes('bar_001') && mapped.includes('bar_002') && mapped.includes('bar_003'), `the two-channel playground bars map in the Kit view too (mapped: ${mapped.join(', ')})`);
  assert.ok(refused.includes('bar_004'), `bar_004's Kit fold is not time-faithful and must be refused (refused: ${refused.join(', ')})`);
});

test('swing is not engraved (the engine draws the straight grid), so a swung bar maps exactly like its straight twin', async () => {
  const py = await engine();
  const a = attachProvenance('n', BARS.swung, compute(py, BARS.swung, 'swung'));
  const straight = { ...BARS.swung, swing_pct: 0 };
  const b = attachProvenance('n', straight, compute(py, straight, 'straight'));
  assert.deepEqual(Object.keys(a.map).sort(), Object.keys(b.map).sort());
  assert.deepEqual(a.problems, []);
});

test('two channels on one step get two ids (two noteheads); an empty channel contributes none; the JSON key order is irrelevant (parts follow the canonical order)', async () => {
  const py = await engine();
  const two = attachProvenance('n', BARS.two_on_one_step, compute(py, BARS.two_on_one_step, 't'));
  for (const c of ['kick', 'snare', 'hihat']) assert.ok(`a_${c}_0` in two.map, `${c} at step 0`);
  const empty = attachProvenance('n', BARS.empty_channel, compute(py, BARS.empty_channel, 'e'));
  assert.ok(!Object.keys(empty.map).some((k) => k.startsWith('a_bell_')), 'bell is empty: no ids');
  assert.deepEqual(empty.problems, []);
  const keyed = attachProvenance('n', BARS.json_key_order_not_canonical, compute(py, BARS.json_key_order_not_canonical, 'k'));
  assert.deepEqual(keyed.problems, []);
  assert.deepEqual(Object.keys(keyed.map).sort(), ['a_kick_0', 'a_kick_8', 'a_snare_12', 'a_snare_4']);
});

test('a ring that is not one note value is drawn as TIED notes (10 steps = half + eighth): the tail is the same hit — own element id, same provenance, never an extra hit', async () => {
  const py = await engine();
  const tk = await verovio();
  const r = attachProvenance('n', BARS.empty_channel, compute(py, BARS.empty_channel, 't'));
  assert.deepEqual(r.problems, []);
  assert.ok('a_kick_0_t1' in r.map && r.map.a_kick_0_t1.params.tiedFrom === 'a_kick_0', 'the kick at step 0 rings 10 steps: a tail');
  assert.equal(r.map.a_kick_0_t1.params.step, 0, 'the tail IS step 0\'s hit');
  assert.ok(!('a_kick_8' in r.map), 'the tail\'s onset (step 8) is not a hit');
  assert.ok('a_claves_6_t1' in r.map);
  tk.loadData(r.payload.multi_staff_content as string);
  assert.ok(svgNoteIds(tk.renderToSVG(1)).includes('a_kick_0_t1'), 'Verovio keeps the tail\'s id too');
});

test('velocities are carried as params (an int), a plain hit has none; a loud hit still maps', async () => {
  const py = await engine();
  const r = attachProvenance('n', BARS.velocities, compute(py, BARS.velocities, 'v'));
  assert.deepEqual(r.problems, []);
  assert.equal(r.map.a_kick_0.params.velocity, 100);
  assert.equal(r.map.a_kick_4.params.velocity, 127);
  assert.equal(r.map.a_kick_8.params.velocity, 64);
  assert.ok(!('velocity' in r.map.a_kick_12.params), 'a plain `true` has no invented velocity');
});

test('THE CANONICAL ORDER IS PINNED AGAINST THE ENGINE: with all seven channels, the Score\'s part names are the engine\'s order, and the provenance list is that order', async () => {
  const py = await engine();
  const p = compute(py, BARS.all_seven, 'seven');
  const names = [...(p.multi_staff_content as string).matchAll(/<part-name>([^<]*)<\/part-name>/g)].map((m) => m[1]);
  assert.deepEqual(names, ['Kick', 'Snare', 'Closed Hi-Hat', 'Bell', 'Claves', 'High Conga', 'Low Conga'], 'the engine\'s part order (if this fails, lib.py\'s channel order changed and CANONICAL_CHANNELS must follow)');
  assert.deepEqual([...CANONICAL_CHANNELS], ['kick', 'snare', 'hihat', 'bell', 'claves', 'conga_high', 'conga_low']);
  assert.equal(scanParts(p.multi_staff_content as string)!.length, 7);
});

test('a data note the Score does not match is refused with a reason and the payload is left untouched (a map for the wrong thing is worse than none)', async () => {
  const py = await engine();
  const payload = compute(py, BARS.bar_001, 'x');
  const wrong = attachProvenance('n', BARS.all_seven as RhythmDataLike, payload);
  assert.ok(wrong.problems.length > 0, 'bar_001\'s score is not the all-seven bar\'s data');
  const shifted = attachProvenance('n', { ...BARS.bar_001, channels: { ...BARS.bar_001.channels, kick: BARS.bar_001.channels.snare } } as RhythmDataLike, payload);
  assert.ok(shifted.problems.length > 0, 'right channels, wrong steps: refused');
  assert.deepEqual(wrong.map, {});
  assert.equal(wrong.payload, payload, 'the very same payload object, untouched');
  const unknown = annotateRhythmXml(payload.multi_staff_content as string, null, { ...BARS.bar_001, channels: { ...BARS.bar_001.channels, tambourine: [] } } as RhythmDataLike);
  assert.equal(unknown.ok, false);
});

test('the map takes a fraction of a frame to build (measured, not asserted tightly): every fixture bar under 50 ms', async () => {
  const py = await engine();
  for (const [name, data] of Object.entries(BARS)) {
    const payload = compute(py, data, name);
    const t0 = performance.now();
    attachProvenance(`bars/${name}`, data, payload);
    const ms = performance.now() - t0;
    assert.ok(ms < 50, `${name}: ${ms.toFixed(1)} ms`);
  }
});
