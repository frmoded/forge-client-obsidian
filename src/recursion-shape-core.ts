// Drain 2026-08-26-1020 — recursion is legal; mirroring is not.
//
// THE ARC. 2360 removed a note from its own callable inventory so a
// generated Recipe could not call itself. That stopped the mirror (self
// looked like a different perfect function) and, three drains later,
// produced the factorial/show_factorial mutual cycle when the model
// reached for the nearest remaining callable. 373 belted the cycle.
// This drain makes the honest case WORK: the target goes back into its
// own inventory, LABELED as itself, and the mirror is held out by SHAPE
// rather than by absence.
//
// THE SHAPE, mechanically (prompt §2):
//   (a) a base case exists — an `If`-guarded `Return`, distinct from the
//       Recipe's final unconditional one.
//   (b) the self-call makes progress — at least one argument is a
//       DERIVED value, not a bare unchanged `Input` name and not absent.
//
// A Recipe satisfying both recurses toward a base case. A Recipe calling
// itself with `with n=n` and no guard is the 2360 mirror, and it is the
// thing that hangs.
//
// WHY TEXT ONLY. Both checks read the generated text plus the target id
// — no other note's Recipe, no registry. That is what lets the SERVICE
// own the corrective half (it has `req.snippet_id` and its own output)
// while the client mirrors it as the final belt, the same split drain
// 1900 established for the free-identifier belt.
//
// CONSERVATIVE IN THE DIRECTION THAT MATTERS, like every belt in this
// family: a Recipe that does not call itself at all is never judged
// here, and an argument the scanner cannot classify counts as progress
// rather than as a mirror. A false rejection blocks authoring; a false
// pass leaves the pre-existing recursion error.

import { extractWikilinkTargets } from './write-generated-recipe-core.ts';
import { matchesTarget } from './one-hop-cycle-core.ts';

export type RecursionShapeFailure = 'no-base-case' | 'no-progress' | 'both';

export interface RecursionShapeVerdict {
  /** Does the Recipe call the note it is being generated for? */
  callsSelf: boolean;
  /** Is there an `If`-guarded `Return` distinct from the final one? */
  hasBaseCase: boolean;
  /** Does at least one self-call pass a derived argument? */
  progresses: boolean;
  /** Accept iff it does not self-call, or self-calls with both halves. */
  ok: boolean;
  failure?: RecursionShapeFailure;
}

/** `Input NAME: …` — the names a bare self-call argument could echo. */
function declaredInputs(recipeBody: string): Set<string> {
  const out = new Set<string>();
  for (const raw of recipeBody.split('\n')) {
    const m = raw.trim().match(/^Input\s+([A-Za-z_]\w*)\s*:/);
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * Is there a conditional `Return` — a base case?
 *
 * E-- guards with `If <cond>:` and indents the guarded body. A `Return`
 * that is indented under an `If` (or that trails `If … :` on the same
 * line) terminates a branch without recursing, which is what a base
 * case IS. The Recipe's final unconditional `Return` does not count —
 * every Recipe has one, so counting it would make the check vacuous.
 */
export function hasBaseCase(recipeBody: string): boolean {
  const lines = recipeBody.split('\n');
  let insideConditional = false;
  let conditionalIndent = 0;

  for (const raw of lines) {
    if (raw.trim() === '') continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    if (insideConditional && indent <= conditionalIndent) {
      insideConditional = false;
    }

    const cond = line.match(/^(If|Otherwise)\b(.*)$/);
    if (cond) {
      // `If n <= 1: Return 1.` — guard and Return on one line.
      if (/\bReturn\b/.test(cond[2])) return true;
      insideConditional = true;
      conditionalIndent = indent;
      continue;
    }

    if (insideConditional && /^Return\b/.test(line)) return true;
  }
  return false;
}

/** The argument fragment of every self-call in the Recipe.
 *
 *  `Call [[factorial]] with n=n - 1.` → `['n=n - 1.']`
 *  `Call [[factorial]].`             → `['']`  (absent arguments) */
export function selfCallArguments(
  recipeBody: string,
  targetId: string,
): string[] {
  const out: string[] = [];
  const re = /Call\s+\[\[([^\]]+)\]\]([^\n]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(recipeBody)) !== null) {
    const callee = m[1].split('|')[0].trim();
    if (!matchesTarget(callee, targetId)) continue;
    const tail = m[2] ?? '';
    const withPart = tail.match(/^\s*with\s+(.*)$/);
    out.push(withPart ? withPart[1] : '');
  }
  return out;
}

