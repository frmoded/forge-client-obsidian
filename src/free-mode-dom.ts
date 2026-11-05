// 2026-11-04-1172 (Scale Explorer 3 of 4) — the DOM half of FREE MODE (`mode: free`): the piano is clickable, a click toggles a key (any octave; the set is kept ascending), a short note sounds when a key goes ON, a Clear button, and a live readout
// under the piano (free-mode-core.ts: the chord's name with its inversion and slash bass, "also:", the interval of two notes, the note, a hint; the Roman numeral "in" the chosen scale, or which notes are outside it). The staff shows the toggled notes
// as one chord, live. The tonic and scale dropdowns set the KEY: its keys are tinted on the piano (lighter than a toggled key). `show: diatonic` adds the row of the scale's seven chords (diatonic-chords-core.ts) and a "7ths" switch; a click on
// one REPLACES the toggled notes with that chord, lights the keys and plays it.
// Reached through mountScaleExplorer (which dispatches here for `mode: free`); no `obsidian`, no engine: the sound and the staff are injected, exactly as in scale-explorer-dom.ts.

import { KEYBOARD_HEIGHT, buildKeyboard, centerXOf, initialScrollLeft, keyboardWidth } from './input-widget-piano.ts';
import { stackedMusicXML } from './chord-names-core.ts';
import { diatonicChords, keyName } from './diatonic-chords-core.ts';
import { clefFor, freeReadout, pickedNotes, spellInKey, toggleKey } from './free-mode-core.ts';
import { GUITAR_FRETS, positionsOf, positionsOfMidi, tabForRun, tabText } from './guitar-core.ts';
import { mountGuitar, type GuitarDot } from './guitar-dom.ts';
import {
  SCALE_TYPES,
  SCALE_TYPE_LABELS,
  normalizeTonic,
  playEvents,
  scaleNotes,
  tonicAfterTypeChange,
  tonicNamesFor,
  type ScaleExplorerOptions,
  type ScaleType,
} from './scale-explorer-core.ts';
import type { ScaleExplorerDeps, ScaleExplorerHandle } from './scale-explorer-dom.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** How long a toggled key sounds. */
export const TOGGLE_NOTE_MS = 350;
const SILENT_HOOKS = { onNoteOn: () => {}, onNoteOff: () => {}, onEnd: () => {} };

