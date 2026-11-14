// 2026-11-13-1215 - GADGET 2, tune_shifter.html: "move the tune". Two tunes (Amazing Grace, Bach BWV 1007 bars 1-2), a piano strip C3..C5 in which pressing a key makes the tune START on it, a treble staff above showing the notes at the
// current position, Play. The pure functions (placeTune, allowedStarts, the staff placement against a table of known notes, the clef geometry) and the page in a DOM; expected values are published rules and lists, not read back from the page.
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

const GRACE = [62, 67, 71, 67, 71, 69, 67, 64, 62];                                         // D4 G4 B4 G4 B4 A4 G4 E4 D4 (the prompt's list; Mutopia "New Britain", public domain)
const BACH = [55, 62, 71, 69, 71, 62, 71, 62, 55, 64, 72, 71, 72, 64, 72, 64];             // 1213's list: bars 1 and 2 of the Prelude
const diffs = (n: number[]) => n.slice(1).map((m, i) => m - n[i]);
// The treble-clef rule, written here independently of the page: white keys by their letter step, black keys as the FLAT of the next letter (so on that letter's position).
const WHITE_POS: Record<number, number> = { 48: -9, 50: -8, 52: -7, 53: -6, 55: -5, 57: -4, 59: -3, 60: -2, 62: -1, 64: 0, 65: 1, 67: 2, 69: 3, 71: 4, 72: 5 };
const FLAT_POS: Record<number, number> = { 49: -8, 51: -7, 54: -5, 56: -4, 58: -3, 61: -1, 63: 0, 66: 2, 68: 3, 70: 4 };       // D-flat3, E-flat3, G-flat3, A-flat3, B-flat3, D-flat4, E-flat4, G-flat4, A-flat4, B-flat4

