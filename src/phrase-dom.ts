// score_first M5 (drain 2026-10-22-1850; M7 Phase A 2026-10-22-2330 adds the mix strip) — the phrase surface, plain DOM (no obsidian import, so a happy-dom test mounts the very code the tab runs): a small control strip above the live Score.
//
//   <div class="forge-phrase-controls" role="group" aria-label="Phrase">
//     Source <span class="forge-phrase-source">bar_005</span>
//     Bars <input class="forge-phrase-bars">   Style <select class="forge-phrase-style">   Tempo change (%) <input class="forge-phrase-pct">
//     <span class="forge-phrase-status" role="status">…</span>                                  a write the note refused ('' = nothing to say)
//   </div>
//   <div class="forge-rhythm-edit-score">…the live Score, the same panel the Beat Box tab has…</div>
//
// A MIX phrase (M7) has its own strip in the same place — two bar dropdowns, a Weight slider, a Threshold slider, a Ghost notes checkbox and one plain-words sentence — and NO inspector, bracket or
// source link (navigation through a mix is M8). The strip, the bracket and the Score area are rebuilt when the note's `kind` changes (a hand edit), so the tab always shows the surface of what the note says.
//
// Editing a control is an explicit user edit through a plugin UI (constitution D5, clarification v30 — the same posture as the Beat Box autosave): it writes the phrase's json block, and
// the Score redraws when the vault's modify event for that note arrives (ONE path: a hand edit of the JSON, a sync and a control all redraw the same way). The Score is the live Score
// controller with a `produce` step of its own — no second scheduler: debounce, one render in flight, the latest request queued.

import { attachScoreArea, type ScoreArea, type ScoreAreaPorts } from './live-score-dom.ts';
import type { ScoreInspectorPorts } from './score-inspector.ts';
import type { ProvenanceResult } from './provenance-core.ts';
import { PHRASE_BAR_ROLE, PHRASE_BAR_SCOPE, annotatePhraseXml, phraseBarId, phraseLineageOf, phraseNoteId, phraseProvenance } from './phrase-lineage-core.ts';
import { MIX_BAR_ROLE, MIX_HIT_ROLE, annotateMixPayload, mixLineageOf } from './mix-lineage-core.ts';
import { paintMixHits } from './mix-hits-dom.ts';
import { MORPH_BAR_ROLE, MORPH_HIT_ROLE, annotateMorphPayload, morphLineageOf, morphTraceInspector } from './morph-lineage-core.ts';
import { paintMorphHits } from './morph-hits-dom.ts';
import { editThisBar, revertThisBar, type ForkPorts } from './phrase-fork-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';
import type { ScorePanelPlan } from './score-first-core.ts';
import {
  MORPH_ORDERS, PHRASE_BARS_MAX, PHRASE_BARS_MIN, PHRASE_PCT_MAX, PHRASE_PCT_MIN, PHRASE_STYLES, PHRASE_STYLE_NOTES, clampMixUnit, clampMorphPosition, clampMorphSeed, clampPhraseBars, clampPhrasePct, mixSentence, mixTraceInspector,
  morphEditCount, morphSentence, normalizeMix, normalizeMorph, pathStopOf, pathWeightFor, phraseSourcePath, producePhraseNote, readPhraseKind, readPhraseNote,
  type ExtendPhrase, type MixPhrase, type MorphPhrase, type PhraseParams, type PhraseScoreDeps,
} from './phrase-core.ts';
import { readRhythmNote } from './rhythm-edit-core.ts';

export const PHRASE_CONTROLS_CLASS = 'forge-phrase-controls';
/** The mix tab is dragged, not clicked, so its Score does not wait for the person to stop (a trailing debounce restarts on every input: nothing would redraw until the drag paused). 0 = the first change draws
 *  at once; changes that arrive while a draw is in flight collapse into ONE next draw with the latest values — one render in flight, never a queue of them (createScoreScheduler). The cell-click Score waits LIVE_SCORE_DEBOUNCE_MS. */
export const MIX_SCORE_DEBOUNCE_MS = 0;

type Patch = Partial<Pick<ExtendPhrase, 'bars' | 'style' | 'tempo_change_pct'>>;
type MixPatch = Partial<Pick<MixPhrase, 'a' | 'b' | 'weight' | 'threshold' | 'ghost' | 'mode' | 'order' | 'seed'>>;
type MorphPatch = Partial<Pick<MorphPhrase, 'a' | 'b' | 'bars' | 'order' | 'seed' | 'position'>>;

export interface PhraseControls {
  readonly el: HTMLElement;
  /** Show these parameters (enabled), or `null` = the phrase is not valid: the fields are disabled and say nothing. Never fires `onChange`. */
  set(params: ExtendPhrase | null): void;
  /** The line next to the controls ('' clears it). */
  setStatus(text: string): void;
  dispose(): void;
}

