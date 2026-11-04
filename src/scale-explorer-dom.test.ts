// 2026-11-04-1170 (Scale Explorer 1 of 4): the picture and the controls of the `forge-scale` block, in happy-dom, with a test double for the sound and for the staff drawer. REAL events go through the listeners production attaches.
// Pins the PROPERTY (what is highlighted, marked, numbered, lit; what sounds when) not the DOM shape; the real-Chrome measure (scripts/dev/measure-scale-explorer.ts) draws the same thing under Obsidian's app.css with a real Verovio staff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { KEYBOARD_HEIGHT } from './input-widget-piano.ts';
import { DEFAULT_SCALE_OPTIONS, scaleNotes, tonicNamesFor, type PlayEvent, type ScaleExplorerOptions } from './scale-explorer-core.ts';
import { mountScaleBlock, mountScaleExplorer, tonicAfterTypeChange, type ScaleExplorerDeps, type ScaleSound } from './scale-explorer-dom.ts';

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
  const noNum = world({ show: { piano: true, staff: true, numbers: false } });
  assert.equal(noNum.q('text.forge-scale-degree').length, 0);
  assert.equal(noNum.q('rect.is-scale').length, 8);
  const noPiano = world({ show: { piano: false, staff: true, numbers: false } });
  assert.equal(noPiano.q('rect').length, 0);
  assert.equal(noPiano.q('.forge-scale-piano').length, 0);
  const noStaff = world({ show: { piano: true, staff: false, numbers: true } });
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
  assert.deepEqual(w.handle.state(), { tonic: 'D#', scale: 'natural minor' }, 'Eb and D# are one pitch class: the minor list spells it D#');
  assert.equal(w.q<HTMLSelectElement>('select.forge-scale-tonic')[0].value, 'D#');
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
