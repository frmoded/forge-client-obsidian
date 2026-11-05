// 2026-11-04-1173 (Scale Explorer 4 of 4) — the guitar fretboard of the Scale Explorer: a horizontal neck (6 strings, the open-string names, fret numbers 1 to 15, inlays at 3 5 7 9 12 15) in a horizontal scroller (reachable at 300 px, like the piano),
// dots (class forge-gdot: NOT the widget's .forge-guitar-dot, which is invisible until hovered) on the positions (the root larger and another colour, a label in each), lit while a note plays, strong when picked. Used by scale, chord and free mode (scale-explorer-dom.ts, free-mode-dom.ts); guitar-core.ts decides WHERE the dots are.
// The geometry is input-widget-guitar-fretboard.ts's own (buildFretboard: each position's dot centre and hit rectangle; fretboardWidth; FRETBOARD_HEIGHT), not a copy: 164 px tall for six strings, the drawing of the strings, wires and inlays is here
// (that widget draws them inside its own render()). No `obsidian`, no engine.

import { FRETBOARD_HEIGHT, STRING_COUNT, buildFretboard, fretboardWidth } from './input-widget-guitar-fretboard.ts';
import { midiToPitchName } from './input-widget-piano.ts';
import { DOUBLE_INLAY_FRET, GUITAR_FRETS, INLAY_FRETS, STANDARD_TUNING, stringNumber } from './guitar-core.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The neck's height in px (the widget's: 20 + 5 x 24 + 24). */
export const GUITAR_HEIGHT = FRETBOARD_HEIGHT;

export interface GuitarDot {
  string: number;
  fret: number;
  midi: number;
  pc: number;
  isRoot: boolean;
  /** The text in the dot: a degree number or a note name. */
  label: string;
  /** In free mode: a note of the key that is not picked (drawn lighter). */
  tint?: boolean;
}

export interface GuitarClick { string: number; fret: number; midi: number }

export interface GuitarView {
  /** Draw these dots (replacing the last). */
  setDots(dots: readonly GuitarDot[]): void;
  /** Light every dot that sounds one of these midi numbers (a note being played): class `is-lit`. */
  setLit(midis: ReadonlySet<number>): void;
  /** Mark every dot that sounds one of these midi numbers as picked (class `is-picked`; a pitch has several dots, they all light). */
  setPicked(midis: ReadonlySet<number>): void;
  destroy(): void;
}

export interface GuitarOptions {
  frets?: number;
  /** Free mode: every intersection is clickable (a transparent hit rectangle), not only the dots. */
  clickAll?: boolean;
  onClick(pos: GuitarClick): void;
}

export function mountGuitar(host: HTMLElement, opts: GuitarOptions): GuitarView {
  const doc = host.ownerDocument;
  const frets = opts.frets ?? GUITAR_FRETS;
  const cells = buildFretboard(frets + 1);
  const width = fretboardWidth(frets + 1);
  const scroller = doc.createElement('div');
  scroller.className = 'forge-piano-scroller forge-guitar-scroller';
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `forge-guitar-svg forge-scale-guitar-svg${opts.clickAll ? ' is-clickall' : ''}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(GUITAR_HEIGHT));
  svg.setAttribute('viewBox', `0 0 ${width} ${GUITAR_HEIGHT}`);
  scroller.appendChild(svg);
  host.appendChild(scroller);

  const el = (name: string, attrs: Record<string, string>, text?: string): SVGElement => {
    const e = doc.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // ---- the neck: strings, nut, wires, inlays, numbers, open-string names -----------------------------------------------------------------------------------------------------------
  const open = cells.filter((c) => c.fret === 0);
  const first = cells.find((c) => c.fret === 1)!;
  const top = Math.min(...open.map((c) => c.cy));
  const bottom = Math.max(...open.map((c) => c.cy));
  for (const c of open) svg.appendChild(el('line', { x1: String(first.x), y1: String(c.cy), x2: String(width - 4), y2: String(c.cy), class: 'forge-guitar-string' }));
  svg.appendChild(el('line', { x1: String(first.x), y1: String(top), x2: String(first.x), y2: String(bottom), class: 'forge-guitar-nut' }));
  for (let f = 1; f <= frets; f++) {
    const c = cells.find((x) => x.fret === f)!;
    svg.appendChild(el('line', { x1: String(c.cx), y1: String(top), x2: String(c.cx), y2: String(bottom), class: 'forge-guitar-fret' }));
    svg.appendChild(el('text', { x: String(c.x + c.w / 2), y: String(bottom + 18), 'text-anchor': 'middle', class: 'forge-guitar-fret-number' }, String(f)));
  }
  const mid = (top + bottom) / 2;
  for (const f of [...INLAY_FRETS, DOUBLE_INLAY_FRET]) {
    if (f > frets) continue;
    const c = cells.find((x) => x.fret === f)!;
    const x = c.x + c.w / 2;
    if (f === DOUBLE_INLAY_FRET) {
      svg.appendChild(el('circle', { cx: String(x), cy: String(mid - 24), r: '4', class: 'forge-guitar-inlay' }));
      svg.appendChild(el('circle', { cx: String(x), cy: String(mid + 24), r: '4', class: 'forge-guitar-inlay' }));
    } else svg.appendChild(el('circle', { cx: String(x), cy: String(mid), r: '4', class: 'forge-guitar-inlay' }));
  }
  STANDARD_TUNING.forEach((openMidi, idx) => {
    const c = open.find((x) => x.string === idx)!;
    svg.appendChild(el('text', { x: String(c.x + 6), y: String(c.cy + 4), class: 'forge-guitar-open-label' }, midiToPitchName(openMidi).replace(/\d+$/, '')));
  });
  if (open.length !== STRING_COUNT) throw new Error('guitar-dom: the widget geometry has an unexpected number of strings');

  // ---- hit cells (free mode) and dots ------------------------------------------------------------------------------------------------------------------------------------------------
  const cellOf = (stringNo: number, fret: number) => cells.find((c) => stringNumber(c.string) === stringNo && c.fret === fret)!;
  const dotGroup = el('g', { class: 'forge-guitar-dots' });
  if (opts.clickAll) {
    const hits = el('g', { class: 'forge-guitar-hits' });
    for (const c of cells) {
      const midi = STANDARD_TUNING[c.string] + c.fret;
      const r = el('rect', { x: String(c.x), y: String(c.y), width: String(c.w), height: String(c.h), class: 'forge-guitar-hit', 'data-string': String(stringNumber(c.string)), 'data-fret': String(c.fret), 'data-midi': String(midi) });
      r.addEventListener('click', () => { opts.onClick({ string: stringNumber(c.string), fret: c.fret, midi }); });
      hits.appendChild(r);
    }
    svg.appendChild(hits);
  }
  svg.appendChild(dotGroup);

  let dots: readonly GuitarDot[] = [];
  let lit: ReadonlySet<number> = new Set();
  let picked: ReadonlySet<number> = new Set();
  const dotEls: { dot: GuitarDot; g: SVGElement }[] = [];

  const classOf = (d: GuitarDot): string => `forge-gdot${d.isRoot ? ' is-root' : ''}${d.tint ? ' is-tint' : ''}${lit.has(d.midi) ? ' is-lit' : ''}${picked.has(d.midi) ? ' is-picked' : ''}`;
  const draw = (): void => {
    dotGroup.textContent = '';
    dotEls.length = 0;
    for (const d of dots) {
      const c = cellOf(d.string, d.fret);
      const g = el('g', { class: classOf(d), 'data-string': String(d.string), 'data-fret': String(d.fret), 'data-midi': String(d.midi), 'data-root': d.isRoot ? 'true' : 'false' });
      g.appendChild(el('circle', { cx: String(c.cx), cy: String(c.cy), r: d.isRoot ? '11' : '9', class: 'forge-gdot-disc' }));
      g.appendChild(el('text', { x: String(c.cx), y: String(c.cy + 4), 'text-anchor': 'middle', class: 'forge-gdot-label' }, d.label));
      if (!opts.clickAll) g.addEventListener('click', () => { opts.onClick({ string: d.string, fret: d.fret, midi: d.midi }); });
      dotGroup.appendChild(g);
      dotEls.push({ dot: d, g });
    }
  };
  const restyle = (): void => { for (const { dot, g } of dotEls) g.setAttribute('class', classOf(dot)); };

  return {
    setDots: (next) => { dots = next; draw(); },
    setLit: (midis) => { lit = midis; restyle(); },
    setPicked: (midis) => { picked = midis; restyle(); },
    destroy: () => { scroller.remove(); },
  };
}