export function mountPhraseControls(parent: HTMLElement, ports: { onChange(patch: Patch): void; openSource?(source: string): void }, before: Node | null = null): PhraseControls {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = PHRASE_CONTROLS_CLASS;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Phrase');

  const field = (label: string, control: HTMLElement): void => {
    const wrap = doc.createElement('label');
    wrap.className = 'forge-phrase-field';
    const text = doc.createElement('span');
    text.textContent = label;
    wrap.appendChild(text);
    wrap.appendChild(control);
    el.appendChild(wrap);
  };

  const sourceWrap = doc.createElement('span');
  sourceWrap.className = 'forge-phrase-field';
  sourceWrap.appendChild(doc.createTextNode('Source '));
  // M6: with `openSource` the source bar's name is a link to that bar ("which parent" from this end); without it, plain text as before.
  const sourceEl = doc.createElement(ports.openSource ? 'button' : 'span');
  sourceEl.className = 'forge-phrase-source';
  if (ports.openSource) {
    (sourceEl as HTMLButtonElement).type = 'button';
    sourceEl.addEventListener('click', () => { const name = sourceEl.textContent ?? ''; if (name) ports.openSource!(name); });
  }
  sourceWrap.appendChild(sourceEl);
  el.appendChild(sourceWrap);

  const bars = doc.createElement('input');
  bars.type = 'number'; bars.className = 'forge-phrase-bars'; bars.min = String(PHRASE_BARS_MIN); bars.max = String(PHRASE_BARS_MAX); bars.step = '1';
  bars.setAttribute('aria-label', 'Bars');
  field('Bars', bars);

  const style = doc.createElement('select');
  style.className = 'forge-phrase-style';
  style.setAttribute('aria-label', 'Style');
  for (const s of PHRASE_STYLES) { const o = doc.createElement('option'); o.value = s; o.textContent = s.replace(/_/g, ' '); style.appendChild(o); }
  field('Style', style);
  // What the chosen style does, in plain words (2100). It follows the select at once and the note's own style on every reload.
  const styleNote = doc.createElement('span');
  styleNote.className = 'forge-phrase-style-note';
  el.appendChild(styleNote);
  const showStyleNote = (s: string) => { styleNote.textContent = (PHRASE_STYLE_NOTES as Record<string, string>)[s] ?? ''; };

  const pct = doc.createElement('input');
  pct.type = 'number'; pct.className = 'forge-phrase-pct'; pct.min = String(PHRASE_PCT_MIN); pct.max = String(PHRASE_PCT_MAX); pct.step = '1';
  pct.setAttribute('aria-label', 'Tempo change (%): negative slows down, positive speeds up');
  field('Tempo change (%)', pct);

  const statusEl = doc.createElement('span');
  statusEl.className = 'forge-phrase-status';
  statusEl.setAttribute('role', 'status');
  el.appendChild(statusEl);
  parent.insertBefore(el, before);

  let shown: ExtendPhrase | null = null;
  const revert = () => { if (shown) { bars.value = String(shown.bars); style.value = shown.style; pct.value = String(shown.tempo_change_pct); } };
  // A field the person leaves with something that is not a number is put back to what the note says (nothing written); a number is clamped to the range and what was clamped is what shows.
  const onNumber = (input: HTMLInputElement, make: (n: number) => Patch) => () => {
    const n = Number.parseFloat(input.value);
    if (!Number.isFinite(n)) { revert(); return; }
    const patch = make(n);
    if (patch.bars !== undefined) bars.value = String(patch.bars);
    if (patch.tempo_change_pct !== undefined) pct.value = String(patch.tempo_change_pct);
    ports.onChange(patch);
  };
  bars.addEventListener('change', onNumber(bars, (n) => ({ bars: clampPhraseBars(n) })));
  pct.addEventListener('change', onNumber(pct, (n) => ({ tempo_change_pct: clampPhrasePct(n) })));
  style.addEventListener('change', () => { showStyleNote(style.value); ports.onChange({ style: style.value as ExtendPhrase['style'] }); });

  return {
    el,
    set(params) {
      shown = params;
      const off = params === null;
      bars.disabled = style.disabled = pct.disabled = off;
      sourceEl.textContent = params ? params.source : '';
      if (ports.openSource) { (sourceEl as HTMLButtonElement).disabled = params === null; if (params) sourceEl.setAttribute('aria-label', `Open ${params.source}`); }
      if (params) revert();
      showStyleNote(params ? params.style : '');
    },
    setStatus(text) { statusEl.textContent = text; },
    dispose() { el.remove(); },
  };
}

export interface MixControls {
  readonly el: HTMLElement;
  /** Show these parameters (enabled), or `null` = the mix is not valid: the controls are disabled. Never fires `onChange`. */
  set(params: MixPhrase | null): void;
  setStatus(text: string): void;
  dispose(): void;
}

/** The mix strip (M7 Phase A): two bar dropdowns (every `bars/bar_*.md`), Weight and Threshold sliders 0..1 in steps of 0.05 that show their number, a Ghost notes checkbox, and a sentence saying what
 *  the settings do. A slider reports every `input` (the number and the sentence follow the thumb at once; the caller coalesces the writes), a dropdown or the checkbox its `change`.
 *
 *  2026-10-26-0900: a **Mode** select (Vote, Path). In PATH mode the Weight slider walks the morph's single-hit steps: one stop per change (step 1/d, snapping on input, labelled `k of d changes`), Order and Seed appear
 *  (as the morph's), and Threshold and Ghost notes are greyed with a one-line note (kept in the note, ignored). `changes(a, b)` is how many single-hit changes lie between two bars (null = it could not be told); it is
 *  asked only in path mode, again whenever a bar changes. In vote mode the strip is what it was. */