export function mountFreeMode(el: HTMLElement, options: ScaleExplorerOptions, deps: ScaleExplorerDeps): ScaleExplorerHandle {
  const doc = el.ownerDocument;
  let tonic = options.tonic;
  let scale: ScaleType = options.scale;
  let picked: number[] = [];
  let sevenths = false;
  let drawToken = 0;
  let destroyed = false;

  const root = doc.createElement('div');
  root.className = 'forge-scale';
  root.setAttribute('data-mode', 'free');
  el.appendChild(root);
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // ---- controls: the key (tonic, scale) and Clear ---------------------------------------------------------------------------------------------------------------------------------
  const bar = h('div', 'forge-scale-controls');
  const tonicSelect = h('select', 'forge-scale-tonic');
  tonicSelect.setAttribute('aria-label', 'Tonic');
  const tLabel = h('label', 'forge-scale-field', 'Key ');
  tLabel.appendChild(tonicSelect);
  const typeSelect = h('select', 'forge-scale-type');
  typeSelect.setAttribute('aria-label', 'Scale type');
  for (const t of SCALE_TYPES) { const o = h('option', undefined, SCALE_TYPE_LABELS[t]); o.value = t; typeSelect.appendChild(o); }
  typeSelect.value = scale;
  const sLabel = h('label', 'forge-scale-field', 'Scale ');
  sLabel.appendChild(typeSelect);
  const clearBtn = h('button', 'forge-scale-clear', 'Clear');
  clearBtn.type = 'button';
  clearBtn.setAttribute('data-action', 'clear');
  bar.append(tLabel, sLabel, clearBtn);
  root.appendChild(bar);

  const fillTonics = (): void => {
    const names = tonicNamesFor(scale);
    if (!names.includes(tonic)) names.push(tonic);
    tonicSelect.textContent = '';
    for (const n of names) { const o = h('option', undefined, n); o.value = n; tonicSelect.appendChild(o); }
    tonicSelect.value = tonic;
  };

  const caption = h('div', 'forge-scale-caption');
  caption.setAttribute('aria-live', 'polite');
  root.appendChild(caption);
  const pianoHost = h('div', 'forge-scale-piano');
  root.appendChild(pianoHost);

  // The readout under the piano.
  const readout = h('div', 'forge-scale-readout');
  readout.setAttribute('aria-live', 'polite');
  const rHead = h('div', 'forge-scale-readout-headline');
  const rAlso = h('div', 'forge-scale-readout-also');
  const rRoman = h('div', 'forge-scale-readout-roman');
  const rOutside = h('div', 'forge-scale-readout-outside');
  readout.append(rHead, rAlso, rRoman, rOutside);
  root.appendChild(readout);

  const rowHost = options.show.diatonic ? h('div', 'forge-scale-diatonic') : null;
  if (rowHost) root.appendChild(rowHost);
  // 2026-11-04-1173: the guitar neck (every intersection clickable: a click toggles that PITCH like a piano key; a pitch has several dots, they all light) and the one-line tab of the picked notes.
  const guitarHost = options.show.guitar ? h('div', 'forge-scale-guitar') : null;
  if (guitarHost) root.appendChild(guitarHost);
  const tabHost = options.show.guitar && options.tab ? h('div', 'forge-scale-tab') : null;
  if (tabHost) root.appendChild(tabHost);
  const staffHost = options.show.staff && deps.renderStaff ? h('div', 'forge-scale-staff') : null;
  if (staffHost) root.appendChild(staffHost);

  // ---- the piano -----------------------------------------------------------------------------------------------------------------------------------------------------------------
  let keyEls = new Map<number, SVGElement>();
  const keys = buildKeyboard();
  const total = keyboardWidth(keys);
  const scroller = h('div', 'forge-piano-scroller');
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'forge-piano-svg forge-free-svg');
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
    rect.setAttribute('class', `forge-piano-key ${key.black ? 'forge-piano-key-black' : 'forge-piano-key-white'} forge-free-key`);
    rect.addEventListener('click', () => { toggle(key.midi); });
    svg.appendChild(rect);
    keyEls.set(key.midi, rect);
  }
  const scrollToKey = (): void => {
    const sc = scaleNotes(tonic, scale, options.octave);
    const mid = (centerXOf(keys, sc[0].midi) + centerXOf(keys, sc[7].midi)) / 2;
    scroller.scrollLeft = initialScrollLeft(mid, scroller.clientWidth ?? 0, total);
  };

  /** The keys of the scale are tinted (every octave); the picked keys are strong. */
  const tintKey = (): void => {
    const pcs = new Set(scaleNotes(tonic, scale, 4).slice(0, 7).map((n) => ((n.midi % 12) + 12) % 12));
    for (const [midi, rect] of keyEls) rect.classList.toggle('is-in-key', pcs.has(((midi % 12) + 12) % 12));
  };
  const markPicked = (): void => {
    const on = new Set(picked);
    for (const [midi, rect] of keyEls) { rect.classList.toggle('is-picked', on.has(midi)); if (on.has(midi)) rect.setAttribute('data-picked', 'true'); else rect.removeAttribute('data-picked'); }
  };

  // ---- the readout, the staff, the row ----------------------------------------------------------------------------------------------------------------------------------------
  const setLine = (e: HTMLElement, text: string | null): void => {
    e.textContent = text ?? '';
    if (text) e.removeAttribute('hidden'); else e.setAttribute('hidden', '');
  };
  const updateReadout = (): void => {
    const r = freeReadout(picked, { tonic, scale });
    root.setAttribute('data-readout', r.kind);
    setLine(rHead, r.headline);
    setLine(rAlso, r.also.length > 0 ? `also: ${r.also.join(' / ')}` : null);
    setLine(rRoman, r.roman);
    setLine(rOutside, r.outside);
  };

  const drawStaff = (): void => {
    if (!staffHost || !deps.renderStaff) return;
    const token = ++drawToken;
    const host = h('div', 'forge-scale-staff-score');
    staffHost.textContent = '';
    staffHost.appendChild(host);
    deps.renderStaff(host, stackedMusicXML(pickedNotes(picked, { tonic, scale }), clefFor(picked))).catch((e: unknown) => {
      if (token !== drawToken || destroyed) return;
      console.error('Forge: scale explorer (free mode) — the staff could not be drawn:', e);
      host.textContent = `The staff could not be drawn: ${e instanceof Error ? e.message : String(e)}`;
      host.classList.add('forge-scale-staff-error');
    });
  };

  const renderRow = (): void => {
    if (!rowHost) return;
    rowHost.textContent = '';
    for (const c of diatonicChords(tonic, scale, sevenths, options.octave)) {
      const b = h('button', 'forge-scale-diatonic-btn');
      b.type = 'button';
      b.setAttribute('data-degree', String(c.degree));
      b.setAttribute('data-numeral', c.numeral);
      b.setAttribute('data-midis', c.midis.join(','));
      b.appendChild(h('span', 'forge-scale-diatonic-numeral', c.numeral));
      b.appendChild(h('span', 'forge-scale-diatonic-label', c.label));
      b.addEventListener('click', () => { replaceWith(c.midis); });
      rowHost.appendChild(b);
    }
    const sw = h('button', 'forge-scale-sevenths', '7ths');
    sw.type = 'button';
    sw.setAttribute('aria-pressed', sevenths ? 'true' : 'false');
    sw.addEventListener('click', () => { sevenths = !sevenths; renderRow(); });
    rowHost.appendChild(sw);
  };

  const guitar = guitarHost ? mountGuitar(guitarHost, { clickAll: true, onClick: (pos) => { toggle(pos.midi); } }) : null;
  /** The key's notes everywhere on the neck (tinted), the root larger; plus a dot for each picked pitch that is not a note of the key; every dot of a picked pitch is lit. */
  const refreshGuitar = (): void => {
    if (!guitar) return;
    const key = { tonic, scale };
    const sc = scaleNotes(tonic, scale, options.octave).slice(0, 7);
    const names = new Map<number, string>(sc.map((n) => [((n.midi % 12) + 12) % 12, n.name.replace(/\d+$/, '')]));
    const degrees = new Map<number, number>(sc.map((n) => [((n.midi % 12) + 12) % 12, n.degree]));
    const rootPc = ((sc[0].midi % 12) + 12) % 12;
    const labelOf = (pc: number, midi: number): string => (options.labels === 'degrees' ? (degrees.has(pc) ? String(degrees.get(pc)) : '') : (names.get(pc) ?? spellInKey(midi, key).replace(/\d+$/, '')));
    const dots: GuitarDot[] = positionsOf(sc.map((n) => n.name), GUITAR_FRETS, { root: rootPc, degrees }).map((p) => ({ string: p.string, fret: p.fret, midi: p.midi, pc: p.pc, isRoot: p.isRoot, label: labelOf(p.pc, p.midi), tint: true }));
    for (const m of picked) {
      const pc = ((m % 12) + 12) % 12;
      if (degrees.has(pc)) continue;
      for (const pos of positionsOfMidi(m)) dots.push({ string: pos.string, fret: pos.fret, midi: m, pc, isRoot: false, label: labelOf(pc, m), tint: false });
    }
    guitar.setDots(dots);
    guitar.setPicked(new Set(picked));
    if (tabHost) tabHost.textContent = tabText(tabForRun(picked));
  };

  const refreshAll = (): void => {
    root.setAttribute('data-tonic', tonic);
    root.setAttribute('data-scale', scale);
    caption.textContent = `Key: ${keyName(tonic, scale)}: ${scaleNotes(tonic, scale, options.octave).slice(0, 7).map((n) => n.name.replace(/\d+$/, '')).join(' ')}`;
    tintKey();
    markPicked();
    updateReadout();
    renderRow();
    refreshGuitar();
    drawStaff();
  };

  // ---- the gestures ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  function toggle(midi: number): void {
    const wasOn = picked.includes(midi);
    picked = toggleKey(picked, midi);
    markPicked(); updateReadout(); refreshGuitar(); drawStaff();
    if (!wasOn) deps.sound.play([{ midi, startMs: 0, durMs: TOGGLE_NOTE_MS }], SILENT_HOOKS);   // a key going ON sounds; going OFF is silent
  }
  function replaceWith(midis: number[]): void {
    picked = [...midis].sort((a, b) => a - b);
    markPicked(); updateReadout(); refreshGuitar(); drawStaff();
    deps.sound.play(playEvents(picked, 'together'), SILENT_HOOKS);
  }
  function stop(): void { deps.sound.stop(); }

  clearBtn.addEventListener('click', () => { stop(); picked = []; markPicked(); updateReadout(); refreshGuitar(); drawStaff(); });
  tonicSelect.addEventListener('change', () => {
    const t = normalizeTonic(tonicSelect.value);
    if (!t) return;
    stop(); tonic = t; refreshAll();
  });
  typeSelect.addEventListener('change', () => {
    stop();
    const next = typeSelect.value as ScaleType;
    tonic = tonicAfterTypeChange(tonic, scale, next);
    scale = next;
    fillTonics(); refreshAll();
  });

  fillTonics();
  refreshAll();
  scrollToKey();
  const raf = (doc.defaultView as (Window & typeof globalThis) | null)?.requestAnimationFrame;
  if (raf) raf.call(doc.defaultView, () => { if (!destroyed) scrollToKey(); });

  return {
    state: () => ({ tonic, scale, picked: [...picked] }),
    stop,
    destroy: () => { destroyed = true; deps.sound.stop(); root.remove(); },
  };
}
