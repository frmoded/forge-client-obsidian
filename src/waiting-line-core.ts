// 2026-11-21-1015 PART C - WAITING LINES and "Translate line N" (music-composer code, behind the list-model seam; lean never carries it). A sentence that neither the grammar nor the service can turn into canonical lines is kept in the note's list as
// `Waiting: <the driver's words>`: plain text, no red; the replay stops before it exactly as before any unreadable line (so later lines wait until it is resolved); the dialog says why. `Translate line N.` (typed or from the "+" menu) asks the service for
// that line alone; the answer is a plan; on confirmation the waiting line is REPLACED by the canonical lines (the first carries the provenance marker). No automatic second pass, no call to the service on save.
import { WAITING_LINE, saidText, splitSaid } from './sentence-list-core.ts';

/** 2026-11-19-0997: this core is the LIST MODEL's (reached only through src/list-model-selected.ts); list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_WAITING_LINE_CORE = 'forge-list-model-core:waiting-line-core';

export const isWaitingLine = (line: string): boolean => WAITING_LINE.test(String(line ?? ''));

/** The waiting line for the driver's words (one plain line), or null when nothing is worth keeping. */
export function waitingLine(words: string): string | null { const t = saidText(words); return t === '' ? null : `Waiting: ${t}`; }

/** The words a waiting line holds (a marker beside them is not part of them), or null when the line is not a waiting line or has none. */
export function waitingWords(line: string): string | null {
  if (!isWaitingLine(line)) return null;
  const t = splitSaid(String(line)).line.replace(WAITING_LINE, '').trim();
  return t === '' ? null : t;
}

/** `Translate line 3.` -> { n: 3 }; anything else (more than one sentence, no number, line 0) is not a translate request. */
export function translateRequest(text: string): { n: number } | null {
  const m = /^\s*translate\s+line\s+(\d+)\s*\.?\s*$/i.exec(String(text ?? ''));
  return m === null || Number(m[1]) < 1 ? null : { n: Number(m[1]) };
}

/** What the dialog says when a sentence was kept as line `n`: where, why, how to translate it, how to take it back. */
export const keptMessage = (n: number, reason: string): string => `Kept as line ${n}, waiting for a translation.${reason.trim() === '' ? '' : ` ${reason.trim()}`} Say "Translate line ${n}." to ask the service again; with the box empty, Cmd/Ctrl+Z takes it back.`;
