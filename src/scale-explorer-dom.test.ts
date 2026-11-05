// 2026-11-04-1170 (Scale Explorer 1 of 4): the picture and the controls of the `forge-scale` block, in happy-dom, with a test double for the sound and for the staff drawer. REAL events go through the listeners production attaches.
// Pins the PROPERTY (what is highlighted, marked, numbered, lit; what sounds when) not the DOM shape; the real-Chrome measure (scripts/dev/measure-scale-explorer.ts) draws the same thing under Obsidian's app.css with a real Verovio staff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { KEYBOARD_HEIGHT } from './input-widget-piano.ts';
import { DEFAULT_SCALE_OPTIONS, scaleNotes, tonicNamesFor, type PlayEvent, type ScaleExplorerOptions } from './scale-explorer-core.ts';
import { mountScaleBlock, mountScaleExplorer, rootAfterQualityChange, tonicAfterTypeChange, type ScaleExplorerDeps, type ScaleSound } from './scale-explorer-dom.ts';

interface Hooks { onNoteOn(m: number): void; onNoteOff(m: number): void; onEnd(): void }

function world(over: Partial<ScaleExplorerOptions> = {}, staff: 'ok' | 'fails' | 'none' = 'ok') {
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document as Document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const plays: { events: PlayEvent[]; hooks: Hooks }[] = [];
  let stops = 0;
  const sound: ScaleSound = { play: (events, hooks) => { plays.push({ events: [...events], hooks }); }, stop: () => { stops++; } };
  const xml: string[] = [];
  const deps: ScaleExplorerDeps = {
    sound,
    renderStaff: staff === 'none' ? undefined : async (host, musicxml) => { xml.push(musicxml); if (staff === 'fails') throw new Error('no verovio'); host.setAttribute('data-staff', 'drawn'); },
  };
  const options: ScaleExplorerOptions = { ...DEFAULT_SCALE_OPTIONS, show: { ...DEFAULT_SCALE_OPTIONS.show }, ...over };
  const handle = mountScaleExplorer(el, options, deps);
  const q = <T extends Element = Element>(sel: string): T[] => [...el.querySelectorAll(sel)] as T[];
  const change = (select: HTMLSelectElement, value: string) => { select.value = value; select.dispatchEvent(new win.Event('change', { bubbles: true })); };
  return { win, doc, el, handle, plays, stops: () => stops, xml, q, change, sound, deps, options };
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const midiOf = (e: Element) => Number(e.getAttribute('data-midi'));

test('nothing sounds on mount; no Play button was pressed', () => {
  const w = world();
  assert.equal(w.plays.length, 0);
  assert.equal(w.stops(), 0);
});

test('C major: 8 keys highlighted (7 notes + the octave), the root marked on both Cs and on no other key, numbers 1-7 and 8', () => {
  const w = world();
  const on = w.q('rect.is-scale');
  assert.deepEqual(on.map(midiOf).sort((a, b) => a - b), [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.equal(new Set(on.map((k) => midiOf(k) % 12)).size, 7, 'seven pitch classes');
  assert.deepEqual(w.q('rect.is-root').map(midiOf).sort((a, b) => a - b), [60, 72]);
  assert.equal(w.q('rect.forge-piano-key').length, 88);
  const numbers = w.q('text.forge-scale-degree');
  assert.deepEqual(numbers.map((t) => t.textContent), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.deepEqual(numbers.map((t) => t.getAttribute('data-degree')), ['1', '2', '3', '4', '5', '6', '7', '8']);
});

test('a control that can fail: D dorian highlights different keys than D major, and the root moves', () => {
  const dorian = world({ tonic: 'D', scale: 'dorian' });
  const major = world({ tonic: 'D', scale: 'major' });
  const keys = (w: ReturnType<typeof world>) => w.q('rect.is-scale').map(midiOf).sort((a, b) => a - b).join(',');
  assert.notEqual(keys(dorian), keys(major));
  assert.equal(keys(dorian), '62,64,65,67,69,71,72,74');
  assert.deepEqual(dorian.q('rect.is-root').map(midiOf).sort((a, b) => a - b), [62, 74]);
});

test('black keys of the scale are highlighted and numbered too (Bb major: Bb4, Eb5 and Bb5 are black keys)', () => {
  const w = world({ tonic: 'Bb', scale: 'major' });
  assert.deepEqual(w.q('rect.is-scale').map((k) => k.getAttribute('data-name')).sort(), scaleNotes('Bb', 'major', 4).map((n) => n.name).sort());
  assert.equal(w.q('rect.forge-piano-key-black.is-scale').length, 3);
  assert.equal(w.q('text.forge-scale-degree').length, 8);
});

test('the piano is the piano widget\'s own keyboard: 146 px tall, in a horizontal scroller, and the scale sits inside the scrolled-to range', () => {
  const w = world();
  assert.equal(KEYBOARD_HEIGHT, 146, 'medium: between the 120 and 150 px asked for');
  const svg = w.q('svg.forge-scale-svg')[0];
  assert.equal(svg.getAttribute('height'), String(KEYBOARD_HEIGHT));
  assert.equal(w.q('.forge-piano-scroller').length, 1);
});

test('show: numbers off -> no numbers; piano off -> no piano and numbers cannot appear; staff off -> the staff drawer is never called', async () => {
  const noNum = world({ show: { piano: true, staff: true, numbers: false, diatonic: false, guitar: false } });
  assert.equal(noNum.q('text.forge-scale-degree').length, 0);
  assert.equal(noNum.q('rect.is-scale').length, 8);
  const noPiano = world({ show: { piano: false, staff: true, numbers: false, diatonic: false, guitar: false } });
  assert.equal(noPiano.q('rect').length, 0);
  assert.equal(noPiano.q('.forge-scale-piano').length, 0);
  const noStaff = world({ show: { piano: true, staff: false, numbers: true, diatonic: false, guitar: false } });
  await tick();
  assert.equal(noStaff.xml.length, 0);
  assert.equal(noStaff.q('.forge-scale-staff').length, 0);
});

test('controls: no -> no dropdowns and no Play buttons (a fixed picture); controls: yes -> two dropdowns and three buttons', () => {
  const fixed = world({ controls: false });
  assert.equal(fixed.q('select, button').length, 0);
  assert.equal(fixed.q('rect.is-scale').length, 8, 'the picture is still there');
  const live = world();
  assert.equal(live.q('select').length, 2);
  assert.deepEqual(live.q('button.forge-scale-play').map((b) => b.getAttribute('data-mode')), ['up', 'down', 'together']);
  assert.deepEqual(live.q('button.forge-scale-play').map((b) => b.textContent), ['Play up', 'Play down', 'Play together']);
});

test('the staff gets the scale\'s MusicXML: C# major is 7 sharps, F major one flat; a tonic change redraws it', async () => {
  const cs = world({ tonic: 'C#' });
  await tick();
  assert.match(cs.xml[0], /<fifths>7<\/fifths>/);
  assert.equal(cs.q('.forge-scale-staff-score')[0].getAttribute('data-staff'), 'drawn');
  const f = world({ tonic: 'F' });
  await tick();
  assert.match(f.xml[0], /<fifths>-1<\/fifths>/);
  const sel = f.q<HTMLSelectElement>('select.forge-scale-tonic')[0];
  f.change(sel, 'G');
  await tick();
  assert.match(f.xml[f.xml.length - 1], /<fifths>1<\/fifths>/);
});

test('a staff that cannot be drawn says so in its place and leaves the piano alone', async () => {
  const w = world({}, 'fails');
  const saved = console.error;
  console.error = () => {};
  await tick();
  console.error = saved;
  assert.match(w.q('.forge-scale-staff-error')[0].textContent ?? '', /The staff could not be drawn: no verovio/);
  assert.equal(w.q('rect.is-scale').length, 8);
});

test('the tonic dropdown offers the 12 names of the scale type (plus a typed one outside them); the type dropdown the 9 types', () => {
  const w = world();
  assert.deepEqual(w.q('select.forge-scale-tonic option').map((o) => o.textContent), tonicNamesFor('major'));
  assert.equal(w.q('select.forge-scale-type option').length, 9);
  const typed = world({ tonic: 'C#' });
  assert.deepEqual(typed.q('select.forge-scale-tonic option').map((o) => o.textContent), [...tonicNamesFor('major'), 'C#']);
  assert.equal(typed.q<HTMLSelectElement>('select.forge-scale-tonic')[0].value, 'C#');
});

test('choosing a tonic re-highlights the keys, moves the root and the caption; choosing a type keeps the pitch class, re-spelled by the new key signature', () => {
  const w = world();
  w.change(w.q<HTMLSelectElement>('select.forge-scale-tonic')[0], 'Eb');
  assert.deepEqual(w.handle.state(), { tonic: 'Eb', scale: 'major' });
  assert.deepEqual(w.q('rect.is-scale').map((k) => k.getAttribute('data-name')).sort(), scaleNotes('Eb', 'major', 4).map((n) => n.name).sort());
  assert.match(w.q('.forge-scale-caption')[0].textContent ?? '', /^Eb Major \(Ionian\): Eb F G Ab Bb C D Eb$/);
  w.change(w.q<HTMLSelectElement>('select.forge-scale-type')[0], 'natural minor');
  assert.deepEqual(w.handle.state(), { tonic: 'Eb', scale: 'natural minor' }, 'Eb major and Eb minor: the minor list spells pitch class 3 as Eb (1171-2)');
  assert.equal(w.q<HTMLSelectElement>('select.forge-scale-tonic')[0].value, 'Eb');
  assert.equal(tonicAfterTypeChange('F#', 'major', 'natural minor'), 'F#');
  assert.equal(tonicAfterTypeChange('Db', 'major', 'natural minor'), 'C#');
});

test('Play together: one call to the sound hook with all 8 notes at once; the playing notes light on the piano and go out; the plan\'s end resets the button', () => {
  const w = world();
  const btn = w.q<HTMLButtonElement>('button[data-mode="together"]')[0];
  btn.click();
  assert.equal(w.plays.length, 1);
  assert.deepEqual(w.plays[0].events.map((e) => e.midi).sort((a, b) => a - b), [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.ok(w.plays[0].events.every((e) => e.startMs === 0));
  assert.equal(btn.textContent, 'Stop');
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
  w.plays[0].hooks.onNoteOn(60);
  w.plays[0].hooks.onNoteOn(67);
  assert.deepEqual(w.q('rect.is-playing').map(midiOf).sort((a, b) => a - b), [60, 67]);
  w.plays[0].hooks.onNoteOff(60);
  assert.deepEqual(w.q('rect.is-playing').map(midiOf), [67]);
  w.plays[0].hooks.onEnd();
  assert.equal(w.q('rect.is-playing').length, 0);
  assert.equal(btn.textContent, 'Play together');
  assert.equal(btn.getAttribute('aria-pressed'), 'false');
});

test('Play up / Play down: the notes in order, up then reversed', () => {
  const w = world();
  w.q<HTMLButtonElement>('button[data-mode="up"]')[0].click();
  assert.deepEqual(w.plays[0].events.map((e) => e.midi), [60, 62, 64, 65, 67, 69, 71, 72]);
  w.q<HTMLButtonElement>('button[data-mode="down"]')[0].click();
  assert.deepEqual(w.plays[1].events.map((e) => e.midi), [72, 71, 69, 67, 65, 64, 62, 60]);
  assert.deepEqual(w.q<HTMLButtonElement>('button.forge-scale-play').map((b) => b.textContent), ['Play up', 'Stop', 'Play together'], 'only the pressed one says Stop; the first was replaced');
});

test('a second press of the same button stops: the sound is silenced, the lit keys go out, no new play starts', () => {
  const w = world();
  const btn = w.q<HTMLButtonElement>('button[data-mode="up"]')[0];
  btn.click();
  w.plays[0].hooks.onNoteOn(62);
  assert.equal(w.q('rect.is-playing').length, 1);
  const stopsBefore = w.stops();
  btn.click();
  assert.equal(w.plays.length, 1, 'no second play');
  assert.ok(w.stops() > stopsBefore, 'the sound was stopped');
  assert.equal(w.q('rect.is-playing').length, 0);
  assert.equal(btn.textContent, 'Play up');
});

test('changing the tonic or the type while it plays stops it first', () => {
  const w = world();
  w.q<HTMLButtonElement>('button[data-mode="up"]')[0].click();
  const before = w.stops();
  w.change(w.q<HTMLSelectElement>('select.forge-scale-tonic')[0], 'G');
  assert.ok(w.stops() > before);
  assert.equal(w.q<HTMLButtonElement>('button[data-mode="up"]')[0].textContent, 'Play up');
});

test('destroy silences and removes the picture', () => {
  const w = world();
  const before = w.stops();
  w.handle.destroy();
  assert.ok(w.stops() > before);
  assert.equal(w.q('.forge-scale').length, 0);
});

// ---- the block: the source -> the explorer or the error ------------------------------------------------------------------------------------------------------------

test('a bad source shows an inline error naming the bad line, and mounts nothing', () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const el = win.document.createElement('div');
  const handle = mountScaleBlock(el, 'tonic: C\nscale: blues', { sound: { play() {}, stop() {} } });
  assert.equal(handle, null);
  assert.match(el.querySelector('.forge-scale-error p')?.textContent ?? '', /^Scale explorer: scale must be one of .*\(got "blues"\)\.$/);
  assert.equal(el.querySelectorAll('.forge-scale').length, 0);
});

test('a good source mounts the explorer with the options read from it', () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const el = win.document.createElement('div');
  const handle = mountScaleBlock(el, 'tonic: A\nscale: harmonic minor\ncontrols: no', { sound: { play() { throw new Error('no sound on mount'); }, stop() {} } });
  assert.ok(handle);
  assert.deepEqual(handle!.state(), { tonic: 'A', scale: 'harmonic minor' });
  assert.equal(el.querySelector('.forge-scale')?.getAttribute('data-scale'), 'harmonic minor');
  assert.equal(el.querySelectorAll('select, button').length, 0);
});

// ---- 2026-11-04-1171: chord mode -------------------------------------------------------------------------------------------------------------------------------------------

import { chordNotes, chordRootNamesFor } from './chord-names-core.ts';

function chordWorld(over: Partial<ScaleExplorerOptions> = {}) {
  return world({ mode: 'chord', ...over });
}
const keysOf = (w: ReturnType<typeof world>) => w.q('rect.is-scale').map(midiOf).sort((a, b) => a - b);

test('chord mode, C major: C E G highlighted, the root marked once, the labels 1 3 5, the name "C major" large above the piano', () => {
  const w = chordWorld();
  assert.deepEqual(keysOf(w), [60, 64, 67]);
  assert.deepEqual(w.q('rect.is-root').map(midiOf), [60]);
  assert.deepEqual(w.q('text.forge-scale-degree').map((t) => t.textContent), ['1', '3', '5']);
  assert.equal(w.q('.forge-scale-chord-name')[0].textContent, 'C major');
  assert.equal(w.q('.forge-scale-caption')[0].textContent, 'C E G');
  assert.equal(w.q('.forge-scale')[0].getAttribute('data-mode'), 'chord');
  assert.deepEqual(w.handle.state(), { tonic: 'C', chord: 'major' });
  const order = [...w.q('.forge-scale')[0].children].map((c) => c.className.split(' ')[0]);
  assert.deepEqual(order, ['forge-scale-controls', 'forge-scale-chord-name', 'forge-scale-caption', 'forge-scale-piano', 'forge-scale-staff'], 'controls, the name, the note names, the piano, the staff');
});

test('chord mode, Bb dom7: four notes, the name "Bb7" (ASCII flat, as 1170 names notes), the labels 1 3 5 7; a control: it is not C major\'s picture', () => {
  const w = chordWorld({ tonic: 'Bb', chord: 'dom7' });
  assert.deepEqual(keysOf(w), chordNotes('Bb', 'dom7', 4).map((n) => n.midi).sort((a, b) => a - b));
  assert.equal(keysOf(w).length, 4);
  assert.equal(w.q('.forge-scale-chord-name')[0].textContent, 'Bb7');
  assert.deepEqual(w.q('text.forge-scale-degree').map((t) => t.textContent), ['1', '3', '5', '7']);
  assert.notDeepEqual(keysOf(w), keysOf(chordWorld()));
});

test('every quality: the highlighted keys, the labels and the name come from the chord table (12 qualities)', () => {
  for (const q of ['major', 'minor', 'diminished', 'augmented', 'maj7', 'dom7', 'min7', 'half_dim7', 'dim7', 'dom9', 'dom11', 'dom13'] as const) {
    const w = chordWorld({ tonic: chordRootNamesFor(q)[2], chord: q });
    const notes = chordNotes(chordRootNamesFor(q)[2], q, 4);
    assert.deepEqual(keysOf(w), notes.map((n) => n.midi).sort((a, b) => a - b), q);
    assert.deepEqual(w.q('text.forge-scale-degree').map((t) => t.textContent), notes.map((n) => String(n.degree)), q);
    assert.ok((w.q('.forge-scale-chord-name')[0].textContent ?? '').startsWith('D'), q);
  }
});

test('chord mode controls: a root dropdown (the quality\'s 12 names), a quality dropdown (12), and Play together / Play arpeggio only', () => {
  const w = chordWorld({ chord: 'minor' });
  assert.deepEqual(w.q('select.forge-scale-tonic option').map((o) => o.textContent), chordRootNamesFor('minor'));
  assert.equal(w.q('select.forge-chord-quality option').length, 12);
  assert.deepEqual(w.q<HTMLButtonElement>('button.forge-scale-play').map((b) => b.textContent), ['Play together', 'Play arpeggio']);
  assert.deepEqual(w.q('button.forge-scale-play').map((b) => b.getAttribute('data-mode')), ['together', 'arpeggio']);
  assert.ok(/Chord/.test(w.q('label.forge-scale-field')[1].textContent ?? ''));
});

test('chord mode: choosing a root or a quality redraws the keys, the name and the staff; the quality keeps the pitch class, re-named by the new quality\'s list', async () => {
  const w = chordWorld();
  w.change(w.q<HTMLSelectElement>('select.forge-scale-tonic')[0], 'G');
  assert.equal(w.q('.forge-scale-chord-name')[0].textContent, 'G major');
  w.change(w.q<HTMLSelectElement>('select.forge-chord-quality')[0], 'dom7');
  assert.deepEqual(w.handle.state(), { tonic: 'G', chord: 'dom7' });
  assert.equal(w.q('.forge-scale-chord-name')[0].textContent, 'G7');
  assert.deepEqual(keysOf(w), chordNotes('G', 'dom7', 4).map((n) => n.midi).sort((a, b) => a - b));
  w.change(w.q<HTMLSelectElement>('select.forge-scale-tonic')[0], 'Db');
  w.change(w.q<HTMLSelectElement>('select.forge-chord-quality')[0], 'minor');
  assert.deepEqual(w.handle.state(), { tonic: 'C#', chord: 'minor' }, 'Db and C# are one pitch class: the minor list names it C#');
  assert.equal(w.q('.forge-scale-chord-name')[0].textContent, 'C# minor');
  await tick();
  assert.match(w.xml[w.xml.length - 1], /<chord\/>/);
  assert.equal(rootAfterQualityChange('F#', 'major', 'minor'), 'F#');
});

test('the staff of a chord block gets ONE chord of stacked notes (chordMusicXML), not the scale\'s eight', async () => {
  const w = chordWorld({ tonic: 'C', chord: 'dom7' });
  await tick();
  assert.equal((w.xml[0].match(/<note>/g) ?? []).length, 4);
  assert.equal((w.xml[0].match(/<chord\/>/g) ?? []).length, 3);
  assert.match(w.xml[0], /<fifths>0<\/fifths>/);
});

test('chord mode sound: Play together = the notes at once; Play arpeggio = one after the other, upward; a second press stops', () => {
  const w = chordWorld({ tonic: 'C', chord: 'dom7' });
  w.q<HTMLButtonElement>('button[data-mode="together"]')[0].click();
  assert.deepEqual(w.plays[0].events.map((e) => e.midi).sort((a, b) => a - b), [60, 64, 67, 70]);
  assert.ok(w.plays[0].events.every((e) => e.startMs === 0));
  const arp = w.q<HTMLButtonElement>('button[data-mode="arpeggio"]')[0];
  arp.click();
  assert.deepEqual(w.plays[1].events.map((e) => e.midi), [60, 64, 67, 70]);
  assert.ok(w.plays[1].events.every((e, i) => i === 0 || e.startMs > w.plays[1].events[i - 1].startMs));
  assert.deepEqual(w.q<HTMLButtonElement>('button.forge-scale-play').map((b) => b.textContent), ['Play together', 'Stop']);
  const stopsBefore = w.stops();
  arp.click();
  assert.equal(w.plays.length, 2);
  assert.ok(w.stops() > stopsBefore);
  assert.equal(arp.textContent, 'Play arpeggio');
  w.plays[1].hooks.onNoteOn(64);
});

test('chord mode: no sound on mount, controls: no is a fixed picture, and the block source drives it (mode: chord, chord: half_dim7, tonic: B)', () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const el = win.document.createElement('div');
  const h = mountScaleBlock(el, 'mode: chord\nchord: half_dim7\ntonic: B\ncontrols: no', { sound: { play() { throw new Error('no sound on mount'); }, stop() {} } });
  assert.ok(h);
  assert.deepEqual(h!.state(), { tonic: 'B', chord: 'half_dim7' });
  assert.equal(el.querySelector('.forge-scale-chord-name')?.textContent, 'Bm7b5');
  assert.equal(el.querySelectorAll('select, button').length, 0);
  assert.equal(el.querySelectorAll('rect.is-scale').length, 4);
});

test('a bad chord block names the bad line', () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const el = win.document.createElement('div');
  assert.equal(mountScaleBlock(el, 'mode: chord\nchord: sus4', { sound: { play() {}, stop() {} } }), null);
  assert.match(el.querySelector('.forge-scale-error p')?.textContent ?? '', /chord must be one of .*\(got "sus4"\)/);
});

test('1171-2: an Eb minor block shows Eb in the dropdown (six flats on the staff XML); a D# minor block keeps D# as typed, added to the list', async () => {
  const eb = world({ tonic: 'Eb', scale: 'natural minor' });
  await tick();
  assert.equal(eb.q<HTMLSelectElement>('select.forge-scale-tonic')[0].value, 'Eb');
  assert.deepEqual(eb.q('select.forge-scale-tonic option').map((o) => o.textContent), tonicNamesFor('natural minor'));
  assert.match(eb.xml[0], /<fifths>-6<\/fifths>/);
  const ds = world({ tonic: 'D#', scale: 'natural minor' });
  assert.equal(ds.q<HTMLSelectElement>('select.forge-scale-tonic')[0].value, 'D#');
  assert.deepEqual(ds.q('select.forge-scale-tonic option').map((o) => o.textContent), [...tonicNamesFor('natural minor'), 'D#']);
  assert.deepEqual(ds.handle.state(), { tonic: 'D#', scale: 'natural minor' });
});

// ---- 2026-11-04-1172: free mode and the diatonic row -------------------------------------------------------------------------------------------------------------------------------

function freeWorld(over: Partial<ScaleExplorerOptions> = {}) {
  const w = world({ mode: 'free', ...over });
  const click = (midi: number) => { const k = w.q(`rect[data-midi="${midi}"]`)[0]; k.dispatchEvent(new w.win.MouseEvent('click', { bubbles: true })); };
  const readout = () => ({
    head: w.q('.forge-scale-readout-headline')[0].textContent ?? '', also: w.q('.forge-scale-readout-also')[0].textContent ?? '',
    roman: w.q('.forge-scale-readout-roman')[0].textContent ?? '', outside: w.q('.forge-scale-readout-outside')[0].textContent ?? '',
  });
  const pickedKeys = () => w.q('rect.is-picked').map(midiOf).sort((a, b) => a - b);
  const rowBtn = (n: number) => w.q<HTMLButtonElement>('button.forge-scale-diatonic-btn')[n - 1];
  return { ...w, click, readout, pickedKeys, rowBtn };
}

test('free mode: nothing sounds on mount, the hint shows, no key is picked, the 88 keys are there, the key C major is tinted (7 pitch classes in every octave) and the toggled keys will differ from it', () => {
  const f = freeWorld();
  assert.equal(f.plays.length, 0);
  assert.equal(f.readout().head, 'Click keys to build a chord');
  assert.equal(f.pickedKeys().length, 0);
  assert.equal(f.q('rect.forge-piano-key').length, 88);
  const tinted = f.q('rect.is-in-key').map(midiOf);
  assert.ok(tinted.every((m) => [0, 2, 4, 5, 7, 9, 11].includes(m % 12)));
  assert.equal(tinted.length, 52, '7 of 12 pitch classes over A0..C8: 52 keys');
  assert.equal(f.q('.forge-scale')[0].getAttribute('data-mode'), 'free');
  assert.deepEqual(f.handle.state(), { tonic: 'C', scale: 'major', picked: [] });
});

test('free mode: a click toggles a key (ON then OFF), the set stays ascending across octaves, a note sounds when a key goes ON and not when it goes OFF', () => {
  const f = freeWorld();
  f.click(67); f.click(60); f.click(64);
  assert.deepEqual(f.pickedKeys(), [60, 64, 67]);
  assert.deepEqual(f.handle.state(), { tonic: 'C', scale: 'major', picked: [60, 64, 67] });
  assert.equal(f.plays.length, 3, 'one short note for each key switched on');
  assert.deepEqual(f.plays.map((p) => p.events[0].midi), [67, 60, 64]);
  assert.ok(f.plays.every((p) => p.events.length === 1 && p.events[0].durMs > 0));
  f.click(64);
  assert.deepEqual(f.pickedKeys(), [60, 67]);
  assert.equal(f.plays.length, 3, 'switching OFF is silent');
  f.click(72);
  assert.deepEqual(f.pickedKeys(), [60, 67, 72], 'a key in another octave');
});

test('free mode, the readout: C E G is "C major" and "I in C major"; adding F# gives no name and "F# is not in C major"; the V button lights G B D', () => {
  const f = freeWorld({ show: { piano: true, staff: true, numbers: false, diatonic: true, guitar: false } });
  f.click(60); f.click(64); f.click(67);
  assert.equal(f.readout().head, 'C major');
  assert.equal(f.readout().roman, 'I in C major');
  assert.equal(f.readout().outside, '');
  f.click(66);
  assert.match(f.readout().head, /^No chord name: P1 M3 d5 P5 above C$/);
  assert.equal(f.readout().outside, 'F# is not in C major');
  assert.equal(f.readout().roman, '');
  f.rowBtn(5).click();
  assert.deepEqual(f.pickedKeys(), [67, 71, 74], 'G B D lit; the F# and the old notes are gone (the click REPLACES)');
  assert.equal(f.readout().head, 'G major');
  assert.equal(f.readout().roman, 'V in C major');
});

test('free mode: inversion and slash bass ("C major/E", I6), "also:" with the other readings, an interval for two notes, a note for one', () => {
  const f = freeWorld();
  f.click(64); f.click(67); f.click(72);
  assert.equal(f.readout().head, 'C major/E');
  assert.equal(f.readout().roman, 'I6 in C major');
  const g = freeWorld();
  [59, 62, 65, 68].forEach((m) => g.click(m));
  assert.equal(g.readout().head, 'Bdim7');
  assert.match(g.readout().also, /^also: .*dim7\/B.* \/ .*dim7\/B/);
  const two = freeWorld(); two.click(60); two.click(64);
  assert.equal(two.readout().head, 'major third');
  const one = freeWorld(); one.click(61);
  assert.equal(one.readout().head, 'C#4');
  assert.equal(one.readout().outside, 'C# is not in C major');
});

test('free mode: Clear empties the set, the readout and the staff, and silences', () => {
  const f = freeWorld();
  f.click(60); f.click(64);
  const stops = f.stops();
  f.q<HTMLButtonElement>('button.forge-scale-clear')[0].click();
  assert.equal(f.pickedKeys().length, 0);
  assert.equal(f.readout().head, 'Click keys to build a chord');
  assert.ok(f.stops() > stops);
  assert.deepEqual(f.handle.state(), { tonic: 'C', scale: 'major', picked: [] });
});

test('free mode: the dropdowns set the KEY, the tint follows, the picked keys stay, and the numeral is read in the new key ("V in F major" for C E G)', () => {
  const f = freeWorld();
  f.click(60); f.click(64); f.click(67);
  f.change(f.q<HTMLSelectElement>('select.forge-scale-tonic')[0], 'F');
  assert.equal(f.readout().roman, 'V in F major');
  assert.equal(f.readout().outside, '');
  assert.deepEqual(f.pickedKeys(), [60, 64, 67]);
  assert.ok(f.q('rect.is-in-key').map(midiOf).every((m) => [5, 7, 9, 10, 0, 2, 4].includes(m % 12)), 'F major tinted: F G A Bb C D E');
  f.change(f.q<HTMLSelectElement>('select.forge-scale-type')[0], 'natural minor');
  assert.deepEqual(f.handle.state(), { tonic: 'F', scale: 'natural minor', picked: [60, 64, 67] });
  assert.equal(f.readout().outside, 'E is not in F minor');
  assert.equal(f.readout().roman, '');
  assert.match(f.q('.forge-scale-caption')[0].textContent ?? '', /^Key: F minor: F G Ab Bb C Db Eb$/);
});

test('free mode: the staff shows the toggled notes as ONE chord, live; none = a whole rest; low notes take the bass clef', async () => {
  const f = freeWorld();
  await tick();
  assert.match(f.xml[f.xml.length - 1], /<rest\/>/);
  f.click(60); f.click(64); f.click(67);
  await tick();
  const last = f.xml[f.xml.length - 1];
  assert.equal((last.match(/<note>/g) ?? []).length, 3);
  assert.equal((last.match(/<chord\/>/g) ?? []).length, 2);
  assert.match(last, /<sign>G<\/sign>/);
  f.click(66);
  await tick();
  assert.match(f.xml[f.xml.length - 1], /<alter>1<\/alter>/, 'F# carries its sharp');
  f.q<HTMLButtonElement>('button.forge-scale-clear')[0].click();
  f.click(48); f.click(52);
  await tick();
  assert.match(f.xml[f.xml.length - 1], /<sign>F<\/sign>/);
});

test('free mode, show: diatonic: seven buttons I ii iii IV V vi vii° labelled C Dm Em F G Am B°; the 7ths switch makes them sevenths; a click replaces the set, lights it and plays it together', () => {
  const f = freeWorld({ show: { piano: true, staff: true, numbers: false, diatonic: true, guitar: false } });
  const btns = f.q<HTMLButtonElement>('button.forge-scale-diatonic-btn');
  assert.deepEqual(btns.map((b) => b.getAttribute('data-numeral')), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  assert.deepEqual(btns.map((b) => b.querySelector('.forge-scale-diatonic-label')!.textContent), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°']);
  f.click(61);
  f.rowBtn(2).click();
  assert.deepEqual(f.pickedKeys(), [62, 65, 69], 'D F A: the old C# is gone');
  const last = f.plays[f.plays.length - 1];
  assert.deepEqual(last.events.map((e) => e.midi).sort((a, b) => a - b), [62, 65, 69]);
  assert.ok(last.events.every((e) => e.startMs === 0), 'together');
  const sw = f.q<HTMLButtonElement>('button.forge-scale-sevenths')[0];
  assert.equal(sw.getAttribute('aria-pressed'), 'false');
  sw.click();
  assert.equal(f.q<HTMLButtonElement>('button.forge-scale-sevenths')[0].getAttribute('aria-pressed'), 'true');
  assert.deepEqual(f.q<HTMLButtonElement>('button.forge-scale-diatonic-btn').map((b) => b.querySelector('.forge-scale-diatonic-label')!.textContent), ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bø7']);
  f.rowBtn(5).click();
  assert.deepEqual(f.pickedKeys(), [67, 71, 74, 77]);
  assert.equal(f.readout().head, 'G7');
  assert.equal(f.readout().roman, 'V7 in C major');
});

test('free mode, the row follows the key and the scale: A minor gives i ii° III iv v VI VII (Am B° C Dm Em F G); D natural minor Dm E° F Gm Am Bb C', () => {
  const am = freeWorld({ tonic: 'A', scale: 'natural minor', show: { piano: true, staff: false, numbers: false, diatonic: true, guitar: false } });
  assert.deepEqual(am.q<HTMLButtonElement>('button.forge-scale-diatonic-btn').map((b) => b.getAttribute('data-numeral')), ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
  am.rowBtn(1).click();
  assert.equal(am.readout().roman, 'i in A minor');
  const dm = freeWorld({ tonic: 'D', scale: 'natural minor', show: { piano: true, staff: false, numbers: false, diatonic: true, guitar: false } });
  assert.deepEqual(dm.q<HTMLButtonElement>('button.forge-scale-diatonic-btn').map((b) => b.querySelector('.forge-scale-diatonic-label')!.textContent), ['Dm', 'E°', 'F', 'Gm', 'Am', 'Bb', 'C']);
});

test('free mode: without show: diatonic there is no row; the block source mode: free parses, and "controls: no" and a missing piano are refused naming the line', () => {
  assert.equal(freeWorld().q('.forge-scale-diatonic').length, 0);
  const win: any = new Window({ url: 'http://localhost/' });
  const el = win.document.createElement('div');
  const h = mountScaleBlock(el, 'mode: free\ntonic: G\nshow: piano, staff, diatonic', { sound: { play() { throw new Error('no sound on mount'); }, stop() {} } });
  assert.ok(h);
  assert.deepEqual(h!.state(), { tonic: 'G', scale: 'major', picked: [] });
  assert.equal(el.querySelectorAll('button.forge-scale-diatonic-btn').length, 7);
  for (const [src, re] of [['mode: free\ncontrols: no', /controls: no.*not available/], ['mode: free\nshow: staff', /needs.*piano|must include "piano"/], ['mode: scale\nshow: piano, diatonic', /needs "mode: free"/]] as const) {
    const e2 = win.document.createElement('div');
    assert.equal(mountScaleBlock(e2, src, { sound: { play() {}, stop() {} } }), null, src);
    assert.match(e2.querySelector('.forge-scale-error p')?.textContent ?? '', re, src);
  }
});

// ---- 2026-11-04-1173: the guitar view ---------------------------------------------------------------------------------------------------------------------------------------------------------------

import { GUITAR_HEIGHT } from './guitar-dom.ts';
import { positionsOf, positionsOfMidi, tabText, tabForRun } from './guitar-core.ts';

function guitarWorld(over: Partial<ScaleExplorerOptions> = {}) {
  const base: Partial<ScaleExplorerOptions> = { show: { piano: true, staff: false, numbers: false, diatonic: false, guitar: true }, ...over };
  const w = world(base);
  const dots = () => w.q('g.forge-gdot');
  const dotAt = (s: number, f: number) => w.q(`g.forge-gdot[data-string="${s}"][data-fret="${f}"]`)[0];
  const label = (g: Element | undefined) => g?.querySelector('.forge-gdot-label')?.textContent ?? null;
  return { ...w, dots, dotAt, label };
}

test('guitar, scale mode: C major shows EVERY position of its notes (59 dots), degrees in the dots by default, the 8 root dots larger and marked, the dot at string 5 fret 3 is the root, and a D# on string 4 is absent', () => {
  const g = guitarWorld();
  assert.equal(g.dots().length, 59);
  assert.equal(g.q('g.forge-gdot.is-root').length, 8);
  assert.equal(g.dotAt(5, 3)?.getAttribute('data-root'), 'true');
  assert.equal(g.label(g.dotAt(5, 3)), '1');
  assert.equal(g.dotAt(4, 1), undefined, 'D# on the D string');
  assert.equal(g.label(g.dotAt(4, 0)), '2', 'the open D is degree 2');
  assert.equal(g.dotAt(5, 3)!.querySelector('circle')!.getAttribute('r'), '11', 'the root dot is larger');
  assert.equal(g.dotAt(5, 5)!.querySelector('circle')!.getAttribute('r'), '9');
  assert.deepEqual([...new Set(g.dots().map((d) => label(d)))].sort(), ['1', '2', '3', '4', '5', '6', '7']);
  function label(d: Element) { return d.querySelector('.forge-gdot-label')!.textContent; }
});

test('guitar: the neck is the widget\'s geometry: 6 strings, fret numbers 1 to 15, inlays at 3 5 7 9 12 (two) 15, the open-string names E A D G B E, 164 px tall, in a horizontal scroller', () => {
  const g = guitarWorld();
  assert.equal(GUITAR_HEIGHT, 164);
  assert.equal(g.q('svg.forge-guitar-svg')[0].getAttribute('height'), '164');
  assert.equal(g.q('line.forge-guitar-string').length, 6);
  assert.deepEqual(g.q('text.forge-guitar-fret-number').map((t) => t.textContent), Array.from({ length: 15 }, (_, i) => String(i + 1)));
  assert.equal(g.q('circle.forge-guitar-inlay').length, 7);
  assert.deepEqual(g.q('text.forge-guitar-open-label').map((t) => t.textContent), ['E', 'A', 'D', 'G', 'B', 'E']);
  assert.equal(g.q('.forge-guitar-scroller').length, 1);
});

test('guitar labels: names instead of degrees; chord mode defaults to names (C E G) and degrees give 1 3 5', () => {
  const n = guitarWorld({ labels: 'names' });
  assert.deepEqual([...new Set(n.dots().map((d) => d.querySelector('.forge-gdot-label')!.textContent))].sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  const chord = guitarWorld({ mode: 'chord', labels: 'names', chord: 'major' });
  assert.deepEqual([...new Set(chord.dots().map((d) => d.querySelector('.forge-gdot-label')!.textContent))].sort(), ['C', 'E', 'G']);
  assert.equal(chord.q('g.forge-gdot.is-root').every((d) => d.querySelector('.forge-gdot-label')!.textContent === 'C'), true);
  const deg = guitarWorld({ mode: 'chord', labels: 'degrees', chord: 'dom7', tonic: 'Bb' });
  assert.deepEqual([...new Set(deg.dots().map((d) => d.querySelector('.forge-gdot-label')!.textContent))].sort(), ['1', '3', '5', '7']);
  const eb = guitarWorld({ tonic: 'Eb', scale: 'natural minor', labels: 'names' });
  assert.ok(eb.dots().some((d) => d.querySelector('.forge-gdot-label')!.textContent === 'Cb'), 'the scale\'s own spelling: Cb');
});

test('guitar: without show: guitar there is no neck; the dots follow the tonic and the scale dropdowns', () => {
  assert.equal(world().q('svg.forge-guitar-svg').length, 0);
  const g = guitarWorld();
  g.change(g.q<HTMLSelectElement>('select.forge-scale-tonic')[0], 'G');
  assert.equal(g.q('g.forge-gdot.is-root').every((d) => d.getAttribute('data-midi') !== null && Number(d.getAttribute('data-midi')) % 12 === 7), true);
  assert.equal(g.dots().length, positionsOf(['G', 'A', 'B', 'C', 'D', 'E', 'F#']).length, 'G major: its own positions (58: the F# and the G land differently on the neck)');
});

test('guitar tab: tab: yes writes the run Play up plays: C major from C3 is 5:3 4:0 4:2 4:3 3:0 3:2 2:0 2:1', () => {
  const g = guitarWorld({ tab: true, octave: 3 });
  assert.equal(g.q('.forge-scale-tab')[0].textContent, '5:3 4:0 4:2 4:3 3:0 3:2 2:0 2:1');
  const off = guitarWorld();
  assert.equal(off.q('.forge-scale-tab').length, 0);
  const em = guitarWorld({ tab: true, octave: 2, tonic: 'E', scale: 'natural minor' });
  assert.equal(em.q('.forge-scale-tab')[0].textContent, '6:0 6:2 6:3 5:0 5:2 5:3 4:0 4:2');
  const chord = guitarWorld({ tab: true, mode: 'chord', octave: 3, tonic: 'C', chord: 'major' });
  assert.equal(chord.q('.forge-scale-tab')[0].textContent, tabText(tabForRun(['C3', 'E3', 'G3'])));
});

test('guitar: while a note plays every dot that sounds it is lit (a pitch has several), and they go out; a click on a dot plays that pitch', () => {
  const g = guitarWorld();
  g.q<HTMLButtonElement>('button[data-mode="up"]')[0].click();
  g.plays[0].hooks.onNoteOn(60);
  assert.deepEqual(g.q('g.forge-gdot.is-lit').map((d) => `${d.getAttribute('data-string')}:${d.getAttribute('data-fret')}`).sort(), ['2:1', '3:5', '4:10', '5:15']);
  g.plays[0].hooks.onNoteOff(60);
  assert.equal(g.q('g.forge-gdot.is-lit').length, 0);
  g.plays[0].hooks.onNoteOn(64); g.plays[0].hooks.onEnd();
  assert.equal(g.q('g.forge-gdot.is-lit').length, 0);
  const before = g.plays.length;
  g.dotAt(5, 3)!.dispatchEvent(new g.win.MouseEvent('click', { bubbles: true }));
  assert.equal(g.plays.length, before + 1);
  assert.deepEqual(g.plays[g.plays.length - 1].events.map((e) => e.midi), [48]);
});

test('free mode, the guitar: a click on the string 2 fret 1 cell toggles middle C (the same pitch list as the piano): the piano key 60 is picked, ALL four dots of that pitch light, the readout says C4 and the tab 2:1; a second click turns them off', () => {
  const g = guitarWorld({ mode: 'free', tab: true });
  const cell = (s: number, f: number) => g.q(`rect.forge-guitar-hit[data-string="${s}"][data-fret="${f}"]`)[0];
  assert.equal(g.q('rect.forge-guitar-hit').length, 96, 'every intersection is clickable');
  cell(2, 1).dispatchEvent(new g.win.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(g.q('rect.is-picked').map(midiOf), [60]);
  assert.deepEqual(g.handle.state(), { tonic: 'C', scale: 'major', picked: [60] });
  assert.deepEqual(g.q('g.forge-gdot.is-picked').map((d) => `${d.getAttribute('data-string')}:${d.getAttribute('data-fret')}`).sort(), ['2:1', '3:5', '4:10', '5:15']);
  assert.equal(g.q('.forge-scale-readout-headline')[0].textContent, 'C4');
  assert.equal(g.q('.forge-scale-tab')[0].textContent, '2:1');
  assert.equal(g.plays.length, 1);
  assert.deepEqual(g.plays[0].events.map((e) => e.midi), [60]);
  cell(5, 15).dispatchEvent(new g.win.MouseEvent('click', { bubbles: true }));            // the same pitch on another string: toggles it OFF
  assert.equal(g.q('rect.is-picked').length, 0);
  assert.equal(g.q('g.forge-gdot.is-picked').length, 0);
  assert.equal(g.plays.length, 1, 'switching OFF is silent');
});

test('free mode, the guitar: the key\'s notes are tinted dots (names, the parser\'s default for free mode), a picked note OUTSIDE the key gets its own dots (D#3 at string 4 fret 1) and the readout says it is not in the key; the neck chord reads like the piano chord', () => {
  const g = guitarWorld({ mode: 'free', labels: 'names' });
  const cell = (s: number, f: number) => g.q(`rect.forge-guitar-hit[data-string="${s}"][data-fret="${f}"]`)[0];
  const click = (s: number, f: number) => cell(s, f).dispatchEvent(new g.win.MouseEvent('click', { bubbles: true }));
  assert.equal(g.dots().length, 59);
  assert.ok(g.dots().every((d) => d.classList.contains('is-tint')));
  assert.deepEqual([...new Set(g.dots().map((d) => d.querySelector('.forge-gdot-label')!.textContent))].sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  click(4, 1);
  assert.equal(g.dotAt(4, 1)?.classList.contains('is-picked'), true);
  assert.equal(g.q('.forge-scale-readout-headline')[0].textContent, 'D#3');
  assert.equal(g.q('.forge-scale-readout-outside')[0].textContent, 'D# is not in C major');
  click(4, 1);
  assert.equal(g.dotAt(4, 1), undefined, 'the extra dot goes with the pick');
  click(5, 3); click(4, 2); click(3, 0);                                              // C3 E3 G3 on the neck
  assert.equal(g.q('.forge-scale-readout-headline')[0].textContent, 'C major');
  assert.equal(g.q('.forge-scale-readout-roman')[0].textContent, 'I in C major');
  assert.deepEqual(g.q('rect.is-picked').map(midiOf), [48, 52, 55]);
  assert.deepEqual(g.handle.state(), { tonic: 'C', scale: 'major', picked: [48, 52, 55] });
});

test('free mode: a click on a piano key lights the guitar dots too (one source of truth), and Clear / the V button clear them or replace them', () => {
  const g = guitarWorld({ mode: 'free', show: { piano: true, staff: false, numbers: false, diatonic: true, guitar: true } });
  g.q('rect[data-midi="60"]')[0].dispatchEvent(new g.win.MouseEvent('click', { bubbles: true }));
  assert.equal(g.q('g.forge-gdot.is-picked').length, 4);
  g.q<HTMLButtonElement>('button.forge-scale-diatonic-btn')[4].click();
  assert.deepEqual([...new Set(g.q('g.forge-gdot.is-picked').map((d) => d.getAttribute('data-midi')))].sort(), ['67', '71', '74']);
  g.q<HTMLButtonElement>('button.forge-scale-clear')[0].click();
  assert.equal(g.q('g.forge-gdot.is-picked').length, 0);
  assert.ok(positionsOfMidi(67).length >= 3);
});