function coreFailures(g: any): string[] {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  eq('the two tunes, in order', g.TUNES.map((t: any) => [t.id, t.title, t.notes]), [['grace', 'Amazing Grace', GRACE], ['bwv1007', 'Bach: Cello Suite No. 1, Prelude (bars 1-2)', BACH]]);
  eq('steps: Amazing Grace the Shift tab\'s 0.45 s, Bach 0.2 s', g.TUNES.map((t: any) => t.step), [0.45, 0.2]);
  eq('the strip is C3..C5', [g.LOW, g.HIGH], [48, 72]);
  for (const t of g.TUNES) {
    const base = diffs(t.notes);
    const allowed = g.allowedStarts(t, 48, 72);
    // the allowed starts, from the arithmetic of the range (independent): the lowest note may not go under 48, the highest not over 72
    const lo = Math.min(...t.notes), hi = Math.max(...t.notes), first = t.notes[0];
    const want: number[] = []; for (let s = 48; s <= 72; s++) if (lo + (s - first) >= 48 && hi + (s - first) <= 72) want.push(s);
    eq(`${t.id}: allowedStarts`, allowed, want);
    if (allowed.length < 8) bad.push(`${t.id}: only ${allowed.length} allowed starts: the invariance was barely tested`);
    for (let s = 40; s <= 80; s++) {
      const placed = g.placeTune(t, s);
      eq(`${t.id}: the first note is the start (${s})`, placed[0], s);
      eq(`${t.id}: the intervals are identical at start ${s}`, diffs(placed), base);                // EVERY start, allowed or not: the move never changes an interval
      eq(`${t.id}: a start is allowed exactly when whyNot says null (${s})`, [s >= 48 && s <= 72 && allowed.includes(s), s >= 48 && s <= 72 ? g.whyNot(t, s, 48, 72) === null : null], [s >= 48 && s <= 72 && allowed.includes(s), s >= 48 && s <= 72 ? allowed.includes(s) : null]);
    }
    eq(`${t.id}: tuneIntervals`, g.tuneIntervals(t.notes), base);
    eq(`${t.id}: placeTune does not change its tune`, [t.notes.slice(), g.placeTune(t, 55) && t.notes], [t.notes, t.notes]);
  }
  eq('Amazing Grace may start on any key C3..D#4/E-flat4 (48..63)', g.allowedStarts(g.TUNES[0], 48, 72), [...Array(16)].map((_, i) => 48 + i));
  eq('Bach may start on 48..55 (shifts -7..0), as in the Shift tab', g.allowedStarts(g.TUNES[1], 48, 72), [...Array(8)].map((_, i) => 48 + i));
  eq('why a key is off', [g.whyNot(g.TUNES[0], 64, 48, 72), g.whyNot(g.TUNES[1], 56, 48, 72), g.whyNot(g.TUNES[0], 47, 48, 72), g.whyNot(g.TUNES[0], 60, 48, 72)], ['Too high: the tune would go above C5', 'Too high: the tune would go above C5', 'Too low: the tune would go below C3', null]);
  // the staff: every key C3..C5 against the table, ledger lines, flats
  for (const [m, pos] of Object.entries({ ...WHITE_POS, ...FLAT_POS })) eq(`staffPos(${m})`, g.staffPos(+m), pos);
  eq('ledger lines: middle C one, D4 none, A3 two, C3 four, B3 one, E4 and the top none', [-2, -1, -4, -9, -3, 0, 5].map((p) => g.ledgerPositions(p)), [[-2], [], [-2, -4], [-2, -4, -6, -8], [-2], [], []]);
  eq('flats for black keys, never sharps', [49, 61, 66, 70].map((m) => g.plainName(m)), ['D-flat', 'D-flat', 'G-flat', 'B-flat']);
  eq('isBlack', [...Array(25)].map((_, i) => g.isBlack(48 + i)).filter(Boolean).length, 10);
  const lay = g.staffLayout(BACH);
  eq('layout: one head per note, left to right, y from the position, a flat exactly on the black keys', [lay.length, lay.every((n: any, i: number) => i === 0 || n.x > lay[i - 1].x), lay.every((n: any) => n.y === g.yOf(n.pos)), lay.filter((n: any) => n.flat).length], [16, true, true, 0]);
  eq('Bach moved down 3 (starting on E3) has a flat exactly on the notes that land on black keys (by the table), and Bach on C3 has notes on four ledger lines', [g.staffLayout(g.placeTune(g.TUNES[1], 52)).filter((n: any) => n.flat).length, g.staffLayout(g.placeTune(g.TUNES[1], 48)).some((n: any) => n.ledger.length === 4)], [g.placeTune(g.TUNES[1], 52).filter((m: number) => m in FLAT_POS).length, true]);
  eq('the heads fit the width', lay.every((n: any) => n.x + 6 < g.SC.width), true);
  const plan = g.planPlay(g.TUNES[1], 53);
  eq('Play: Bach at its 0.2 s step, equal short notes, the last longer', [plan.length, +plan[1].when.toFixed(2), new Set(plan.slice(0, 15).map((n: any) => +n.dur.toFixed(2))).size, +plan[15].dur.toFixed(2)], [16, 0.2, 1, 0.4]);
  eq('Play: the pitches are the moved tune', plan.map((n: any) => n.midi), g.placeTune(g.TUNES[1], 53));
  eq('Play: Amazing Grace at 0.45 s', [+g.planPlay(g.TUNES[0], 62)[1].when.toFixed(2), +g.planPlay(g.TUNES[0], 62)[8].dur.toFixed(2)], [0.45, 0.9]);
  return bad;
}
test('pure functions: placeTune keeps every interval at EVERY start for both tunes, allowedStarts, why a key is off, the staff position of every key C3..C5 (flats), ledger lines, the layout, what Play sounds', () => {
  assert.deepEqual(coreFailures(pure()), []);
  assert.match(html, /NOT Hey Jude/, 'the tune list says Hey Jude is not there');
  assert.match(html, /Mutopia/); assert.match(html, /New Britain|NEW BRITAIN/); assert.match(html, /BWV 1007/); assert.doesNotMatch(html.replace(/NOT Hey Jude[^\n]*/g, ''), /Hey Jude/i);
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
  ok('25 keys C3..C5', p.doc.querySelectorAll('.key').length === 25 && !!p.key(48) && !!p.key(72));
  ok('three buttons only: the two tunes and Play (no tabs, no dropdown, no Back to start, no break)', [...p.doc.querySelectorAll('button')].map((b: any) => b.textContent.trim()).join('|') === 'Amazing Grace|Bach: Cello Suite 1|Play' && p.doc.querySelectorAll('select, input, [role="tab"]').length === 0);
  ok('opens on Amazing Grace at its own start (D4), nothing playing', p.tuneButton('grace').getAttribute('aria-pressed') === 'true' && p.tuneButton('bwv1007').getAttribute('aria-pressed') === 'false' && p.cls(62).includes('startkey') && p.stub.all.length === 0);
  ok('the start key is highlighted, the other tune notes lightly (G4 B4 A4 E4), the rest plain', [67, 71, 69, 64].every((m) => p.cls(m).includes('tunenote')) && !p.cls(60).includes('tunenote') && p.doc.querySelectorAll('.key.startkey').length === 1);
  ok('keys that would push a note off the strip are dimmed with a reason (Amazing Grace: 64..72) and the rest are not', [64, 65, 72].every((m) => p.cls(m).includes('dim') && /Too high/.test(p.key(m).getAttribute('title'))) && [48, 60, 63].every((m) => !p.cls(m).includes('dim')) && p.doc.querySelectorAll('.key.dim').length === 9);
  ok('every key has an aria-label; a dimmed one is aria-disabled', [...p.doc.querySelectorAll('.key')].every((k: any) => k.getAttribute('aria-label')) && p.key(70).getAttribute('aria-disabled') === 'true');
  ok('the staff: a clef, five lines, nine heads, the notes at D4 G4 B4 ...', p.doc.querySelectorAll('#staff .clef').length === 1 && p.doc.querySelectorAll('#staff .staffline').length === 5 && p.heads().length === 9);
  const before = p.heads().join();
  p.press(55);                                                                                // G3: the tune moves down a fifth...
  ok('pressing a key moves the tune so it starts there: the start key, the staff and the label follow; it is SILENT', p.cls(55).includes('startkey') && !p.cls(62).includes('startkey') && p.heads().join() !== before && p.heads().length === 9 && /^starts on G \(octave 3\)$/.test(p.doc.getElementById('start').textContent) && p.stub.all.length === 0);
  const placed = g.placeTune(g.TUNES[0], 55);
  ok('the keys lit are exactly the moved tune', [...p.doc.querySelectorAll('.key.startkey, .key.tunenote')].map((k: any) => +k.getAttribute('data-midi')).sort((a: number, b: number) => a - b).join() === [...new Set(placed)].sort((a: number, b: number) => a - b).join());
  p.press(70);
  ok('a dimmed key does nothing: the tune stays', p.cls(55).includes('startkey') && p.stub.all.length === 0);
  p.play.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
  ok('Play sounds the MOVED tune, nine notes, from the start key', JSON.stringify(p.stub.osc.map((x) => +x.toFixed(2))) === JSON.stringify(placed.map((m: number) => +g.midiToHz(m).toFixed(2))) && p.stub.all.length === 9 * 20);
  p.click(p.tuneButton('bwv1007'));
  ok('the second tune opens at ITS start (G3), 16 heads, its own dimming (starts above D#3/E-flat... 56 and up are off)', p.tuneButton('bwv1007').getAttribute('aria-pressed') === 'true' && p.cls(55).includes('startkey') && p.heads().length === 16 && p.cls(56).includes('dim') && !p.cls(55).includes('dim') && p.doc.querySelectorAll('.key.dim').length === 17);
  p.press(48);
  const ledgers = p.doc.querySelectorAll('#staff .ledger').length, flats = [...p.doc.querySelectorAll('#staff .acc')].map((e: any) => e.textContent);
  ok('Bach starting on C3: its lowest notes are on ledger lines (the staff shows them) and it has no flats there', ledgers > 0 && flats.length === 0 && p.heads().length === 16 && p.cls(48).includes('startkey'));
  p.press(49);
  ok('a start on D-flat3: a black key start is allowed for Bach (49 <= 55) and the notes written with flats show a flat sign', p.cls(49).includes('startkey') && [...p.doc.querySelectorAll('#staff .acc')].length > 0 && [...p.doc.querySelectorAll('#staff .acc')].every((e: any) => e.textContent === '♭') && /D flat/.test(p.doc.getElementById('start').textContent));
  p.key(52).dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  ok('a key is operated by Enter too', p.cls(52).includes('startkey'));
  ok('no error', p.errors.length === 0);
  return bad;
}
test('the page in a DOM: two tunes, the strip, a key moves the tune silently (staff, label and lit keys follow), dimmed keys with a reason do nothing, Play sounds the moved tune, Enter operates a key', () => {
  assert.deepEqual(pageFailures(html), []);
});

function clefFailures(h: string): string[] {
  const bad: string[] = []; const p = open(h), doc = p.doc;
  const lines = [...doc.querySelectorAll('#staff .staffline')].map((l: any) => +l.getAttribute('y1')).sort((a: number, b: number) => b - a);
  const clefs = [...doc.querySelectorAll('#staff .clef')];
  if (lines.length !== 5) bad.push(`five staff lines, got ${lines.length}`);
  if (clefs.length !== 1) { bad.push(`exactly one clef element, got ${clefs.length}`); return bad; }
  const el: any = clefs[0], d = el.getAttribute('d') ?? '', t = transformOf(el.getAttribute('transform'));
  const space = (lines[0] - lines[4]) / 4, gLine = lines[1]; const b = pathBBox(d);
  const ys = [t.ty + t.sy * b.minY, t.ty + t.sy * b.maxY], top = Math.min(...ys), bottom = Math.max(...ys);
  if (Math.abs(t.ty - gLine) > 1) bad.push(`the clef's origin is at y=${t.ty}, the G line is at ${gLine}`);
  if (bottom < lines[0] + 1.5 * space - 1) bad.push(`the tail ends ${((bottom - lines[0]) / space).toFixed(2)} spaces below the bottom line, wants at least 1.5`);
  if (top > lines[4] - 1.25 * space) bad.push(`the top reaches ${((lines[4] - top) / space).toFixed(2)} spaces above the top line, wants at least 1.25`);
  if ((bottom - top) / space < 6.5 || (bottom - top) / space > 7.5) bad.push(`height ${((bottom - top) / space).toFixed(2)} spaces, wants about 7`);
  if (el.tagName.toLowerCase() !== 'path' || /font-family|<text/i.test(el.outerHTML)) bad.push('the clef is an outline path, not text in a font');
  if (!/Bravura/.test(h) || !/OFL|SIL Open Font/i.test(h)) bad.push('the outline names its source (Bravura) and licence (OFL) in a comment');
  const sx = t.tx + t.sx * b.minX, sxr = t.tx + t.sx * b.maxX; if (sx < 0 || sxr > 38) bad.push(`the clef (${sx}..${sxr}) must sit left of the first note (38) and inside the staff`);
  const staffH = +/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(doc.getElementById('staff').outerHTML)![1];
  if (top < -1 || bottom > staffH + 1) bad.push(`the clef (${top.toFixed(1)}..${bottom.toFixed(1)}) leaves the staff drawing (0..${staffH})`);
  return bad;
}
test('the clef is a real treble clef (as in 1199): the Bravura outline anchored on the G line, from 1.5 spaces below the bottom line to above the top line, about 7 spaces tall, left of the notes and inside the drawing', () => {
  assert.deepEqual(clefFailures(html), []);
});
test('PIXELS: no margin or padding on html and body, no wrapper with padding, no fixed page height, both drawings sized by their viewBox', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
  assert.match(css, /html,\s*body\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/);
  assert.doesNotMatch(css, /\.wrap|body\s*\{[^}]*(?:min-)?height/);
  assert.match(css, /svg \{[^}]*height: auto/);
});
test('CONTROL: a move that changes an interval, an allowed start that lets a note off the strip, a staff position off by one, a clef off the G line, a bare key that plays each go red', () => {
  assert.deepEqual(coreFailures(pure()), []); assert.deepEqual(pageFailures(html), []); assert.deepEqual(clefFailures(html), []);
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `premise: ${from}`); return html.replace(from, to); };
  assert.ok(coreFailures(pure(scriptOf(damaged('return m + d;', 'return m + d + (m > tune.notes[0] ? 1 : 0);')))).length > 0, 'the move changes an interval');
  assert.ok(coreFailures(pure(scriptOf(damaged('Math.max.apply(null, p) <= hi', 'true')))).length > 0, 'the top is not checked');
  assert.ok(coreFailures(pure(scriptOf(damaged('LETTER_STEP[plainName(m).charAt(0)] - 30', 'LETTER_STEP[plainName(m).charAt(0)] - 31')))).length > 0, 'staff position off by one');
  assert.ok(pageFailures(damaged('function press(m) { if (whyNot(tune, m, LOW, HIGH) !== null) return; start = m; render(); }', 'function press(m) { start = m; render(); }')).length > 0, 'a dimmed key moves the tune');
  assert.ok(pageFailures(damaged('function press(m) { if (whyNot(tune, m, LOW, HIGH) !== null) return; start = m; render(); }', 'function press(m) { if (whyNot(tune, m, LOW, HIGH) !== null) return; start = m; render(); $("play").click(); }')).length > 0, 'a key press plays');
  assert.ok(clefFailures(damaged('"translate(5 " + yOf(2)', '"translate(5 " + yOf(0)')).length > 0, 'the clef off the G line');
});
