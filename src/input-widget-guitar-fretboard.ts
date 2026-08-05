// Guitar fretboard input widget — pure core. Drain 2026-08-05-1530.
//
// Six strings by twenty-two fret positions (0 = open, 1..21 fingered).
// Click an intersection to select it; the selection serializes to the
// pitches those positions sound, as a JSON list, low to high:
//
//     ["E2", "B3", "G4"]
//
// This is the second renderer on the drain-1500 framework and it needed
// ZERO framework changes — one file, one `registerWidget` line, one CSS
// prefix. That was the test of whether the framework was the right
// shape, and it passed.
//
// WHY THERE IS NO `music21` HERE
// -----------------------------
// The drain prompt's fix shape says to compute each pitch with
// `tuning[string].transpose(fret)`. That is music21's Python API; it
// lives in the engine and runs in Pyodide. This widget is plain
// TypeScript in Obsidian's renderer, called synchronously while the Run
// modal is being built — there is no music21 in reach and no
// opportunity to await one.
//
// It does not need one. Transposing by N semitones is integer addition
// on a MIDI number, and drain 1500 already shipped `midiToPitchName`.
// So tunings are stored as MIDI numbers and a fret pitch is
// `midiToPitchName(openStringMidi + fret)` — the same answer music21
// would give for these inputs, with no engine dependency and no async.
//
// WHY JSON AND NOT "E2,B3,G4"
// ---------------------------
// The prompt's example is comma-joined. Drain 1500 shipped JSON,
// because `coerceRunInputValues` JSON-parses every input value, so a
// list arrives at the Recipe as a list and a comma string arrives as a
// string that E-- has no method call to split. Matching piano matters
// more than matching the example: a Recipe author should not have to
// know WHICH widget produced a value to know its shape. Flagged for the
// driver in the drain FEEDBACK.

import type { WidgetRenderer } from './input-widget-core.ts';
import { midiToPitchName } from './input-widget-piano.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One clicked intersection. Field named `string` per the drain
 *  prompt's `GuitarSelection` shape — it is the string INDEX. */
export interface FretPosition {
  string: number;
  fret: number;
}

export interface GuitarSelection {
  tuning: string;
  frets: FretPosition[];
}

export interface Tuning {
  id: string;
  label: string;
  /** Open-string MIDI numbers, LOW to HIGH. Index 0 is the low string. */
  strings: number[];
}

// MIDI: E2=40 A2=45 D3=50 G3=55 B3=59 E4=64; D2=38 G2=43 A3=57 D4=62.
export const TUNINGS: Tuning[] = [
  { id: 'standard', label: 'Standard (EADGBE)', strings: [40, 45, 50, 55, 59, 64] },
  { id: 'drop_d', label: 'Drop D (DADGBE)', strings: [38, 45, 50, 55, 59, 64] },
  { id: 'dadgad', label: 'DADGAD', strings: [38, 45, 50, 55, 57, 62] },
  { id: 'open_g', label: 'Open G (DGDGBD)', strings: [38, 43, 50, 55, 59, 62] },
];

export const DEFAULT_TUNING = 'standard';

/** Positions per string, INCLUDING the open string. 22 means 0..21.
 *  Parametrized per the prompt's §Don'ts — the geometry helpers all
 *  take a count; only the renderer defaults it. */
export const DEFAULT_FRET_COUNT = 22;

export const STRING_COUNT = 6;

export function tuningById(id: string): Tuning {
  return TUNINGS.find(t => t.id === id) ?? TUNINGS[0];
}

/** The pitch a position sounds. Integer addition, then spell it. */
export function fretPitch(tuning: Tuning, stringIndex: number, fret: number): string {
  return midiToPitchName(tuning.strings[stringIndex] + fret);
}

export function fretMidi(tuning: Tuning, stringIndex: number, fret: number): number {
  return tuning.strings[stringIndex] + fret;
}

// Geometry, in SVG user units.
const LABEL_W = 32;   // open-string name column
const NUT_X = LABEL_W + 30;
const FRET_W = 38;
const STRING_GAP = 24;
const TOP = 20;
const FRET_NUM_H = 24;

export const FRETBOARD_HEIGHT =
  TOP + (STRING_COUNT - 1) * STRING_GAP + FRET_NUM_H;

/** Standard inlay positions. Cosmetic, but their absence is the first
 *  thing a guitarist notices — they are how you find fret 7 without
 *  counting. */
const INLAY_FRETS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAY_FRET = 12;

