// 2026-11-16-0902 - a bar number at the start of every bar of the Score. Verovio prints them itself (`mnumInterval: 1`: a number above the top staff at the start of every measure, the first included); this module is the rest: the number must be the
// bar's POSITION in what is drawn (1, 2, 3 ...), not whatever `number` the engine wrote into the MusicXML (a joined, thinned or morphed Score can carry any), so every part's measures are renumbered by their order before the score is engraved.
// Pure: text in, text out. No obsidian import.
export const BAR_NUMBER_INTERVAL = 1;                 // Verovio's `mnumInterval` when the numbers are on: every bar; 0 when off
const PART = /<part\b[^>]*>[\s\S]*?<\/part>/g;
const MEASURE_OPEN = /<measure\b([^>]*)>/g;

/** Every part's measures numbered 1..N in order (the attribute `number` rewritten; any other attribute, `id` and `implicit` included, is kept). A score with no `<measure>` comes back unchanged. */
export function renumberMeasures(xml: string): string {
  if (typeof xml !== 'string' || !xml.includes('<measure')) return xml;
  return xml.replace(PART, (part) => {
    let n = 0;
    return part.replace(MEASURE_OPEN, (_all, attrs: string) => {
      n++;
      const has = /\bnumber\s*=\s*"[^"]*"/.test(attrs);
      return `<measure${has ? attrs.replace(/\bnumber\s*=\s*"[^"]*"/, `number="${n}"`) : `${attrs} number="${n}"`}>`;
    });
  });
}

/** Verovio's `mnumInterval: 0` is not "none": it still writes the number at the start of every SYSTEM after the first (the engraver's usual habit). With the setting off the drawing must show NO number, so the number groups are taken out of the SVG text. */
export function stripBarNumbers(svg: string): string {
  if (typeof svg !== 'string' || !svg.includes('mNum')) return svg;
  return svg.replace(/<g\b[^>]*\bclass="mNum[^"]*"[^>]*>[\s\S]*?<\/g>/g, '');
}

/** What Verovio is asked for: the interval of its measure numbers. */
export function mnumIntervalFor(showBarNumbers: boolean): number { return showBarNumbers ? BAR_NUMBER_INTERVAL : 0; }
