// Piano keyboard input widget — pure core. Drain 2026-08-05-1500.
//
// An 88-key keyboard (A0 to C8, MIDI 21..108) rendered as SVG. Click a
// key to select it; click again to deselect. The selection serializes
// to a JSON list of pitch names in ascending order:
//
//     ["C4", "E4", "G4"]
//
// WHY JSON AND NOT "C4,E4,G4"
// ---------------------------
// `ForgeRunModal.submit` has run every input value through
// `JSON.parse`-with-string-fallback since long before this drain (now
// `coerceRunInputValues` in input-widget-core.ts). A JSON list
// therefore arrives at the Recipe as an actual list, with nothing else
// in the chain changing. A comma-joined string would arrive as a
// string, and E-- has no method calls — the cohort would need a `{{ }}`
// slot to `.split(",")` before the value was usable. The convention was
// effectively already chosen; this widget just matches it.
//
// The pitch strings are the spelling music21 already takes:
// `pitch.Pitch("C4")`, `pitch.Pitch("F#5")`. Sharps, never flats — one
// spelling per key, so a round-trip through the widget is stable. A
// cohort who wants Db can still type it; the widget is an affordance,
// not a restriction on what the Recipe accepts.
//
// NO OBSIDIAN IMPORTS, and no reliance on a global `document`: every
// element comes from `container.ownerDocument`, so the widget renders
// identically under Obsidian and under happy-dom in the suite.

import type { WidgetRenderer } from './input-widget-core.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** MIDI note numbers of the 88-key range: A0 (21) .. C8 (108). */
export const LOWEST_MIDI = 21;
export const HIGHEST_MIDI = 108;

/** Sharp spellings, indexed by pitch class. */
const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Pitch classes that are black keys. */
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

// Geometry, in SVG user units. White-key width drives everything else.
const WHITE_W = 24;
const WHITE_H = 130;
const BLACK_W = 14;
const BLACK_H = 82;
const LABEL_H = 16;

export const KEYBOARD_HEIGHT = WHITE_H + LABEL_H;

