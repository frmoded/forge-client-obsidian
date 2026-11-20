// 2026-11-20-1000 (P3: a phrase with a head and NO step line is byte for byte as it was) - the GOLDEN of 97496cc, captured from the UNCHANGED tree before any code of this prompt was written (the evidence file is ~/.forge-mem-evidence/p1000/gold-old-tree.json):
// for phrases with no structure step (Extend with and without a fork, Morph, Mix, Take, Take with a Thin out), (1) the sha256 (first 16 hex digits) of the JSON of the payload producePhraseNote gives (so no key, no byte was added: the head count of the steps rides ONLY on a phrase that has steps),
// and (2) on the REAL tab, the Inspector's lines for every pinned bar (and, for the Morph and the Mix, the line it says under the stand-in engine, which has no parents to tie: unchanged is the point). This file is green on the old tree and must stay green.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';

import { drawNote, noteFor } from './test-support/phrase-steps-rig.ts';
import { rig } from './test-support/phrase-steps-tab-rig.ts';

const P3: Array<[string, string[]]> = [
  ['extend', ['Extend [[bar_005]] to 6 bars, repeating with fills, 20 percent slower.']],
  ['extend forks', ['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Bar 3 is replaced by [[bar_009]].']],
  ['morph', ['Morph [[bar_005]] into [[bar_006]] over 5 bars, in musical order.']],
  ['mix', ['Mix [[bar_005]] and [[bar_006]].']],
  ['take', ['Take [[phrase_014]].']],
  ['take thin', ['Take [[phrase_014]].', 'Thin out bars 1 to 2, by half, keeping the downbeat.']],
];
const GOLD: Record<string, { hash: string; hint: string; n: number; pins: string[][] }> = {
 "extend": {
  "hash": "09fdc90476187666",
  "hint": "bar 6 of 6made by phrase_020 (extend, slowing 20 %, style repeat_with_fills)Open",
  "n": 6,
  "pins": [
   [
    "bar 1 of 6",
    "made by phrase_020 (extend, slowing 20 %, style repeat_with_fills)",
    "from bar_005",
    "tempo 100"
   ],
   [
    "bar 2 of 6",
    "made by phrase_020 (extend, slowing 20 %, style repeat_with_fills)",
    "from bar_005",
    "tempo 101"
   ],
   [
    "bar 3 of 6",
    "made by phrase_020 (extend, slowing 20 %, style repeat_with_fills)",
    "from bar_005",
    "tempo 102"
   ],
   [
    "bar 4 of 6",
    "made by phrase_020 (extend, slowing 20 %, style repeat_with_fills)",
    "from bar_005",
    "tempo 103"
   ],
   [
    "bar 5 of 6",
    "made by phrase_020 (extend, slowing 20 %, style repeat_with_fills)",
    "from bar_005",
    "tempo 104"
   ],
   [
    "bar 6 of 6",
    "made by phrase_020 (extend, slowing 20 %, style repeat_with_fills)",
    "from bar_005",
    "tempo 105"
   ]
  ]
 },
 "extend forks": {
  "hash": "862eaf227678e805",
  "hint": "bar 4 of 4made by phrase_020 (extend, no tempo change, style repeat_with_fills)O",
  "n": 4,
  "pins": [
   [
    "bar 1 of 4",
    "made by phrase_020 (extend, no tempo change, style repeat_with_fills)",
    "from bar_005",
    "tempo 100"
   ],
   [
    "bar 2 of 4",
    "made by phrase_020 (extend, no tempo change, style repeat_with_fills)",
    "from bar_005",
    "tempo 101"
   ],
   [
    "bar 3 of 4",
    "forked: edited in bar_009 (was made by phrase_020, repeat_with_fills)",
    "tempo 100 (the fork's own)"
   ],
   [
    "bar 4 of 4",
    "made by phrase_020 (extend, no tempo change, style repeat_with_fills)",
    "from bar_005",
    "tempo 103"
   ]
  ]
 },
 "morph": {
  "hash": "983ad4649eee8656",
  "hint": "This score could not be mapped to its note, so it cannot be inspected (the engin",
  "n": 0,
  "pins": []
 },
 "mix": {
  "hash": "a2ba225e0beee2e8",
  "hint": "This score could not be mapped to its note, so it cannot be inspected (kick: the",
  "n": 0,
  "pins": []
 },
 "take": {
  "hash": "96f1490c9614ded4",
  "hint": "bar 4 of 4made by phrase_020 (a transform of phrase_014)Open noteOpen phrase_020",
  "n": 4,
  "pins": [
   [
    "bar 1 of 4",
    "made by phrase_020 (a transform of phrase_014)",
    "from phrase_014",
    "tempo 100"
   ],
   [
    "bar 2 of 4",
    "made by phrase_020 (a transform of phrase_014)",
    "from phrase_014",
    "tempo 101"
   ],
   [
    "bar 3 of 4",
    "made by phrase_020 (a transform of phrase_014)",
    "from phrase_014",
    "tempo 102"
   ],
   [
    "bar 4 of 4",
    "made by phrase_020 (a transform of phrase_014)",
    "from phrase_014",
    "tempo 103"
   ]
  ]
 },
 "take thin": {
  "hash": "96f1490c9614ded4",
  "hint": "bar 4 of 4made by phrase_020 (a transform of phrase_014)Open noteOpen phrase_020",
  "n": 4,
  "pins": [
   [
    "bar 1 of 4",
    "made by phrase_020 (a transform of phrase_014)",
    "from phrase_014",
    "tempo 100"
   ],
   [
    "bar 2 of 4",
    "made by phrase_020 (a transform of phrase_014)",
    "from phrase_014",
    "tempo 101"
   ],
   [
    "bar 3 of 4",
    "made by phrase_020 (a transform of phrase_014)",
    "from phrase_014",
    "tempo 102"
   ],
   [
    "bar 4 of 4",
    "made by phrase_020 (a transform of phrase_014)",
    "from phrase_014",
    "tempo 103"
   ]
  ]
 }
};

for (const [name, list] of P3) {
  test(`P3 ${name}: the payload and the Inspector of a phrase with no step line are what 97496cc gave`, async () => {
    const d = await drawNote(noteFor(list)) as { payload: Record<string, unknown> };
    assert.equal('forge_steps' in d.payload, false, 'no head count on a phrase with no step');
    assert.equal(createHash('sha256').update(JSON.stringify(d.payload)).digest('hex').slice(0, 16), GOLD[name].hash, 'the payload, byte for byte');
    const r = await rig(list);
    try {
      assert.equal(r.bars().length, GOLD[name].n);
      const pins: string[][] = [];
      for (let i = 0; i < r.bars().length; i++) { r.type(''); r.click(r.bars()[i]); await r.flush(); pins.push(r.lines()); }
      assert.deepEqual(pins, GOLD[name].pins, 'the lines of every bar');
      assert.equal(r.hint().slice(0, 80), GOLD[name].hint);
    } finally { r.done(); }
  });
}