export interface FretCell {
  string: number;
  fret: number;
  /** Dot center. */
  cx: number;
  cy: number;
  /** Transparent hit rectangle. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Every clickable intersection, with its geometry.
 *
 * DISPLAY ORDER IS TAB ORDER: string index 0 (the low string) renders at
 * the BOTTOM, index 5 at the top. That is how guitar tablature is
 * written and how every fretboard diagram a cohort has seen is laid
 * out. The data keeps low-to-high indexing so the tuning arrays read in
 * the order people say them ("E A D G B E").
 */
export function buildFretboard(fretCount = DEFAULT_FRET_COUNT): FretCell[] {
  const cells: FretCell[] = [];
  for (let s = 0; s < STRING_COUNT; s++) {
    const cy = TOP + (STRING_COUNT - 1 - s) * STRING_GAP;
    for (let f = 0; f < fretCount; f++) {
      const x = f === 0 ? LABEL_W : NUT_X + (f - 1) * FRET_W;
      const w = f === 0 ? NUT_X - LABEL_W : FRET_W;
      cells.push({
        string: s,
        fret: f,
        cx: x + w / 2,
        cy,
        x,
        y: cy - STRING_GAP / 2,
        w,
        h: STRING_GAP,
      });
    }
  }
  return cells;
}

export function fretboardWidth(fretCount = DEFAULT_FRET_COUNT): number {
  return NUT_X + (fretCount - 1) * FRET_W + 8;
}

const ATTR_POS = 'data-forge-guitar-pos';
const ATTR_STRING = 'data-string';
const ATTR_FRET = 'data-fret';
const ATTR_SELECTED = 'data-selected';
const ATTR_TUNING = 'data-forge-guitar-tuning';
const ATTR_OPEN_LABEL = 'data-forge-guitar-open-label';

const CLS_SELECTED = 'is-selected';

function posKey(p: FretPosition): string {
  return `${p.string}:${p.fret}`;
}

/** Flip one position's selected state. Exported so the toggle is
 *  testable without synthesizing a click, and reused BY the click
 *  listener so the two paths cannot drift. */
export function toggleFretElement(el: Element): boolean {
  const on = el.getAttribute(ATTR_SELECTED) === 'true';
  const next = !on;
  el.setAttribute(ATTR_SELECTED, next ? 'true' : 'false');
  if (next) el.classList.add(CLS_SELECTED);
  else el.classList.remove(CLS_SELECTED);
  return next;
}

/** Repaint the open-string name column for a tuning. Called on render
 *  and on every tuning change — the labels ARE the feedback that the
 *  dropdown did something, since the dots do not move. */
export function applyTuningLabels(container: HTMLElement, tuning: Tuning): void {
  const labels = container.querySelectorAll(`[${ATTR_OPEN_LABEL}]`);
  labels.forEach(el => {
    const s = Number(el.getAttribute(ATTR_STRING) ?? 0);
    el.textContent = midiToPitchName(tuning.strings[s]).replace(/\d+$/, '');
  });
}

/**
 * The lowest-fret fingering that sounds `pitches` in `tuning`.
 *
 * Needed because serialization is LOSSY on purpose: the Recipe wants
 * pitches, but a pitch can be played in several places, so a cached
 * value cannot say which one was clicked. Rather than open blank on
 * re-entry — which would look like the selection was lost — this picks
 * *a* way to play the notes: lowest fret first, and among equal frets
 * the highest string. That lands near open position, which is where a
 * guitarist would look first.
 *
 * Consequence worth knowing: re-opening the modal can show a DIFFERENT
 * fingering from the one clicked. The pitches are identical, which is
 * what the Recipe receives.
 */
export function fingeringFor(
  pitches: string[],
  tuning: Tuning,
  fretCount = DEFAULT_FRET_COUNT,
): FretPosition[] {
  const wanted = new Set(pitches);
  const out: FretPosition[] = [];
  for (const pitch of wanted) {
    let best: FretPosition | null = null;
    for (let s = STRING_COUNT - 1; s >= 0; s--) {
      for (let f = 0; f < fretCount; f++) {
        if (fretPitch(tuning, s, f) !== pitch) continue;
        if (!best || f < best.fret) best = { string: s, fret: f };
        break;  // lowest fret on this string; no need to look higher
      }
    }
    if (best) out.push(best);
  }
  return out;
}

export const guitarFretboardWidget: WidgetRenderer<GuitarSelection> = {
  type: 'guitar_fretboard',

  render(container: HTMLElement, initialSelection: GuitarSelection): void {
    const doc = container.ownerDocument;
    const fretCount = DEFAULT_FRET_COUNT;
    const cells = buildFretboard(fretCount);
    const totalWidth = fretboardWidth(fretCount);
    const tuning = tuningById(initialSelection?.tuning ?? DEFAULT_TUNING);
    const selected = new Set((initialSelection?.frets ?? []).map(posKey));

    container.classList.add('forge-guitar');
    container.setAttribute(ATTR_TUNING, tuning.id);

    // --- tuning dropdown ------------------------------------------
    const controls = doc.createElement('div');
    controls.className = 'forge-guitar-controls';
    const label = doc.createElement('label');
    label.className = 'forge-guitar-tuning-label';
    label.textContent = 'Tuning';
    const select = doc.createElement('select');
    select.className = 'forge-guitar-tuning';
    for (const t of TUNINGS) {
      const opt = doc.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      select.appendChild(opt);
    }
    select.value = tuning.id;
    select.addEventListener('change', () => {
      // Positions are held; only what they SOUND changes. That is the
      // whole point of a tuning control — the shape you fingered stays,
      // the notes move.
      const next = tuningById(select.value);
      container.setAttribute(ATTR_TUNING, next.id);
      applyTuningLabels(container, next);
    });
    controls.appendChild(label);
    controls.appendChild(select);
    container.appendChild(controls);

    // --- board ----------------------------------------------------
    const scroller = doc.createElement('div');
    scroller.className = 'forge-guitar-scroller';
    container.appendChild(scroller);

    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'forge-guitar-svg');
    svg.setAttribute('width', String(totalWidth));
    svg.setAttribute('height', String(FRETBOARD_HEIGHT));
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${FRETBOARD_HEIGHT}`);
    scroller.appendChild(svg);

    const boardRight = NUT_X + (fretCount - 1) * FRET_W;

    // Inlays first, so everything else paints over them.
    for (let f = 1; f < fretCount; f++) {
      const cx = NUT_X + (f - 0.5) * FRET_W;
      const midY = TOP + ((STRING_COUNT - 1) / 2) * STRING_GAP;
      if (f === DOUBLE_INLAY_FRET) {
        for (const dy of [-STRING_GAP, STRING_GAP]) {
          const dot = doc.createElementNS(SVG_NS, 'circle');
          dot.setAttribute('cx', String(cx));
          dot.setAttribute('cy', String(midY + dy));
          dot.setAttribute('r', '4');
          dot.setAttribute('class', 'forge-guitar-inlay');
          svg.appendChild(dot);
        }
      } else if (INLAY_FRETS.includes(f)) {
        const dot = doc.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', String(cx));
        dot.setAttribute('cy', String(midY));
        dot.setAttribute('r', '4');
        dot.setAttribute('class', 'forge-guitar-inlay');
        svg.appendChild(dot);
      }
    }

    // Fret wires, then the nut (thicker, and it must paint over wire 0).
    for (let f = 1; f < fretCount; f++) {
      const x = NUT_X + (f - 1) * FRET_W;
      const wire = doc.createElementNS(SVG_NS, 'line');
      wire.setAttribute('x1', String(x));
      wire.setAttribute('x2', String(x));
      wire.setAttribute('y1', String(TOP - STRING_GAP / 2));
      wire.setAttribute('y2', String(TOP + (STRING_COUNT - 1) * STRING_GAP + STRING_GAP / 2));
      wire.setAttribute('class', 'forge-guitar-fret');
      svg.appendChild(wire);
    }
    const nut = doc.createElementNS(SVG_NS, 'line');
    nut.setAttribute('x1', String(NUT_X));
    nut.setAttribute('x2', String(NUT_X));
    nut.setAttribute('y1', String(TOP - STRING_GAP / 2));
    nut.setAttribute('y2', String(TOP + (STRING_COUNT - 1) * STRING_GAP + STRING_GAP / 2));
    nut.setAttribute('class', 'forge-guitar-nut');
    svg.appendChild(nut);

    // Strings, thicker toward the low end — the visual cue that tells
    // you which way up the diagram is without reading the labels.
    for (let s = 0; s < STRING_COUNT; s++) {
      const y = TOP + (STRING_COUNT - 1 - s) * STRING_GAP;
      const line = doc.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(LABEL_W));
      line.setAttribute('x2', String(boardRight));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('class', 'forge-guitar-string');
      line.setAttribute(ATTR_STRING, String(s));
      line.setAttribute('stroke-width', String(1 + (STRING_COUNT - 1 - s) * 0.25));
      svg.appendChild(line);

      const openLabel = doc.createElementNS(SVG_NS, 'text');
      openLabel.setAttribute('x', String(LABEL_W - 8));
      openLabel.setAttribute('y', String(y + 4));
      openLabel.setAttribute('text-anchor', 'end');
      openLabel.setAttribute('class', 'forge-guitar-open-label');
      openLabel.setAttribute(ATTR_OPEN_LABEL, '');
      openLabel.setAttribute(ATTR_STRING, String(s));
      svg.appendChild(openLabel);
    }

    // Fret numbers.
    for (let f = 1; f < fretCount; f++) {
      const num = doc.createElementNS(SVG_NS, 'text');
      num.setAttribute('x', String(NUT_X + (f - 0.5) * FRET_W));
      num.setAttribute('y', String(FRETBOARD_HEIGHT - 8));
      num.setAttribute('text-anchor', 'middle');
      num.setAttribute('class', 'forge-guitar-fret-number');
      num.textContent = String(f);
      svg.appendChild(num);
    }

    // Clickable positions, last so they sit on top of every decoration.
    for (const cell of cells) {
      const g = doc.createElementNS(SVG_NS, 'g');
      g.setAttribute(ATTR_POS, '');
      g.setAttribute(ATTR_STRING, String(cell.string));
      g.setAttribute(ATTR_FRET, String(cell.fret));
      const isOn = selected.has(posKey(cell));
      g.setAttribute(ATTR_SELECTED, isOn ? 'true' : 'false');
      if (isOn) g.classList.add(CLS_SELECTED);

      // `fill: transparent` in CSS, NOT `fill: none` — `none` is not
      // hit-testable in SVG, so the cell would look identical and
      // silently swallow every click.
      const hit = doc.createElementNS(SVG_NS, 'rect');
      hit.setAttribute('x', String(cell.x));
      hit.setAttribute('y', String(cell.y));
      hit.setAttribute('width', String(cell.w));
      hit.setAttribute('height', String(cell.h));
      hit.setAttribute('class', 'forge-guitar-cell');
      g.appendChild(hit);

      const dot = doc.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(cell.cx));
      dot.setAttribute('cy', String(cell.cy));
      dot.setAttribute('r', '8');
      dot.setAttribute('class', 'forge-guitar-dot');
      g.appendChild(dot);

      g.addEventListener('click', () => { toggleFretElement(g); });
      svg.appendChild(g);
    }

    applyTuningLabels(container, tuning);
  },

  getSelection(container: HTMLElement): GuitarSelection {
    const tuning = container.getAttribute(ATTR_TUNING) ?? DEFAULT_TUNING;
    const els = container.querySelectorAll(`[${ATTR_POS}][${ATTR_SELECTED}="true"]`);
    const frets: FretPosition[] = [];
    els.forEach(el => {
      frets.push({
        string: Number(el.getAttribute(ATTR_STRING) ?? 0),
        fret: Number(el.getAttribute(ATTR_FRET) ?? 0),
      });
    });
    return { tuning, frets };
  },

  serialize(selection: GuitarSelection): string {
    const tuning = tuningById(selection?.tuning ?? DEFAULT_TUNING);
    const midis = (selection?.frets ?? []).map(p => fretMidi(tuning, p.string, p.fret));
    // De-duplicated: two strings can sound the same pitch, and a
    // unison in the Recipe's input list is noise, not information.
    const unique = [...new Set(midis)].sort((a, b) => a - b);
    return JSON.stringify(unique.map(midiToPitchName));
  },

  /**
   * Read a cached raw value back into a selection.
   *
   * Two things are unrecoverable and both degrade to a default rather
   * than to a throw: the fingering (see `fingeringFor`) and the tuning,
   * which never left the widget because serialization emits pitches.
   * So a re-opened widget shows standard tuning holding the same notes.
   */
  deserialize(raw: string | undefined): GuitarSelection {
    const empty: GuitarSelection = { tuning: DEFAULT_TUNING, frets: [] };
    if (!raw) return empty;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return empty;
      const pitches = parsed.filter((p): p is string => typeof p === 'string');
      return {
        tuning: DEFAULT_TUNING,
        frets: fingeringFor(pitches, tuningById(DEFAULT_TUNING)),
      };
    } catch {
      return empty;
    }
  },
};