/** `60` -> `"C4"`. Scientific pitch notation, so C4 is middle C. */
export function midiToPitchName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${PC_NAMES[pc]}${octave}`;
}

export function isBlackKey(midi: number): boolean {
  return BLACK_PCS.has(((midi % 12) + 12) % 12);
}

export interface PianoKey {
  midi: number;
  pitch: string;
  black: boolean;
  /** Left edge in SVG user units. */
  x: number;
  width: number;
  height: number;
}

/**
 * The 88 keys with their geometry.
 *
 * White keys tile left to right. Each black key straddles the boundary
 * between the white key before it and the one after, which is why its
 * `x` is derived from the running white-key count rather than from its
 * own index — the black keys are not evenly spaced, and computing them
 * from a fixed stride is the classic way to draw a keyboard that looks
 * subtly wrong.
 */
export function buildKeyboard(): PianoKey[] {
  const keys: PianoKey[] = [];
  let whiteIndex = 0;
  for (let midi = LOWEST_MIDI; midi <= HIGHEST_MIDI; midi++) {
    const black = isBlackKey(midi);
    if (black) {
      // Sits between white `whiteIndex - 1` and white `whiteIndex`.
      keys.push({
        midi,
        pitch: midiToPitchName(midi),
        black: true,
        x: whiteIndex * WHITE_W - BLACK_W / 2,
        width: BLACK_W,
        height: BLACK_H,
      });
    } else {
      keys.push({
        midi,
        pitch: midiToPitchName(midi),
        black: false,
        x: whiteIndex * WHITE_W,
        width: WHITE_W,
        height: WHITE_H,
      });
      whiteIndex++;
    }
  }
  return keys;
}

/** Total SVG width: the white keys tile the whole thing. */
export function keyboardWidth(keys: PianoKey[]): number {
  return keys.filter(k => !k.black).length * WHITE_W;
}

/**
 * Where to scroll so `targetCenterX` sits in the middle of the viewport,
 * clamped to the scrollable range.
 *
 * Split out from the render so it is testable: in a headless DOM the
 * viewport measures 0 wide, and this then degenerates to "put the target
 * at the left edge" rather than producing a negative or NaN scroll.
 */
export function initialScrollLeft(
  targetCenterX: number,
  viewportWidth: number,
  totalWidth: number,
): number {
  const maxScroll = Math.max(0, totalWidth - viewportWidth);
  const ideal = targetCenterX - viewportWidth / 2;
  return Math.min(Math.max(0, ideal), maxScroll);
}

/** Center X of the key the keyboard opens on. */
export function centerXOf(keys: PianoKey[], midi: number): number {
  const key = keys.find(k => k.midi === midi);
  if (!key) return 0;
  return key.x + key.width / 2;
}

/** Middle C — the reference point a musician scans for first. */
const DEFAULT_CENTER_MIDI = 60;

const ATTR_KEY = 'data-forge-piano-key';
const ATTR_MIDI = 'data-midi';
const ATTR_PITCH = 'data-pitch';
const ATTR_SELECTED = 'data-selected';

const CLS_SELECTED = 'is-selected';

/** Sort pitch names by pitch, not alphabetically — `["C4","E4","G4"]`,
 *  never `["C4","G4","E4"]` just because that was the click order. */
function sortByPitch(pitches: string[], keys: PianoKey[]): string[] {
  const order = new Map(keys.map(k => [k.pitch, k.midi]));
  return [...pitches].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export const pianoWidget: WidgetRenderer<string[]> = {
  type: 'piano',

  render(container: HTMLElement, initialSelection: string[]): void {
    const doc = container.ownerDocument;
    const keys = buildKeyboard();
    const totalWidth = keyboardWidth(keys);
    const selected = new Set(initialSelection);

    container.classList.add('forge-piano');

    const scroller = doc.createElement('div');
    scroller.className = 'forge-piano-scroller';
    container.appendChild(scroller);

    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'forge-piano-svg');
    svg.setAttribute('width', String(totalWidth));
    svg.setAttribute('height', String(KEYBOARD_HEIGHT));
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${KEYBOARD_HEIGHT}`);
    scroller.appendChild(svg);

    // White keys first, then black, so the blacks paint on top without
    // needing z-index (SVG has none — paint order IS the stacking).
    const ordered = [...keys.filter(k => !k.black), ...keys.filter(k => k.black)];
    for (const key of ordered) {
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(key.x));
      rect.setAttribute('y', '0');
      rect.setAttribute('width', String(key.width));
      rect.setAttribute('height', String(key.height));
      rect.setAttribute(
        'class',
        `forge-piano-key ${key.black ? 'forge-piano-key-black' : 'forge-piano-key-white'}`,
      );
      rect.setAttribute(ATTR_KEY, '');
      rect.setAttribute(ATTR_MIDI, String(key.midi));
      rect.setAttribute(ATTR_PITCH, key.pitch);
      const isOn = selected.has(key.pitch);
      rect.setAttribute(ATTR_SELECTED, isOn ? 'true' : 'false');
      if (isOn) rect.classList.add(CLS_SELECTED);
      rect.addEventListener('click', () => { toggleKeyElement(rect); });
      svg.appendChild(rect);
    }

    // Octave markers under each C, so the cohort can find their register
    // without counting keys.
    for (const key of keys) {
      if (key.black || key.midi % 12 !== 0) continue;
      const label = doc.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(key.x + key.width / 2));
      label.setAttribute('y', String(WHITE_H + LABEL_H - 4));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'forge-piano-label');
      label.textContent = key.pitch;
      svg.appendChild(label);
    }

    // Open centered on middle C. `clientWidth` is 0 before layout (and
    // in the headless suite); `initialScrollLeft` degenerates to
    // "C4 at the left edge" there rather than producing nonsense.
    scroller.scrollLeft = initialScrollLeft(
      centerXOf(keys, DEFAULT_CENTER_MIDI),
      scroller.clientWidth ?? 0,
      totalWidth,
    );
  },

  getSelection(container: HTMLElement): string[] {
    const els = container.querySelectorAll(`[${ATTR_KEY}][${ATTR_SELECTED}="true"]`);
    const out: { midi: number; pitch: string }[] = [];
    els.forEach(el => {
      const pitch = el.getAttribute(ATTR_PITCH);
      if (!pitch) return;
      out.push({ midi: Number(el.getAttribute(ATTR_MIDI) ?? 0), pitch });
    });
    out.sort((a, b) => a.midi - b.midi);
    return out.map(o => o.pitch);
  },

  serialize(selection: string[]): string {
    return JSON.stringify(sortByPitch(selection, buildKeyboard()));
  },

  /**
   * Read a cached raw value back into a selection.
   *
   * Tolerant on purpose: the cache is a plain string from a previous
   * run and may predate this widget entirely (the same input could have
   * been a text box last week). Anything unreadable opens the keyboard
   * blank, which is a fine place to start, rather than throwing inside
   * modal construction where there is nowhere to report it.
   */
  deserialize(raw: string | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const known = new Set(buildKeyboard().map(k => k.pitch));
      return parsed.filter((p): p is string => typeof p === 'string' && known.has(p));
    } catch {
      return [];
    }
  },
};

/** Flip one key's selected state. Exported so the toggle is testable
 *  without synthesizing a click, and reused by the click listener so
 *  the test and production paths cannot drift. */
export function toggleKeyElement(el: Element): boolean {
  const on = el.getAttribute(ATTR_SELECTED) === 'true';
  const next = !on;
  el.setAttribute(ATTR_SELECTED, next ? 'true' : 'false');
  if (next) el.classList.add(CLS_SELECTED);
  else el.classList.remove(CLS_SELECTED);
  return next;
}
