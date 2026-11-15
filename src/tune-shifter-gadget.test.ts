// 2026-11-13-1215, rewritten for 2026-11-15-1218 - GADGET 2, tune_shifter.html: "move the tune". Two tunes in their real metre (Amazing Grace, the first two phrases, 3/4 with an upbeat; Bach BWV 1007 bars 1 to 4, 4/4, every sixteenth), a piano strip C3..G5 in which pressing a key
// makes the tune START on it, a treble staff of two systems of a fixed total height with bar lines at the measure boundaries, Play in the tune's own rhythm. The pure functions (placeTune, allowedStarts, the staff placement against a table of known notes, the layout:
// bar lines, accidentals, stems, beams) and the page in a DOM; expected values are published rules and lists, not read back from the page.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/music_instruments/resources/html');
const html = fs.readFileSync(path.join(DIR, 'tune_shifter.html'), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
function pure(source: string = scriptOf(html)): any { const mod: { exports: any } = { exports: {} }; vm.runInNewContext(source, { module: mod, Math, Float32Array }); return mod.exports; }

// Amazing Grace, from the Mutopia LilyPond (soprano, relative to C4): d'4 | g'2 b'8 g' | b'2 a'4 | g'2 e'4 | d'2 d'4 | g'2 b'8 g' | b'2 a'4 | d''2.
const GRACE = [62, 67, 71, 67, 71, 69, 67, 64, 62, 62, 67, 71, 67, 71, 69, 74];
const GRACE_BEATS = [1, 2, 0.5, 0.5, 2, 1, 2, 1, 2, 1, 2, 0.5, 0.5, 2, 1, 3];
// Bach bars 1 to 4 (Mutopia, Schirmer 1916): each bar is one figure of eight sixteenths, twice; bar 4's second half ends on F# (66) instead of G.
const FIG = (a: number[]) => [...a, ...a];
const BACH = [...FIG([55, 62, 71, 69, 71, 62, 71, 62]), ...FIG([55, 64, 72, 71, 72, 64, 72, 64]), ...FIG([55, 66, 72, 71, 72, 66, 72, 66]), 55, 67, 71, 69, 71, 67, 71, 67, 55, 67, 71, 69, 71, 67, 71, 66];
const diffs = (n: number[]) => n.slice(1).map((m, i) => m - n[i]);
// The treble-clef rule, written here independently of the page: white keys by their letter step, black keys as the FLAT of the next letter (so on that letter's position). C3..G5.
const WHITE_POS: Record<number, number> = { 48: -9, 50: -8, 52: -7, 53: -6, 55: -5, 57: -4, 59: -3, 60: -2, 62: -1, 64: 0, 65: 1, 67: 2, 69: 3, 71: 4, 72: 5, 74: 6, 76: 7, 77: 8, 79: 9 };
const FLAT_POS: Record<number, number> = { 49: -8, 51: -7, 54: -5, 56: -4, 58: -3, 61: -1, 63: 0, 66: 2, 68: 3, 70: 4, 73: 6, 75: 7, 78: 9 };       // D-flat3, E-flat3, G-flat3, A-flat3, B-flat3, D-flat4, E-flat4, G-flat4, A-flat4, B-flat4, D-flat5, E-flat5, G-flat5

function coreFailures(g: any): string[] {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  eq('the two tunes, in order', g.TUNES.map((t: any) => [t.id, t.title, t.notes]), [['grace', 'Amazing Grace', GRACE], ['bwv1007', 'Bach: Cello Suite No. 1, Prelude (bars 1-4)', BACH]]);
  eq('the rhythm of Amazing Grace, in beats', g.TUNES[0].beats, GRACE_BEATS);
  eq('Bach is 64 sixteenths of a quarter beat divided by four', [g.TUNES[1].beats.length, new Set(g.TUNES[1].beats).size, g.TUNES[1].beats[0]], [64, 1, 0.25]);
  eq('meters and beat lengths', g.TUNES.map((t: any) => [t.meter, t.beatSeconds]), [[[3, 4], 0.6], [[4, 4], 0.8]]);
  eq('the strip is C3..G5', [g.LOW, g.HIGH], [48, 79]);
  // the metre: every bar line falls where the beats add up to a whole bar (a one-beat upbeat for Amazing Grace, none for Bach)
  for (const [t, upbeat] of [[g.TUNES[0], 1], [g.TUNES[1], 0]] as const) {
    const cum = (i: number) => t.beats.slice(0, i).reduce((a: number, b: number) => a + b, 0);
    t.barStarts.forEach((b: number, j: number) => { if (Math.abs(cum(b) - (upbeat + t.meter[0] * (j + (upbeat ? 0 : 1)))) > 1e-9) bad.push(`${t.id}: bar line ${j} at note ${b} falls at beat ${cum(b)}`); });
    eq(`${t.id}: the tune ends on a whole beat count`, Number.isInteger(cum(t.notes.length)), true);
    eq(`${t.id}: the second system starts at a bar line`, t.barStarts.includes(t.systemStarts[1]), true);
  }
  for (const t of g.TUNES) {
    const base = diffs(t.notes);
    const allowed = g.allowedStarts(t, 48, 79);
    const lo = Math.min(...t.notes), hi = Math.max(...t.notes), first = t.notes[0];
    const want: number[] = []; for (let s = 48; s <= 79; s++) if (lo + (s - first) >= 48 && hi + (s - first) <= 79) want.push(s);
    eq(`${t.id}: allowedStarts`, allowed, want);
    for (let s = 40; s <= 90; s++) {
      const placed = g.placeTune(t, s);
      eq(`${t.id}: the first note is the start (${s})`, placed[0], s);
      eq(`${t.id}: the intervals are identical at start ${s}`, diffs(placed), base);                // EVERY start, allowed or not
      if (s >= 48 && s <= 79) eq(`${t.id}: a start is allowed exactly when whyNot says null (${s})`, g.whyNot(t, s, 48, 79) === null, allowed.includes(s));
    }
    eq(`${t.id}: tuneIntervals`, g.tuneIntervals(t.notes), base);
  }
  eq('Amazing Grace may start on 48..67 (20 keys: its top note is D5 and G5 is the highest key)', g.allowedStarts(g.TUNES[0], 48, 79), [...Array(20)].map((_, i) => 48 + i));
  eq('Bach may start on 48..62 (15 keys: shifts -7..+7)', g.allowedStarts(g.TUNES[1], 48, 79), [...Array(15)].map((_, i) => 48 + i));
  eq('why a key is off', [g.whyNot(g.TUNES[0], 68, 48, 79), g.whyNot(g.TUNES[1], 63, 48, 79), g.whyNot(g.TUNES[0], 47, 48, 79), g.whyNot(g.TUNES[0], 60, 48, 79)], ['Too high: the tune would go above G5', 'Too high: the tune would go above G5', 'Too low: the tune would go below C3', null]);
  // the staff position of every key C3..G5, ledger lines, flats
  for (const [m, pos] of Object.entries({ ...WHITE_POS, ...FLAT_POS })) eq(`staffPos(${m})`, g.staffPos(+m), pos);
  eq('ledger lines: middle C one, D4 none, A3 two, C3 four, B3 one, E4 none, G5 none (the staff has headroom for it)', [-2, -1, -4, -9, -3, 0, 9].map((p) => g.ledgerPositions(p)), [[-2], [], [-2, -4], [-2, -4, -6, -8], [-2], [], []]);
  eq('flats for black keys, never sharps', [49, 61, 66, 70, 73].map((m) => g.plainName(m)), ['D-flat', 'D-flat', 'G-flat', 'B-flat', 'D-flat']);
  eq('isBlack over the strip', [...Array(32)].map((_, i) => g.isBlack(48 + i)).filter(Boolean).length, 13);
  eq('the drawing is two systems of one height: the total height is fixed', [g.SC.sysCount, g.SC.height], [2, 2 * g.SC.sysH + g.SC.systemGap]);
  // the layout, at the original position: bar lines, systems, heads, stems, beams
  const grace = g.staffLayout(g.TUNES[0], g.TUNES[0].notes), bach = g.staffLayout(g.TUNES[1], g.TUNES[1].notes);
  eq('Amazing Grace: system 1 has the upbeat and bars 1-4 (10 notes, 4 bar lines), system 2 bars 5-7 (6 notes, 2 bar lines), the time signature on the first, the final bar on the last', [grace.map((s: any) => [s.items.length, s.bars.length, s.showTime, s.finalBar])], [[[10, 4, true, false], [6, 2, false, true]]]);
  eq('Bach: 32 notes and ONE bar line a system (two bars each)', bach.map((s: any) => [s.items.length, s.bars.length]), [[32, 1], [32, 1]]);
  for (const sys of [...grace, ...bach]) eq('every note and bar line is inside the drawing (with the final bar)', [sys.items.every((it: any) => it.x - 12 > g.SC.left - 12 && it.x + 6 < g.SC.width), sys.end + 6 <= g.SC.width], [true, true]);
  eq('a bar line sits BETWEEN the last note of a bar and the first of the next', grace[0].bars.every((bx: number, j: number) => { const idx = g.TUNES[0].barStarts[j]; const before = grace[0].items.find((it: any) => it.index === idx - 1), after = grace[0].items.find((it: any) => it.index === idx); return before.x < bx && bx < after.x; }), true);
  const gi = grace[0].items.concat(grace[1].items);
  eq('heads: filled for quarters and shorter, OPEN for the half notes and the dotted half', gi.map((it: any) => it.open), GRACE_BEATS.map((b) => b >= 2));
  eq('stems up below the middle line (pos < 4), down from it up (a beamed group takes the average)', gi.filter((it: any) => !it.beamed).every((it: any) => it.stemUp === (it.pos < 4)), true);
  eq('Amazing Grace: the two eighth-note pairs are beamed (one beam of one level each)', [grace[0].beams.length, grace[1].beams.length, grace[0].beams[0].level, grace[0].beams[0].items.length], [1, 1, 1, 2]);
  eq('Bach: the sixteenths are beamed in groups of four, two levels (8 groups a system)', [bach[0].beams.length, bach[1].beams.length, new Set(bach.flatMap((s: any) => s.beams.map((b: any) => b.items.length))).size, bach[0].beams[0].items.length, bach[0].beams[0].level], [8, 8, 1, 4, 2]);
  eq('Bach moved to C3: notes on four ledger lines', g.staffLayout(g.TUNES[1], g.placeTune(g.TUNES[1], 48)).some((s: any) => s.items.some((it: any) => it.ledger.length === 4)), true);
  // accidentals: a flat the first time a black key appears in a bar, none for the same pitch again in that bar, a natural when the natural follows it, new in the next bar
  const T = { notes: [61, 61, 62, 61, 61, 61], beats: [1, 1, 1, 1, 1, 1], barStarts: [4], systemStarts: [0], meter: [4, 4], beatSeconds: 0.5 };
  eq('accidentals: flat, none, natural, flat again; then a new bar: flat', g.staffLayout(T, T.notes)[0].items.map((it: any) => it.sign), ['flat', null, 'natural', 'flat', 'flat', null]);
  eq('Play: Amazing Grace in its own rhythm, 0.6 s a beat (the upbeat 0.6 s, a half 1.2 s, the last note 1.8 s)', (() => { const p = g.planPlay(g.TUNES[0], 62); return [p.length, +p[0].dur.toFixed(2), +p[1].when.toFixed(2), +p[1].dur.toFixed(2), +p[2].when.toFixed(2), +p[2].dur.toFixed(2), +p[15].dur.toFixed(2), +(p[15].when + p[15].dur).toFixed(2)]; })(), [16, 0.6, 0.6, 1.2, 1.8, 0.3, 1.8, 13.2]);
  eq('Play: Bach, a sixteenth is 0.2 s, 64 of them, 12.8 s', (() => { const p = g.planPlay(g.TUNES[1], 55); return [p.length, +p[1].when.toFixed(2), +p[1].dur.toFixed(2), +(p[63].when + p[63].dur).toFixed(2)]; })(), [64, 0.2, 0.2, 12.8]);
  eq('Play: the pitches are the moved tune', g.planPlay(g.TUNES[1], 53).map((n: any) => n.midi), g.placeTune(g.TUNES[1], 53));
  return bad;
}
test('pure functions: placeTune keeps every interval at EVERY start for both tunes, allowedStarts (20 and 15 keys), why a key is off, the metre (bar lines where the beats add up), the staff position of every key C3..G5 (flats), ledger lines, accidentals within a bar, stems and beams, the fixed two-system height, what Play sounds in the tune\'s own rhythm', () => {
  assert.deepEqual(coreFailures(pure()), []);
  assert.match(html, /NOT Hey Jude/, 'the tune list says Hey Jude is not there');
  assert.match(html, /Mutopia/); assert.match(html, /New Britain|NEW BRITAIN/); assert.match(html, /BWV 1007/); assert.doesNotMatch(html.replace(/NOT Hey Jude[^\n]*/g, ''), /Hey Jude/i);
  assert.match(html, /Bar 3: g, fis' c' b c fis, c' fis, \(twice\)/, 'the sources of bars 3 and 4 are named');
});

// ---- the clef geometry pin, as in 1199 ---------------------------------------------------------------------------------------------------------------------------------------------
function pathBBox(d: string): { minX: number; maxX: number; minY: number; maxY: number } {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
  const pts: number[][] = [], num = (): number => parseFloat(toks[i++]);
  const cubic = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => { for (let k = 0; k <= 24; k++) { const t = k / 24, u = 1 - t; pts.push([u*u*u*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3, u*u*u*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3]); } };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    if (C === 'Z') { x = sx; y = sy; continue; }
    if (C === 'M') { const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; sx = x; sy = y; pts.push([x, y]); cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { const a = num(), b = num(); x = rel ? x + a : a; y = rel ? y + b : b; pts.push([x, y]); }
    else if (C === 'H') { const a = num(); x = rel ? x + a : a; pts.push([x, y]); }
    else if (C === 'V') { const a = num(); y = rel ? y + a : a; pts.push([x, y]); }
    else if (C === 'C') { const v = [num(), num(), num(), num(), num(), num()]; const w = rel ? [x + v[0], y + v[1], x + v[2], y + v[3], x + v[4], y + v[5]] : v; cubic(x, y, w[0], w[1], w[2], w[3], w[4], w[5]); x = w[4]; y = w[5]; }
    else throw new Error(`unsupported path command ${cmd}`);
  }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
const transformOf = (t: string | null) => { const tr = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(t ?? ''), sc = /scale\(\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+))?\s*\)/.exec(t ?? ''); return { tx: tr ? +tr[1] : 0, ty: tr ? +tr[2] : 0, sx: sc ? +sc[1] : 1, sy: sc ? +(sc[2] ?? sc[1]) : 1 }; };

// ---- the page -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
function open(h: string = html) {
  const stub = audioStub(); const errors: string[] = [];
  const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  win.AudioContext = stub.Ctx; win.Float32Array = Float32Array;
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!;
  win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document;
  const key = (midi: number) => doc.querySelector(`.key[data-midi="${midi}"]`);
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const cls = (midi: number): string[] => [...key(midi).classList];
  const heads = () => [...doc.querySelectorAll('#staff .head')].map((e: any) => +e.getAttribute('cy'));
  return { win, doc, stub, errors, key, press: (m: number) => click(key(m)), click, cls, heads, tuneButton: (id: string) => doc.getElementById(`tune-${id}`), play: doc.getElementById('play') };
}
function pageFailures(h: string): string[] {
  const bad: string[] = []; const ok = (what: string, cond: unknown) => { if (!cond) bad.push(what); };
  const g = pure(scriptOf(h)); const p = open(h);
  ok('loads clean', p.errors.length === 0);
  ok('32 keys C3..G5', p.doc.querySelectorAll('.key').length === 32 && !!p.key(48) && !!p.key(79) && !p.key(80));
  ok('three buttons only: the two tunes and Play (no tabs, no dropdown, no Back to start, no break)', [...p.doc.querySelectorAll('button')].map((b: any) => b.textContent.trim()).join('|') === 'Amazing Grace|Bach: Cello Suite 1|Play' && p.doc.querySelectorAll('select, input, [role="tab"]').length === 0);
  ok('opens on Amazing Grace at its own start (D4), nothing playing', p.tuneButton('grace').getAttribute('aria-pressed') === 'true' && p.tuneButton('bwv1007').getAttribute('aria-pressed') === 'false' && p.cls(62).includes('startkey') && p.stub.all.length === 0);
  ok('the start key is highlighted, the other tune notes lightly (G4 B4 A4 E4 D5), the rest plain', [67, 71, 69, 64, 74].every((m) => p.cls(m).includes('tunenote')) && !p.cls(60).includes('tunenote') && p.doc.querySelectorAll('.key.startkey').length === 1);
  ok('keys that would push a note off the strip are dimmed with a reason (Amazing Grace: 68..79, twelve keys) and the rest are not', [68, 70, 79].every((m) => p.cls(m).includes('dim') && /Too high/.test(p.key(m).getAttribute('title'))) && [48, 60, 67].every((m) => !p.cls(m).includes('dim')) && p.doc.querySelectorAll('.key.dim').length === 12);
  ok('every key has an aria-label; a dimmed one is aria-disabled', [...p.doc.querySelectorAll('.key')].every((k: any) => k.getAttribute('aria-label')) && p.key(70).getAttribute('aria-disabled') === 'true');
  ok('the staff: TWO systems (two clefs, ten staff lines), the time signature 3 over 4 once, sixteen heads at the start', p.doc.querySelectorAll('#staff .clef').length === 2 && p.doc.querySelectorAll('#staff .staffline').length === 10 && [...p.doc.querySelectorAll('#staff .timesig')].map((e: any) => e.textContent).join('') === '34' && p.heads().length === 16);
  ok('bar lines are drawn: six inside Amazing Grace plus the double final bar (two lines)', p.doc.querySelectorAll('#staff .barline').length === 8);
  ok('half notes are open heads (8 of the 16), the rest filled', p.doc.querySelectorAll('#staff .head.open').length === 7 && p.doc.querySelectorAll('#staff .head').length === 16);
  const before = p.heads().join(), viewBox = p.doc.getElementById('staff').getAttribute('viewBox');
  p.press(55);                                                                                // G3: the tune moves down a fifth...
  ok('pressing a key moves the tune so it starts there: the start key, the staff and the label follow; it is SILENT', p.cls(55).includes('startkey') && !p.cls(62).includes('startkey') && p.heads().join() !== before && p.heads().length === 16 && /^starts on G \(octave 3\)$/.test(p.doc.getElementById('start').textContent) && p.stub.all.length === 0);
  ok('the staff drawing keeps its size when the tune moves (the page never jumps)', p.doc.getElementById('staff').getAttribute('viewBox') === viewBox);
  const placed = g.placeTune(g.TUNES[0], 55);
  ok('the keys lit are exactly the moved tune', [...p.doc.querySelectorAll('.key.startkey, .key.tunenote')].map((k: any) => +k.getAttribute('data-midi')).sort((a: number, b: number) => a - b).join() === [...new Set(placed)].sort((a: number, b: number) => a - b).join());
  p.press(70);
  ok('a dimmed key does nothing: the tune stays', p.cls(55).includes('startkey') && p.stub.all.length === 0);
  p.play.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
  ok('Play sounds the MOVED tune, sixteen notes, from the start key, in the tune\'s own rhythm', JSON.stringify(p.stub.osc.map((x) => +x.toFixed(2))) === JSON.stringify(placed.map((m: number) => +g.midiToHz(m).toFixed(2))) && p.stub.all.length === 16 * 20 && JSON.stringify(p.stub.times.map((t) => +t.toFixed(2))) === JSON.stringify(g.planPlay(g.TUNES[0], 55).map((n: any) => +n.when.toFixed(2))));
  p.click(p.tuneButton('bwv1007'));
  ok('the second tune opens at ITS start (G3), 64 heads, 4/4, its own dimming (starts above D4 are off: 63..79, seventeen keys)', p.tuneButton('bwv1007').getAttribute('aria-pressed') === 'true' && p.cls(55).includes('startkey') && p.heads().length === 64 && p.cls(63).includes('dim') && !p.cls(62).includes('dim') && p.doc.querySelectorAll('.key.dim').length === 17 && [...p.doc.querySelectorAll('#staff .timesig')].map((e: any) => e.textContent).join('') === '44');
  ok('Bach has bar lines: two inside plus the double final bar, and its sixteenths are beamed', p.doc.querySelectorAll('#staff .barline').length === 4 && p.doc.querySelectorAll('#staff .beam').length === 32);
  p.press(48);
  const ledgers = p.doc.querySelectorAll('#staff .ledger').length, flats = [...p.doc.querySelectorAll('#staff .acc')].map((e: any) => e.textContent);
  ok('Bach starting on C3 (a move of seven half steps down): its lowest notes are on ledger lines (the staff shows them), every note is a white key so there is no accidental, and it keeps its 64 heads', ledgers > 0 && flats.length === 0 && p.heads().length === 64 && p.cls(48).includes('startkey'));
  p.press(49);
  ok('a start on D-flat3: the notes written with flats show a flat sign, once a bar', [...p.doc.querySelectorAll('#staff .acc')].length > 0 && [...p.doc.querySelectorAll('#staff .acc')].every((e: any) => e.textContent === '\u266D' || e.textContent === '\u266E') && /D flat/.test(p.doc.getElementById('start').textContent));
  p.key(52).dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  ok('a key is operated by Enter too', p.cls(52).includes('startkey'));
  ok('no error', p.errors.length === 0);
  return bad;
}
test('the page in a DOM: two tunes, the strip C3..G5, a key moves the tune silently (staff, label and lit keys follow, the drawing keeps its size), dimmed keys with a reason do nothing, Play sounds the moved tune in its own rhythm, bar lines, beams, Enter operates a key', () => {
  assert.deepEqual(pageFailures(html), []);
});

function clefFailures(h: string): string[] {
  const bad: string[] = []; const p = open(h), doc = p.doc;
  const lines = [...doc.querySelectorAll('#staff .staffline')].map((l: any) => +l.getAttribute('y1')).sort((a: number, b: number) => a - b);       // top to bottom: the two systems, five lines each
  const clefs = [...doc.querySelectorAll('#staff .clef')];
  if (lines.length !== 10) bad.push(`ten staff lines (two systems), got ${lines.length}`);
  if (clefs.length !== 2) { bad.push(`one clef per system, got ${clefs.length}`); return bad; }
  const staffH = +/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(doc.getElementById('staff').outerHTML)![1];
  clefs.forEach((cl: any, sysI: number) => {
    const ls = lines.slice(sysI * 5, sysI * 5 + 5).sort((a: number, b: number) => b - a);       // bottom line first (largest y)
    const d = cl.getAttribute('d') ?? '', t = transformOf(cl.getAttribute('transform'));
    const space = (ls[0] - ls[4]) / 4, gLine = ls[1]; const b = pathBBox(d);
    const ys = [t.ty + t.sy * b.minY, t.ty + t.sy * b.maxY], top = Math.min(...ys), bottom = Math.max(...ys);
    if (Math.abs(t.ty - gLine) > 1) bad.push(`system ${sysI}: the clef's origin is at y=${t.ty}, the G line is at ${gLine}`);
    if (bottom < ls[0] + 1.5 * space - 1) bad.push(`system ${sysI}: the tail ends ${((bottom - ls[0]) / space).toFixed(2)} spaces below the bottom line, wants at least 1.5`);
    if (top > ls[4] - 1.25 * space) bad.push(`system ${sysI}: the top reaches ${((ls[4] - top) / space).toFixed(2)} spaces above the top line, wants at least 1.25`);
    if ((bottom - top) / space < 6.5 || (bottom - top) / space > 7.5) bad.push(`system ${sysI}: height ${((bottom - top) / space).toFixed(2)} spaces, wants about 7`);
    if (cl.tagName.toLowerCase() !== 'path' || /font-family|<text/i.test(cl.outerHTML)) bad.push('the clef is an outline path, not text in a font');
    const sx = t.tx + t.sx * b.minX, sxr = t.tx + t.sx * b.maxX; if (sx < 0 || sxr > 26) bad.push(`system ${sysI}: the clef (${sx}..${sxr}) must sit left of the time signature (26) and inside the staff`);
    if (top < sysI * 80 - 1 || bottom > staffH + 1) bad.push(`system ${sysI}: the clef (${top.toFixed(1)}..${bottom.toFixed(1)}) leaves the staff drawing (0..${staffH})`);
  });
  if (!/Bravura/.test(h) || !/OFL|SIL Open Font/i.test(h)) bad.push('the outline names its source (Bravura) and licence (OFL) in a comment');
  return bad;
}
test('the clef is a real treble clef (as in 1199) on EACH of the two systems: the Bravura outline anchored on the G line, from 1.5 spaces below the bottom line to above the top line, about 7 spaces tall, left of the time signature and inside the drawing', () => {
  assert.deepEqual(clefFailures(html), []);
});
test('PIXELS: no margin or padding on html and body, no wrapper with padding, no fixed page height, both drawings sized by their viewBox and fluid up to 560 px', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
  assert.match(css, /html,\s*body\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/);
  assert.doesNotMatch(css, /\.wrap|body\s*\{[^}]*(?:min-)?height/);
  assert.match(css, /svg \{[^}]*width: 100%; max-width: 560px; height: auto/);
});
test('CONTROL: a move that changes an interval, an allowed start that lets a note off the strip, a staff position off by one, a bar line in the wrong place, a beam that is not drawn, a clef off the G line, a bare key that plays each go red', () => {
  assert.deepEqual(coreFailures(pure()), []); assert.deepEqual(pageFailures(html), []); assert.deepEqual(clefFailures(html), []);
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `premise: ${from}`); return html.replace(from, to); };
  assert.ok(coreFailures(pure(scriptOf(damaged('return m + d;', 'return m + d + (m > tune.notes[0] ? 1 : 0);')))).length > 0, 'the move changes an interval');
  assert.ok(coreFailures(pure(scriptOf(damaged('Math.max.apply(null, p) <= hi', 'true')))).length > 0, 'the top is not checked');
  assert.ok(coreFailures(pure(scriptOf(damaged('LETTER_STEP[plainName(m).charAt(0)] - 30', 'LETTER_STEP[plainName(m).charAt(0)] - 31')))).length > 0, 'staff position off by one');
  assert.ok(coreFailures(pure(scriptOf(damaged('barStarts: [1, 4, 6, 8, 10, 13, 15]', 'barStarts: [1, 4, 6, 9, 10, 13, 15]')))).length > 0, 'a bar line in the wrong place');
  assert.ok(coreFailures(pure(scriptOf(damaged('if (acc[key] !== "flat") { sign = "flat"; acc[key] = "flat"; }', 'sign = "flat";')))).length > 0, 'an accidental repeated inside a bar');
  assert.ok(coreFailures(pure(scriptOf(damaged('level: beats < 0.5 ? 2 : beats < 1 ? 1 : 0', 'level: 0')))).length > 0, 'beams without a level');
  assert.ok(pageFailures(damaged('function press(m) { if (whyNot(tune, m, LOW, HIGH) !== null) return; start = m; render(); }', 'function press(m) { start = m; render(); }')).length > 0, 'a dimmed key moves the tune');
  assert.ok(pageFailures(damaged('function press(m) { if (whyNot(tune, m, LOW, HIGH) !== null) return; start = m; render(); }', 'function press(m) { if (whyNot(tune, m, LOW, HIGH) !== null) return; start = m; render(); $("play").click(); }')).length > 0, 'a key press plays');
  assert.ok(clefFailures(damaged('yOf(2, s) + ") scale(" + CLEF_SCALE', 'yOf(0, s) + ") scale(" + CLEF_SCALE')).length > 0, 'the clef off the G line');
});
