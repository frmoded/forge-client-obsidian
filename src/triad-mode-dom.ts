// 2026-11-05-1188 (Scale Explorer: `mode: triad`) - the DOM half: the SCALE as a score (its 8 notes, each notehead a click target), a row of seven chips under it (the Roman numerals of the scale: the guaranteed, keyboard-reachable route to
// the same pick), the piano (the three triad keys tinted, the root marked, the rest of the scale lightly tinted as in free mode), the triad's OWN staff (one stacked chord, in the scale's spelling), a readout line ("D minor: degrees 2, 4
// and 6 of C major, the ii chord") and the legend line (always visible). On the scale staff the three chosen noteheads are coloured and carry 1, 3, 5 (root, third, fifth), so the person SEES the skipping. No sevenths anywhere.
// Reached through mountScaleExplorer (which dispatches here for `mode: triad`); no `obsidian`, no engine: the staff drawer and the sound are INJECTED, exactly as in scale-explorer-dom.ts and free-mode-dom.ts.
// Picking a note is silent; sound comes only from a press on a Play button (nothing sounds on mount or on a pick).
//
// Notehead hit areas: the engraved SVG's own `g.note` elements are the targets (a click on a notehead bubbles to the staff host); a click on the staff that misses every notehead by a few pixels picks the NEAREST one by its rendered box.
// Nothing is laid over the engraving, so nothing has to be re-placed when the pane is resized. The chips are the route that never depends on the engraving.

import { KEYBOARD_HEIGHT, buildKeyboard, centerXOf, initialScrollLeft, keyboardWidth } from './input-widget-piano.ts';
import { stackedMusicXML } from './chord-names-core.ts';
import { clefFor } from './free-mode-core.ts';
import {
  SCALE_TYPES,
  SCALE_TYPE_LABELS,
  normalizeTonic,
  playEvents,
  scaleMusicXML,
  scaleNotes,
  tonicAfterTypeChange,
  tonicNamesFor,
  type PlayMode,
  type ScaleExplorerOptions,
  type ScaleType,
} from './scale-explorer-core.ts';
import { diatonicChords } from './diatonic-chords-core.ts';
import { TRIAD_LEGEND, TRIAD_ROLES, degreeOfStaffIndex, scaleStaffIndexes, triadOfDegree, triadReadout } from './triad-mode-core.ts';
import type { ScaleExplorerDeps, ScaleExplorerHandle } from './scale-explorer-dom.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** A click this close (pixels) to a notehead's rendered box, and no closer to another, picks it. */
const NOTEHEAD_SLACK_PX = 12;
const ROLE_NUMBERS = ['1', '3', '5'] as const;
const PLAYS: readonly { mode: PlayMode | 'scale'; label: string }[] = [
  { mode: 'together', label: 'Play together' },
  { mode: 'arpeggio', label: 'Play arpeggio' },
  { mode: 'scale', label: 'Play scale' },
];

