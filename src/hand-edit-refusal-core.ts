// 2026-11-03-1155-8 (A and B, CCQA smoke 11): a control refused because a facet was edited by hand says "press Update from X first or revert it". Two things that sentence needs to stay true:
//   * A - the bar with those buttons is on screen when the sentence is: the writer that refuses calls `handEditRefused(path)`, and the description controller LOOKS at the note at once (it never writes: a control must not
//     publish a person's half-typed text, and applying the edit first would). The one subscriber is wired in score-first.ts, so in any other vault the call reaches nobody (P3).
//   * B - the red line goes when the refusal stops being true (`handEditStatusSettled`): the bar's own apply, Revert, or any write that leaves the note without the hand edit.
// Pure: no `obsidian`, no DOM.
import { customRefusal, handEditRefusal, handEditRefusalOf, recipeEditRefusal, pythonEditRefusal } from './phrase-notes-core.ts';

type Listener = (path: string) => void;
const listeners = new Set<Listener>();

/** Hear every control refusal for a hand edit; returns the way to stop hearing. */
export function onHandEditRefusal(fn: Listener): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** A control (the writer of `path`) refused with `message`: if it is a hand-edit sentence, tell the listeners the note at `path` should be looked at now. Returns whether it was one. */
export function handEditRefused(path: string, message: string): boolean {
  if (!isHandEditRefusal(message)) return false;
  for (const fn of [...listeners]) fn(path);
  return true;
}

/** Is this message one of the sentences `handEditRefusalOf` answers with (either lead)? */
export const isHandEditRefusal = (message: string): boolean => [true, false].some((lead) => [handEditRefusal, recipeEditRefusal, pythonEditRefusal, customRefusal].some((f) => f(lead) === message));

/** The sentence `status` is a hand-edit refusal and the note `text` would no longer answer with it (nothing to protect any more, or a different facet is the one edited): it is stale and goes. Any other status is left alone. */
export const handEditStatusSettled = (status: string, text: string): boolean => isHandEditRefusal(status) && ![true, false].some((lead) => handEditRefusalOf(text, lead) === status);
