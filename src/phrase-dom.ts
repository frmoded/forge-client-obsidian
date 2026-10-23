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
import { PHRASE_BAR_SCOPE, annotatePhraseXml, phraseBarId, phraseLineageOf, phraseNoteId, phraseProvenance } from './phrase-lineage-core.ts';
import type { ScorePanelPlan } from './score-first-core.ts';
import {
  PHRASE_BARS_MAX, PHRASE_BARS_MIN, PHRASE_PCT_MAX, PHRASE_PCT_MIN, PHRASE_STYLES, PHRASE_STYLE_NOTES, clampMixUnit, clampPhraseBars, clampPhrasePct, mixSentence, phraseSourcePath, producePhraseNote,
  readPhraseKind, readPhraseNote,
  type ExtendPhrase, type MixPhrase, type PhraseParams, type PhraseScoreDeps,
} from './phrase-core.ts';

export const PHRASE_CONTROLS_CLASS = 'forge-phrase-controls';
/** The mix tab is dragged, not clicked, so its Score does not wait for the person to stop (a trailing debounce restarts on every input: nothing would redraw until the drag paused). 0 = the first change draws
 *  at once; changes that arrive while a draw is in flight collapse into ONE next draw with the latest values — one render in flight, never a queue of them (createScoreScheduler). The cell-click Score waits LIVE_SCORE_DEBOUNCE_MS. */
export const MIX_SCORE_DEBOUNCE_MS = 0;

type Patch = Partial<Pick<ExtendPhrase, 'bars' | 'style' | 'tempo_change_pct'>>;
type MixPatch = Partial<Pick<MixPhrase, 'a' | 'b' | 'weight' | 'threshold' | 'ghost'>>;

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
 *  the settings do. A slider reports every `input` (the number and the sentence follow the thumb at once; the caller coalesces the writes), a dropdown or the checkbox its `change`. */
export function mountMixControls(parent: HTMLElement, ports: { onChange(patch: MixPatch): void; listBars(): string[] }, before: Node | null = null): MixControls {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = `${PHRASE_CONTROLS_CLASS} forge-mix-controls`;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Mix');

  const field = (label: string, ...controls: HTMLElement[]): void => {
    const wrap = doc.createElement('label');
    wrap.className = 'forge-phrase-field';
    const text = doc.createElement('span');
    text.textContent = label;
    wrap.appendChild(text);
    for (const c of controls) wrap.appendChild(c);
    el.appendChild(wrap);
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
  const weight = slider('forge-mix-weight', 'Weight of bar a: 1 is all bar a, 0 is all bar b');
  field('Weight', weight.input, weight.value);
  const threshold = slider('forge-mix-threshold', 'Threshold: how much weight a hit needs to appear');
  field('Threshold', threshold.input, threshold.value);
  const ghost = doc.createElement('input');
  ghost.type = 'checkbox'; ghost.className = 'forge-mix-ghost';
  ghost.setAttribute('aria-label', 'Ghost notes');
  field('Ghost notes', ghost);

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
  const fill = (sel: HTMLSelectElement, current: string): void => {
    const names = Array.from(new Set([...ports.listBars(), current].filter((n) => n !== ''))).sort();
    sel.textContent = '';
    for (const n of names) { const o = doc.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); }
    sel.value = current;
  };
  const paint = (p: MixPhrase): void => {
    weight.input.value = String(p.weight); weight.value.textContent = p.weight.toFixed(2);
    threshold.input.value = String(p.threshold); threshold.value.textContent = p.threshold.toFixed(2);
    ghost.checked = p.ghost;
    sentence.textContent = mixSentence(p);
  };
  const emit = (patch: MixPatch): void => {
    if (!live) return;
    const next = { ...live, ...patch };
    const changed = (Object.keys(patch) as Array<keyof MixPatch>).some((k) => live![k] !== next[k]);
    live = next;
    paint(next);
    if (changed) ports.onChange(patch);
  };
  const onSlider = (input: HTMLInputElement, field: 'weight' | 'threshold') => () => {
    const n = Number.parseFloat(input.value);
    if (!Number.isFinite(n) || !live) { if (live) paint(live); return; }
    emit({ [field]: clampMixUnit(n) });
  };
  weight.input.addEventListener('input', onSlider(weight.input, 'weight'));
  weight.input.addEventListener('change', onSlider(weight.input, 'weight'));
  threshold.input.addEventListener('input', onSlider(threshold.input, 'threshold'));
  threshold.input.addEventListener('change', onSlider(threshold.input, 'threshold'));
  ghost.addEventListener('change', () => emit({ ghost: ghost.checked }));
  a.addEventListener('change', () => emit({ a: a.value }));
  b.addEventListener('change', () => emit({ b: b.value }));
  // a bar made after the strip was shown appears in the lists the next time one is opened
  for (const sel of [a, b]) {
    const refresh = () => { if (live) fill(sel, sel === a ? live.a : live.b); };
    sel.addEventListener('focus', refresh);
    sel.addEventListener('mousedown', refresh);
  }

  return {
    el,
    set(params) {
      live = params;
      const off = params === null;
      a.disabled = b.disabled = weight.input.disabled = threshold.input.disabled = ghost.disabled = off;
      if (params) { fill(a, params.a); fill(b, params.b); paint(params); } else { sentence.textContent = ''; }
    },
    setStatus(text) { statusEl.textContent = text; },
    dispose() { el.remove(); },
  };
}