export function mountTriadMode(el: HTMLElement, options: ScaleExplorerOptions, deps: ScaleExplorerDeps): ScaleExplorerHandle {
  const doc = el.ownerDocument;
  let tonic = options.tonic;
  let scale: ScaleType = options.scale;
  let degree = options.degree;
  let playing: PlayMode | 'scale' | null = null;
  let scaleToken = 0;
  let triadToken = 0;
  let destroyed = false;

  const root = doc.createElement('div');
  root.className = 'forge-scale';
  root.setAttribute('data-mode', 'triad');
  el.appendChild(root);
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // ---- controls: the key (tonic, scale type) and the three Play buttons ---------------------------------------------------------------------------------------------------------
  let tonicSelect: HTMLSelectElement | null = null;
  let typeSelect: HTMLSelectElement | null = null;
  const playButtons = new Map<PlayMode | 'scale', HTMLButtonElement>();
  const fillTonics = (): void => {
    if (!tonicSelect) return;
    const names = tonicNamesFor(scale);
    if (!names.includes(tonic)) names.push(tonic);
    tonicSelect.textContent = '';
    for (const n of names) { const o = h('option', undefined, n); o.value = n; tonicSelect.appendChild(o); }
    tonicSelect.value = tonic;
  };
  if (options.controls) {
    const bar = h('div', 'forge-scale-controls');
    const tLabel = h('label', 'forge-scale-field', 'Tonic ');
    tonicSelect = h('select', 'forge-scale-tonic');
    tonicSelect.setAttribute('aria-label', 'Tonic');
    tLabel.appendChild(tonicSelect);
    const sLabel = h('label', 'forge-scale-field', 'Scale ');
    typeSelect = h('select', 'forge-scale-type');
    typeSelect.setAttribute('aria-label', 'Scale type');
    for (const t of SCALE_TYPES) { const o = h('option', undefined, SCALE_TYPE_LABELS[t]); o.value = t; typeSelect.appendChild(o); }
    typeSelect.value = scale;
    sLabel.appendChild(typeSelect);
    bar.append(tLabel, sLabel);
    for (const { mode, label } of PLAYS) {
      const b = h('button', 'forge-scale-play', label);
      b.type = 'button';
      b.setAttribute('data-mode', mode);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { onPlayPressed(mode); });
      playButtons.set(mode, b);
      bar.appendChild(b);
    }
    root.appendChild(bar);
    fillTonics();
  }

  const caption = h('div', 'forge-scale-caption');
  caption.setAttribute('aria-live', 'polite');
  root.appendChild(caption);

  // ---- the scale staff, and the row of chips under it ----------------------------------------------------------------------------------------------------------------------------
  const scaleStaffHost = options.show.staff && deps.renderStaff ? h('div', 'forge-scale-staff forge-triad-scale-staff') : null;
  if (scaleStaffHost) root.appendChild(scaleStaffHost);
  const degreeChips = h('div', 'forge-triad-chips');
  degreeChips.setAttribute('role', 'group');
  degreeChips.setAttribute('aria-label', 'Root of the triad: a degree of the scale, by its Roman numeral');
  root.appendChild(degreeChips);

  // ---- the piano ----------------------------------------------------------------------------------------------------------------------------------------------------------------
  const pianoHost = options.show.piano ? h('div', 'forge-scale-piano') : null;
  if (pianoHost) root.appendChild(pianoHost);
  const keyEls = new Map<number, SVGElement>();
  const keys = buildKeyboard();
  const total = keyboardWidth(keys);
  const scroller = h('div', 'forge-piano-scroller');
  if (pianoHost) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'forge-piano-svg forge-triad-svg');
    svg.setAttribute('width', String(total));
    svg.setAttribute('height', String(KEYBOARD_HEIGHT));
    svg.setAttribute('viewBox', `0 0 ${total} ${KEYBOARD_HEIGHT}`);
    scroller.appendChild(svg);
    pianoHost.appendChild(scroller);
    for (const key of [...keys.filter((k) => !k.black), ...keys.filter((k) => k.black)]) {
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(key.x));
      rect.setAttribute('y', '0');
      rect.setAttribute('width', String(key.width));
      rect.setAttribute('height', String(key.height));
      rect.setAttribute('data-midi', String(key.midi));
      rect.setAttribute('data-pitch', key.pitch);
      rect.setAttribute('class', `forge-piano-key ${key.black ? 'forge-piano-key-black' : 'forge-piano-key-white'} forge-triad-key`);
      svg.appendChild(rect);
      keyEls.set(key.midi, rect);
    }
  }
  const scrollToKey = (): void => {
    if (!pianoHost) return;
    const sc = scaleNotes(tonic, scale, options.octave);
    const mid = (centerXOf(keys, sc[0].midi) + centerXOf(keys, sc[7].midi)) / 2;
    scroller.scrollLeft = initialScrollLeft(mid, scroller.clientWidth ?? 0, total);
  };

  // ---- the triad's own staff, the readout and the legend --------------------------------------------------------------------------------------------------------------------------
  const triadStaffHost = options.show.staff && deps.renderStaff ? h('div', 'forge-scale-staff forge-triad-chord-staff') : null;
  if (triadStaffHost) root.appendChild(triadStaffHost);
  const readout = h('div', 'forge-triad-readout');
  readout.setAttribute('aria-live', 'polite');
  root.appendChild(readout);
  const legend = h('div', 'forge-triad-legend', TRIAD_LEGEND);
  legend.title = TRIAD_LEGEND;
  root.appendChild(legend);

  // ---- drawing -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const drawChips = (): void => {
    degreeChips.textContent = '';
    for (const c of diatonicChords(tonic, scale, false, options.octave)) {
      const b = h('button', 'forge-triad-chip');
      b.type = 'button';
      b.setAttribute('data-degree', String(c.degree));
      b.setAttribute('data-numeral', c.numeral);
      b.setAttribute('aria-pressed', c.degree === degree ? 'true' : 'false');
      b.setAttribute('aria-label', `${c.numeral}: ${c.label}, degree ${c.degree} of the scale`);
      const numeral = h('span', 'forge-triad-chip-numeral', c.numeral);
      numeral.title = TRIAD_LEGEND;
      b.append(numeral, h('span', 'forge-triad-chip-name', c.label));
      b.addEventListener('click', () => { pick(c.degree); });
      degreeChips.appendChild(b);
    }
  };
  const markChips = (): void => {
    for (const b of degreeChips.querySelectorAll<HTMLElement>('.forge-triad-chip')) b.setAttribute('aria-pressed', Number(b.getAttribute('data-degree')) === degree ? 'true' : 'false');
  };

  /** The engraved noteheads of the scale staff, left to right (`g.note`, which Verovio writes in score order). */
  const staffNotes = (): Element[] => (scaleStaffHost ? [...scaleStaffHost.querySelectorAll('g.note')] : []);
  /** Colour the three noteheads of the picked triad and write 1, 3, 5 under them; every other notehead is plain again. */
  const markStaff = (): void => {
    const notes = staffNotes();
    const chosen = scaleStaffIndexes(degree);
    notes.forEach((n, i) => {
      n.classList.remove('is-triad');
      n.removeAttribute('data-role');
      for (const old of [...n.querySelectorAll('text.forge-triad-label')]) old.remove();
      const at = chosen.indexOf(i);
      if (at < 0) return;
      n.classList.add('is-triad');
      n.setAttribute('data-role', TRIAD_ROLES[at]);
      const label = doc.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'forge-triad-label');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = ROLE_NUMBERS[at];
      try {
        const head = (n.querySelector('g.notehead') ?? n) as unknown as SVGGraphicsElement;
        const box = head.getBBox();
        const size = Math.max(box.height * 1.9, 1);
        label.setAttribute('x', String(box.x + box.width / 2));
        label.setAttribute('y', String(box.y + box.height + size * 1.05));
        label.setAttribute('font-size', String(size));
      } catch { /* no layout (a test DOM): the label is there, unplaced */ }
      n.appendChild(label);
    });
  };

  const drawScaleStaff = (): void => {
    if (!scaleStaffHost || !deps.renderStaff) return;
    const token = ++scaleToken;
    const host = h('div', 'forge-scale-staff-score');
    scaleStaffHost.textContent = '';
    scaleStaffHost.appendChild(host);
    deps.renderStaff(host, scaleMusicXML(tonic, scale, options.octave)).then(() => { if (token === scaleToken && !destroyed) markStaff(); }, (e: unknown) => {
      if (token !== scaleToken || destroyed) return;
      console.error('Forge: scale explorer (triad mode) - the scale staff could not be drawn:', e);
      host.textContent = `The staff could not be drawn: ${e instanceof Error ? e.message : String(e)}`;
      host.classList.add('forge-scale-staff-error');
    });
  };
  const drawTriadStaff = (): void => {
    if (!triadStaffHost || !deps.renderStaff) return;
    const token = ++triadToken;
    const t = triadOfDegree(tonic, scale, degree, options.octave);
    const host = h('div', 'forge-scale-staff-score');
    triadStaffHost.textContent = '';
    triadStaffHost.appendChild(host);
    deps.renderStaff(host, stackedMusicXML(t.notes, clefFor(t.midis))).catch((e: unknown) => {
      if (token !== triadToken || destroyed) return;
      console.error('Forge: scale explorer (triad mode) - the triad staff could not be drawn:', e);
      host.textContent = `The staff could not be drawn: ${e instanceof Error ? e.message : String(e)}`;
      host.classList.add('forge-scale-staff-error');
    });
  };

  /** The scale's keys are lightly tinted (every octave), the three triad keys are strong and the root is marked. */
  const markPiano = (): void => {
    if (!pianoHost) return;
    const t = triadOfDegree(tonic, scale, degree, options.octave);
    const pcs = new Set(scaleNotes(tonic, scale, 4).slice(0, 7).map((n) => ((n.midi % 12) + 12) % 12));
    const on = new Set(t.midis);
    for (const [midi, rect] of keyEls) {
      rect.classList.toggle('is-in-key', pcs.has(((midi % 12) + 12) % 12));
      rect.classList.toggle('is-triad', on.has(midi));
      rect.classList.toggle('is-triad-root', midi === t.midis[0]);
      const at = t.midis.indexOf(midi);
      if (at >= 0) rect.setAttribute('data-role', TRIAD_ROLES[at]); else rect.removeAttribute('data-role');
    }
  };

  const updateText = (): void => {
    const t = triadOfDegree(tonic, scale, degree, options.octave);
    root.setAttribute('data-tonic', tonic);
    root.setAttribute('data-scale', scale);
    root.setAttribute('data-degree', String(degree));
    caption.textContent = `${tonic} ${SCALE_TYPE_LABELS[scale]}: ${scaleNotes(tonic, scale, options.octave).map((n) => n.name.replace(/\d+$/, '')).join(' ')}`;
    readout.textContent = triadReadout(t, tonic, scale);
  };

  /** A change of the pick: everything that shows the triad, but not the scale staff's engraving (that follows the key only). */
  function pick(next: number): void {
    if (next === degree) return;
    stop();
    degree = next;
    markChips(); markPiano(); markStaff(); updateText(); drawTriadStaff();
  }
  const redrawAll = (): void => {
    updateText(); drawChips(); markPiano(); drawScaleStaff(); drawTriadStaff();
    scrollToKey();
  };

  // ---- picking a notehead --------------------------------------------------------------------------------------------------------------------------------------------------
  if (scaleStaffHost) {
    scaleStaffHost.addEventListener('click', (e: Event) => {
      const notes = staffNotes();
      if (notes.length === 0) return;
      const target = e.target as Element | null;
      let hit = target?.closest ? target.closest('g.note') : null;
      if (!hit || !notes.includes(hit)) {
        // a click beside a notehead: the nearest one by its rendered box, if close enough
        const mouse = e as MouseEvent;
        let best = -1, bestD = NOTEHEAD_SLACK_PX + 1;
        notes.forEach((n, i) => {
          const r = (n.querySelector('g.notehead') ?? n).getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          const dx = mouse.clientX < r.left ? r.left - mouse.clientX : mouse.clientX > r.right ? mouse.clientX - r.right : 0;
          const dy = mouse.clientY < r.top ? r.top - mouse.clientY : mouse.clientY > r.bottom ? mouse.clientY - r.bottom : 0;
          const d = Math.hypot(dx, dy);
          if (d < bestD) { bestD = d; best = i; }
        });
        hit = best >= 0 ? notes[best] : null;
      }
      if (!hit) return;
      pick(degreeOfStaffIndex(notes.indexOf(hit)));
    });
  }

  // ---- sound: only on a press of a Play button --------------------------------------------------------------------------------------------------------------------------------
  const light = (midi: number, on: boolean): void => { keyEls.get(midi)?.classList.toggle('is-playing', on); };
  const clearLit = (): void => { for (const k of keyEls.values()) k.classList.remove('is-playing'); };
  const refreshButtons = (): void => {
    for (const { mode, label } of PLAYS) {
      const b = playButtons.get(mode);
      if (!b) continue;
      const on = playing === mode;
      b.textContent = on ? 'Stop' : label;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };
  function stop(): void {
    deps.sound.stop();
    clearLit();
    playing = null;
    refreshButtons();
  }
  function onPlayPressed(mode: PlayMode | 'scale'): void {
    if (playing === mode) { stop(); return; }
    stop();
    playing = mode;
    refreshButtons();
    const midis = mode === 'scale' ? scaleNotes(tonic, scale, options.octave).map((n) => n.midi) : triadOfDegree(tonic, scale, degree, options.octave).midis;
    deps.sound.play(playEvents(midis, mode === 'scale' ? 'up' : mode), {
      onNoteOn: (midi) => { light(midi, true); },
      onNoteOff: (midi) => { light(midi, false); },
      onEnd: () => { clearLit(); playing = null; refreshButtons(); },
    });
  }

  tonicSelect?.addEventListener('change', () => {
    const t = normalizeTonic(tonicSelect!.value);
    if (!t) return;
    stop(); tonic = t; redrawAll();
  });
  typeSelect?.addEventListener('change', () => {
    stop();
    const next = typeSelect!.value as ScaleType;
    tonic = tonicAfterTypeChange(tonic, scale, next);
    scale = next;
    fillTonics(); redrawAll();
  });

  redrawAll();
  const raf = (doc.defaultView as (Window & typeof globalThis) | null)?.requestAnimationFrame;
  if (raf) raf.call(doc.defaultView, () => { if (!destroyed) scrollToKey(); });

  return {
    state: () => ({ tonic, scale, degree }),
    stop,
    destroy: () => { destroyed = true; deps.sound.stop(); root.remove(); },
  };
}