export function mountMixControls(parent: HTMLElement, ports: { onChange(patch: MixPatch): void; listBars(): string[]; morph?(): void; changes?(a: string, b: string): Promise<number | null> }, before: Node | null = null): MixControls {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = `${PHRASE_CONTROLS_CLASS} forge-mix-controls`;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Mix');

  const field = (label: string, ...controls: HTMLElement[]): HTMLElement => {
    const wrap = doc.createElement('label');
    wrap.className = 'forge-phrase-field';
    const text = doc.createElement('span');
    text.textContent = label;
    wrap.appendChild(text);
    for (const c of controls) wrap.appendChild(c);
    el.appendChild(wrap);
    return wrap;
  };
  const barSelect = (cls: string, label: string): HTMLSelectElement => {
    const sel = doc.createElement('select');
    sel.className = cls;
    sel.setAttribute('aria-label', label);
    return sel;
  };
  const slider = (cls: string, label: string): { input: HTMLInputElement; value: HTMLElement } => {
    const input = doc.createElement('input');
    input.type = 'range'; input.className = cls; input.min = '0'; input.max = '1'; input.step = '0.05';
    input.setAttribute('aria-label', label);
    const value = doc.createElement('span');
    value.className = `${cls}-value`;
    return { input, value };
  };

  const a = barSelect('forge-mix-a', 'Bar a');
  field('Bar a', a);
  const b = barSelect('forge-mix-b', 'Bar b');
  field('Bar b', b);
  const mode = barSelect('forge-mix-mode', 'Mode: Vote is a weighted vote of the two bars, Path walks the single-hit changes from bar a to bar b');
  for (const [value, label] of [['vote', 'Vote'], ['path', 'Path']] as const) { const o = doc.createElement('option'); o.value = value; o.textContent = label; mode.appendChild(o); }
  field('Mode', mode);
  const weight = slider('forge-mix-weight', 'Weight of bar a: 1 is all bar a, 0 is all bar b');
  const changesLabel = doc.createElement('span');
  changesLabel.className = 'forge-mix-weight-changes';
  field('Weight', weight.input, weight.value, changesLabel);
  const threshold = slider('forge-mix-threshold', 'Threshold: how much weight a hit needs to appear');
  field('Threshold', threshold.input, threshold.value);
  const ghost = doc.createElement('input');
  ghost.type = 'checkbox'; ghost.className = 'forge-mix-ghost';
  ghost.setAttribute('aria-label', 'Ghost notes');
  field('Ghost notes', ghost);
  const order = barSelect('forge-mix-order', 'Order of the single-hit changes (path mode)');
  for (const o of MORPH_ORDERS) { const opt = doc.createElement('option'); opt.value = o; opt.textContent = MIX_ORDER_LABELS[o]; order.appendChild(opt); }
  const orderField = field('Order', order);
  const seed = doc.createElement('input');
  seed.type = 'number'; seed.className = 'forge-mix-seed'; seed.min = '0'; seed.step = '1';
  seed.setAttribute('aria-label', 'Seed: shuffles the changes (seeded order only)');
  const seedField = field('Seed', seed);
  // 2026-10-25-1000: the way to this mix's morph (the path of single-hit changes). Only when the caller gives the action; it writes nothing itself (the action makes a NEW phrase note).
  const morph = ports.morph ? doc.createElement('button') : null;
  if (morph && ports.morph) {
    const ask = ports.morph;
    morph.type = 'button'; morph.className = 'forge-mix-morph'; morph.textContent = 'Morph this mix';
    morph.title = 'Make a new morph phrase from these two bars: a path of single-hit changes, one per bar, instead of a vote';
    morph.setAttribute('aria-label', 'Morph this mix: make a new morph phrase from these two bars');
    morph.addEventListener('click', () => { if (!morph.disabled) ask(); });
    el.appendChild(morph);
  }

  const pathNote = doc.createElement('div');
  pathNote.className = 'forge-mix-path-note';
  pathNote.textContent = 'Threshold and Ghost notes are not used in path mode (they stay in the note for Vote).';
  el.appendChild(pathNote);
  const sentence = doc.createElement('div');
  sentence.className = 'forge-mix-sentence';
  sentence.setAttribute('aria-live', 'polite');
  el.appendChild(sentence);
  const statusEl = doc.createElement('span');
  statusEl.className = 'forge-phrase-status';
  statusEl.setAttribute('role', 'status');
  el.appendChild(statusEl);
  parent.insertBefore(el, before);

  let live: MixPhrase | null = null;              // what the controls show right now (ahead of the note while the person is dragging)
  let known: number | null = null;                // path mode: the number of single-hit changes between live.a and live.b, once asked
  let ask = 0;
  const fill = (sel: HTMLSelectElement, current: string): void => {
    const names = Array.from(new Set([...ports.listBars(), current].filter((n) => n !== ''))).sort();
    sel.textContent = '';
    for (const n of names) { const o = doc.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); }
    sel.value = current;
  };
  const paint = (p: MixPhrase): void => {
    const path = p.mode === 'path';
    mode.value = p.mode ?? 'vote';
    weight.input.step = path && known !== null ? String(known > 0 ? 1 / known : 1) : '0.05';
    weight.input.value = String(p.weight); weight.value.textContent = p.weight.toFixed(2);
    changesLabel.style.display = path && known !== null ? '' : 'none';
    if (path && known !== null) changesLabel.textContent = `${pathStopOf(p.weight, known)} of ${known} change${known === 1 ? '' : 's'}`;
    threshold.input.value = String(p.threshold); threshold.value.textContent = p.threshold.toFixed(2);
    ghost.checked = p.ghost;
    threshold.input.disabled = ghost.disabled = path;
    pathNote.style.display = path ? '' : 'none';
    orderField.style.display = seedField.style.display = path ? '' : 'none';
    order.value = p.order ?? 'musical';
    seed.value = String(p.seed ?? 0);
    seed.disabled = (p.order ?? 'musical') !== 'seeded';
    sentence.textContent = mixSentence(p, known);
  };
  const emit = (patch: MixPatch): void => {
    if (!live) return;
    const next = normalizeMix({ ...live, ...patch });
    const changed = (['a', 'b', 'weight', 'threshold', 'ghost', 'mode', 'order', 'seed'] as const).some((k) => k in patch && live![k] !== next[k]);
    const modeChanged = (live.mode === 'path') !== (next.mode === 'path');
    live = next;
    paint(next);
    if (changed) ports.onChange(patch);
    if (modeChanged) refresh();
  };
  /** Path mode: how many changes lie between the two bars, again (nothing is asked in vote mode). */
  const refresh = (): void => {
    if (!live || live.mode !== 'path' || !ports.changes) { known = null; if (live) paint(live); return; }
    const mine = ++ask;
    const { a: from, b: to } = live;
    void ports.changes(from, to).then((d) => {
      if (mine !== ask || !live || live.mode !== 'path' || live.a !== from || live.b !== to) return;
      known = d;
      paint(live);
    });
  };
  const onWeight = () => {
    const n = Number.parseFloat(weight.input.value);
    if (!Number.isFinite(n) || !live) { if (live) paint(live); return; }
    // path mode with the number of changes known: the slider SNAPS to a stop and writes that stop's weight; otherwise (and in vote mode) the weight as the person set it
    if (live.mode === 'path' && known !== null) emit({ weight: pathWeightFor(pathStopOf(n, known), known) });
    else emit({ weight: clampMixUnit(n) });
  };
  weight.input.addEventListener('input', onWeight);
  weight.input.addEventListener('change', onWeight);
  const onThreshold = () => {
    const n = Number.parseFloat(threshold.input.value);
    if (!Number.isFinite(n) || !live) { if (live) paint(live); return; }
    emit({ threshold: clampMixUnit(n) });
  };
  threshold.input.addEventListener('input', onThreshold);
  threshold.input.addEventListener('change', onThreshold);
  ghost.addEventListener('change', () => emit({ ghost: ghost.checked }));
  mode.addEventListener('change', () => emit({ mode: mode.value === 'path' ? 'path' : 'vote' }));
  order.addEventListener('change', () => emit({ order: order.value as MixPhrase['order'] }));
  seed.addEventListener('change', () => {
    const n = Number.parseFloat(seed.value);
    if (!Number.isFinite(n) || !live) { if (live) paint(live); return; }
    emit({ seed: clampMorphSeed(n) });
  });
  a.addEventListener('change', () => { emit({ a: a.value }); refresh(); });
  b.addEventListener('change', () => { emit({ b: b.value }); refresh(); });
  // a bar made after the strip was shown appears in the lists the next time one is opened
  for (const sel of [a, b]) {
    const refill = () => { if (live) fill(sel, sel === a ? live.a : live.b); };
    sel.addEventListener('focus', refill);
    sel.addEventListener('mousedown', refill);
  }

  return {
    el,
    set(params) {
      live = params;
      const off = params === null;
      a.disabled = b.disabled = mode.disabled = weight.input.disabled = threshold.input.disabled = ghost.disabled = order.disabled = off;
      if (off) seed.disabled = true;
      if (morph) morph.disabled = off;
      if (params) { fill(a, params.a); fill(b, params.b); paint(params); refresh(); } else { sentence.textContent = ''; }
    },
    setStatus(text) { statusEl.textContent = text; },
    dispose() { el.remove(); },
  };
}

