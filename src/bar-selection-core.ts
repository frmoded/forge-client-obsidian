// 2026-11-16-1000 - SELECT BARS ON THE SCORE, then act on them: the pure part (no obsidian, no DOM). The selection is a set of bar numbers (1-based, the bars of the Score on screen) and an anchor; the gestures are the ones a person knows
// (shift-click extends a range from the anchor, ctrl/cmd-click toggles one bar, a drag across bars is a range, Esc clears); a plain click is NOT a selection gesture: it stays the pin. What the menu does with a selection is WRITE A SENTENCE:
//
//   New phrase from these bars -> a new phrase note   "Take [[phrase_006]]. Keep bars 3 to 5."        (a link to the source, never a frozen copy)
//   Copy / Delete / Move left / Move right -> the step is APPENDED as the next line of a transform phrase's list    "Delete bars 3 to 5."   (2026-11-19-0980: it was a preview in the prompt box; a phrase's Description is a list now, the line is added at once, in one write, and Cmd/Ctrl+Z takes it back)
//
// A phrase that is not a transform (an extend, a morph, a mix), or a transform with edited bars (forks are numbered by the bars it has NOW), cannot take the step into its own Description without changing what it is: the step is then the
// first sentence of a NEW transform phrase of it ("Take [[phrase_006]]. Delete bars 3 to 5."), made like "New phrase from these bars". The words of the steps are bar-structure-core.ts (one table).
import { isStructureOp, runsOfBars, runsWords } from './bar-structure-core.ts';
import { describe } from './phrase-describe-core.ts';
import { validatePhrase, type PhraseParams, type StructureOp, type TransformOp, type TransformPhrase } from './phrase-core.ts';

/** `anchor`: where a Shift-click extends from; `last`: the bar the last gesture touched (the menu is placed by the range it is in: the person is looking there). */
export interface BarSelection { readonly bars: readonly number[]; readonly anchor: number | null; readonly last: number | null }
export const NO_SELECTION: BarSelection = { bars: [], anchor: null, last: null };

const norm = (bars: Iterable<number>): number[] => [...new Set([...bars].filter((n) => Number.isInteger(n) && n >= 1))].sort((a, b) => a - b);
const range = (a: number, b: number): number[] => { const out: number[] = []; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i); return out; };

/** A drag from bar `a` to bar `b`: those bars, anchored where the press began. */
export const selectRange = (a: number, b: number): BarSelection => ({ bars: norm(range(a, b)), anchor: a, last: b });
/** Shift-click on bar `n`: nothing selected yet = just that bar; else the range from the anchor to `n` (the anchor stays). */
export function extendSelection(s: BarSelection, n: number): BarSelection {
  if (s.anchor === null || s.bars.length === 0) return { bars: [n], anchor: n, last: n };
  return { bars: norm(range(s.anchor, n)), anchor: s.anchor, last: n };
}
/** Ctrl/Cmd-click on bar `n`: in -> out, out -> in. The bar clicked becomes the anchor of the next shift-click. */
export function toggleSelection(s: BarSelection, n: number): BarSelection {
  const has = s.bars.includes(n);
  const bars = has ? s.bars.filter((b) => b !== n) : norm([...s.bars, n]);
  if (bars.length === 0) return NO_SELECTION;
  return { bars, anchor: has ? (s.anchor !== null && bars.includes(s.anchor) ? s.anchor : bars[bars.length - 1]) : n, last: has ? bars[bars.length - 1] : n };       // a bar toggled OUT leaves the anchor where it was (if that bar is still in)
}
/** The notebook (or any other producer) chose these bars. */
export const selectionOf = (bars: Iterable<number>): BarSelection => { const b = norm(bars); return { bars: b, anchor: b.length > 0 ? b[0] : null, last: b.length > 0 ? b[b.length - 1] : null }; };
/** After a redraw: a bar the Score no longer has is not selected. */
export function limitTo(s: BarSelection, count: number): BarSelection {
  const bars = s.bars.filter((b) => b <= count);
  return bars.length === s.bars.length ? s : { bars, anchor: s.anchor !== null && s.anchor <= count && bars.length > 0 ? s.anchor : bars.length > 0 ? bars[0] : null, last: s.last !== null && s.last <= count && bars.length > 0 ? s.last : bars.length > 0 ? bars[bars.length - 1] : null };
}
export const sameSelection = (a: BarSelection, b: BarSelection): boolean => a.bars.length === b.bars.length && a.bars.every((n, i) => n === b.bars[i]);

/** The run of selected bars the menu goes beside: the one with the bar last touched, else the last run. */
export function menuRun(s: BarSelection): [number, number] | null {
  const runs = runsOfBars(s.bars);
  if (runs.length === 0) return null;
  return runs.find(([a, b]) => s.last !== null && s.last >= a && s.last <= b) ?? runs[runs.length - 1];
}

/** "1 bar selected" / "3 bars selected: bars 3 to 5" / "4 bars selected: bars 3 to 5 and bar 8". */
export function selectionText(s: BarSelection): string {
  const n = s.bars.length;
  if (n === 0) return 'no bars selected';
  const runs = runsOfBars(s.bars);
  if (n === 1) return `bar ${s.bars[0]} selected`;
  return `${n} bars selected: ${runsWords(runs)}`;
}

