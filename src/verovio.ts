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

export async function renderMusicXMLToSVG(musicxml: string, hostWidthPx?: number): Promise<string> {
  const toolkit = await getToolkit();
  // adjustPageHeight: trim whitespace below the score.
  // pageWidth is in 1/100 mm; sized roughly to the host so we get a sensible
  // line break / margin layout instead of Verovio's full-sheet default.
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
  toolkit.loadData(musicxml);
  return toolkit.renderToSVG(1);
}