const MIX_ORDER_LABELS: Record<string, string> = { musical: 'musical', seeded: 'seeded', by_channel: 'by channel' };

export interface MorphControls {
  readonly el: HTMLElement;
  /** Show these parameters (enabled), or `null` = the morph is not valid: the controls are disabled. Never fires `onChange`. */
  set(params: MorphPhrase | null): void;
  setStatus(text: string): void;
  dispose(): void;
}

const ORDER_LABELS: Record<string, string> = { musical: 'musical', seeded: 'seeded', by_channel: 'by channel' };

/** The morph strip (M7c Phase A): Bar a and Bar b (every `bars/bar_*.md`), Bars (1..64) with an **Atomic** button that sets Bars to the number of single-hit changes + 1, Order (musical, seeded, by channel), Seed (only
 *  for the seeded order), a Position slider (only while Bars is 1: one stop per state of the path, labelled `k of d changes`) and one sentence in plain words. `changes(a, b)` is how many single-hit changes lie between
 *  two bars (null = it could not be told); the strip asks it again whenever a bar changes and keeps the Position inside 0..d. A number is written on `change`, a slider on every `input` (the caller coalesces writes). */
export function mountMorphControls(parent: HTMLElement, ports: { onChange(patch: MorphPatch): void; listBars(): string[]; changes(a: string, b: string): Promise<number | null> }, before: Node | null = null): MorphControls {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = `${PHRASE_CONTROLS_CLASS} forge-morph-controls`;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Morph');

  const field = (label: string, ...controls: HTMLElement[]): HTMLElement => {
    const wrap = doc.createElement('label');
    wrap.className = 'forge-phrase-field';
    const text = doc.createElement('span');
    text.textContent = label;
    wrap.appendChild(text);
    for (const c of controls) wrap.appendChild(c);
    el.appendChild(wrap);
    return wrap;
  };
  const select = (cls: string, label: string): HTMLSelectElement => {
    const sel = doc.createElement('select');
    sel.className = cls;
    sel.setAttribute('aria-label', label);
    return sel;
  };
  const number = (cls: string, label: string, min: number, max?: number): HTMLInputElement => {
    const input = doc.createElement('input');
    input.type = 'number'; input.className = cls; input.min = String(min); input.step = '1';
    if (max !== undefined) input.max = String(max);
    input.setAttribute('aria-label', label);
    return input;
  };

  const a = select('forge-morph-a', 'Bar a: where the morph starts');
  field('Bar a', a);
  const b = select('forge-morph-b', 'Bar b: where the morph ends');
  field('Bar b', b);
  const bars = number('forge-morph-bars', 'Bars: how many bars the morph is drawn in', PHRASE_BARS_MIN, PHRASE_BARS_MAX);
  const atomic = doc.createElement('button');
  atomic.type = 'button'; atomic.className = 'forge-morph-atomic'; atomic.textContent = 'Atomic';
  atomic.title = 'Set Bars to the number of single-hit changes + 1, so every bar differs from the one before by exactly one hit';
  atomic.setAttribute('aria-label', 'Atomic: one bar per single-hit change');
  field('Bars', bars, atomic);
  const order = select('forge-morph-order', 'Order of the single-hit changes');
  for (const o of MORPH_ORDERS) { const opt = doc.createElement('option'); opt.value = o; opt.textContent = ORDER_LABELS[o]; order.appendChild(opt); }
  field('Order', order);
  const seed = number('forge-morph-seed', 'Seed: shuffles the changes (seeded order only)', 0);
  field('Seed', seed);
  const position = doc.createElement('input');
  position.type = 'range'; position.className = 'forge-morph-position'; position.min = '0'; position.step = '1'; position.max = '0';
  position.setAttribute('aria-label', 'Position: how many single-hit changes this one bar has had');
  const positionValue = doc.createElement('span');
  positionValue.className = 'forge-morph-position-value';
  const positionField = field('Position', position, positionValue);

  const sentence = doc.createElement('div');
  sentence.className = 'forge-morph-sentence';
  sentence.setAttribute('aria-live', 'polite');
  el.appendChild(sentence);
  const statusEl = doc.createElement('span');
  statusEl.className = 'forge-phrase-status';
  statusEl.setAttribute('role', 'status');
  el.appendChild(statusEl);
  parent.insertBefore(el, before);

  let live: MorphPhrase | null = null;            // what the controls show right now (ahead of the note while the person is dragging)
  let known: number | null = null;                // the number of single-hit changes between live.a and live.b, once asked
  let ask = 0;
  const fill = (sel: HTMLSelectElement, current: string): void => {
    const names = Array.from(new Set([...ports.listBars(), current].filter((n) => n !== ''))).sort();
    sel.textContent = '';
    for (const n of names) { const o = doc.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); }
    sel.value = current;
  };
  const paint = (p: MorphPhrase): void => {
    bars.value = String(p.bars);
    order.value = p.order;
    seed.value = String(p.seed);
    seed.disabled = p.order !== 'seeded';
    positionField.style.display = p.bars === 1 ? '' : 'none';
    const at = p.position ?? 0;
    position.max = String(known ?? Math.max(at, 0));
    position.value = String(at);
    positionValue.textContent = known === null ? String(at) : `${at} of ${known} change${known === 1 ? '' : 's'}`;
    sentence.textContent = morphSentence(p, known);
  };
  const emit = (patch: MorphPatch): void => {
    if (!live) return;
    const next = normalizeMorph({ ...live, ...patch });
    const changed = (['a', 'b', 'bars', 'order', 'seed', 'position'] as const).some((k) => live![k] !== next[k]);
    live = next;
    paint(next);
    if (changed) ports.onChange(patch);
  };
  /** How many changes lie between the two bars, again; the Position stays inside 0..d. */
  const refresh = (): void => {
    if (!live) return;
    const mine = ++ask;
    const { a: from, b: to } = live;
    void ports.changes(from, to).then((d) => {
      if (mine !== ask || !live || live.a !== from || live.b !== to) return;
      known = d;
      paint(live);
      if (d !== null && live.bars === 1 && (live.position ?? 0) > d) emit({ position: clampMorphPosition(live.position ?? 0, d) });
    });
  };
  const onNumber = (input: HTMLInputElement, make: (n: number) => MorphPatch) => () => {
    const n = Number.parseFloat(input.value);
    if (!Number.isFinite(n) || !live) { if (live) paint(live); return; }
    emit(make(n));
  };
  bars.addEventListener('change', onNumber(bars, (n) => ({ bars: clampPhraseBars(n) })));
  seed.addEventListener('change', onNumber(seed, (n) => ({ seed: clampMorphSeed(n) })));
  const onPosition = onNumber(position, (n) => ({ position: clampMorphPosition(n, known ?? Number.MAX_SAFE_INTEGER) }));
  position.addEventListener('input', onPosition);
  position.addEventListener('change', onPosition);
  order.addEventListener('change', () => emit({ order: order.value as MorphPhrase['order'] }));
  a.addEventListener('change', () => { emit({ a: a.value }); refresh(); });
  b.addEventListener('change', () => { emit({ b: b.value }); refresh(); });
  atomic.addEventListener('click', () => {
    if (!live) return;
    const from = live.a; const to = live.b;
    void ports.changes(from, to).then((d) => {
      if (d === null || !live || live.a !== from || live.b !== to) return;
      known = d;
      emit({ bars: clampPhraseBars(d + 1) });
    });
  });
  for (const sel of [a, b]) {
    const refill = () => { if (live) fill(sel, sel === a ? live.a : live.b); };
    sel.addEventListener('focus', refill);
    sel.addEventListener('mousedown', refill);
  }

  return {
    el,
    set(params) {
      live = params;
      const off = params === null;
      a.disabled = b.disabled = bars.disabled = atomic.disabled = order.disabled = position.disabled = off;
      if (params) { fill(a, params.a); fill(b, params.b); seed.disabled = params.order !== 'seeded'; paint(params); refresh(); } else { seed.disabled = true; sentence.textContent = ''; }
    },
    setStatus(text) { statusEl.textContent = text; },
    dispose() { ask++; el.remove(); },
  };
}

