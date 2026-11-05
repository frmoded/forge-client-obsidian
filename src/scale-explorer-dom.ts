// 2026-11-04-1170 (Scale Explorer 1 of 4) — the DOM half of the `forge-scale` block: `mountScaleExplorer(el, options, deps)` draws one scale as controls + a piano (highlighted keys, the root marked, degree numbers) + a staff, and plays it.
// No `obsidian` import and no engine: the staff drawer and the sound are INJECTED (deps), so this runs under happy-dom and in the Chrome measure with a test double for the sound, and the lean edition never reaches it (it is reached only
// through music-edition.full.ts -> scale-explorer-view.ts). The scale itself is scale-explorer-core.ts.
//
// The piano is input-widget-piano.ts's own keyboard (buildKeyboard / keyboardWidth / centerXOf / initialScrollLeft / KEYBOARD_HEIGHT, and its CSS classes), not a copy: 88 keys in a horizontal scroller, 146 px tall, opened on the scale.

import { KEYBOARD_HEIGHT, buildKeyboard, centerXOf, initialScrollLeft, keyboardWidth } from './input-widget-piano.ts';
import { mountFreeMode } from './free-mode-dom.ts';
import { GUITAR_FRETS, positionsOf, tabForRun, tabText } from './guitar-core.ts';
import { mountGuitar } from './guitar-dom.ts';
import { CHORD_QUALITIES, CHORD_QUALITY_LABELS, chordMusicXML, chordNotes, chordRootName, chordRootNamesFor, nameChord, type ChordQuality } from './chord-names-core.ts';
import {
  SCALE_TYPES,
  SCALE_TYPE_LABELS,
  degreeLabels,
  intervalPattern,
  normalizeTonic,
  parseScaleExplorerSource,
  playEvents,
  scaleMusicXML,
  scaleNotes,
  tonicAfterTypeChange,
  tonicNamesFor,
  type PlayEvent,
  type PlayMode,
  type ScaleExplorerOptions,
  type ScaleNote,
  type ScaleType,
} from './scale-explorer-core.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The sound seam. `play` starts a plan and reports each note's start and end and the end of the plan; `stop` silences it at once (and must not call the hooks). Nothing sounds until `play` is called. */
export interface ScaleSound {
  play(events: readonly PlayEvent[], hooks: { onNoteOn(midi: number): void; onNoteOff(midi: number): void; onEnd(): void }): void;
  stop(): void;
}

export interface ScaleExplorerDeps {
  sound: ScaleSound;
  /** Engrave the MusicXML into `host`. Absent: the staff is left out. */
  renderStaff?: (host: HTMLElement, musicxml: string) => Promise<void>;
}

export interface ScaleExplorerHandle {
  /** The tonic and scale type shown now. */
  /** The tonic (the root, in chord mode) and the scale type shown now; chord mode answers `{ tonic, chord }` instead. */
  state(): { tonic: string; scale: ScaleType } | { tonic: string; chord: ChordQuality } | { tonic: string; scale: ScaleType; picked: number[] };
  /** Silence and unlight (a second press of the same Play button does this too). */
  stop(): void;
  destroy(): void;
}

const SCALE_PLAY_MODES: readonly { mode: PlayMode; label: string }[] = [
  { mode: 'up', label: 'Play up' },
  { mode: 'down', label: 'Play down' },
  { mode: 'together', label: 'Play together' },
];
/** Chord mode (1171): the chord all at once, or one note after the other, upward. */
const CHORD_PLAY_MODES: readonly { mode: PlayMode; label: string }[] = [
  { mode: 'together', label: 'Play together' },
  { mode: 'arpeggio', label: 'Play arpeggio' },
];

export { tonicAfterTypeChange };

/** The root the dropdown shows after the chord quality changes: the same pitch class, named the way the new quality's list names it. */
export function rootAfterQualityChange(root: string, from: ChordQuality, to: ChordQuality): string {
  const pc = chordNotes(root, from, 4)[0].midi % 12;
  return chordRootName(pc, to);
}

