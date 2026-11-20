// 2026-11-20-1000 (THE INSPECTOR THROUGH THE STEP LINES) - THE REAL TAB, end to end (happy-dom): the real phrase tab (mountPhrase: the Score area, the Inspector, the click handlers) with the real composer and dialog in the SAME tab element, joined by the host the plugin registers
// (bar-selection-bus.ts), drawing phrases with a head and one, two and three step lines of every kind (the stub engine of test-support/phrase-steps-rig.ts; the Score is a stand-in svg made from the ids the plugin put on the MusicXML). Written RED first: against 97496cc the Inspector says
// "This score could not be mapped to its note ... (the Score has 7 bars but the phrase asks for 4)" / "(the two bars of the morph did not reach the Score)", maps nothing, and a click on a bar does nothing. For EVERY bar of the Score:
//   * a click with an empty composer PINS it and the Inspector names a note (`from bar_005`) or says "made by step N: ..." in plain words; it never says "could not be mapped";
//   * a click with `Delete`, `Move`, `Copy` or `Keep` in the composer inserts ` bar N`, N being the bar's position in the Score, and pins nothing.
// A DOM element is never an assert operand. Obsidian itself is not driven (and the real Verovio is not here: scripts/dev/measure-inspector-steps.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STEP_POOL } from './test-support/phrase-steps-rig.ts';
import { rig } from './test-support/phrase-steps-tab-rig.ts';

const HEADS: Array<{ name: string; list: string[] }> = [
  { name: 'extend', list: ['Extend [[bar_005]] to 6 bars, repeating with fills.'] },
  { name: 'morph', list: ['Morph [[bar_005]] into [[bar_006]] over 5 bars, in musical order.'] },
  { name: 'mix', list: ['Mix [[bar_005]] and [[bar_006]].', 'Extend bar 1 to 4 bars.'] },
  { name: 'take', list: ['Take [[phrase_014]].'] },
];
const pool = STEP_POOL.map((s) => s.typed);
/** one, two and three steps of every kind in mixed order: every kind alone, then pairs and triples that rotate through the kinds (every kind is first, second and third somewhere). */
const SEQUENCES: string[][] = [
  ...pool.map((a) => [a]),
  ...pool.map((a, i) => [a, pool[(i + 3) % pool.length]]),
  ...pool.map((a, i) => [a, pool[(i + 5) % pool.length], pool[(i + 2) % pool.length]]),
];

for (const head of HEADS) {
  test(`${head.name} head + one, two and three step lines of every kind: every bar of the Score pins and the Inspector names a note or says "made by step N"; a click with Delete / Move / Copy / Keep in the composer inserts the bar's POSITION`, async () => {
    let phrases = 0, bars = 0;
    for (const steps of SEQUENCES) {
      const list = [...head.list, ...steps];
      const r = await rig(list);
      try {
        const where = list.join(' | ');
        assert.ok(!/could not be mapped/.test(r.hint()), `${where}: the Inspector says "${r.hint()}"`);
        const n = r.bars().length;
        if (n === 0) continue;                                             // the phrase draws nothing (refused at draw time)
        phrases++;
        for (let i = 0; i < n; i++) {
          r.type(''); r.click(r.bars()[i]); await r.flush();
          const lines = r.lines();
          assert.equal(lines[0], `bar ${i + 1} of ${n}`, `${where}: bar ${i + 1} pinned (${lines.join(' / ')})`);
          assert.ok(lines.some((l) => /^from (bar_|phrase_)/.test(l) || /^made by step \d+: /.test(l)), `${where}: bar ${i + 1} names a note or its step (${lines.join(' / ')})`);
          assert.ok(!lines.some((l) => /could not be mapped/.test(l)), where);
          bars++;
        }
        const pinned = r.pins.length;
        for (const verb of ['Delete', 'Move', 'Copy', 'Keep']) for (let i = 0; i < n; i++) {
          r.type(verb); r.click(r.bars()[i]); await r.flush();
          assert.equal(r.field().value, `${verb} bar ${i + 1}`, `${where}: ${verb}, bar ${i + 1} of ${n}`);
        }
        assert.equal(r.pins.length, pinned, `${where}: a bar-word click pins nothing`);
      } finally { r.done(); }
    }
    assert.ok(phrases >= 20, `${head.name}: ${phrases} phrases drawn`);
    assert.ok(bars >= 100, `${head.name}: ${bars} bars checked`);
  });
}

test('a selection of bars survives a change that keeps the numbers (the head\'s style) and is let go when a step line renumbers the bars (the numbers of a selection mean other bars then)', async () => {
  const head = 'Extend [[bar_005]] to 6 bars, repeating with fills.';
  const r = await rig([head, 'Delete bar 2.']);
  try {
    r.click(r.bars()[2], { shiftKey: true }); await r.flush();
    assert.match(r.count() ?? '', /^bar 3 selected$/, 'bar 3 is selected');
    await r.edit(['Extend [[bar_005]] to 6 bars, building up.', 'Delete bar 2.']);
    assert.match(r.count() ?? '', /^bar 3 selected$/, 'the head changed its style, the bars keep their numbers: the selection stays');
    await r.edit([head, 'Delete bar 2.', 'Copy bars 1 to 2.']);
    assert.equal(r.bars().length, 7, 'the Score has the copy');
    assert.doesNotMatch(r.count() ?? '', /^bar 3 selected$/, 'a step line renumbered the bars: the selection is let go');
  } finally { r.done(); }
});