/** M6: present = the phrase's Score is inspectable (click a bar: its lineage; the phrase bracket; the source link). Absent = exactly the M5 tab. */
export interface PhraseInspectorPorts {
  /** Open a note by its lineage id (`phrases/phrase_001`, `bars/bar_005`): the plugin's own openers. */
  openNote(noteId: string): void;
}

export const PHRASE_BRACKET_CLASS = 'forge-phrase-bracket';
export const PHRASE_INSPECTOR_HINT = 'Click a bar to see where it came from. Arrow keys move between bars; Esc lets go.';

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
  /** M7: the names of the bars in `bars/` (fresh on every call), for the mix dropdowns. Absent = a mix's dropdowns list only its own two bars. */
  listBars?(): string[];
  /** M7: the phrase note's text when the caller already has it, so the FIRST surface drawn is the right one for its `kind` (no extend strip flashing before a mix). Absent = the extend surface until `load()`. */
  initial?: string;
}

export interface PhraseHandle {
  /** Read the phrase note and show it (the first draw is immediate). */
  load(): Promise<void>;
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

  const insp = ports.inspector;
  const { path: _path, plan, readNote: _read, writePhrase: _write, compute: _compute, inspector: _insp, listBars: _list, initial: _initial, ...areaPorts } = ports;   // what the Score area itself takes (the rest is the phrase's)

  let kind: PhraseParams['kind'] = (ports.initial !== undefined ? readPhraseKind(ports.initial) : null) ?? 'extend';
  let strip!: Strip;
  let bracket: HTMLElement | null = null;
  let area: ScoreArea | null = null;

  /** Build the surface of one kind: its strip, (extend only) the bracket and the inspector, and the live Score. Everything is appended in that order, so after `teardown()` a rebuild lands in the same places. */
  const build = (k: PhraseParams['kind']): void => {
    kind = k;
    if (k === 'mix') {
      const mix = mountMixControls(parent, { onChange: (patch) => { void commit(patch); }, listBars: () => ports.listBars?.() ?? [] });
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
      annotate: (note, payload) => annotateForPhrase(ports.path, note as NoteText, payload),
      lineage: phraseLineageOf,
      hint: PHRASE_INSPECTOR_HINT,
      enlargeTargets: null,                          // no hit rectangle: it would sit over the noteheads and take the Score's click-to-play; a click on any drawn part of a bar (a notehead, a staff line) selects the BAR
      previewOnHover: true,
      band: true,                                    // 2300: the class recolour alone was not visible in the real Obsidian; the band does not depend on the stylesheet or the theme
      kitNote: 'Kit view: not mapped for this phrase (use the multi-staff view to inspect).',
    } : undefined;
    area = attachScoreArea(parent, plan, {
      ...areaPorts,
      inspector: inspectorPorts,
      debounceMs: k === 'mix' ? MIX_SCORE_DEBOUNCE_MS : undefined,
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

  async function commit(patch: Patch | MixPatch): Promise<void> {
    const base = want ?? current;
    if (!base || disposed) return;
    want = { ...base, ...patch } as PhraseParams;
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
      const made = current === null ? [] : current.kind === 'mix' ? [phraseSourcePath(current.a), phraseSourcePath(current.b)] : [phraseSourcePath(current.source)];
      if (made.includes(path)) area?.update(last);                       // a bar this phrase is made of changed: the Score is read fresh by the next render
    },
    dispose() {
      disposed = true;
      teardown();
    },
  };
}