/**
 * Does at least one self-call pass a DERIVED argument?
 *
 * Not progress: no arguments at all (`Call [[factorial]].`), or every
 * argument echoing a declared `Input` unchanged (`with n=n`). Both are
 * the mirror shape — the call cannot converge because nothing moves.
 *
 * Progress: anything else. `with n=n - 1`, `with n=count`, `with n=3`.
 * A literal counts: it does not converge for every input, but it is not
 * the mirror this gate exists to catch, and rejecting it would reject
 * a legal (if odd) Recipe. Conservative in the accepting direction, per
 * the module note.
 */
export function selfCallProgresses(
  recipeBody: string,
  targetId: string,
): boolean {
  const inputs = declaredInputs(recipeBody);
  const calls = selfCallArguments(recipeBody, targetId);
  if (calls.length === 0) return false;

  return calls.some((args) => {
    const trimmed = args.replace(/\.\s*$/, '').trim();
    if (trimmed === '') return false;               // no arguments at all
    // Split on top-level commas — good enough for `a=1, b=x - 1`.
    const pairs = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
    if (pairs.length === 0) return false;
    return pairs.some((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return true;                   // unparseable → accept
      const value = pair.slice(eq + 1).trim();
      if (value === '') return false;
      // A bare, unchanged Input name is the mirror.
      return !inputs.has(value);
    });
  });
}

/** The full verdict. */
export function checkRecursionShape(
  recipeBody: string,
  targetId: string,
): RecursionShapeVerdict {
  const callsSelf = !targetId
    ? false
    : extractWikilinkTargets(recipeBody).some((w) => matchesTarget(w, targetId));

  if (!callsSelf) {
    return { callsSelf: false, hasBaseCase: false, progresses: false, ok: true };
  }

  const base = hasBaseCase(recipeBody);
  const progress = selfCallProgresses(recipeBody, targetId);
  const ok = base && progress;
  const failure: RecursionShapeFailure | undefined = ok
    ? undefined
    : (!base && !progress) ? 'both' : (!base ? 'no-base-case' : 'no-progress');

  return { callsSelf: true, hasBaseCase: base, progresses: progress, ok, failure };
}

/** The label attached to the target's own inventory entry (§1).
 *
 *  2360's mirror happened because the note's own summary described a
 *  function that did exactly what was wanted — so calling it looked
 *  perfect. Naming it as THIS NOTE, and naming the only legitimate use,
 *  is what makes re-inclusion safe. */
export function selfReferenceLabel(summary: string): string {
  const base = summary.trim();
  const note =
    'THIS NOTE — self-reference; call only to recurse, and only with a '
    + 'base case and a changed argument';
  return base ? `${base} (${note})` : `(${note})`;
}

/** The cohort-facing rejection, replacing 2360's flat direct-self-call
 *  message with the same UX and a smarter criterion. */
export function recursionShapeRejectionMessage(
  verdict: RecursionShapeVerdict,
  targetName: string,
): string {
  const head =
    `The generated Recipe calls \`[[${targetName}]]\` — itself — `;
  if (verdict.failure === 'no-base-case') {
    return head
      + 'but never stops: there is no `If`-guarded `Return` to end the '
      + 'recursion, so it would run until Python gives up. Add a base '
      + 'case (e.g. `If n <= 1:` then `Return 1.`), or refine the '
      + 'Description to say when it should stop.';
  }
  if (verdict.failure === 'no-progress') {
    return head
      + 'with the same value it was given, so it would call itself '
      + 'forever with no progress. The recursive call needs a changed '
      + 'argument (e.g. `with n=n - 1`), or refine the Description to '
      + 'say what shrinks on each step.';
  }
  return head
    + 'without a base case and without changing its argument — that is '
    + 'a mirror, not recursion. If this note should recurse, say what '
    + 'shrinks each step and when it stops; otherwise describe what the '
    + 'note should compute directly.';
}
