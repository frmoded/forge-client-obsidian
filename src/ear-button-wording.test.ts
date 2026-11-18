// 2026-11-17-2002 - the ear widgets' button that starts the next question says "Play", not "Next" (driver 2026-11-17: "have the wording of the next button either try or play or play button, not Next"). It plays the new
// question's notes, so the label is the action. The four files: the three interval ear widgets and name-the-scale (the five scale build widgets became exercises in 2003 with their own labels). Replay keeps its own label; the hint says "Press Play"; no "Next" string is
// left in any of the eight (the button, the hints, the live-region texts, the aria-label of the keys, a code comment). The ids and function names (`id="next"`, `$("next")`) are not words the person sees and stay: the pure
// core is an identical block across a family (pinned in ear-gadgets-split.test.ts), and the tests that drive the button by id keep working. How TALL each widget is (unchanged at 800 and 360 px) is measured in real Chrome
// (scripts/dev/measure-ear-split.mjs, scripts/dev/measure-ear-button-wording.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';
import { seeded } from './test-support/interval-ear-core-checks.ts';

const VAULT = path.resolve(import.meta.dirname, '../assets/vaults/music-theory');
const INTERVAL_DIR = path.join(VAULT, 'music_instruments/resources/html'), SCALE_DIR = path.join(VAULT, 'scales/resources/html');
const FILES: Array<[string, string]> = [
  [INTERVAL_DIR, 'interval_ear_one_after_the_other.html'], [INTERVAL_DIR, 'interval_ear_both_at_once.html'], [INTERVAL_DIR, 'interval_ear_triads.html'],
  [SCALE_DIR, 'scale_ear_name_the_scale.html'],
];
// 2026-11-17-2003: the five scale "build" widgets are EXERCISES now (their own labels: Play, New exercise, Random, Reset; scale-build-exercise.test.ts), so the rename of 2002 is pinned here for the four ear widgets that are
// still questions (the three interval widgets and name-the-scale). The old scale_build_major_and_minor.html was retired and deleted on 2026-11-18 (prompt 1000), once no page embedded it.
const read = (dir: string, f: string): string => fs.readFileSync(path.join(dir, f), 'utf8');

function open(dir: string, file: string) {
  const h = read(dir, file); const stub = audioStub(); const win: any = new Window({ url: 'http://localhost/' });
  win.AudioContext = stub.Ctx; win.Float32Array = Float32Array; win.__earRandom = seeded(7);
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  return { win, doc: win.document, stub };
}

test('non-vacuity: all four files exist and each has the button that starts a question (id next) and a Replay button', () => {
  assert.equal(FILES.length, 4);
  for (const [d, f] of FILES) { const h = read(d, f); assert.match(h, /<button id="next"/, f); assert.match(h, /<button id="replay"/, f); }
});

test('no "Next" string remains in any of the four files (the button, the hints, the live texts, the keys\' aria-label, the comments)', () => {
  for (const [d, f] of FILES) assert.doesNotMatch(read(d, f), /Next/, `${f} still says Next`);
});

test('the button reads "Play", Replay keeps its own label, and the start hint is "Press Play" in every file', () => {
  for (const [d, f] of FILES) {
    const { doc } = open(d, f);
    assert.equal(doc.getElementById('next').textContent.trim(), 'Play', f);
    assert.equal(doc.getElementById('replay').textContent.trim(), 'Replay', f);
    assert.equal(doc.getElementById('hint').textContent.trim(), 'Press Play', `${f}: the hint before a question`);
    assert.equal([...doc.querySelectorAll('button')].some((b: any) => b.textContent.trim() === 'Next'), false, f);
  }
});

test('the hint the person reads after a question ends, and the words of the other states, say Press Play (the source has no "Press Next" and has the new wording)', () => {
  for (const [d, f] of FILES) {
    const h = read(d, f);
    assert.doesNotMatch(h, /Press Next/, f);
    assert.match(h, /return "Press Play"/, `${f}: the hint function`);
    assert.match(h, /Correct\. Press Play\./, `${f}: the end of a question`);
    assert.ok((h.match(/Press Play/g) ?? []).length >= 6, `${f}: the six places that said Press Next (key label, hint, solved, gave up, level text, start text) now say Press Play`);
    assert.match(h, /Out of attempts\./, `${f}: the give-up text is still there`);
  }
});

test('the button still starts a question: pressing it plays the notes and the hint changes (the rename did not touch what it does)', () => {
  for (const [d, f] of FILES) {
    const { doc, win, stub } = open(d, f);
    stub.osc.length = 0;
    doc.getElementById('next').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.ok(stub.osc.length > 0, `${f}: the question's notes play`);
    assert.notEqual(doc.getElementById('hint').textContent.trim(), 'Press Play', `${f}: a question is asked`);
  }
});