/** M6: present = the phrase's Score is inspectable (click a bar: its lineage; the phrase bracket; the source link). Absent = exactly the M5 tab. */
export interface PhraseInspectorPorts {
  /** Open a note by its lineage id (`phrases/phrase_001`, `bars/bar_005`): the plugin's own openers. */
  openNote(noteId: string): void;
}

export const PHRASE_BRACKET_CLASS = 'forge-phrase-bracket';
/** M8: a mix has one bar, so there is nothing to walk between with the arrow keys; Esc lets go. */
export const MIX_INSPECTOR_HINT = 'Click the bar or a note to see where it came from. Esc lets go.';
export const PHRASE_INSPECTOR_HINT = 'Click a bar to see where it came from. Arrow keys move between bars; Esc lets go.';
/** M7c Phase B: a morph's bars and each of its hits. */
export const MORPH_INSPECTOR_HINT = 'Click a bar or a note to see where it came from. Arrow keys move between bars; Esc lets go.';

export interface PhraseMountPorts extends Omit<ScoreAreaPorts, 'compute' | 'produce' | 'inspector'> {
  inspector?: PhraseInspectorPorts;
  /** The phrase note's path. */
  path: string;
  plan: ScorePanelPlan;
  /** A vault note's text by path (fresh on every call). Rejects when the note is not there. */
  readNote(path: string): Promise<string>;
  /** Rewrite the phrase note's json block (one atomic read-modify-write on the vault side). */
  writePhrase(params: PhraseParams): Promise<{ ok: true } | { ok: false; message: string }>;
  compute: PhraseScoreDeps['compute'];
  /** M9 (fork on edit): the vault side of "Edit this bar" (create the fork note, list `bars/`, tell the person). Absent = the extend inspector offers no Edit this bar / Revert to generated. The phrase write and
   *  the opener are the ports above (`writePhrase`, `inspector.openNote`). */
  fork?: Pick<ForkPorts<unknown>, 'listBarBasenames' | 'exists' | 'create' | 'notify' | 'isAlreadyExists'>;
  /** M7: the names of the bars in `bars/` (fresh on every call), for the mix dropdowns. Absent = a mix's dropdowns list only its own two bars. */
  listBars?(): string[];
  /** 2026-10-25-1000: "Turn this mix into a morph". Present = the mix strip has a **Morph this mix** button that asks for it; absent = no button (the strip as it was). */
  turnIntoMorph?(): void;
  /** M7: the phrase note's text when the caller already has it, so the FIRST surface drawn is the right one for its `kind` (no extend strip flashing before a mix). Absent = the extend surface until `load()`. */
  initial?: string;
}

