// Chord builder input widget — pure core. Drain 2026-08-05-1600.
//
// Four dropdowns — root, quality, inversion, octave — and a live
// preview of the pitches they spell. Third of three renderers on the
// drain-1500 framework; like the guitar (drain 1530), it needed zero
// framework changes.
//
// Serializes to the same JSON pitch list as the piano and guitar:
//
//     ["C4","E4","G4"]
//
// The compatibility clause in the drain prompt — "chord builder OUTPUT
// compatible with piano widget INPUT" — is the reason this module
// spells accidentals as SHARPS even though the prompt's own preview
// example writes 'Eb4'. `pianoWidget.deserialize` filters against the
// keyboard's known pitch names, and those are sharp spellings; an
// 'Eb4' in the cache would be silently dropped on the piano side. One
// spelling across all three widgets, and the round-trip is pinned by a
// test that literally feeds this widget's output to the piano's
// deserialize.
//
// THE INTERVAL MAP IS HARDCODED on purpose (prompt §Don'ts): the
// widget runs synchronously at modal-build time, offline, with no
// music21 in reach — the same constraint the guitar hit, resolved the
// same way. The engine's own chord sites (`chord.Chord([...])` at
// forge/music/lib.py:1593 and :2024) build from pitch lists, so a
// pitch list is also the shape the engine natively consumes.

import type { WidgetRenderer } from './input-widget-core.ts';
import { midiToPitchName } from './input-widget-piano.ts';

export interface ChordSelection {
  /** Sharp-spelled pitch class: 'C', 'C#', ... 'B'. */
  root: string;
  /** Quality id from QUALITIES. */
  quality: string;
  /** 0 = root position; k cycles the k lowest notes up an octave. */
  inversion: number;
  /** The ROOT's octave (before inversion moves it). */
  octave: number;
}

export interface ChordQuality {
  id: string;
  label: string;
  /** Semitones above the root, ascending, starting at 0. */
  intervals: number[];
}

/** Internal (value) spellings are sharps; labels show both names so a
 *  flat-thinking cohort can still find their root. */
export const ROOTS: { value: string; label: string }[] = [
  { value: 'C', label: 'C' },
  { value: 'C#', label: 'C♯/D♭' },
  { value: 'D', label: 'D' },
  { value: 'D#', label: 'D♯/E♭' },
  { value: 'E', label: 'E' },
  { value: 'F', label: 'F' },
  { value: 'F#', label: 'F♯/G♭' },
  { value: 'G', label: 'G' },
  { value: 'G#', label: 'G♯/A♭' },
  { value: 'A', label: 'A' },
  { value: 'A#', label: 'A♯/B♭' },
  { value: 'B', label: 'B' },
];

/** The prompt's 12-quality Tier 1 set, intervals verbatim from §Fix
 *  shape. Not extended (see FEEDBACK §5) — 9ths/11ths/13ths and
 *  alterations are Tier 2 by the prompt's own scoping. */
export const QUALITIES: ChordQuality[] = [
  { id: 'maj', label: 'maj', intervals: [0, 4, 7] },
  { id: 'min', label: 'min', intervals: [0, 3, 7] },
  { id: 'dim', label: 'dim', intervals: [0, 3, 6] },
  { id: 'aug', label: 'aug', intervals: [0, 4, 8] },
  { id: 'sus2', label: 'sus2', intervals: [0, 2, 7] },
  { id: 'sus4', label: 'sus4', intervals: [0, 5, 7] },
  { id: 'dom7', label: 'dom7', intervals: [0, 4, 7, 10] },
  { id: 'maj7', label: 'maj7', intervals: [0, 4, 7, 11] },
  { id: 'min7', label: 'min7', intervals: [0, 3, 7, 10] },
  { id: 'dim7', label: 'dim7', intervals: [0, 3, 6, 9] },
  { id: 'half-dim7', label: 'half-dim7 (m7♭5)', intervals: [0, 3, 6, 10] },
  { id: 'aug7', label: 'aug7', intervals: [0, 4, 8, 10] },
];

export const INVERSION_LABELS = [
  'root position',
  '1st inversion',
  '2nd inversion',
  '3rd inversion',
];

