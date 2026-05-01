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

export async function renderMusicXMLToSVG(musicxml: string): Promise<string> {
  const toolkit = await getToolkit();
  toolkit.loadData(musicxml);
  return toolkit.renderToSVG(1);
}