export interface PhraseHandle {
  /** Read the phrase note and show it (the first draw is immediate). */
  load(): Promise<void>;
  /** The kind of phrase on screen right now (what the strip and the Score are for). The "Turn this mix into a morph" command asks it, synchronously, to know whether it is offered. */
  kind(): PhraseParams['kind'];
  /** The vault's `modify` event for any note: the phrase note reloads; its source bar redraws; anything else is ignored. */
  noteModified(path: string): void;
  dispose(): void;
}

type NoteText = string | { unreadable: string };

function phraseSourceNote(source: string): string {
  return `bars/${source}`;
}

/** The map of a phrase's Score: parse the phrase the Score was rendered for, put the bar ids on the engine's MusicXML, and tie each id to the phrase, its source and its tempo. Never throws. */
function annotateForPhrase(path: string, note: NoteText, payload: Record<string, unknown>): ProvenanceResult {
  const none = (problem: string): ProvenanceResult => ({ payload, map: {}, problems: [problem], kitProblems: [] });
  const parsed = typeof note === 'string' ? readPhraseNote(note) : null;
  if (!parsed || parsed.ok === false) return none('the phrase could not be read');
  if (parsed.value.kind !== 'extend') return none('a mix has no bar lineage yet');
  const extend = parsed.value;
  const multiKey = typeof payload.multi_staff_content === 'string' ? 'multi_staff_content' : typeof payload.content === 'string' ? 'content' : null;
  if (multiKey === null) return none('the Score payload carries no MusicXML');
  let r;
  try {
    r = annotatePhraseXml(payload[multiKey] as string, typeof payload.kit_content === 'string' ? payload.kit_content : null, extend.bars, PHRASE_BAR_SCOPE);
  } catch (e) {
    console.error('annotateForPhrase failed', e);
    return none(`the bars could not be tied to the phrase (${(e as Error)?.message ?? e})`);
  }
  if (r.ok === false) return none(r.problems[0]);
  const next: Record<string, unknown> = { ...payload, [multiKey]: r.multiXml };
  if (r.kitXml !== null) next.kit_content = r.kitXml;
  return { payload: next, map: phraseProvenance(phraseNoteId(path), extend, r.bars), problems: [], kitProblems: r.kitProblems };
}

/** The map of a MIX's Score (M8): the bar and every hit, each tied to the two bars it was made of. Never throws. */
function annotateForMix(path: string, note: NoteText, payload: Record<string, unknown>): ProvenanceResult {
  const parsed = typeof note === 'string' ? readPhraseNote(note) : null;
  if (!parsed || parsed.ok === false || parsed.value.kind !== 'mix') return { payload, map: {}, problems: ['the mix could not be read'], kitProblems: [] };
  const result = annotateMixPayload(phraseNoteId(path), parsed.value, payload);
  console.info(mixTraceInspector(result.problems, result.map));          // evidence ships with the feature: a mix that cannot be inspected says why, in the console too
  return result;
}

/** The map of a MORPH's Score (M7c Phase B): every bar and every hit of every generated bar, tied to the path between the two bars. Never throws. */
function annotateForMorph(path: string, note: NoteText, payload: Record<string, unknown>): ProvenanceResult {
  const parsed = typeof note === 'string' ? readPhraseNote(note) : null;
  if (!parsed || parsed.ok === false || parsed.value.kind !== 'morph') return { payload, map: {}, problems: ['the morph could not be read'], kitProblems: [] };
  const result = annotateMorphPayload(phraseNoteId(path), parsed.value, payload);
  console.info(morphTraceInspector(result.problems, result.map));        // evidence ships with the feature: a morph that cannot be inspected says why, in the console too
  return result;
}

/** The bracket: hovering or focusing it lights every bar the phrase made; leaving clears; a click (or Enter / Space) opens the phrase note. */
function wireBracket(el: HTMLElement, current: () => ExtendPhrase | null, area: () => ScoreArea | null, open: () => void): void {
  const ids = () => { const p = current(); return p ? Array.from({ length: p.bars }, (_, i) => phraseBarId(PHRASE_BAR_SCOPE, i + 1)) : []; };
  el.addEventListener('mouseenter', () => area()?.lightAll(ids()));
  el.addEventListener('mouseleave', () => area()?.lightAll([]));
  el.addEventListener('focus', () => area()?.lightAll(ids()));
  el.addEventListener('blur', () => area()?.lightAll([]));
  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') { e.preventDefault(); open(); } });
}

/** The strip the tab shows, whichever kind of phrase it is: the ONE thing mountPhrase needs from either. `set` takes the parsed phrase (or null for one that is not valid). */
interface Strip {
  readonly el: HTMLElement;
  set(params: PhraseParams | null): void;
  setStatus(text: string): void;
  dispose(): void;
}

