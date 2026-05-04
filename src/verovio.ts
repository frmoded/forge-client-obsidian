// Lazy singleton Verovio toolkit. The WASM blob is ~7MB and runtime init is
// async; we kick it off only when a MusicXML result arrives, then reuse the
// toolkit for subsequent renders.

let toolkitPromise: Promise<any> | null = null;

async function getToolkit(): Promise<any> {
  if (!toolkitPromise) {
    toolkitPromise = (async () => {
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

function applyOptions(toolkit: any, hostWidthPx?: number) {
  const targetWidth = hostWidthPx && hostWidthPx > 0 ? hostWidthPx * 5 : 2100;
  toolkit.setOptions({
    adjustPageHeight: true,
    breaks: 'auto',
    pageWidth: targetWidth,
    pageMarginTop: 50,
    pageMarginBottom: 50,
    pageMarginLeft: 50,
    pageMarginRight: 50,
    scale: 40,
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

export async function renderMusicXMLAndMIDI(musicxml: string, hostWidthPx?: number): Promise<RenderedScore> {
  const toolkit = await getToolkit();
  applyOptions(toolkit, hostWidthPx);
  toolkit.loadData(musicxml);
  const svg = toolkit.renderToSVG(1);
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
  toolkit.loadData(musicxml);
  return toolkit.getTimeForElement(elementId);
}

// Load a score into the singleton toolkit so subsequent getElementsAtTime
// calls operate on it. Used by the score-follower at playback start.
export async function loadScore(musicxml: string): Promise<void> {
  const toolkit = await getToolkit();
  toolkit.loadData(musicxml);
}

// Notes (and other elements) sounding at the given time in ms. Caller must
// have invoked loadScore for the relevant MusicXML first.
export async function getElementsAtTime(ms: number): Promise<string[]> {
  const toolkit = await getToolkit();
  const result = toolkit.getElementsAtTime(ms);
  return result?.notes ?? [];
}
