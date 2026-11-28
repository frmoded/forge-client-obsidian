// 2026-11-27-1050 (prompt stack stage 2) - the preview line of a phrase's card: `bars 1 2 3 4 5 become 1 2 9 4 5`, made WITHOUT the engine from the bar count of the Score on screen and the structure steps the push adds, run by the plugin's own step
// code (`traceSteps`, which runs `applyStructure` for Keep, Delete, Copy and Move). A bar a step MAKES has no old number and is `new`. Pure but for the one DOM count. NEVER GUESSED: null (no line) whenever the count, or which old bar is which
// new one, is not known.
import { traceSteps } from './phrase-steps-lineage-core.ts';
import { isStructureOp } from './bar-structure-core.ts';
import type { PhraseParams, StructureOp } from './phrase-core.ts';

/** 2026-11-19-0997: this core is the LIST MODEL's (reached only through src/list-model-selected.ts); list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_BAR_ORDER_CORE = 'forge-list-model-core:bar-order-core';

/** A longer line is not shown at all (the dialog would cut it, and a cut order reads as another order). */
export const BAR_ORDER_MAX = 400;

/** The bars of the Score on screen: not one still being drawn, and nothing from a Score that is behind the note (the stale class). Null = not known. */
export function drawnBarCount(pane: ParentNode | null | undefined): number | null {
  const host = pane?.querySelector('.forge-rhythm-score-host:not(.forge-rhythm-score-host-pending)');
  if (host === null || host === undefined || host.classList.contains('forge-rhythm-score-host-stale')) return null;
  return host.querySelectorAll('g.measure').length || null;
}

const stepsOf = (p: PhraseParams): StructureOp[] => (p.kind === 'transform' ? p.ops.filter(isStructureOp) : (p.ops ?? []));
/** The head: everything of the params but the steps, the replaced bars and the tempo (none of which says which bars the head makes). */
const headOf = (p: PhraseParams): string => JSON.stringify({ ...p, ops: 0, overrides: 0, tempo_change_pct: 0 });

/**
 * `count` the bars of the Score on screen, `before` what the note's list says now, `after` what it would say. The line is made only when the head is the same, the old steps are all still there in front, the push ADDS steps that change which bars there
 * are, and no bar is replaced by a note (a replacement stays at its position, so the numbers would not follow the bars).
 */
export function barOrderLine(count: number | null, before: PhraseParams | null, after: PhraseParams | null): string | null {
  if (count === null || before === null || after === null || headOf(before) !== headOf(after)) return null;
  if (Object.keys((after as { overrides?: object }).overrides ?? {}).length > 0) return null;
  const old = stepsOf(before), all = stepsOf(after), added = all.slice(old.length);
  if (added.length === 0 || JSON.stringify(all.slice(0, old.length)) !== JSON.stringify(old)) return null;
  const head = before.kind === 'extend' || before.kind === 'morph' ? before.bars : before.kind === 'mix' ? 1 : null;          // (a Take's source is not counted here: the Score's own count stands)
  try {
    if (head !== null && traceSteps(head, old).length !== count) return null;          // the Score is not the note's: it is behind
    for (let k = 0; k < added.length; k++) { const at = (added[k] as { after?: number | 'end' }).after; if (typeof at === 'number' && at > traceSteps(count, added.slice(0, k)).length) return null; }          // (a place past the last bar: the engine refuses it, the trace would not)
    const order = traceSteps(count, added).map((o) => o.head ?? 'new');
    const line = `bars ${Array.from({ length: count }, (_, i) => i + 1).join(' ')} become ${order.join(' ')}`;
    return line.length > BAR_ORDER_MAX ? null : line;
  } catch { return null; }          // a step the bars on screen do not have
}
