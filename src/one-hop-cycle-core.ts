// Drain 2026-08-26-1000 — the one-hop cycle belt for GENERATED Recipes.
//
// THE INCIDENT. `factorial.md` is Description-canonical ("a note that
// calls itself…"). The driver forged it; drain 2360's self-exclusion
// removed `factorial` from its own inventory — correctly, that is what
// stops a direct self-call — so the model reached for the closest
// visible callable, `[[show_factorial]]`, whose own hand-authored
// Recipe is `Let r = Call [[factorial]] with n=5.` A demo wrapper with
// a hardcoded 5. Result:
//
//     factorial(n) → show_factorial(ignores n) → factorial(5) → …
//     maximum recursion depth exceeded
//
// This is 2360's recorded tradeoff with a live casualty: "a sibling
// note was the closest thing it had been shown." 2360 closed the
// one-node cycle and opened the two-node one. This closes that.
//
// ONE HOP, DELIBERATELY. For each `Call [[X]]` where X is a VAULT NOTE,
// read X's committed Recipe and ask whether it calls the target back.
// No transitive walk: the incident shape is two nodes, the check is
// mechanical and cheap, and a deeper cycle still ends in the runtime's
// own recursion error — which is a worse message but not a silent one.
// A graph walk would need every note's Recipe on every generation, and
// would still have a depth limit somewhere.
//
// SCOPE — generated output only, same as the closure check and 2310's
// belt. Hand-authored recursion stays legal: `factorial.md`'s committed
// Recipe calls itself on purpose and IS the tutorial's recursion
// lesson. This belt never sees it, because it only runs on freshly
// generated text before it is written.
//
// WHY THE CLIENT OWNS THIS WHOLE. Placement was left to me by §1, on
// 2310's "one side owns it whole" criterion. The service cannot own it:
// its `callables` payload carries `{name, qualified, inputs, summary,
// kind}` and NO Recipe bodies, so a server-side version would need the
// client to ship every callable's full Recipe on every /generate — a
// large payload change to move a check to the side with less
// information. The client already has the vault open. Not close.

import { extractWikilinkTargets } from './write-generated-recipe-core.ts';

/** Last path segment of a snippet id. Duplicated from
 *  exclude-self-from-inventory-core's private helper because that one
 *  is not exported; the matching RULE is shared deliberately (see
 *  `matchesTarget`), not the accident of how a slash is found. */
function basename(id: string): string {
  const i = id.lastIndexOf('/');
  return i === -1 ? id : id.slice(i + 1);
}

/**
 * Does `candidate` name the target note?
 *
 * By id AND by basename — the SAME rule drain 2360 uses to exclude a
 * note from its own inventory, and for the same reason: `snippetIdFromPath`
 * falls back to a bare basename for a note in a non-library subdirectory,
 * so the target id and the registry id genuinely disagree for the exact
 * note shape the driver runs. A belt that matched only exact ids would
 * miss the cycle on precisely those notes.
 */
export function matchesTarget(candidate: string, targetId: string): boolean {
  if (!candidate || !targetId) return false;
  return candidate === targetId || basename(candidate) === basename(targetId);
}

export interface OneHopCycle {
  /** The callable the generated Recipe calls. */
  callee: string;
  /** The wikilink inside the callee's own Recipe that points back. */
  backReference: string;
}

/**
 * Callees whose own committed Recipe calls the target note back.
 *
 * `kindOf` distinguishes vault notes from engine chips — a chip is
 * Python in `forge.<domain>.lib`, has no Recipe, and must never be
 * registry-probed. `recipeFor` returns the callee's committed Recipe
 * body, or null when it cannot be read (note missing, no `# Recipe`
 * section, read failure).
 *
 * DEGRADES TOWARD ACCEPTING, like every belt in this family. A callee
 * whose Recipe cannot be read is not reported: a false rejection blocks
 * authoring, while a false pass leaves the pre-existing recursion
 * error, which is where we already were.
 */
export function collectOneHopCycles(
  generatedRecipe: string,
  targetId: string,
  kindOf: (name: string) => 'note' | 'chip' | 'unknown',
  recipeFor: (name: string) => string | null,
): OneHopCycle[] {
  if (!targetId) return [];
  const out: OneHopCycle[] = [];
  const seen = new Set<string>();

  for (const callee of extractWikilinkTargets(generatedRecipe)) {
    if (seen.has(callee)) continue;
    seen.add(callee);
    // A direct self-call is 2360's business, not this belt's. Reporting
    // it here would double-surface the same defect with different
    // wording; 2360's guidance for it is unchanged.
    if (matchesTarget(callee, targetId)) continue;
    if (kindOf(callee) !== 'note') continue;

    const calleeRecipe = recipeFor(callee);
    if (calleeRecipe === null) continue;

    for (const back of extractWikilinkTargets(calleeRecipe)) {
      if (matchesTarget(back, targetId)) {
        out.push({ callee, backReference: back });
        break;
      }
    }
  }
  return out;
}

/** The cohort-facing rejection message.
 *
 *  Voice matches the closure-fail and free-variable belts: name what is
 *  wrong, then the shape of the repair. The second sentence is the one
 *  that matters — the cohort's Description often DOES describe
 *  recursion (the driver's said "a note that calls itself"), so the fix
 *  is usually "edit the Recipe directly", not "rewrite the
 *  Description". Saying only the latter would send them in circles.
 */
export function oneHopCycleRejectionMessage(
  cycles: readonly OneHopCycle[],
  targetName: string,
): string {
  const names = cycles.map((c) => `\`[[${c.callee}]]\``).join(', ');
  const plural = cycles.length > 1;
  return (
    `The generated Recipe calls ${names}, whose own Recipe${plural ? 's call' : ' calls'} `
    + `this note back — running it would recurse forever. `
    + `Recursion in Forge is hand-authored: if this note should call itself, `
    + `edit the Recipe directly (\`Call [[${targetName}]] with n=…\`). `
    + `Otherwise refine the Description to name what the helper should do.`
  );
}
