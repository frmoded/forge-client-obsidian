// score_first M5 (drain 2026-10-22-1850) — the phrase surface, plain DOM (no obsidian import, so a happy-dom test mounts the very code the tab runs): a small control strip above the live Score.
//
//   <div class="forge-phrase-controls" role="group" aria-label="Phrase">
//     Source <span class="forge-phrase-source">bar_005</span>
//     Bars <input class="forge-phrase-bars">   Style <select class="forge-phrase-style">   Tempo change (%) <input class="forge-phrase-pct">
//     <span class="forge-phrase-status" role="status">…</span>                                  a write the note refused ('' = nothing to say)
//   </div>
//   <div class="forge-rhythm-edit-score">…the live Score, the same panel the Beat Box tab has…</div>
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
  PHRASE_BARS_MAX, PHRASE_BARS_MIN, PHRASE_PCT_MAX, PHRASE_PCT_MIN, PHRASE_STYLES, PHRASE_STYLE_NOTES, clampPhraseBars, clampPhrasePct, phraseSourcePath, producePhraseNote, readPhraseNote,
  type PhraseParams, type PhraseScoreDeps,
} from './phrase-core.ts';

export const PHRASE_CONTROLS_CLASS = 'forge-phrase-controls';

type Patch = Partial<Pick<PhraseParams, 'bars' | 'style' | 'tempo_change_pct'>>;

export interface PhraseControls {
  readonly el: HTMLElement;
  /** Show these parameters (enabled), or `null` = the phrase is not valid: the fields are disabled and say nothing. Never fires `onChange`. */
  set(params: PhraseParams | null): void;
  /** The line next to the controls ('' clears it). */
  setStatus(text: string): void;
  dispose(): void;
}

export function mountPhraseControls(parent: HTMLElement, ports: { onChange(patch: Patch): void; openSource?(source: string): void }): PhraseControls {
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
  parent.appendChild(el);

  let shown: PhraseParams | null = null;
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
  style.addEventListener('change', () => { showStyleNote(style.value); ports.onChange({ style: style.value as PhraseParams['style'] }); });

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
  const multiKey = typeof payload.multi_staff_content === 'string' ? 'multi_staff_content' : typeof payload.content === 'string' ? 'content' : null;
  if (multiKey === null) return none('the Score payload carries no MusicXML');
  let r;
  try {
    r = annotatePhraseXml(payload[multiKey] as string, typeof payload.kit_content === 'string' ? payload.kit_content : null, parsed.value.bars, PHRASE_BAR_SCOPE);
  } catch (e) {
    console.error('annotateForPhrase failed', e);
    return none(`the bars could not be tied to the phrase (${(e as Error)?.message ?? e})`);
  }
  if (r.ok === false) return none(r.problems[0]);
  const next: Record<string, unknown> = { ...payload, [multiKey]: r.multiXml };
  if (r.kitXml !== null) next.kit_content = r.kitXml;
  return { payload: next, map: phraseProvenance(phraseNoteId(path), parsed.value, r.bars), problems: [], kitProblems: r.kitProblems };
}

/** The bracket: hovering or focusing it lights every bar the phrase made; leaving clears; a click (or Enter / Space) opens the phrase note. */
function wireBracket(el: HTMLElement, current: () => PhraseParams | null, area: () => ScoreArea | null, open: () => void): void {
  const ids = () => { const p = current(); return p ? Array.from({ length: p.bars }, (_, i) => phraseBarId(PHRASE_BAR_SCOPE, i + 1)) : []; };
  el.addEventListener('mouseenter', () => area()?.lightAll(ids()));
  el.addEventListener('mouseleave', () => area()?.lightAll([]));
  el.addEventListener('focus', () => area()?.lightAll(ids()));
  el.addEventListener('blur', () => area()?.lightAll([]));
  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') { e.preventDefault(); open(); } });
}

export function mountPhrase(parent: HTMLElement, ports: PhraseMountPorts): PhraseHandle {
  let current: PhraseParams | null = null;
  let last: NoteText = { unreadable: 'not read yet' };
  let seq = 0;
  let disposed = false;

  const insp = ports.inspector;
  const controls = mountPhraseControls(parent, { onChange: (patch) => { void commit(patch); }, openSource: insp ? (source) => insp.openNote(phraseSourceNote(source)) : undefined });
  // The bracket over every bar made by this phrase note (hover lights them all, a click opens the phrase). Built before the Score so it sits between the strip and the engraving.
  let bracket: HTMLElement | null = null;
  if (insp) {
    const doc = parent.ownerDocument;
    bracket = doc.createElement('div');
    bracket.className = PHRASE_BRACKET_CLASS;
    bracket.setAttribute('role', 'button');
    bracket.setAttribute('tabindex', '0');
    bracket.style.display = 'none';
    parent.appendChild(bracket);
  }
  const { path: _path, plan, readNote: _read, writePhrase: _write, compute: _compute, inspector: _insp, ...areaPorts } = ports;   // what the Score area itself takes (the rest is the phrase's)
  const inspectorPorts: ScoreInspectorPorts | undefined = insp ? {
    noteId: phraseNoteId(ports.path),
    openNote: insp.openNote,
    annotate: (note, payload) => annotateForPhrase(ports.path, note as NoteText, payload),
    lineage: phraseLineageOf,
    hint: PHRASE_INSPECTOR_HINT,
    enlargeTargets: null,                          // no hit rectangle: it would sit over the noteheads and take the Score's click-to-play; a click on any drawn part of a bar (a notehead, a staff line) selects the BAR
    previewOnHover: true,
    kitNote: 'Kit view: not mapped for this phrase (use the multi-staff view to inspect).',
  } : undefined;
  const area: ScoreArea | null = attachScoreArea(parent, plan, {
    ...areaPorts,
    inspector: inspectorPorts,
    produce: (note, title) => producePhraseNote({ readNote: ports.readNote, compute: ports.compute }, note as NoteText, title),
  });
  if (bracket) wireBracket(bracket, () => current, () => area, () => insp!.openNote(phraseNoteId(ports.path)));

  const readText = async (): Promise<NoteText> => {
    try { return await ports.readNote(ports.path); } catch (e) { return { unreadable: (e as Error)?.message ?? String(e) }; }
  };
  const apply = (text: NoteText): void => {
    last = text;
    const parsed = typeof text === 'string' ? readPhraseNote(text) : null;
    current = parsed && parsed.ok ? parsed.value : null;
    controls.set(current);
    if (bracket) {
      bracket.style.display = current ? '' : 'none';
      if (current) {
        const name = phraseNoteId(ports.path).split('/').pop() ?? '';
        bracket.textContent = `${name} · ${current.bars} bar${current.bars === 1 ? '' : 's'}`;
        bracket.setAttribute('aria-label', `Open ${name} (hover to light its ${current.bars} bar${current.bars === 1 ? '' : 's'})`);
      }
    }
  };

  async function commit(patch: Patch): Promise<void> {
    if (!current || disposed) return;
    const next: PhraseParams = { ...current, ...patch };
    const result = await ports.writePhrase(next);
    if (disposed) return;
    if (result.ok === false) {
      controls.set(current);                                            // refused: the fields go back to what the note says
      controls.setStatus(result.message);
      return;
    }
    current = next;                                                     // written: the vault's modify event for this write brings the Score
    controls.setStatus('');
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
      if (current && path === phraseSourcePath(current.source)) area?.update(last);   // the bar this phrase is made of changed: the Score is read fresh by the next render
    },
    dispose() {
      disposed = true;
      area?.dispose();
      bracket?.remove();
      controls.dispose();
    },
  };
}
