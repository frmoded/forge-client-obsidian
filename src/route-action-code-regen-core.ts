// v0.2.121 — Option C plugin-side routing for English → Python regen.
//
// Replaces v0.2.55's facet_form-gated dispatch with plugin-side
// fallback chain:
//   1. Try resolveActionCode (E-- transpile via engine).
//   2. If E-- returns null/empty: fall back to /generate (LLM).
//   3. If no transpile token: surface clear "set token" error.
//
// Engine no longer reads facet_form (v0.2.121 engine change). All
// snippets attempt E-- first; the engine returns null when it can't
// compile (free-text English, missing # English heading), and the
// router catches that signal here.
//
// Pure-core: dependency-injected functions for both the E-- and LLM
// surfaces. Caller in main.ts wires in the real PyodideHost +
// generateSnippetAlpha implementations.

export type RoutingSuccess = { ok: true; code: string; via: 'e--' | 'generate' };
export type RoutingFailure =
  | { ok: false; reason: 'no-token'; message: string }
  | { ok: false; reason: 'http-error'; message: string }
  | { ok: false; reason: 'engine-error'; message: string };
export type RoutingResult = RoutingSuccess | RoutingFailure;

export interface RoutingDeps {
  /** Returns the engine's transpiled Python code, or null/empty when
   *  E-- couldn't compile (free-text English, missing English heading).
   *  May throw on engine wiring failure (no host, Pyodide not ready);
   *  router catches and surfaces as `engine-error`. */
  resolveActionCode: (snippetId: string) => Promise<string | null>;
  /** Has the user set a transpile service token in settings? */
  hasToken: boolean;
  /** Calls the hosted /generate (LLM) endpoint. Throws on transport
   *  error or non-2xx; router catches and surfaces as `http-error`.
   *  Returns the generated Python source on success. */
  generate: (snippetId: string) => Promise<string>;
}

/** Route English → Python regen via E-- with /generate fallback.
 *
 *  Behavior:
 *  - Try E-- transpile first (no LLM cost, deterministic).
 *  - If E-- returns null/empty (free-text English) AND a token is
 *    set → call /generate (LLM) and return its output.
 *  - If E-- returns null/empty AND NO token → surface the "set
 *    token" error message.
 *  - If E-- throws (engine wiring failure) → surface engine-error.
 *  - If /generate throws → surface http-error. */
export async function routeActionCodeRegen(
  snippetId: string,
  deps: RoutingDeps,
): Promise<RoutingResult> {
  // Phase 1: try E-- transpile.
  let emmResult: string | null = null;
  try {
    emmResult = await deps.resolveActionCode(snippetId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'engine-error', message };
  }
  if (emmResult && emmResult.trim().length > 0) {
    return { ok: true, code: emmResult, via: 'e--' };
  }

  // Phase 2: E-- returned empty → fall back to /generate.
  if (!deps.hasToken) {
    return {
      ok: false,
      reason: 'no-token',
      message:
        'Forge: this snippet needs free-text Python generation but '
        + 'no transpile token is set. Set one in Settings → Forge → '
        + 'Transpile token, or write the English in E-- form '
        + '(`Do [[snippet_name]](args).`) for deterministic compile.',
    };
  }
  try {
    const code = await deps.generate(snippetId);
    return { ok: true, code, via: 'generate' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'http-error', message };
  }
}

// ---------------------------------------------------------------------
// Drain 2026-08-27-1830 — making the fallback LOUD on Recipe-canonical
// notes.
//
// Phase 2 above is correct for a free-text-English note: E-- cannot
// compile prose, and /generate is the whole point. It is a different
// thing entirely on a note whose `source_facet` is `recipe`. There the
// Recipe is a hand-authored artifact, and /generate's request payload
// carries description / english / inputs / generation_notes / deps /
// callables and NO RECIPE (measured in drain 1700 §1) — so the Python
// that lands was not derived from the Recipe at all, and the Recipe's
// semantics are simply discarded.
//
// Drain 1700 made the resulting frontmatter honest: the note now renders
// `— derived from Recipe, out of date` instead of claiming currency.
// But that is a suffix someone has to notice. Forge-core's adjudication
// (drain 1830 §0, answering message 1810) was shape 3 of three: keep the
// behaviour, end the silence.
//
// Shape 1 — refusing the fallback outright — is philosophically the
// better match for the "hand-authored artifact is the source" doctrine
// (drain 1620's mayMachineWriteFacet, drain 1700 itself). It is
// deliberately NOT what this drain does: a Recipe-canonical note with an
// unresolved `{{ }}` slot would stop producing any runnable Python, and
// nobody has yet measured how many bundled notes that would brick.

/** Should the E-- → /generate fallback warn before it writes?
 *
 *  True only when the note's STORED source facet is `recipe`. Absent /
 *  unknown PERMITS silently, matching the convention drains 1620 and
 *  1700 both adopted: a pre-drain-1200 note carries no hand-authored
 *  claim, and warning on every legacy note would cry wolf. */
export function shouldWarnRecipeCanonicalFallback(
  storedSourceFacet: string | null | undefined,
): boolean {
  return storedSourceFacet === 'recipe';
}

/** The notice text. Says which note, what happened, and what the reader
 *  should do — the Recipe was not merely stale in that output, it was
 *  never read. */
export function recipeCanonicalFallbackNotice(noteName: string): string {
  return `${noteName}: the Recipe could not be compiled, so the Python was `
    + `generated from the Description instead. The Recipe was not used — `
    + `check the result against it.`;
}
