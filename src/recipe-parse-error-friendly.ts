// v0.2.249 drain 2026-07-03-0700 — cohort-friendly Recipe ParseError
// surfacing. When cohort makes a Recipe syntax error, the engine's
// Python parser raises forge.recipe.parser.ParseError with a
// Python-internal message (e.g., "expected = after kwarg name 'a'").
// This module intercepts the Pyodide traceback and rewrites to
// cohort-facing language.
//
// The engine's error class stays as-is; the transformation is
// plugin-side, at the compute boundary. See prompt 0700 §3 for
// rationale.

export interface FriendlyRecipeParseError {
  /** Cohort-facing message. When matched, a specific hint; when
   *  unmatched, a generic "Recipe parse error: <last-line>". */
  userMessage: string;
  /** The full raw Pyodide traceback, preserved verbatim so engineers
   *  can still inspect the Python-internal detail. */
  rawTraceback: string;
  /** True when a specific pattern matched. False → generic fallback. */
  matched: boolean;
}

interface Pattern {
  /** Regex matched against the LAST line of the traceback (the
   *  message payload after the class name). Capturing groups feed
   *  the rewrite function. */
  regex: RegExp;
  /** Produces the cohort message from the regex match groups. */
  rewrite: (match: RegExpMatchArray) => string;
}

/** Pattern → cohort rewrite table. Extend as new messages surface
 *  in cohort smokes. Ordered least-to-most-specific isn't required;
 *  first match wins. */
const PATTERNS: Pattern[] = [
  {
    // "expected = after kwarg name 'a'"
    regex: /expected = after kwarg name '([^']+)'/,
    rewrite: (m) =>
      `Recipe kwarg near '${m[1]}' — the grammar is 'Call [[chip]] with name=value'. `
      + `Did you mean '${m[1]}=...'? Or is there an extra word before the kwarg list?`,
  },
  {
    // "unexpected token '<tok>' at column N"
    regex: /unexpected token '([^']+)'(?:\s+at column\s+(\d+))?/,
    rewrite: (m) => {
      const col = m[2] ? ` at column ${m[2]}` : '';
      return `Recipe has an unexpected token '${m[1]}'${col}. `
        + `Check the line for a typo, missing period, or misplaced bracket.`;
    },
  },
  {
    // "unterminated string literal" or "unclosed string"
    regex: /unterminated string|unclosed string/i,
    rewrite: () =>
      `Recipe has an unclosed quoted value. Check for a missing closing quote.`,
  },
  {
    // Snippet resolution failures via GraphResolver.
    // "Snippet 'foo' not found. Searched: ..."
    regex: /Snippet '([^']+)' not found/,
    rewrite: (m) =>
      `Chip '${m[1]}' isn't in your library. Check the wikilink spelling; `
      + `try Cmd-P → 'Forge: Refresh chips' if you just added it.`,
  },
];

/** Extract the last meaningful line from a Pyodide traceback (the
 *  error class + message). Falls back to the whole traceback if
 *  parsing fails. */
function lastLineOf(traceback: string): string {
  const lines = traceback.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  if (lines.length === 0) return traceback;
  return lines[lines.length - 1];
}

/** Detect whether the traceback originates from forge.recipe.parser
 *  or a related engine error class we can meaningfully rewrite. Used
 *  to gate the generic fallback so unrelated Python errors (e.g.,
 *  runtime NameError inside compute) don't get rewritten as "Recipe
 *  parse error." */
function isRecipeRelevant(traceback: string): boolean {
  return (
    traceback.includes('forge.recipe.parser')
    || traceback.includes('forge.recipe.')
    || traceback.includes('ParseError')
    || traceback.includes('LexError')
    || traceback.includes('SnippetResolutionError')
  );
}

/** Given a raw Pyodide traceback (or any error message), produce a
 *  cohort-friendly rewrite. Pure; deterministic; no I/O.
 *
 *  Returns the raw traceback unchanged in `rawTraceback` so the caller
 *  can still surface it to engineers under a "Details" fold. */
export function friendlyRecipeParseError(
  rawTraceback: string,
): FriendlyRecipeParseError {
  const last = lastLineOf(rawTraceback);
  const relevant = isRecipeRelevant(rawTraceback);

  for (const p of PATTERNS) {
    const m = last.match(p.regex);
    if (m) {
      return {
        userMessage: p.rewrite(m),
        rawTraceback,
        matched: true,
      };
    }
  }

  if (relevant) {
    // Recipe/parser-related but pattern didn't match. Generic fallback
    // still less intimidating than the raw traceback.
    // Strip the leading "ClassName: " if present to keep the message
    // readable.
    const stripped = last.replace(/^[A-Za-z_.]*(?:Error|Exception):\s*/, '');
    return {
      userMessage:
        `Recipe parse error: ${stripped}. Check Recipe syntax.`,
      rawTraceback,
      matched: false,
    };
  }

  // Not Recipe-related. Return raw last line unchanged; caller decides
  // whether to still show it.
  return {
    userMessage: last,
    rawTraceback,
    matched: false,
  };
}