export function mountScaleExplorer(el: HTMLElement, options: ScaleExplorerOptions, deps: ScaleExplorerDeps): ScaleExplorerHandle {
  if (options.mode === 'free') return mountFreeMode(el, options, deps);   // 2026-11-04-1172: free mode lives in its own module (scale and chord mode are untouched)
  const doc = el.ownerDocument;
  let tonic = options.tonic;
  let scale = options.scale;
  let chord = options.chord;
  const chordMode = options.mode === 'chord';
  const PLAY_MODES = chordMode ? CHORD_PLAY_MODES : SCALE_PLAY_MODES;
  let playing: PlayMode | null = null;
  let drawToken = 0;
  let destroyed = false;

  const root = doc.createElement('div');
  root.className = 'forge-scale';
  el.appendChild(root);

  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // ---- controls ----------------------------------------------------------------------------------------------------------------------------------------------
  let tonicSelect: HTMLSelectElement | null = null;
  let typeSelect: HTMLSelectElement | null = null;
  const playButtons = new Map<PlayMode, HTMLButtonElement>();

  const fillTonics = (): void => {
    if (!tonicSelect) return;
    const names = chordMode ? chordRootNamesFor(chord) : tonicNamesFor(scale);
    if (!names.includes(tonic)) names.push(tonic);
    tonicSelect.textContent = '';
    for (const n of names) {
      const o = h('option', undefined, n);
      o.value = n;
      tonicSelect.appendChild(o);
    }
    tonicSelect.value = tonic;
  };

  if (options.controls) {
    const bar = h('div', 'forge-scale-controls');
    const tLabel = h('label', 'forge-scale-field', 'Tonic ');
    tonicSelect = h('select', 'forge-scale-tonic');
    tonicSelect.setAttribute('aria-label', 'Tonic');
    tLabel.appendChild(tonicSelect);
    const sLabel = h('label', 'forge-scale-field', chordMode ? 'Chord ' : 'Scale ');
    typeSelect = h('select', chordMode ? 'forge-scale-type forge-chord-quality' : 'forge-scale-type');
    typeSelect.setAttribute('aria-label', chordMode ? 'Chord quality' : 'Scale type');
    for (const t of chordMode ? CHORD_QUALITIES : SCALE_TYPES) {
      const o = h('option', undefined, chordMode ? CHORD_QUALITY_LABELS[t as ChordQuality] : SCALE_TYPE_LABELS[t as ScaleType]);
      o.value = t;
      typeSelect.appendChild(o);
    }
    typeSelect.value = chordMode ? chord : scale;
    sLabel.appendChild(typeSelect);
    bar.append(tLabel, sLabel);
    for (const { mode, label } of PLAY_MODES) {
      const b = h('button', 'forge-scale-play', label);
      b.type = 'button';
      b.setAttribute('data-mode', mode);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { onPlayPressed(mode); });
      playButtons.set(mode, b);
      bar.appendChild(b);
    }
    root.appendChild(bar);
    fillTonics();
    tonicSelect.addEventListener('change', () => {
      const t = normalizeTonic(tonicSelect!.value);
      if (!t) return;
      stop();
      tonic = t;
      draw();
    });
    typeSelect.addEventListener('change', () => {
      stop();
      if (chordMode) {
        const next = typeSelect!.value as ChordQuality;
        tonic = rootAfterQualityChange(tonic, chord, next);
        chord = next;
      } else {
        const next = typeSelect!.value as ScaleType;
        tonic = tonicAfterTypeChange(tonic, scale, next);
        scale = next;
      }
      fillTonics();
      draw();
    });
  }

  // Chord mode: the chord's name, large, above the piano ("C major", "G7"). Scale mode has no such element.
  const chordName = chordMode ? h('div', 'forge-scale-chord-name') : null;
  if (chordName) { chordName.setAttribute('aria-live', 'polite'); root.appendChild(chordName); }
  const caption = h('div', 'forge-scale-caption');
  caption.setAttribute('aria-live', 'polite');
  root.appendChild(caption);
  const pianoHost = options.show.piano ? h('div', 'forge-scale-piano') : null;
  if (pianoHost) root.appendChild(pianoHost);
  // 2026-11-05-1185: the interval pattern of the scale TYPE (W W H W W W H over 2 2 1 2 2 2 1) as a row of chips right under the piano: scale mode with `show: ... intervals` only (the default picture of a scale block has it). Chord and free mode never.
  const intervalsHost = !chordMode && options.show.intervals ? h('div', 'forge-scale-intervals') : null;
  if (intervalsHost) root.appendChild(intervalsHost);
  // 2026-11-04-1173: the guitar fretboard under the piano (or alone), and the one-line tab of the played run under it. Absent unless `show: guitar`: scale and chord mode without it are byte-identical.
  const guitarHost = options.show.guitar ? h('div', 'forge-scale-guitar') : null;
  if (guitarHost) root.appendChild(guitarHost);
  const tabHost = options.show.guitar && options.tab ? h('div', 'forge-scale-tab') : null;
  if (tabHost) root.appendChild(tabHost);
  const staffHost = options.show.staff && deps.renderStaff ? h('div', 'forge-scale-staff') : null;
  if (staffHost) root.appendChild(staffHost);
  const litMidis = new Set<number>();
  const guitar = guitarHost ? mountGuitar(guitarHost, { onClick: (pos) => { deps.sound.play([{ midi: pos.midi, startMs: 0, durMs: 350 }], { onNoteOn: () => {}, onNoteOff: () => {}, onEnd: () => {} }); } }) : null;

  // ---- drawing -----------------------------------------------------------------------------------------------------------------------------------------------
  let notes: ScaleNote[] = [];
  let keyEls = new Map<number, SVGElement>();

  const drawPiano = (): void => {
    if (!pianoHost) return;
    pianoHost.textContent = '';
    keyEls = new Map();
    const keys = buildKeyboard();
    const total = keyboardWidth(keys);
    const scroller = h('div', 'forge-piano-scroller');
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'forge-piano-svg forge-scale-svg');
    svg.setAttribute('width', String(total));
    svg.setAttribute('height', String(KEYBOARD_HEIGHT));
    svg.setAttribute('viewBox', `0 0 ${total} ${KEYBOARD_HEIGHT}`);
    scroller.appendChild(svg);
    pianoHost.appendChild(scroller);
    const byMidi = new Map(notes.map((n) => [n.midi, n]));
    // White keys first, then black: paint order is the stacking (as in the piano widget).
    for (const key of [...keys.filter((k) => !k.black), ...keys.filter((k) => k.black)]) {
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(key.x));
      rect.setAttribute('y', '0');
      rect.setAttribute('width', String(key.width));
      rect.setAttribute('height', String(key.height));
      rect.setAttribute('data-midi', String(key.midi));
      rect.setAttribute('data-pitch', key.pitch);
      const note = byMidi.get(key.midi);
      let cls = `forge-piano-key ${key.black ? 'forge-piano-key-black' : 'forge-piano-key-white'}`;
      if (note) {
        cls += ' forge-scale-key is-scale';
        if (note.degree === 1 || (!chordMode && note.degree === 8)) cls += ' is-root';
        rect.setAttribute('data-degree', String(note.degree));
        rect.setAttribute('data-name', note.name);
        keyEls.set(key.midi, rect);
      }
      rect.setAttribute('class', cls);
      svg.appendChild(rect);
    }
    if (options.show.numbers) {
      const labels = degreeLabels(notes);
      notes.forEach((n, i) => {
        const key = keys.find((k) => k.midi === n.midi);
        if (!key) return;
        const t = doc.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', String(key.x + key.width / 2));
        t.setAttribute('y', String(key.height - 8));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('class', 'forge-scale-degree');
        t.setAttribute('data-degree', String(n.degree));
        t.textContent = labels[i];
        svg.appendChild(t);
      });
    }
    const first = keys.find((k) => k.midi === notes[0].midi);
    const last = keys.find((k) => k.midi === notes[notes.length - 1].midi);
    const mid = first && last ? (centerXOf(keys, first.midi) + centerXOf(keys, last.midi)) / 2 : 0;
    const scrollToScale = (): void => { scroller.scrollLeft = initialScrollLeft(mid, scroller.clientWidth ?? 0, total); };
    scrollToScale();
    // The host may not be laid out yet (the block's element is attached after the processor returns): once more on the next frame.
    const raf = (doc.defaultView as (Window & typeof globalThis) | null)?.requestAnimationFrame;
    if (raf) raf.call(doc.defaultView, () => { if (!destroyed) scrollToScale(); });
  };

  /** The seven steps of the scale TYPE, one chip each: the letter (W, H, W+H) over the semitones. Redrawn with the rest, so a change of type changes it (a change of tonic does not: the pattern is the type's). */
  const drawIntervals = (): void => {
    if (!intervalsHost) return;
    intervalsHost.textContent = '';
    intervalsHost.setAttribute('role', 'group');
    intervalsHost.setAttribute('aria-label', 'Interval pattern: the steps between the degrees, W whole tone, H half tone');
    for (const step of intervalPattern(scale)) {
      const chip = h('span', 'forge-scale-step');
      chip.setAttribute('data-semitones', String(step.semitones));
      chip.title = `${step.semitones} semitone${step.semitones === 1 ? '' : 's'}`;
      chip.append(h('span', 'forge-scale-step-letter', step.letter), h('span', 'forge-scale-step-semis', String(step.semitones)));
      intervalsHost.appendChild(chip);
    }
  };

  const drawStaff = (): void => {
    if (!staffHost || !deps.renderStaff) return;
    const token = ++drawToken;
    const engrave = deps.renderStaff;
    const host = h('div', 'forge-scale-staff-score');
    staffHost.textContent = '';
    staffHost.appendChild(host);
    engrave(host, chordMode ? chordMusicXML(tonic, chord, options.octave) : scaleMusicXML(tonic, scale, options.octave)).catch((e: unknown) => {
      if (token !== drawToken || destroyed) return;
      console.error('Forge: scale explorer — the staff could not be drawn:', e);
      host.textContent = `The staff could not be drawn: ${e instanceof Error ? e.message : String(e)}`;
      host.classList.add('forge-scale-staff-error');
    });
  };

  const drawGuitar = (): void => {
    if (!guitar) return;
    const names = new Map<number, string>();
    const degrees = new Map<number, number>();
    for (const n of notes) {
      const pc = ((n.midi % 12) + 12) % 12;
      if (!names.has(pc)) { names.set(pc, n.name.replace(/\d+$/, '')); degrees.set(pc, n.degree); }   // the first note of a pitch class: the octave note is degree 1 again
    }
    const rootPc = ((notes[0].midi % 12) + 12) % 12;
    guitar.setDots(positionsOf(notes.map((n) => n.name), GUITAR_FRETS, { root: rootPc, degrees }).map((p) => ({ ...p, label: options.labels === 'degrees' ? String(p.degree) : names.get(p.pc)! })));
    if (tabHost) tabHost.textContent = tabText(tabForRun(notes.map((n) => n.midi)));
  };

  const draw = (): void => {
    notes = chordMode ? chordNotes(tonic, chord, options.octave) : scaleNotes(tonic, scale, options.octave);
    root.setAttribute('data-tonic', tonic);
    if (chordMode) {
      root.setAttribute('data-mode', 'chord');
      root.setAttribute('data-chord', chord);
      const named = nameChord(notes.map((n) => n.name));
      if (chordName) chordName.textContent = named.title ?? `${tonic} ${chord}`;
      caption.textContent = notes.map((n) => n.name.replace(/\d+$/, '')).join(' ');
    } else {
      root.setAttribute('data-scale', scale);
      caption.textContent = `${tonic} ${SCALE_TYPE_LABELS[scale]}: ${notes.map((n) => n.name.replace(/\d+$/, '')).join(' ')}`;
    }
    drawPiano();
    drawIntervals();
    drawGuitar();
    drawStaff();
  };

  // ---- sound -------------------------------------------------------------------------------------------------------------------------------------------------
  const light = (midi: number, on: boolean): void => {
    keyEls.get(midi)?.classList.toggle('is-playing', on);
    if (on) litMidis.add(midi); else litMidis.delete(midi);
    guitar?.setLit(litMidis);
  };
  const clearLit = (): void => { for (const k of keyEls.values()) k.classList.remove('is-playing'); litMidis.clear(); guitar?.setLit(litMidis); };

  const refreshButtons = (): void => {
    for (const { mode, label } of PLAY_MODES) {
      const b = playButtons.get(mode);
      if (!b) continue;
      const on = playing === mode;
      b.textContent = on ? 'Stop' : label;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };

  function stop(): void {
    deps.sound.stop();
    clearLit();
    playing = null;
    refreshButtons();
  }

  function onPlayPressed(mode: PlayMode): void {
    if (playing === mode) { stop(); return; }
    stop();
    playing = mode;
    refreshButtons();
    deps.sound.play(playEvents(notes.map((n) => n.midi), mode), {
      onNoteOn: (midi) => { light(midi, true); },
      onNoteOff: (midi) => { light(midi, false); },
      onEnd: () => {
        clearLit();
        playing = null;
        refreshButtons();
      },
    });
  }

  draw();

  return {
    state: () => (chordMode ? { tonic, chord } : { tonic, scale }),
    stop,
    destroy: () => {
      destroyed = true;
      deps.sound.stop();
      root.remove();
    },
  };
}

/** The error box: an inline message in the block's place, in the forge-rhythm style (never thrown, never breaks the rest of the page). */
export function showScaleError(el: HTMLElement, message: string): void {
  const doc = el.ownerDocument;
  const box = doc.createElement('div');
  box.className = 'forge-scale-error';
  const p = doc.createElement('p');
  p.textContent = `Scale explorer: ${message}`;
  box.appendChild(p);
  el.appendChild(box);
}

/** A `forge-scale` block's source -> the explorer, or the inline error naming the bad line (null returned). */
export function mountScaleBlock(el: HTMLElement, source: string, deps: ScaleExplorerDeps): ScaleExplorerHandle | null {
  el.classList.add('forge-scale-block');
  const parsed = parseScaleExplorerSource(source);
  if (parsed.ok === false) { showScaleError(el, parsed.message); return null; }
  try {
    return mountScaleExplorer(el, parsed.options, deps);
  } catch (e) {
    console.error('Forge: scale explorer (block) —', e);
    showScaleError(el, e instanceof Error ? e.message : String(e));
    return null;
  }
}
