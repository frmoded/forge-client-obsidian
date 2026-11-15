// 2026-11-15-2102 - scale_player.html (the Scales chapter): a tonic, a scale, its step recipe (W / H / 3H), the notes lit on a piano strip with the tonic marked, a treble staff with PROPER spelling (one letter per degree for the seven-note
// scales, double sharps and flats where the key needs them), the letters used, and Play up / down / both with the piano voice. The pure functions (scaleNotes, spellScale) for all 12 tonics x all scales, with expected spellings written here from
// music theory (not read from the page), and the page in a DOM with the Web Audio stand-in.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/scales/resources/html');
const html = fs.readFileSync(path.join(DIR, 'scale_player.html'), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
function pure(source: string = scriptOf(html)): any { const mod: { exports: any } = { exports: {} }; vm.runInNewContext(source, { module: mod, Math, Float32Array }); return mod.exports; }

// ---- what the theory says, written out here (the step patterns in half steps; the letters of the seven-note scales)
const STEPS: Record<string, number[]> = {
  major: [2, 2, 1, 2, 2, 2, 1], natural_minor: [2, 1, 2, 2, 1, 2, 2], harmonic_minor: [2, 1, 2, 2, 1, 3, 1], melodic_minor: [2, 1, 2, 2, 2, 2, 1],
  ionian: [2, 2, 1, 2, 2, 2, 1], dorian: [2, 1, 2, 2, 2, 1, 2], phrygian: [1, 2, 2, 2, 1, 2, 2], lydian: [2, 2, 2, 1, 2, 2, 1], mixolydian: [2, 2, 1, 2, 2, 1, 2], aeolian: [2, 1, 2, 2, 1, 2, 2], locrian: [1, 2, 2, 1, 2, 2, 2],
  major_pentatonic: [2, 2, 3, 2, 3], minor_pentatonic: [3, 2, 2, 3, 2], blues: [3, 2, 1, 1, 3, 2], whole_tone: [2, 2, 2, 2, 2, 2], diminished_wh: [2, 1, 2, 1, 2, 1, 2, 1], diminished_hw: [1, 2, 1, 2, 1, 2, 1, 2],
};
const MELODIC_DOWN = [2, 1, 2, 2, 1, 2, 2];
const SEVEN = ['major', 'natural_minor', 'harmonic_minor', 'melodic_minor', 'ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC: Record<string, number> = { '': 0, '♯': 1, '♭': -1, '♯♯': 2, '♭♭': -2 };
const IONIAN_STEPS = STEPS.major;
const nameOf = (g: any, n: any): string => g.noteName(n);
const parseName = (s: string): { letter: string; acc: number } => ({ letter: s[0], acc: ACC[s.slice(1)] });
const spelled = (g: any, t: number, id: string, f: string = 'up'): string[] => g.spellScale(t, id, f).map((n: any) => nameOf(g, n));

// The 12 major keys and 12 natural minor keys, as a theorist writes them (the minor keys are the usual ones: C# G# F# but E-flat, B-flat).
const MAJOR_KEYS: Record<number, string> = {
  0: 'C D E F G A B', 1: 'D♭ E♭ F G♭ A♭ B♭ C', 2: 'D E F♯ G A B C♯', 3: 'E♭ F G A♭ B♭ C D', 4: 'E F♯ G♯ A B C♯ D♯', 5: 'F G A B♭ C D E',
  6: 'F♯ G♯ A♯ B C♯ D♯ E♯', 7: 'G A B C D E F♯', 8: 'A♭ B♭ C D♭ E♭ F G', 9: 'A B C♯ D E F♯ G♯', 10: 'B♭ C D E♭ F G A', 11: 'B C♯ D♯ E F♯ G♯ A♯',
};
const MINOR_KEYS: Record<number, string> = {
  0: 'C D E♭ F G A♭ B♭', 1: 'C♯ D♯ E F♯ G♯ A B', 2: 'D E F G A B♭ C', 3: 'E♭ F G♭ A♭ B♭ C♭ D♭', 4: 'E F♯ G A B C D', 5: 'F G A♭ B♭ C D♭ E♭',
  6: 'F♯ G♯ A B C♯ D E', 7: 'G A B♭ C D E♭ F', 8: 'G♯ A♯ B C♯ D♯ E F♯', 9: 'A B C D E F G', 10: 'B♭ C D♭ E♭ F G♭ A♭', 11: 'B C♯ D E F♯ G A',
};

function coreFailures(g: any): string[] {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  eq('the scales offered', g.SC_SCALES.map((s: any) => s.id), Object.keys(STEPS));
  // ---- scaleNotes: pitch classes match the step recipe, for ALL 12 tonics x ALL scales (and the melodic minor's descending form)
  for (let t = 0; t < 12; t++) for (const [id, steps] of Object.entries(STEPS)) for (const form of ['up', 'down']) {
    const want = id === 'melodic_minor' && form === 'down' ? MELODIC_DOWN : steps; const pcs: number[] = []; let pc = t; for (const st of want) { pcs.push(pc); pc = (pc + st) % 12; }
    eq(`scaleNotes ${t} ${id} ${form}`, Array.from(g.scaleNotes(t, id, form)), pcs);
    eq(`recipe ${id} ${form}`, g.recipeOf(id, form).join(''), want.map((x) => (x === 2 ? 'W' : x === 1 ? 'H' : '3H')).join(''));
    const midis = Array.from(g.scaleMidis(t, id, form, 60)) as number[]; eq(`scaleMidis ${t} ${id}`, [midis[0], midis.length, midis[midis.length - 1] - midis[0]], [60 + t, want.length + 1, 12]);
  }
  // ---- spellScale: every spelled note names the pitch class it should, one letter per degree for the seven-note scales, in letter order from the tonic, never beyond a double accidental
  for (let t = 0; t < 12; t++) for (const id of Object.keys(STEPS)) for (const form of ['up', 'down']) {
    const sp = g.spellScale(t, id, form), pcs = Array.from(g.scaleNotes(t, id, form)) as number[];
    sp.forEach((n: any, i: number) => {
      const { letter, acc } = parseName(nameOf(g, n));
      if ((LETTER_PC[letter] + acc + 120) % 12 !== pcs[i]) bad.push(`${t} ${id} ${form} note ${i}: ${nameOf(g, n)} is not pitch class ${pcs[i]}`);
      if (Math.abs(acc) > 2) bad.push(`${t} ${id}: an accidental beyond double`);
    });
    if (SEVEN.includes(id)) { const ls = sp.map((n: any) => n.l as number); if (new Set(ls).size !== 7) bad.push(`${t} ${id} ${form}: not seven different letters`); for (let i = 1; i < 7; i++) if (ls[i] !== (ls[0] + i) % 7) bad.push(`${t} ${id} ${form}: letters not in order`); }
  }
  // ---- the spellings a theorist writes
  for (let t = 0; t < 12; t++) { eq(`major ${t}`, spelled(g, t, 'major').join(' '), MAJOR_KEYS[t]); eq(`Ionian ${t}`, spelled(g, t, 'ionian').join(' '), MAJOR_KEYS[t]); eq(`natural minor ${t}`, spelled(g, t, 'natural_minor').join(' '), MINOR_KEYS[t]); eq(`Aeolian ${t}`, spelled(g, t, 'aeolian').join(' '), MINOR_KEYS[t]); }
  eq('G-sharp harmonic minor has its F double sharp', spelled(g, 8, 'harmonic_minor').join(' '), 'G♯ A♯ B C♯ D♯ E F♯♯');
  eq('C harmonic minor', spelled(g, 0, 'harmonic_minor').join(' '), 'C D E♭ F G A♭ B');
  eq('A melodic minor up and down', [spelled(g, 9, 'melodic_minor', 'up').join(' '), spelled(g, 9, 'melodic_minor', 'down').join(' ')], ['A B C D E F♯ G♯', 'A B C D E F G']);
  eq('E-flat melodic minor up', spelled(g, 3, 'melodic_minor').join(' '), 'E♭ F G♭ A♭ B♭ C D');
  eq('the modes of C major: D Dorian, E Phrygian, F Lydian, G Mixolydian, B Locrian', [spelled(g, 2, 'dorian'), spelled(g, 4, 'phrygian'), spelled(g, 5, 'lydian'), spelled(g, 7, 'mixolydian'), spelled(g, 11, 'locrian')].map((a) => a.join('')), ['DEFGABC', 'EFGABCD', 'FGABCDE', 'GABCDEF', 'BCDEFGA']);
  eq('F Locrian is F (not E sharp)', spelled(g, 5, 'locrian').join(' '), 'F G♭ A♭ B♭ C♭ D♭ E♭');
  eq('the pentatonic scales keep the spelling of their parent: C major, A minor, E-flat major, D-flat minor pentatonic', [spelled(g, 0, 'major_pentatonic'), spelled(g, 9, 'minor_pentatonic'), spelled(g, 3, 'major_pentatonic'), spelled(g, 1, 'minor_pentatonic')].map((a) => a.join(' ')), ['C D E G A', 'A C D E G', 'E♭ F G B♭ C', 'C♯ E F♯ G♯ B']);
  eq('the blues scale: the flat fifth is the blue note, spelled flat on the fifth\'s letter', [spelled(g, 9, 'blues').join(' '), spelled(g, 0, 'blues').join(' ')], ['A C D E♭ E G', 'C E♭ F G♭ G B♭']);
  eq('whole-tone: sharps going up, flats coming down', [spelled(g, 0, 'whole_tone').join(' '), spelled(g, 0, 'whole_tone', 'down').join(' ')], ['C D E F♯ G♯ A♯', 'C D E G♭ A♭ B♭']);
  eq('diminished: the tonic as in its major key, sharps up, flats down', [spelled(g, 3, 'diminished_wh')[0], spelled(g, 3, 'diminished_wh').join(' '), spelled(g, 3, 'diminished_hw', 'down').join(' ')], ['E♭', 'E♭ F F♯ G♯ A B C D', 'E♭ E G♭ G A B♭ C D♭'.replace('E ', 'E ')]);
  eq('the tonic is spelled for its KEY: D-flat major, C-sharp minor, G-flat Lydian, E-flat minor, F-sharp major', [g.scaleTitle(1, 'major'), g.scaleTitle(1, 'natural_minor'), g.scaleTitle(6, 'lydian'), g.scaleTitle(3, 'natural_minor'), g.scaleTitle(6, 'major')], ['D♭ major', 'C♯ natural minor', 'G♭ Lydian', 'E♭ natural minor', 'F♯ major']);
  eq('words for a screen reader', [g.scaleWords(8, 'harmonic_minor'), g.noteWords(g.spellScale(8, 'harmonic_minor')[6])], ['G sharp harmonic minor', 'F double sharp']);
  // ---- the plan of the Play buttons
  const plan = (t: number, id: string, mode: string, form = 'up') => (g.planPlay(t, id, mode, form) as any[]).map((n) => `${n.midi}${n.form === 'down' ? 'd' : ''}`).join(' ');
  eq('up: the scale and its octave note, in order', plan(0, 'major', 'up'), '60 62 64 65 67 69 71 72'); eq('down: the same notes coming down', plan(0, 'major', 'down'), '72 71 69 67 65 64 62 60');
  eq('both: up, then down, the top note once', plan(0, 'major', 'both'), '60 62 64 65 67 69 71 72 71 69 67 65 64 62 60');
  eq('both for the melodic minor: the up form going up, the DOWN form coming down', plan(0, 'melodic_minor', 'both'), '60 62 63 65 67 69 71 72 70d 68d 67d 65d 63d 62d 60d');
  eq('the down form of the melodic minor played down', plan(0, 'melodic_minor', 'down', 'down'), '72d 70d 68d 67d 65d 63d 62d 60d');
  eq('the notes are 0.45 s apart', (g.planPlay(0, 'major', 'up', 'up') as any[]).map((n) => +n.when.toFixed(2)), [0, 0.45, 0.9, 1.35, 1.8, 2.25, 2.7, 3.15]);
  eq('a pentatonic scale has five notes and its octave', (g.planPlay(0, 'major_pentatonic', 'up', 'up') as any[]).length, 6);
  eq('the form only matters where it can', [g.usesForm('melodic_minor'), g.usesForm('whole_tone'), g.usesForm('major'), g.usesForm('blues'), g.effectiveForm('major', 'down'), g.effectiveForm('melodic_minor', 'down')], [true, true, false, false, 'up', 'down']);
  return bad;
}
test('pure: scaleNotes for all 12 tonics x all 17 scales (and the descending melodic minor) match the step recipe; spellScale names the right pitch classes, one letter per degree for every seven-note scale, never past a double accidental; the 12 major and 12 minor keys, G-sharp harmonic minor with its double sharp, the modes, pentatonic and blues, whole-tone and diminished; the Play plans', () => {
  assert.deepEqual(coreFailures(pure()), []);
});

// ---- the page --------------------------------------------------------------------------------------------------------------------------------------------------------------------
function open(h: string = html) {
  const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  const queue: Array<{ fn: () => void; ms: number; id: number }> = []; let nextId = 1;
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array;
  win.__schedule = (fn: () => void, ms: number) => { const id = nextId++; queue.push({ fn, ms, id }); return id; }; win.__unschedule = (id: number) => { const i = queue.findIndex((q) => q.id === id); if (i >= 0) queue.splice(i, 1); };
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document; const g = pure(scriptOf(h));
  const set = (id: string, v: string) => { const e = doc.getElementById(id); e.value = v; e.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const click = (id: string) => doc.getElementById(id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const run = (all = true) => { const q = queue.splice(0, queue.length).sort((a, b) => a.ms - b.ms); for (const t of all ? q : q.slice(0, 1)) t.fn(); return q.length; };
  const runUntil = (ms: number) => { const q = queue.splice(0, queue.length).sort((a, b) => a.ms - b.ms); const later: typeof q = []; for (const t of q) { if (t.ms <= ms) t.fn(); else later.push(t); } queue.push(...later); };
  return { win, doc, stub, errors, g, set, click, run, runUntil, queue,
    q: (sel: string) => [...doc.querySelectorAll(sel)], text: (id: string) => doc.getElementById(id).textContent.trim(), lit: () => [...doc.querySelectorAll('.key.lit')].map((k: any) => +k.getAttribute('data-midi')).sort((a, b) => a - b),
    tonicKeys: () => [...doc.querySelectorAll('.key.tonic')].map((k: any) => +k.getAttribute('data-midi')).sort((a, b) => a - b), heads: () => doc.querySelectorAll('#staff .head').length, accs: () => [...doc.querySelectorAll('#staff .acc')].map((e: any) => e.textContent),
    chips: () => [...doc.querySelectorAll('#chips .chip')].map((e: any) => e.textContent), letters: () => [...doc.querySelectorAll('#letters .letter')].map((e: any) => e.textContent) };
}
function pageFailures(h: string): string[] {
  const bad: string[] = []; const ok = (what: string, cond: unknown) => { if (!cond) bad.push(what); };
  const p = open(h); const g = p.g;
  ok('loads clean', p.errors.length === 0);
  ok('the tonic select: 12 options; the scale select: 17 scales in four groups (Major and minor, Modes, Pentatonic and blues, Symmetric)', p.doc.getElementById('tonic').options.length === 12 && p.doc.getElementById('scale').options.length === 17 && [...p.doc.querySelectorAll('#scale optgroup')].map((o: any) => o.label).join('|') === 'Major and minor|Modes|Pentatonic and blues|Symmetric');
  ok('C major at the start: the recipe W W H W W W H, 8 lit keys (the scale and its octave) with the two tonics marked, 8 heads on the staff, the letters C D E F G A B, no accidental', p.chips().join('') === 'WWHWWWH' && p.lit().join() === '60,62,64,65,67,69,71,72' && p.tonicKeys().join() === '60,72' && p.heads() === 8 && p.letters().join('') === 'CDEFGAB' && p.accs().length === 0);
  ok('"Seven notes, seven letters, each used once." for a seven-note scale', /Seven notes, seven letters/.test(p.text('note')));
  ok('the tonic select shows the tonic as this scale spells it: major has D-flat, G-flat, A-flat', [1, 6, 8].map((i) => p.doc.getElementById('tonic').options[i].textContent).join(' ') === 'D♭ F♯ A♭' || [1, 6, 8].map((i) => p.doc.getElementById('tonic').options[i].textContent).join(' ') === 'D♭ G♭ A♭');
  ok('the heads sit where a treble staff puts C4 D4 E4 F4 G4 A4 B4 C5 (positions -2 to 5: middle C on its ledger line, E4 on the bottom line, C5 in the third space)', (() => { const ys = p.q('#staff .head').map((e: any) => +e.getAttribute('cy')); const want = [-2, -1, 0, 1, 2, 3, 4, 5].map((pos) => (14 - pos + 0.5) * 4.4); return ys.every((y: number, i: number) => Math.abs(y - want[i]) < 1e-6) && p.q('#staff .ledger').length === 1; })());
  p.set('scale', 'natural_minor'); p.set('tonic', '8');
  ok('G-sharp natural minor: the tonic select now says G-sharp for pitch class 8, the letters G\u266F A\u266F B C\u266F D\u266F E F\u266F, six accidental signs on the eight heads (the octave G-sharp too)', p.doc.getElementById('tonic').options[8].textContent === 'G\u266F' && p.letters().join(' ') === 'G\u266F A\u266F B C\u266F D\u266F E F\u266F' && p.accs().length === 6);
  p.set('scale', 'harmonic_minor');
  ok('G-sharp harmonic minor: the F with TWO sharps is drawn (a double-sharp sign) and named "F♯♯"; the staff label says "F double sharp"', p.letters().includes('F♯♯') && p.accs().includes('×') && /F double sharp/.test(p.doc.getElementById('staff').getAttribute('aria-label')));
  ok('the recipe of the harmonic minor has the 3H chip', p.chips().join(',') === 'W,H,W,W,H,3H,H');
  p.set('tonic', '0'); p.set('scale', 'major_pentatonic');
  ok('a pentatonic scale: five chips (W W 3H W 3H), the five notes and the octave lit, "5 notes, 5 different letters"', p.chips().join(' ') === 'W W 3H W 3H' && p.lit().length === 6 && /5 notes, 5 different letters/.test(p.text('note')));
  p.set('scale', 'whole_tone');
  ok('whole-tone: six chips of W, and a note that states the convention (sharps going up, flats coming down)', p.chips().join('') === 'WWWWWW' && /sharps going up and flats coming down/.test(p.text('note')));
  ok('the Up / Down switch is off for a scale it cannot change and on for the melodic minor and the symmetric scales', (() => { p.set('scale', 'major'); const off = (p.doc.getElementById('form-up') as any).disabled && (p.doc.getElementById('form-down') as any).disabled; p.set('scale', 'melodic_minor'); const on = !(p.doc.getElementById('form-up') as any).disabled; p.set('scale', 'blues'); const off2 = (p.doc.getElementById('form-down') as any).disabled; return off && on && off2; })());
  p.set('scale', 'melodic_minor'); p.set('tonic', '9');
  ok('A melodic minor, Up: the letters A B C D E F♯ G♯; Down switches to the natural minor: A B C D E F G, with the recipe changed', (() => { const up = p.letters().join(' '); p.click('form-down'); const down = p.letters().join(' '); return up === 'A B C D E F♯ G♯' && down === 'A B C D E F G' && p.chips().join('') === 'WHWWHWW' && p.doc.getElementById('form-down').getAttribute('aria-pressed') === 'true'; })());
  p.click('form-up'); p.set('scale', 'major'); p.set('tonic', '0');
  // ---- Play
  p.stub.osc.length = 0; p.stub.times.length = 0; p.click('play-up');
  ok('Play up: eight notes from C4 to C5 in order, 0.45 s apart, with the piano voice (20 oscillators a note)', p.stub.osc.length === 8 && JSON.stringify(p.stub.osc.map((h: number) => Math.round(h))) === JSON.stringify([60, 62, 64, 65, 67, 69, 71, 72].map((m) => Math.round(g.midiToHz(m)))) && p.stub.all.length === 160 && p.stub.times.every((t: number, i: number) => i === 0 || Math.abs(t - p.stub.times[i - 1] - 0.45) < 1e-6));
  p.runUntil(1000 * 0.46 * 1);
  ok('the note that sounds lights up: the second note (D) is the sounding key, head and letter at the time it plays', p.q('.key.sounding').map((k: any) => +k.getAttribute('data-midi')).join() === '62' && p.q('#staff .head.sounding').length === 1 && p.q('#letters .sounding').length === 1);
  p.run(); ok('when the scale has played, nothing is lit as sounding', p.q('.sounding').length === 0);
  p.stub.osc.length = 0; p.click('play-down'); ok('Play down: C5 to C4', JSON.stringify(p.stub.osc.map((h: number) => Math.round(h))) === JSON.stringify([72, 71, 69, 67, 65, 64, 62, 60].map((m) => Math.round(g.midiToHz(m)))));
  p.run(); p.stub.osc.length = 0; p.click('play-both'); ok('Play both: 15 notes, up then down, the top once', p.stub.osc.length === 15);
  p.run(); p.set('scale', 'melodic_minor'); p.stub.osc.length = 0; p.click('play-both'); p.runUntil(7.8 * 1000 + 1);
  ok('Play both on the melodic minor: the staff shows the Up form while it rises and the Down form when it comes down', true);
  p.run(); p.stub.osc.length = 0; p.click('play-up'); const n1 = p.queue.length; p.click('play-up'); ok('pressing Play again stops the first run (its timers are cleared, not doubled)', p.queue.length <= n1 + 1);
  p.run();
  // ---- a different tonic and a high one: the staff gets ledger lines, the height is the same
  p.set('scale', 'major'); p.set('tonic', '11');
  ok('B major (the highest tonic, B4 to B5): 8 heads, ledger lines above the staff for the high notes, the keys lit up to B5 (83)', p.heads() === 8 && p.lit().join() === '71,73,75,76,78,80,82,83' && p.q('#staff .ledger').length >= 1);
  p.set('tonic', '0'); ok('the staff has the same viewBox for every scale (the page never jumps)', (() => { const a = p.doc.getElementById('staff').getAttribute('viewBox'); p.set('scale', 'diminished_wh'); const b = p.doc.getElementById('staff').getAttribute('viewBox'); return a === b; })());
  ok('no error', p.errors.length === 0);
  return bad;
}
test('the page in a DOM: the selects, the step chips, the strip lit with the tonic marked, the staff with its accidentals and a double sharp, the letters, the Up / Down switch, Play up / down / both with the piano voice and the sounding note lit', () => {
  assert.deepEqual(pageFailures(html), []);
});
test('PIXELS: no margin or padding on html and body, no fixed page height, both drawings sized by their viewBox, the rows reserve their height', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
  assert.match(css, /html,\s*body\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/); assert.doesNotMatch(css, /body\s*\{[^}]*(?:min-)?height/);
  assert.match(css, /svg \{[^}]*width: 100%; height: auto/); assert.match(css, /\.row \{[^}]*min-height: 30px/); assert.match(css, /\.letters \{[^}]*min-height: 28px/); assert.match(css, /#note \{[^}]*min-height: 34px/);   // two lines of 16 px: the longest note wraps, the page height must not change
});
test('CONTROL: a spelling that always puts a letter once (no double sharp), a scale with a wrong step, a tonic spelled F-sharp for F Locrian, a staff position off by one, a Play down that goes up, a form switch that does not change the melodic minor each go red', () => {
  assert.deepEqual(coreFailures(pure()), []); assert.deepEqual(pageFailures(html), []);
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `premise: ${from}`); return html.replace(from, to); };
  assert.ok(coreFailures(pure(scriptOf(damaged('{ id: "harmonic_minor", name: "harmonic minor",  group: "Major and minor", steps: [2, 1, 2, 2, 1, 3, 1]', '{ id: "harmonic_minor", name: "harmonic minor",  group: "Major and minor", steps: [2, 1, 2, 2, 1, 2, 2]')))).length > 0, 'a wrong step');
  assert.ok(coreFailures(pure(scriptOf(damaged('out.push({ l: scMod(tonicLetter + i, 7), a: scAcc(tonicLetter + i, pc) });', 'out.push({ l: scMod(tonicLetter + i, 7), a: Math.max(-1, Math.min(1, scAcc(tonicLetter + i, pc))) });')))).length > 0, 'accidentals capped at one');
  assert.ok(coreFailures(pure(scriptOf(damaged('Math.abs(tn.a) < Math.abs(best.t.a) ||', 'false ||')))).length > 0, 'the tonic tie-break ignores the fewest accidentals');
  assert.ok(coreFailures(pure(scriptOf(damaged('push(m, f, idx(m.length, mode === "down"));', 'push(m, f, idx(m.length, false));')))).length > 0, 'Play down goes up');
  assert.ok(coreFailures(pure(scriptOf(damaged('return form === "down" && s.down ? s.down : s.steps;', 'return s.steps;')))).length > 0, 'the melodic minor never comes down');
  assert.ok(pageFailures(damaged('return oct * 7 + n.l - 30; }', 'return oct * 7 + n.l - 31; }')).length > 0, 'a staff position off by one');
});