export function mountPhrase(parent: HTMLElement, ports: PhraseMountPorts): PhraseHandle {
  let current: PhraseParams | null = null;
  let last: NoteText = { unreadable: 'not read yet' };
  let seq = 0;
  let disposed = false;
  // What the controls have asked for while a write is in flight (null = nothing waiting). Rapid control input (a slider drag) never queues one write per event: the writes run one at a time and the
  // next one is the LATEST ask, with every field changed since the one before it.
  let want: PhraseParams | null = null;
  let writing = false;
  let barsData: RhythmData[] | null = null;      // M9: the bars as the engine laid them out in the Score on screen (the data "Edit this bar" writes into the fork note)

  const insp = ports.inspector;
  const { path: _path, plan, readNote: _read, writePhrase: _write, compute: _compute, inspector: _insp, listBars: _list, initial: _initial, fork: _fork, turnIntoMorph: _turn, ...areaPorts } = ports;   // what the Score area itself takes (the rest is the phrase's)

  let kind: PhraseParams['kind'] = (ports.initial !== undefined ? readPhraseKind(ports.initial) : null) ?? 'extend';
  let strip!: Strip;
  let bracket: HTMLElement | null = null;
  let area: ScoreArea | null = null;

  /** Build the surface of one kind: its strip, (extend only) the bracket and the inspector, and the live Score. Everything is appended in that order, so after `teardown()` a rebuild lands in the same places. */
  /** How many single-hit changes lie between two bars, read FRESH from the vault; null = a bar could not be read or is not rhythm data (the Score says why). */
  const morphChanges = async (x: string, y: string): Promise<number | null> => {
    try {
      const ra = readRhythmNote(await ports.readNote(phraseSourcePath(x)));
      const rb = readRhythmNote(await ports.readNote(phraseSourcePath(y)));
      if (ra.ok === false || rb.ok === false) return null;
      if (ra.value.data.steps !== rb.value.data.steps) return null;
      return morphEditCount(ra.value.data, rb.value.data);
    } catch {
      return null;
    }
  };
  const build = (k: PhraseParams['kind']): void => {
    kind = k;
    if (k === 'morph') {
      const morph = mountMorphControls(parent, { onChange: (patch) => { void commit(patch); }, listBars: () => ports.listBars?.() ?? [], changes: morphChanges });
      strip = { el: morph.el, set: (params) => morph.set(params && params.kind === 'morph' ? params : null), setStatus: (t) => morph.setStatus(t), dispose: () => morph.dispose() };
    } else if (k === 'mix') {
      const mix = mountMixControls(parent, { onChange: (patch) => { void commit(patch); }, listBars: () => ports.listBars?.() ?? [], morph: ports.turnIntoMorph, changes: morphChanges });
      strip = { el: mix.el, set: (params) => mix.set(params && params.kind === 'mix' ? params : null), setStatus: (t) => mix.setStatus(t), dispose: () => mix.dispose() };
    } else {
      const controls = mountPhraseControls(parent, { onChange: (patch) => { void commit(patch); }, openSource: insp ? (source) => insp.openNote(phraseSourceNote(source)) : undefined });
      strip = { el: controls.el, set: (params) => controls.set(params && params.kind === 'extend' ? params : null), setStatus: (t) => controls.setStatus(t), dispose: () => controls.dispose() };
    }
    // The bracket over every bar made by this phrase note (hover lights them all, a click opens the phrase). Built before the Score so it sits between the strip and the engraving. A mix has none (M8).
    bracket = null;
    if (insp && k === 'extend') {
      const doc = parent.ownerDocument;
      bracket = doc.createElement('div');
      bracket.className = PHRASE_BRACKET_CLASS;
      bracket.setAttribute('role', 'button');
      bracket.setAttribute('tabindex', '0');
      bracket.style.display = 'none';
      parent.appendChild(bracket);
    }
    const inspectorPorts: ScoreInspectorPorts | undefined = insp && k === 'extend' ? {
      noteId: phraseNoteId(ports.path),
      openNote: insp.openNote,
      annotate: (note, payload) => { barsData = Array.isArray(payload.bars_data) ? (payload.bars_data as RhythmData[]) : null; return annotateForPhrase(ports.path, note as NoteText, payload); },
      onAction: ports.fork ? (action) => { void runForkAction(action); } : undefined,
      lineage: phraseLineageOf,
      hint: PHRASE_INSPECTOR_HINT,
      enlargeTargets: null,                          // no hit rectangle: it would sit over the noteheads and take the Score's click; a click on any drawn part of a bar (a notehead, a staff line) selects the BAR
      pointRoles: [PHRASE_BAR_ROLE],                 // 1100: ... and so does a click on the UNPAINTED part of a bar (empty staff, just off a small notehead): the bar's box decides
      trace: (line) => { console.info(line); },
      pinLabel: (id, prov) => (typeof prov.params.bar === 'number' ? `bar ${prov.params.bar}` : id),
      previewOnHover: true,
      band: true,                                    // 2300: the class recolour alone was not visible in the real Obsidian; the band does not depend on the stylesheet or the theme
      kitNote: 'Kit view: not mapped for this phrase (use the multi-staff view to inspect).',
    } : insp && k === 'mix' ? {
      // M8: the mix's one bar and each of its hits, tied to the two bars they came from. Clicking a notehead pins THAT hit, clicking the staff the bar; a redraw (the Weight slider) keeps the pin; the
      // pinned bar's noteheads are painted by parent. No bracket and no source link (they are the extend's); arrows have nowhere to go.
      noteId: phraseNoteId(ports.path),
      openNote: insp.openNote,
      annotate: (note, payload) => annotateForMix(ports.path, note as NoteText, payload),
      lineage: mixLineageOf,
      hint: MIX_INSPECTOR_HINT,
      order: () => [],
      keepPin: true,
      previewOnHover: true,
      enlargeIds: (map) => Object.keys(map).filter((id) => map[id].role === MIX_HIT_ROLE),
      pointRoles: [MIX_BAR_ROLE],                    // 1100: a click on the empty staff shows the bar's stack (a note, drawn or enlarged, still pins itself first)
      trace: (line) => { console.info(line); },
      pinLabel: (id, prov) => (prov.role === MIX_BAR_ROLE ? 'bar 1' : id),
      decorate: paintMixHits,
      kitNote: 'Kit view: not mapped for this mix (use the multi-staff view to inspect).',
    } : insp && k === 'morph' ? {
      // M7c Phase B: every bar of the path and each of its hits, tied to the two bars and the single-hit changes between them. Clicking a notehead pins THAT hit, a click anywhere else in a bar pins the BAR; arrows walk the
      // bars; a redraw (a control moved) keeps the pin; the pinned bar's noteheads are painted by where the hit came from. "Edit this bar" forks a bar exactly as an extend's. No bracket, no source link.
      noteId: phraseNoteId(ports.path),
      openNote: insp.openNote,
      annotate: (note, payload) => { barsData = Array.isArray(payload.bars_data) ? (payload.bars_data as RhythmData[]) : null; return annotateForMorph(ports.path, note as NoteText, payload); },
      onAction: ports.fork ? (action) => { void runForkAction(action); } : undefined,
      lineage: morphLineageOf,
      hint: MORPH_INSPECTOR_HINT,
      order: (map) => Object.keys(map).filter((id) => map[id].role === MORPH_BAR_ROLE).sort((x, y) => Number(map[x].params.bar) - Number(map[y].params.bar)),
      keepPin: true,
      previewOnHover: true,
      enlargeIds: (map) => Object.keys(map).filter((id) => map[id].role === MORPH_HIT_ROLE),
      pointRoles: [MORPH_BAR_ROLE],                  // a click anywhere inside a bar's box pins it (Iteration 123)
      trace: (line) => { console.info(line); },
      pinLabel: (id, prov) => (prov.role === MORPH_BAR_ROLE ? `bar ${String(prov.params.bar)}` : `bar ${String(prov.params.bar)}, ${String(prov.params.channel)} step ${Number(prov.params.step) + 1}`),
      decorate: paintMorphHits,
      kitNote: 'Kit view: not mapped for this morph (use the multi-staff view to inspect).',
    } : undefined;
    area = attachScoreArea(parent, plan, {
      ...areaPorts,
      inspector: inspectorPorts,
      debounceMs: k === 'mix' || k === 'morph' ? MIX_SCORE_DEBOUNCE_MS : undefined,           // a mix and a morph are dragged (sliders): the first change draws at once, later ones collapse into one draw
      produce: (note, title) => producePhraseNote({ readNote: ports.readNote, compute: ports.compute }, note as NoteText, title),
    });
    if (bracket) wireBracket(bracket, () => (current && current.kind === 'extend' ? current : null), () => area, () => insp!.openNote(phraseNoteId(ports.path)));
  };
  const teardown = (): void => {
    area?.dispose();
    area = null;
    bracket?.remove();
    bracket = null;
    strip.dispose();
  };
  build(kind);

  const readText = async (): Promise<NoteText> => {
    try { return await ports.readNote(ports.path); } catch (e) { return { unreadable: (e as Error)?.message ?? String(e) }; }
  };
  const apply = (text: NoteText): void => {
    last = text;
    const parsed = typeof text === 'string' ? readPhraseNote(text) : null;
    current = parsed && parsed.ok ? parsed.value : null;
    // The surface follows what the note SAYS it is, even when the rest of it is wrong (a mix with weight 3 still gets the mix strip, disabled, and the Score says what is wrong).
    const says = typeof text === 'string' ? readPhraseKind(text) : null;
    if (says !== null && says !== kind) { teardown(); build(says); }
    if (!writing && want === null) strip.set(current);                  // while a drag's writes are in flight the sliders stay where the person has them
    if (bracket) {
      const ext = current && current.kind === 'extend' ? current : null;
      bracket.style.display = ext ? '' : 'none';
      if (ext) {
        const name = phraseNoteId(ports.path).split('/').pop() ?? '';
        bracket.textContent = `${name} · ${ext.bars} bar${ext.bars === 1 ? '' : 's'}`;
        bracket.setAttribute('aria-label', `Open ${name} (hover to light its ${ext.bars} bar${ext.bars === 1 ? '' : 's'})`);
      }
    }
  };

  /** M9: "Edit this bar" / "Revert to generated" pressed on the pinned bar of an extend phrase (M7c Phase B: or of a morph). The vault is the `fork` port; the phrase write and the opener are the tab's own. */
  async function runForkAction(action: { id: 'fork' | 'revert'; barNumber: number }): Promise<void> {
    if (!current || (current.kind !== 'extend' && current.kind !== 'morph') || !ports.fork || !insp) return;
    const f = ports.fork;
    const forkPorts: ForkPorts<unknown> = { ...f, writePhrase: (p) => ports.writePhrase(p), open: (id) => insp.openNote(id), trace: (line) => console.info(line) };
    if (action.id === 'revert') {
      const r = await revertThisBar(forkPorts, { params: current, barNumber: action.barNumber });
      if (r.ok) current = r.params;                                          // the vault's modify event for this write brings the Score
      return;
    }
    const data = barsData?.[action.barNumber - 1];
    if (!data) { f.notify(`Edit this bar: the Score has no data for bar ${action.barNumber} yet (wait for it to draw).`); return; }
    const r = await editThisBar(forkPorts, { params: current, barNumber: action.barNumber, phraseNoteId: phraseNoteId(ports.path), barData: data });
    if (r.ok) current = r.params;
  }

  async function commit(patch: Patch | MixPatch | MorphPatch): Promise<void> {
    const base = want ?? current;
    if (!base || disposed) return;
    const merged = { ...base, ...patch } as PhraseParams;
    want = merged.kind === 'morph' ? normalizeMorph(merged) : merged.kind === 'mix' ? normalizeMix(merged) : merged;          // a morph holds a position only while Bars is 1; a mix holds order and seed only in path mode
    if (writing) return;                                                 // the running write loop picks up `want` when it is done
    writing = true;
    try {
      while (want !== null && !disposed) {
        const next: PhraseParams = want;
        const result = await ports.writePhrase(next);
        if (disposed) return;
        if (result.ok === false) {
          want = null;
          strip.set(current);                                            // refused: the fields go back to what the note says
          strip.setStatus(result.message);
          return;
        }
        current = next;                                                  // written: the vault's modify event for this write brings the Score
        strip.setStatus('');
        if (want === next) want = null;                                  // nothing newer was asked for meanwhile
      }
    } finally {
      writing = false;
    }
  }

  return {
    kind: () => kind,
    async load() {
      const mine = ++seq;
      const text = await readText();
      if (disposed || mine !== seq) return;
      apply(text);
      area?.showNow(text);
    },
    noteModified(path) {
      if (disposed) return;
      if (path === ports.path) {
        const mine = ++seq;
        void readText().then((text) => {
          if (disposed || mine !== seq) return;
          apply(text);
          area?.update(text);
        });
        return;
      }
      // the notes this phrase is made of: a mix's two bars; an extend's source bar and (M9) every fork note named in its overrides
      const made = current === null ? [] : current.kind === 'mix' ? [phraseSourcePath(current.a), phraseSourcePath(current.b)] : current.kind === 'morph' ? [phraseSourcePath(current.a), phraseSourcePath(current.b), ...Object.values(current.overrides ?? {}).map((id) => `${id}.md`)] : [phraseSourcePath(current.source), ...Object.values(current.overrides ?? {}).map((id) => `${id}.md`)];
      if (made.includes(path)) area?.update(last);                       // a bar this phrase is made of changed: the Score is read fresh by the next render
    },
    dispose() {
      disposed = true;
      teardown();
    },
  };
}
