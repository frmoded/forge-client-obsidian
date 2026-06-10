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
