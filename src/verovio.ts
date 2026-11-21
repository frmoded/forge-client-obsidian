// Lazy singleton Verovio toolkit. The WASM blob is ~7MB and runtime init is
// async; we kick it off only when a MusicXML result arrives, then reuse the
// toolkit for subsequent renders.

import { ENGRAVING_SCALE, FIT_PAGE_FACTOR, pageWidthFor } from './host-width-core.ts';
import { dedupeTempoMarks } from './tempo-marks-core.ts';
import { mnumIntervalFor, renumberMeasures, stripBarNumbers } from './bar-numbers-core.ts';          // 2026-11-16-0902: a bar number at the start of every bar, by position
import { installEngravingWarningFilter } from './engraving-warnings-core.ts';          // 2026-11-21-1012 (N3): the same engraving warning for every system is one console line with a count
import { uiFlags } from './ui-flags-core.ts';          // 2026-11-15-2101: the tempo is written above a bar only when it changes

let toolkitPromise: Promise<any> | null = null;

async function getToolkit(): Promise<any> {
  if (!toolkitPromise) {
    toolkitPromise = (async () => {
      installEngravingWarningFilter(console as unknown as Record<string, any>, { now: Date.now, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) });          // before the runtime starts: it may print as it loads
      const verovio: any = await import('verovio');
      await new Promise<void>((resolve) => {
        if (verovio.module?.calledRun) {
          resolve();
        } else {
          verovio.module.onRuntimeInitialized = () => resolve();
        }
      });
      return new verovio.toolkit();
    })();
  }
  return toolkitPromise;
}

/** The MusicXML as it is engraved: the bars numbered by their position (1..N), the tempo written only where it changes (2101). Neither touches a note, so the MIDI and the time map are what the engine's text gives. */
export function prepareScore(musicxml: string): string { return dedupeTempoMarks(renumberMeasures(musicxml)); }

function applyOptions(toolkit: any, hostWidthPx?: number, noHeader = false, fit = false) {
  const targetWidth = pageWidthFor(hostWidthPx, fit ? FIT_PAGE_FACTOR : 5);          // 2026-11-15-1217: a score-first tab engraves for its own width (wrapped systems, vertical scroll)   // M6 rider: a host that has not been laid out (16 px) used to ask for pageWidth 80, which Verovio refuses (minimum 100)
  toolkit.setOptions({
    adjustPageHeight: true,
    mnumInterval: mnumIntervalFor(uiFlags().showBarNumbers),          // 2026-11-16-0902: Verovio's own bar numbers, at every bar (the first too); 0 = none
    breaks: 'auto',
    pageWidth: targetWidth,
    pageMarginTop: 50,
    pageMarginBottom: 50,
    pageMarginLeft: 50,
    pageMarginRight: 50,
    scale: ENGRAVING_SCALE,
    ...(noHeader ? { header: 'none' } : {}),       // 2026-11-05-1189: no engraved title (the work title of the MusicXML) above a score-first Score
  });
}

export interface TimeBucket {
  ms: number;
  ids: string[];
}

export interface RenderedScore {
  svg: string;
  midiBase64: string;
  // Sorted by ms. Notes whose start time matches play together.
  timeMap: TimeBucket[];
}

export async function renderMusicXMLAndMIDI(musicxml: string, hostWidthPx?: number, opts: { noHeader?: boolean; fit?: boolean } = {}): Promise<RenderedScore> {
  const toolkit = await getToolkit();
  const showBarNumbers = uiFlags().showBarNumbers;
  applyOptions(toolkit, hostWidthPx, opts.noHeader === true, opts.fit === true);
  toolkit.loadData(prepareScore(musicxml));
  // v0.2.140 — multi-page rendering. Pre-v0.2.140 only rendered
  // page 1; longer scores (e.g. forge-music/murmuration with ~30
  // bars) appeared truncated at the first page break (~9 bars
  // depending on width). Verovio's auto-pagination breaks the
  // score into discrete pages; we render every page and concatenate
  // the SVGs vertically. Each page's `<svg>` carries its own
  // viewBox so they stack cleanly when laid out as block elements.
  const pageCount: number =
    typeof toolkit.getPageCount === 'function' ? toolkit.getPageCount() : 1;
  const pages: string[] = [];
  for (let p = 1; p <= pageCount; p++) {
    pages.push(showBarNumbers ? toolkit.renderToSVG(p) : stripBarNumbers(toolkit.renderToSVG(p)));          // 2026-11-16-0902: off = no number at all (Verovio's interval 0 still numbers every system after the first)
  }
  // Wrap in a host div so the time-map querySelector still sees all
  // notes regardless of which page they live on (querySelectorAll on
  // an HTML/SVG fragment requires a parent — wrapping keeps
  // buildTimeMap's existing DOMParser pattern working).
  const svg = pages.length === 1
    ? pages[0]
    : `<div class="forge-verovio-pages">${pages.join('')}</div>`;
  const midiBase64 = toolkit.renderToMIDI();
  // Capture the time map BEFORE any other render mutates toolkit state.
  // Verovio assigns fresh IDs on every loadData, so we can never re-query
  // time-for-element later — the IDs in `svg` will have been replaced.
  const timeMap = buildTimeMap(toolkit, svg);
  return { svg, midiBase64, timeMap };
}

function buildTimeMap(toolkit: any, svg: string): TimeBucket[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const buckets = new Map<number, string[]>();
  doc.querySelectorAll('.note').forEach(el => {
    const id = el.id;
    if (!id) return;
    const ms = toolkit.getTimeForElement(id);
    if (typeof ms !== 'number' || ms < 0) return;
    if (!buckets.has(ms)) buckets.set(ms, []);
    buckets.get(ms)!.push(id);
  });
  return [...buckets.entries()]
    .map(([ms, ids]) => ({ ms, ids }))
    .sort((a, b) => a.ms - b.ms);
}

// Backward-compat shim — older callers that only need the SVG.
export async function renderMusicXMLToSVG(musicxml: string, hostWidthPx?: number): Promise<string> {
  return (await renderMusicXMLAndMIDI(musicxml, hostWidthPx)).svg;
}

// Time of an element (note, rest, ...) in milliseconds within the current
// MIDI rendering. The toolkit holds whatever was last loaded — callers should
// re-load the relevant score before asking, in case multiple scores live in
// the panel.
export async function getTimeForElement(musicxml: string, elementId: string): Promise<number> {
  const toolkit = await getToolkit();
  toolkit.loadData(prepareScore(musicxml));
  return toolkit.getTimeForElement(elementId);
}

// Load a score into the singleton toolkit so subsequent getElementsAtTime
// calls operate on it. Used by the score-follower at playback start.
export async function loadScore(musicxml: string): Promise<void> {
  const toolkit = await getToolkit();
  toolkit.loadData(prepareScore(musicxml));
}

// Notes (and other elements) sounding at the given time in ms. Caller must
// have invoked loadScore for the relevant MusicXML first.
export async function getElementsAtTime(ms: number): Promise<string[]> {
  const toolkit = await getToolkit();
  const result = toolkit.getElementsAtTime(ms);
  return result?.notes ?? [];
}