// ---- the menu -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export type SelectionAction = 'new-phrase' | 'copy' | 'delete' | 'move-left' | 'move-right';
export const SELECTION_MENU: ReadonlyArray<{ id: SelectionAction; label: string; title: string }> = [
  { id: 'new-phrase', label: 'New phrase from these bars', title: 'Make a new phrase that keeps only the selected bars (it links to this phrase)' },
  { id: 'copy', label: 'Copy', title: 'Play each selected range again right after itself' },
  { id: 'delete', label: 'Delete', title: 'Take the selected bars out' },
  { id: 'move-left', label: 'Move left', title: 'Move each selected range one bar to the left' },
  { id: 'move-right', label: 'Move right', title: 'Move each selected range one bar to the right' },
];

/** The step an action writes for a selection (runs of the selected bars, ascending and apart). */
export function actionStep(action: SelectionAction, s: BarSelection): StructureOp {
  const runs = runsOfBars(s.bars);
  if (action === 'new-phrase') return { op: 'keep', runs };
  if (action === 'copy') return { op: 'copy', runs };
  if (action === 'delete') return { op: 'delete', runs };
  return { op: 'move', runs, by: action === 'move-left' ? -1 : 1 };
}

/** Why an action cannot be done to this selection of a Score of `total` bars (null = it can): nothing selected, a bar the Score has not, deleting every bar, moving off either end. Greys the menu entry. */
export function disabledReason(action: SelectionAction, s: BarSelection, total: number): string | null {
  if (s.bars.length === 0) return 'Select some bars first.';
  if (total > 0 && s.bars[s.bars.length - 1] > total) return `Bar ${s.bars[s.bars.length - 1]} is not on the Score (it has ${total} bar${total === 1 ? '' : 's'}).`;
  if (action === 'delete' && total > 0 && s.bars.length >= total) return 'That would leave no bars.';
  if (action === 'move-left' && s.bars[0] === 1) return 'Bar 1 cannot move left.';
  if (action === 'move-right' && total > 0 && s.bars[s.bars.length - 1] === total) return `Bar ${total} is the last bar: it cannot move right.`;
  return null;
}

export type ActionPlan =
  /** The phrase is a transform with no edited bars and no Thin out or Double up yet: the step is APPENDED to its list (`sentence`; `text` is the whole Description the list says now, for a reader that wants it). 2026-11-19-0980: a step is never re-sorted before a density step: a phrase that has one makes a new phrase instead. */
  | { kind: 'preview'; text: string; sentence: string; step: StructureOp }
  /** A new transform phrase of this one, made now: `sentence` is its Description. */
  | { kind: 'new-phrase'; params: TransformPhrase; sentence: string; step: StructureOp; because: string }
  | { kind: 'refused'; message: string };

/**
 * What to do for `action` on `selection` in the phrase `current` (its params, with `self` its note's basename). `total` is the number of bars the Score on screen has.
 *  - "New phrase from these bars" is always a new phrase.
 *  - The others are a PREVIEW in this phrase's own prompt box when it is a transform without edited bars, else a new transform phrase of it.
 */
export function planAction(action: SelectionAction, selection: BarSelection, current: PhraseParams | null, self: string, total: number): ActionPlan {
  const why = disabledReason(action, selection, total);
  if (why !== null) return { kind: 'refused', message: why };
  const step = actionStep(action, selection);
  const ofThis = (ops: TransformOp[]): TransformPhrase => ({ kind: 'transform', source: `phrases/${self}`, ops });
  const forked = current !== null && current.kind === 'transform' && current.overrides !== undefined && Object.keys(current.overrides).length > 0;
  const dense = current !== null && current.kind === 'transform' && current.ops.some((o) => !isStructureOp(o));            // a structure step comes before every Thin out and Double up: the list is never re-sorted
  if (action !== 'new-phrase' && current !== null && current.kind === 'transform' && !forked && !dense) {
    const ops: TransformOp[] = [...current.ops, step];
    const next: TransformPhrase = { ...current, ops };
    // the new step comes after the steps there already are, so its bar numbers are those of the Score on screen
    const valid = validatePhrase(next);
    if (valid.ok === false) return { kind: 'refused', message: valid.message };
    return { kind: 'preview', text: describe(valid.value), sentence: describe(ofThis([step])).replace(/^Take \[\[[^\]]+\]\]\. /, ''), step };
  }
  const params = ofThis([step]);
  const valid = validatePhrase(params);
  if (valid.ok === false) return { kind: 'refused', message: valid.message };
  const because = action === 'new-phrase' ? 'new phrase' : current !== null && current.kind === 'transform' ? (forked ? 'this phrase has bars you edited, so its numbers are fixed: the change is made as a new phrase of it' : 'this phrase has a Thin out or a Double up, and a step that changes which bars there are comes before them: the change is made as a new phrase of it') : 'this phrase is not a transform: the change is made as a new phrase of it';
  return { kind: 'new-phrase', params, sentence: describe(valid.value), step, because };
}