/** Root-octave choices. 1..6 keeps every chord tone inside the 88-key
 *  range the piano widget can display (compatibility clause again). */
export const OCTAVES = [1, 2, 3, 4, 5, 6];

export const DEFAULT_SELECTION: ChordSelection = {
  root: 'C',
  quality: 'maj',
  inversion: 0,
  octave: 4,
};

export function qualityById(id: string): ChordQuality {
  return QUALITIES.find(q => q.id === id) ?? QUALITIES[0];
}

const PC_INDEX: Record<string, number> = Object.fromEntries(
  ROOTS.map((r, i) => [r.value, i]),
);

/** Highest legal inversion for a quality: notes - 1. Triads stop at
 *  2nd; sevenths reach 3rd. */
export function maxInversion(qualityId: string): number {
  return qualityById(qualityId).intervals.length - 1;
}

/** Clamp a selection's inversion to what its quality supports — the
 *  state-shape trap the prompt's §Don'ts names: switch dom7 in 3rd
 *  inversion to maj (a triad) and the inversion MUST fall to 2nd, not
 *  silently keep an index the chord cannot mean. */
export function clampInversion(sel: ChordSelection): ChordSelection {
  const max = maxInversion(sel.quality);
  return sel.inversion > max ? { ...sel, inversion: max } : sel;
}

/**
 * The pitches a selection spells, ascending.
 *
 * Root at the chosen octave, quality intervals stacked above it, then
 * inversion cycles the k lowest notes up an octave — 1st inversion of
 * C4-E4-G4 is E4-G4-C5. The cycled list is ascending by construction
 * (each moved note lands above the former top), but we sort anyway so
 * the invariant is enforced, not assumed.
 */
export function chordPitches(sel: ChordSelection): string[] {
  const clamped = clampInversion(sel);
  const pc = PC_INDEX[clamped.root] ?? 0;
  const rootMidi = 12 * (clamped.octave + 1) + pc;
  const midis = qualityById(clamped.quality).intervals.map(i => rootMidi + i);
  for (let k = 0; k < clamped.inversion; k++) midis[k] += 12;
  midis.sort((a, b) => a - b);
  return midis.map(midiToPitchName);
}

/** Human-facing preview line: `C4, E4, G4`. Display only — the
 *  serialization is the JSON list, not this string. */
export function previewText(sel: ChordSelection): string {
  return chordPitches(sel).join(', ');
}

/**
 * Brute-force chord recognition, for `deserialize`.
 *
 * The cached value is a pitch list, which does not name the root,
 * quality, inversion or octave that produced it — but the whole space
 * is 12 roots x 12 qualities x <=4 inversions x 6 octaves = a few
 * thousand candidates, each a handful of integer adds. Exact match or
 * nothing; a fuzzy guess would silently rewrite the cohort's chord.
 */
export function chordFromPitches(pitches: string[]): ChordSelection | null {
  const want = JSON.stringify(pitches);
  for (const octave of OCTAVES) {
    for (const root of ROOTS) {
      for (const quality of QUALITIES) {
        for (let inv = 0; inv <= maxInversion(quality.id); inv++) {
          const sel: ChordSelection = {
            root: root.value, quality: quality.id, inversion: inv, octave,
          };
          if (JSON.stringify(chordPitches(sel)) === want) return sel;
        }
      }
    }
  }
  return null;
}

const CLS_ROOT = 'forge-chord-root';
const CLS_QUALITY = 'forge-chord-quality';
const CLS_INVERSION = 'forge-chord-inversion';
const CLS_OCTAVE = 'forge-chord-octave';
const CLS_PREVIEW = 'forge-chord-preview';

function readSelect(container: HTMLElement, cls: string): string {
  return container.querySelector<HTMLSelectElement>(`select.${cls}`)?.value ?? '';
}

