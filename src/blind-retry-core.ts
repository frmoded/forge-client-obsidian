// src/blind-retry-core.ts
//
// Drain 2026-08-25-1020 §2 — one blind retry of /generate before a
// wobble is shown to a human.
//
// The Input-declaration belt (drain 2310) is doing its job: a Recipe
// using a free name it never declared is rejected and the prior Recipe
// is preserved. But the cohort-facing result is a rejection notice
// telling someone to click again — for a model wobble that a second
// identical call usually gets right. The guidance's own first fix
// option is "try again"; this automates it.
//
// BLIND, deliberately. Drain 2310 deferred an informed retry because
// feeding the VIOLATION back to the model needs a service channel that
// does not exist (`generation_notes` is dropped). That blocker is
// still real. A blind retry needs nothing new: same payload, same
// endpoint, one more roll.
//
// ONE retry, never a loop. Two attempts cost one extra LLM call on the
// wobble path and nothing at all on the success path. An unbounded
// retry would turn a systematically-impossible Description into a
// billing incident.

/** Verdicts the auto-forge path reaches after /generate returns. */
export type GenerateVerdict =
  /** Recipe accepted and written. */
  | 'ok'
  /** Used a free name it never declared as an Input (drain 2310's belt). */
  | 'free-variable-fail'
  /** Referenced a [[wikilink]] that is not in the callable inventory. */
  | 'closure-fail'
  /** Prose, missing-chip explanation — no Let/Return statement at all. */
  | 'no-statement'
  /** The call itself failed (no token, network, host down). */
  | 'call-failed';

/** Should we silently roll again rather than surface this to a human?
 *
 *  `attempt` is 1-based: 1 is the first call.
 *
 *  Retried: the two verdicts that are known to wobble — a Recipe that
 *  is well-formed but missed a declaration, and one that reached for a
 *  chip outside the inventory. Both are cases where the model produced
 *  a REAL Recipe and got a detail wrong, which is what a second roll
 *  fixes.
 *
 *  NOT retried:
 *  - `no-statement`. The model returned prose or a missing-chip
 *    explanation, which usually means the Description cannot be
 *    satisfied with the chips on hand. Rolling again spends a call to
 *    print the same explanation.
 *  - `call-failed`. Nothing was generated; a retry here would paper
 *    over a missing token or a service outage, and the existing error
 *    already says which.
 *  - anything on attempt 2. One retry, full stop.
 */
export function shouldBlindRetry(
  attempt: number,
  verdict: GenerateVerdict,
): boolean {
  if (attempt >= 2) return false;
  return verdict === 'free-variable-fail' || verdict === 'closure-fail';
}

/** The user-facing attempt marker, rendered at the FRONT of a notice.
 *
 *  Drain 2026-08-25-1800 §2 — moved from a trailing suffix to a
 *  leading prefix, and the reason is a real failure of the old shape.
 *
 *  As a suffix it landed at the END of a multi-sentence rejection
 *  message. When the driver pasted that notice into a report, the
 *  paste was elided at the first sentence — exactly where a human
 *  naturally trims — and the marker went with it. Drain 1710 then read
 *  the absence of the marker as proof the retry never fired, which the
 *  bytes did not support.
 *
 *  THE LESSON, worth more than the string: a diagnostic that only
 *  matters when a human relays it must survive being relayed. Put it
 *  where a trim cannot reach.
 *
 *  Empty on the first attempt — an unremarkable single roll needs no
 *  marker. */
export function attemptPrefix(attempt: number): string {
  return attempt >= 2 ? '(attempt 2 of 2) ' : '';
}
