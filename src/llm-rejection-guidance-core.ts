// CW-description-prose-hallucination-forge-output-visibility (2026-07-17).
// Derives human-readable guidance from an LLM Recipe-generation
// rejection (closure fail / sanitize fail).
//
// Pure-core — no `obsidian` imports; testable in isolation. The
// output-view's `appendLlmRecipeRejection` renderer calls this to
// produce the "Likely cause" text + "Fix options" list.
//
// Landmine pattern detection: certain phrases in the Description
// deterministically confuse the LLM into emitting phantom chip
// wikilinks. When the rejection's unresolved list matches a known
// landmine (e.g. `print`), the guidance calls out the specific
// prose responsible, matching the driver-facing quality bar the
// drain §3.1 sets.

export type RejectionFailureMode = 'closure-fail' | 'sanitize-fail';

export interface LlmRejectionInput {
  /** Which gate rejected the LLM output. */
  failureMode: RejectionFailureMode;
  /** For closure-fail: the wikilink names the LLM emitted that
   *  don't resolve to any known snippet. Empty for sanitize-fail. */
  unresolvedWikilinks: readonly string[];
  /** The Description body text at the moment of Forge-click. Used
   *  to detect landmine phrases like "print hello" that likely
   *  caused the phantom chip emission. */
  descriptionBody: string;
}

export interface LlmRejectionGuidance {
  /** One-paragraph explanation of what probably went wrong. Names
   *  specific prose from the Description when a landmine pattern
   *  matches; otherwise stays generic. */
  likelyCause: string;
  /** Ordered fix suggestions, most actionable first. Each entry is a
   *  single-line string suitable for a bulleted list. */
  fixOptions: string[];
}

// Known "landmine" identifier → guidance-quality entry. When the LLM
// emits `[[foo]]` and `foo` appears in this table AND the Description
// mentions it in a prose-suggestive way, the guidance names it
// explicitly. Keeps §3.2 test case #5 (guidance-text derivation)
// green when a refactor tries to make the message generic.
const LANDMINE_IDENTIFIERS: Record<string, {
  verb: string;
  builtinAdvice: string;
}> = {
  print: {
    verb: 'print',
    builtinAdvice:
      'Print "text". is the built-in verb for stdout (constitution B7.2). '
      + 'Use Print "..." in the Recipe facet directly — no `[[print]]` chip needed.',
  },
  // Future landmines land here as the reliability suite surfaces them.
};

function _landmineInDescription(
  ident: string,
  descriptionBody: string,
): boolean {
  // Match `ident` as a standalone token near an obvious verb-shape
  // context. Line-oriented — the driver's typical landmine is a
  // trailing prose line like `print hello` at the bottom of the
  // Description. Case-insensitive to catch `Print hello` too.
  const lc = descriptionBody.toLowerCase();
  const identLc = ident.toLowerCase();
  // Bare word occurrence + not part of a wikilink (Description shouldn't
  // reference [[print]] itself; if it does, that's an authored intent
  // signal we shouldn't override).
  const bareWord = new RegExp(`(^|[^\\w\\[])${identLc}([^\\w\\]]|$)`);
  const inWikilink = new RegExp(`\\[\\[${identLc}\\]\\]`);
  return bareWord.test(lc) && !inWikilink.test(lc);
}

/**
 * Compute human-facing guidance for a Recipe rejection.
 *
 * Detection order:
 *   1. Landmine table hit — one of the unresolved wikilinks matches a
 *      known-landmine identifier AND appears as bare prose in the
 *      Description. Emit landmine-specific guidance.
 *   2. Generic closure-fail — unresolved list is populated but no
 *      landmine matched. Emit a generic "unknown chip" explanation.
 *   3. Sanitize-fail — LLM produced no valid `Let/Return` statements.
 *      Emit a generic "prose-only output" explanation.
 */
export function deriveLlmRejectionGuidance(
  input: LlmRejectionInput,
): LlmRejectionGuidance {
  // Landmine detection runs regardless of failure mode — a sanitize-
  // fail is still worth calling out if the Description contains an
  // obvious prose landmine.
  for (const ident of input.unresolvedWikilinks) {
    const landmine = LANDMINE_IDENTIFIERS[ident.toLowerCase()];
    if (landmine && _landmineInDescription(ident, input.descriptionBody)) {
      return {
        likelyCause:
          `Your Description contains \`${landmine.verb}\` as prose — `
          + `the LLM interpreted it as a chip name and emitted `
          + `\`Call [[${ident}]]\`. But no \`${ident}\` chip is registered `
          + `in this vault's palette.`,
        fixOptions: [
          `Remove the \`${landmine.verb}\` prose from Description; keep only intent-level language.`,
          landmine.builtinAdvice,
          `If you meant a real chip named \`${ident}\`, add it to the library (Sprint 4+; usually not the right move).`,
        ],
      };
    }
  }

  if (input.failureMode === 'closure-fail') {
    const list = input.unresolvedWikilinks
      .map((w) => `\`[[${w}]]\``)
      .join(', ');
    return {
      likelyCause:
        `The LLM emitted ${list || 'unresolved wikilinks'} — chip names `
        + `that aren't registered in this vault's palette. The Description `
        + `may have language that reads to the LLM as a chip invocation.`,
      fixOptions: [
        'Rephrase the Description to avoid words that read as chip names.',
        'Move the intended behavior into the Python facet directly and hand-edit the Recipe to match.',
        'If you meant a real chip, verify the name via forge_read_note_catalog.',
      ],
    };
  }

  // sanitize-fail: LLM produced no valid Let/Return.
  return {
    likelyCause:
      `The LLM returned prose or commentary instead of Recipe syntax — no `
      + `\`Let ... = Call [[...]]\` or \`Return ...\` statement was emitted. `
      + `Likely the Description didn't give the LLM enough concrete authoring `
      + `intent, or it explicitly asked for an explanation rather than code.`,
    fixOptions: [
      'Add a concrete "Return the ..." sentence to Description.',
      'Include the name of at least one chip you want the Recipe to use (e.g. "using [[major_pentatonic]]").',
      'Hand-author the Recipe body directly and Forge-click; the Description-canonical branch will re-baseline stamps on next edit.',
    ],
  };
}

/**
 * Trim `raw` to the first `maxChars` for panel display. Adds an ellipsis
 * suffix when trimmed. Keeps line breaks intact so a multi-line LLM
 * response renders sensibly in the panel's `<pre>` block.
 */
export function truncateLlmOutput(raw: string, maxChars = 500): string {
  if (raw.length <= maxChars) return raw;
  return raw.slice(0, maxChars).trimEnd() + '\n… [truncated]';
}