export const chordBuilderWidget: WidgetRenderer<ChordSelection> = {
  type: 'chord_builder',

  render(container: HTMLElement, initialSelection: ChordSelection): void {
    const doc = container.ownerDocument;
    const initial = clampInversion({ ...DEFAULT_SELECTION, ...initialSelection });

    container.classList.add('forge-chord');

    const makeRow = (labelText: string, select: HTMLSelectElement) => {
      const row = doc.createElement('div');
      row.className = 'forge-chord-row';
      const label = doc.createElement('label');
      label.className = 'forge-chord-label';
      label.textContent = labelText;
      row.appendChild(label);
      row.appendChild(select);
      container.appendChild(row);
    };

    const rootSel = doc.createElement('select');
    rootSel.className = CLS_ROOT;
    for (const r of ROOTS) {
      const opt = doc.createElement('option');
      opt.value = r.value;
      opt.textContent = r.label;
      rootSel.appendChild(opt);
    }
    rootSel.value = initial.root;

    const qualitySel = doc.createElement('select');
    qualitySel.className = CLS_QUALITY;
    for (const q of QUALITIES) {
      const opt = doc.createElement('option');
      opt.value = q.id;
      opt.textContent = q.label;
      qualitySel.appendChild(opt);
    }
    qualitySel.value = initial.quality;

    const inversionSel = doc.createElement('select');
    inversionSel.className = CLS_INVERSION;
    INVERSION_LABELS.forEach((label, i) => {
      const opt = doc.createElement('option');
      opt.value = String(i);
      opt.textContent = label;
      inversionSel.appendChild(opt);
    });
    inversionSel.value = String(initial.inversion);

    const octaveSel = doc.createElement('select');
    octaveSel.className = CLS_OCTAVE;
    for (const o of OCTAVES) {
      const opt = doc.createElement('option');
      opt.value = String(o);
      opt.textContent = String(o);
      octaveSel.appendChild(opt);
    }
    octaveSel.value = String(initial.octave);

    makeRow('Root', rootSel);
    makeRow('Quality', qualitySel);
    makeRow('Inversion', inversionSel);
    makeRow('Octave', octaveSel);

    const preview = doc.createElement('div');
    preview.className = CLS_PREVIEW;
    container.appendChild(preview);

    // One refresh path for every change: gray out the inversions the
    // current quality cannot mean, clamp the selection if it points at
    // one, repaint the preview. Called on render so the initial DOM
    // state goes through the same gate the change events do — the two
    // cannot drift.
    const refresh = () => {
      const max = maxInversion(qualitySel.value);
      const opts = inversionSel.querySelectorAll('option');
      opts.forEach((opt, i) => {
        if (i > max) opt.setAttribute('disabled', '');
        else opt.removeAttribute('disabled');
      });
      if (Number(inversionSel.value) > max) inversionSel.value = String(max);
      preview.textContent = previewText({
        root: rootSel.value,
        quality: qualitySel.value,
        inversion: Number(inversionSel.value),
        octave: Number(octaveSel.value),
      });
    };

    for (const sel of [rootSel, qualitySel, inversionSel, octaveSel]) {
      sel.addEventListener('change', refresh);
    }
    refresh();
  },

  getSelection(container: HTMLElement): ChordSelection {
    return clampInversion({
      root: readSelect(container, CLS_ROOT) || DEFAULT_SELECTION.root,
      quality: readSelect(container, CLS_QUALITY) || DEFAULT_SELECTION.quality,
      inversion: Number(readSelect(container, CLS_INVERSION) || 0),
      octave: Number(readSelect(container, CLS_OCTAVE) || DEFAULT_SELECTION.octave),
    });
  },

  serialize(selection: ChordSelection): string {
    return JSON.stringify(chordPitches(selection));
  },

  /**
   * A cached pitch list re-opens as the chord that spells it, via
   * exact brute-force recognition. Anything unrecognizable — a foreign
   * cache, a hand-typed list, a pitch set no Tier-1 chord produces —
   * opens at the default (C maj, root position, octave 4) rather than
   * throwing inside modal construction.
   */
  deserialize(raw: string | undefined): ChordSelection {
    if (!raw) return { ...DEFAULT_SELECTION };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { ...DEFAULT_SELECTION };
      const pitches = parsed.filter((p): p is string => typeof p === 'string');
      return chordFromPitches(pitches) ?? { ...DEFAULT_SELECTION };
    } catch {
      return { ...DEFAULT_SELECTION };
    }
  },
};
