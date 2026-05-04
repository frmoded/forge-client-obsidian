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

export interface RenderedScore {
  svg: string;
  midiBase64: string;
}

export async function renderMusicXMLAndMIDI(musicxml: string, hostWidthPx?: number): Promise<RenderedScore> {
  const toolkit = await getToolkit();
  applyOptions(toolkit, hostWidthPx);
  toolkit.loadData(musicxml);
  const svg = toolkit.renderToSVG(1);
  const midiBase64 = toolkit.renderToMIDI();
  return { svg, midiBase64 };
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
