// 2026-11-20-1002 (A TYPED UNDO AND REDO), the pure reader (no obsidian, no DOM). `Undo`, `Undo.`, `Undo that`, `Undo 3`, `Undo three` and `Redo` typed in the composer take back (or put back) the last applies of the note: the SAME stack and words as
// Cmd/Ctrl+Z in the empty composer. They are read LOCALLY by the same reader as `Duplicate` (duplicate-sentence-core.ts `readActionText` calls `readStepText` first): never a line of the list, never the sentence service's, never the grammar's.
// Any other text that opens a sentence with the word is refused in plain words (neither the grammar nor the service knows it).
/** 2026-11-19-0997: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_TYPED_STEP_CORE = 'forge-list-model-core:typed-step-core';

/** The undo stack keeps 100 entries (sentence-list-core UNDO_CAP): more than that cannot be asked for. */
export const MAX_STEPS = 100;
export type StepRead =
  | { kind: 'none' }
  | { kind: 'undo' | 'redo'; count: number }
  /** `step: true` marks a refusal of THIS reader (the composers of an arrangement, a composition and a bar refuse it too; a refused Duplicate they ignore, as ever). */
  | { kind: 'refused'; message: string; step: true };

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;
/** The forms the refusal names. */
export const stepForms = (word: 'Undo' | 'Redo'): string => `${word}, ${word} that, ${word} 3 or ${word} three`;
const ALONE = 'Undo and Redo have to be on their own: empty the box, then write Undo (or Redo) by itself.';
const refuse = (message: string): StepRead => ({ kind: 'refused', message, step: true });

/** What a typed text says: "none" = not a step sentence (the grammar's, as ever); a step with how many; or a refusal in words. */
export function readStepText(text: string): StepRead {
  const t = String(text ?? '').trim();
  const sentences = t.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x !== '');
  if (!sentences.some((x) => /^(?:undo|redo)(?![A-Za-z0-9_])/i.test(x))) return { kind: 'none' };
  if (sentences.length > 1) return refuse(ALONE);
  const m = /^(undo|redo)\s*(.*?)\s*[.!?]*$/is.exec(t);
  if (m === null) return refuse(ALONE);
  const kind = m[1].toLowerCase() as 'undo' | 'redo', word = kind === 'undo' ? 'Undo' : 'Redo', rest = m[2].toLowerCase();
  if (rest === '' || rest === 'that' || rest === 'it' || /^(?:the )?last sentence$/.test(rest)) return { kind, count: 1 };
  const n = /^\d+$/.test(rest) ? parseInt(rest, 10) : NUMBER_WORDS.indexOf(rest as (typeof NUMBER_WORDS)[number]) + 1;
  if (!(n >= 1)) return refuse(`${word} takes only a number: write ${stepForms(word)}.`);
  if (n > MAX_STEPS) return refuse(`${word} takes up to ${MAX_STEPS} at a time.`);
  return { kind, count: n };
}

// ---- running it (the controller's part, with its ports: no obsidian, no DOM) -----------------------------------------------------------------------------------------------------------------------------------
/** What the controller lends (every member takes the note's `path` first, so the controller builds ONE object for all its notes): `you` says the typed text in the dialog, `canStep` and `step` are the note's own undo stack (`step` is what Cmd/Ctrl+Z does, with its own words),
 *  `say` a line in the dialog, `note` a line under the card, `pb` a console line. */
export interface StepPorts {
  you(path: string, text: string): void;
  canStep(path: string, which: 'undo' | 'redo'): boolean;
  step(path: string, which: 'undo' | 'redo'): Promise<{ ok: boolean; message: string }>;
  say(path: string, kind: 'notice' | 'refused', message: string): void;
  note(path: string, message: string | null): void;
  pb(line: string): void;
}
const refused = (path: string, message: string, p: StepPorts): { ok: false; message: string } => { p.pb(`step refused: ${message}`); p.say(path, 'refused', message); p.note(path, `Refused: ${message}`); return { ok: false, message: `Refused: ${message}` }; };

/** The first Enter on a text: null = not a step sentence (the caller goes on as ever); a refusal in words (never sent to the grammar or the service); or the proposal, applied at once whatever the setting says (a typed Undo IS the take-back, and Redo undoes it). */
export function previewTyped(path: string, text: string, p: StepPorts): { ok: false; message: string } | { ok: true; proposal: { description: string; via: 'grammar'; now: true } } | null {
  const st = readStepText(text);
  return st.kind === 'none' ? null : st.kind === 'refused' ? refused(path, st.message, p) : { ok: true, proposal: { description: st.kind === 'undo' ? 'Undo' : 'Redo', via: 'grammar', now: true } };
}
/** The apply of such a text (`said`: the typed text is in the dialog already): Undo (or Redo) up to `count` applies, one after the other, with the stack's own words for each; several are summed up in one line; none is said in words. A step that fails ends it (its words were said).
 *  null = not a step sentence (synchronously: no tick is spent on an ordinary sentence). */
export function applyTyped(path: string, text: string, said: boolean, p: StepPorts): Promise<{ ok: boolean; disk?: string; message?: string }> | null {
  const st = readStepText(text);
  return st.kind === 'none' ? null : runTyped(path, text, said, st, p);
}
async function runTyped(path: string, text: string, said: boolean, st: Exclude<StepRead, { kind: 'none' }>, p: StepPorts): Promise<{ ok: boolean; disk?: string; message?: string }> {
  if (!said) p.you(path, text);
  if (st.kind === 'refused') return refused(path, st.message, p);
  const which = st.kind; let done = 0;
  while (done < st.count && p.canStep(path, which)) {
    const r = await p.step(path, which);
    if (!r.ok) { p.note(path, r.message); return { ok: false, message: r.message }; }
    done++;
  }
  p.pb(`typed ${which}: ${done} of ${st.count}`);
  if (done === 0) { const m = `There is nothing to ${which}.`; p.say(path, 'notice', m); p.note(path, m); return { ok: true, disk: '' }; }
  if (st.count > 1) p.say(path, 'notice', `${which === 'undo' ? 'Undid' : 'Redid'} ${done} sentence${done === 1 ? '' : 's'}${done < st.count ? `: there was nothing more to ${which}` : ''}.`);
  return { ok: true, disk: '' };
}
