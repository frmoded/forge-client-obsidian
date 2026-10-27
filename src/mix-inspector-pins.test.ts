// score_first M8 (drain 2026-10-23-0230) — MECHANISM PINS for how the phrase tab wires the mix's Inspector. The behaviour is proven in mix-inspector.test.ts (the DOM) and in real Chrome
// (scripts/dev/measure-phrase.ts, the m8_* verdicts: the pin surviving a redraw, hit-only click targets, the painted pixels, arrows doing nothing); a fake-engine DOM test cannot map a Score, so
// these pin that the tab hands the inspector exactly those options. If the design moves these SHOULD go red.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const tab = fs.readFileSync(path.join(import.meta.dirname, 'phrase-dom.ts'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const mixPorts = (() => { const at = tab.indexOf("insp && k === 'mix' ? {"); return tab.slice(at, tab.indexOf('} : undefined;', at)); })();

test('the mix tab\'s inspector options: the pin survives a redraw, arrows have nowhere to go, the bar is painted by parent, and only the HITS get enlarged click targets', () => {
  assert.match(mixPorts, /keepPin: true,/);
  assert.match(mixPorts, /order: \(\) => \[\],/);
  assert.match(mixPorts, /decorate: paintMixHits,/);
  assert.match(mixPorts, /enlargeIds: \(map\) => Object\.keys\(map\)\.filter\(\(id\) => map\[id\]\.role === MIX_HIT_ROLE\),/);
  assert.match(mixPorts, /lineage: mixLineageOf,/);
  assert.match(mixPorts, /annotate: \(note, payload\) => annotateForMix\(ports\.path, note as NoteText, payload\),/);
});

test('the extend tab\'s inspector does NOT get the mix options (its pin, arrows and click targets are what they were)', () => {
  const at = tab.indexOf("insp && k === 'extend' ? {");
  const extend = tab.slice(at, tab.indexOf("} : insp && k === 'mix'", at));
  assert.ok(extend.length > 100);
  for (const opt of ['keepPin:', 'decorate', 'enlargeIds', 'order:']) assert.ok(!extend.includes(opt), `the extend inspector has no ${opt}`);
  assert.match(extend, /enlargeTargets: null,/);
});
