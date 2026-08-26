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

export type RejectionFailureMode =
  | 'closure-fail'
  | 'sanitize-fail'
  // Drain 2026-08-24-2310 — the generated Recipe referenced names it
  // never declared. Sibling of closure-fail: same "the model ignored
  // the contract" family, same preserved-prior-Recipe treatment.
  | 'free-variable-fail'
  // Drain 2026-08-26-1000 — the generated Recipe calls a sibling note
  // whose own Recipe calls this one back. Third member of the same
  // family: the model produced a well-formed Recipe that cannot run.
  | 'cycle-fail';

export interface LlmRejectionInput {
  /** Which gate rejected the LLM output. */
  failureMode: RejectionFailureMode;
  /** For closure-fail: the wikilink names the LLM emitted that
   *  don't resolve to any known snippet. Empty for sanitize-fail. */
  unresolvedWikilinks: readonly string[];
  /** Drain 2026-08-24-2310 — for free-variable-fail: the names the
   *  Recipe referenced but never declared. Empty for the other modes. */
  undeclaredNames?: readonly string[];
  /** The Description body text at the moment of Forge-click. Used
   *  to detect landmine phrases like "print hello" that likely
   *  caused the phantom chip emission. */
  descriptionBody: string;
  /** Drain 2026-08-26-1000 — for cycle-fail: the callees whose own
   *  Recipe calls this note back. Empty for the other modes. */
  cyclicCallees?: readonly string[];
  /** Drain 2026-08-24-2360 — the note being generated FOR. When an
   *  unresolved wikilink turns out to BE this note, the failure is a
   *  self-call, not a phantom chip, and needs its own words: telling
   *  someone that the note on their screen "isn't registered in this
   *  vault's palette" reads as Forge being broken. Optional — absent
   *  keeps the pre-drain behaviour exactly. */
  targetSnippetId?: string;
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
  // CW-print-log-debug-landmine-lane-p3 (drain 2026-07-20-2000).
  // Belt-and-suspenders for `log` / `debug` — drain 1720 measured the
  // Lane A amendment as effective for both (20/20 each), but Lane P1
  // removed the base-prompt canonical `[[print]]` teaching, shifting
  // the residual risk landscape. Adding these entries so the panel
  // guidance is ready if a future prompt tweak (or new model rev)
  // regresses the log/debug rate.
  log: {
    verb: 'log',
    builtinAdvice:
      'There is no Recipe-level `log` chip in V2. For diagnostic output, '
      + 'use `Print "..."` in the Recipe facet (constitution B7.2), or emit '
      + 'the intent as Description prose and leave logging to the Python facet.',
  },
  debug: {
    verb: 'debug',
    builtinAdvice:
      'There is no Recipe-level `debug` chip in V2. Move debug-oriented '
      + 'behavior into the Python facet directly, or use `Print "..."` in '
      + 'the Recipe for quick stdout inspection during development.',
  },
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

/** Drain 2026-08-24-2360 — which unresolved wikilink, if any, is the
 *  target note itself. Returns the emitted spelling (so the message
 *  quotes what the model actually wrote) or null. */
function _selfCallAmong(
  unresolved: readonly string[],
  targetSnippetId: string | undefined,
): string | null {
  if (!targetSnippetId) return null;
  const base = (id: string) => id.slice(id.lastIndexOf('/') + 1);
  const targetBase = base(targetSnippetId);
  for (const w of unresolved) {
    if (w === targetSnippetId || base(w) === targetBase) return w;
  }
  return null;
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

  if (input.failureMode === 'free-variable-fail') {
    const names = input.undeclaredNames ?? [];
    const list = names.map((n) => `\`${n}\``).join(', ');
    const plural = names.length > 1;
    return {
      likelyCause:
        `The LLM's Recipe uses ${list || 'a name'} without declaring `
        + `${plural ? 'them' : 'it'}. The Description mentions `
        + `${plural ? 'inputs' : 'an input'} the Recipe didn't turn into an `
        + `\`Input\` statement — undeclared names parse cleanly and then `
        + `fail at run time with NameError, which is the exact failure the `
        + `\`Input\` keyword exists to prevent.`,
      fixOptions: [
        `Run again — generation wobbles, and a second attempt often declares ${plural ? 'them' : 'it'}.`,
        `Name the ${plural ? 'inputs' : 'input'} more explicitly in the Description (e.g. "takes an input scale, a number, default 1").`,
        `Hand-author the declaration: ${names.map((n) => `\`Input ${n}: <type> = <default>.\``).join(' ')}`,
      ],
    };
  }

  if (input.failureMode === 'cycle-fail') {
    const callees = input.cyclicCallees ?? [];
    const list = callees.map((n) => `\`[[${n}]]\``).join(', ');
    const plural = callees.length > 1;
    // The driver's Description said "a note that calls itself". Leading
    // with "refine the Description" would send exactly that cohort in a
    // circle — their Description was already right, and the thing they
    // want (recursion) is legal but hand-authored. So the hand-author
    // option comes FIRST here, unlike the other modes.
    return {
      likelyCause:
        `The LLM's Recipe calls ${list || 'a sibling note'}, whose own Recipe `
        + `calls this note back. Running it would recurse until Python gives up `
        + `with \`maximum recursion depth exceeded\`. This note is kept out of its `
        + `own callable list (so it cannot call itself directly), which is why `
        + `the model reached for ${plural ? 'those neighbours' : 'a neighbour'} `
        + `instead — and ${plural ? 'they' : 'it'} happens to point back here.`,
      fixOptions: [
        `If this note is meant to recurse, hand-author it: recursion in Forge is written directly in the Recipe facet, not generated.`,
        `Refine the Description to say what the helper should DO, rather than naming a note to call.`,
        `If ${plural ? 'those notes' : 'that note'} should not call this one, edit ${plural ? 'their' : 'its'} Recipe instead.`,
      ],
    };
  }

  if (input.failureMode === 'closure-fail') {
    // Drain 2026-08-24-2360 — self-call first. Since `excludeSelf`
    // keeps the target out of its own inventory, a generated self-call
    // now lands here as an "unresolved" name. It is not a phantom
    // chip, and the generic wording would tell the cohort that the
    // note open in front of them is unregistered.
    //
    // Basename comparison for the same reason `excludeSelf` uses it:
    // `snippetIdFromPath` yields a bare id for a note in a non-library
    // subdirectory, so the emitted wikilink and the target id
    // legitimately disagree on the driver's own note shape.
    const selfName = _selfCallAmong(input.unresolvedWikilinks, input.targetSnippetId);
    if (selfName !== null) {
      return {
        likelyCause:
          `The generated Recipe calls this note itself — \`[[${selfName}]]\` `
          + `IS the note being generated. Running it would recurse until `
          + `Python gave up with "maximum recursion depth exceeded". A note `
          + `is not part of its own vocabulary, so the call doesn't resolve `
          + `and the Recipe was rejected instead of written.`,
        fixOptions: [
          'Run again — the Description probably describes the work itself, and a second attempt usually writes the steps rather than delegating them.',
          'Describe WHAT to compute rather than naming the note\'s own job (e.g. "multiply a random float by scale" rather than "do the random-number thing").',
          `If you genuinely want recursion, hand-author it: edit the Recipe directly to \`Call [[${selfName}]]\` with a terminating condition. Generation cannot produce self-calls, by design.`,
        ],
      };
    }
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
