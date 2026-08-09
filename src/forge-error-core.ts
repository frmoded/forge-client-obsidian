// CW-plugin-plus-mcp-structured-error-format-parity (drain
// 2026-08-08-1300) — shared 3-field error shape for the Forge Output
// panel, mirrored by forge-mcp's error_response.py so failures render
// identically across surfaces. Spec:
// ~/projects/forge/docs/specs/error-format.md
//
// Pure-core: no `obsidian` import. The renderer works against a
// narrow structural interface that Obsidian's HTMLElement (with its
// createEl/addClass augmentation) satisfies at runtime; tests drive
// it with an in-memory fake.

/** The shared cross-surface error shape. `cause` and `suggested_fix`
 *  are each one cohort-facing sentence and always render; `details`
 *  carries the traceback / debug dump and renders collapsed behind a
 *  native `<details>` disclosure. Field names match forge-mcp's
 *  ForgeError dataclass — parity is the point. */
export interface ForgeError {
  cause: string;
  suggested_fix: string;
  details?: string;
}

/** Structural subset of Obsidian's augmented HTMLElement that the
 *  renderer needs. `createEl` returns the created child, which
 *  satisfies the same interface (so nested creation works). */
export interface ErrorRenderHost {
  addClass(cls: string): void;
  createEl(
    tag: string,
    opts?: { text?: string; cls?: string },
  ): ErrorRenderHost;
}

export interface ClassifyInput {
  /** HTTP-ish status when the error came from a non-2xx compute
   *  response; omit for thrown/transport errors. */
  status?: number;
  /** The raw error text (engine traceback line, exception message,
   *  or HTTP detail). */
  errorMsg: string;
  /** Captured stdout accompanying the failure, when any. */
  stdout?: string;
}

// The five error classes migrated in drain 2026-08-08-1300. Matching
// is by exception NAME in the raw text (stable across engine message
// rewording); `cause` is the exception's own message line (the engine
// already writes those cohort-facing, e.g. the AmbiguousSnippet
// message from snippet_registry.get_bare), `suggested_fix` is canned
// per class, `details` preserves the full raw text + stdout for the
// collapsed engineer view. Unmatched errors return null and the
// caller keeps its legacy plain-text path (backwards compat).
const CLASS_RULES: ReadonlyArray<{
  marker: string;
  suggestedFix: string;
}> = [
  {
    marker: 'AmbiguousSnippetResolutionError',
    suggestedFix:
      'Rename one of the listed notes (or qualify the reference ' +
      'with its folder path) so the name is unique, then run again.',
  },
  {
    // Ordered BEFORE the bare SnippetResolutionError marker below —
    // that string is a substring of this one, so substring matching
    // must test the longer name first. (Ambiguous… contains neither.)
    marker: 'SnippetExecError',
    suggestedFix:
      "Open the note's # Python section and fix the line the " +
      'details point at, then run again.',
  },
  {
    marker: 'SnippetResolutionError',
    suggestedFix:
      'Check that the referenced note exists and the [[name]] is ' +
      'spelled exactly; create or rename it, then run again.',
  },
];

/** Extract the exception's own message: the text after the LAST
 *  `<Marker>: ` occurrence (tracebacks repeat the qualified name in
 *  the raise line at the bottom), first line only, trimmed. Falls
 *  back to the first non-empty line of the raw text. */
function extractCauseLine(raw: string, marker: string): string {
  const idx = raw.lastIndexOf(`${marker}:`);
  if (idx >= 0) {
    const after = raw.slice(idx + marker.length + 1);
    const line = after.split('\n')[0].trim();
    if (line.length > 0) return line;
  }
  const firstLine = raw.split('\n').find((l) => l.trim().length > 0);
  return (firstLine ?? raw).trim();
}

/** Classify a raw failure into the shared ForgeError shape, or null
 *  when the error is not one of the migrated classes (caller then
 *  keeps its existing plain-text rendering). */
export function classifyForgeError(input: ClassifyInput): ForgeError | null {
  const raw = input.errorMsg ?? '';
  for (const rule of CLASS_RULES) {
    if (raw.includes(rule.marker)) {
      return {
        cause: extractCauseLine(raw, rule.marker),
        suggested_fix: rule.suggestedFix,
        details: withStdout(raw, input.stdout),
      };
    }
  }
  // forge-transpile / engine service 5xx — no recognizable exception
  // name, but the status tells the cohort-relevant story.
  if (typeof input.status === 'number' && input.status >= 500) {
    return {
      cause: `The Forge service failed with an internal error (HTTP ${input.status}).`,
      suggested_fix:
        'Run again in a moment; if it keeps failing, the service ' +
        'logs have the underlying error.',
      details: withStdout(raw, input.stdout),
    };
  }
  return null;
}

function withStdout(raw: string, stdout?: string): string | undefined {
  const parts = [raw.trim(), stdout?.trim() ?? '']
    .filter((p) => p.length > 0);
  if (parts.length === 0) return undefined;
  return parts.join('\n\n--- stdout ---\n');
}

/** Load-bearing UI strings — pinned by forge-error-core.test.ts and
 *  mirrored in the spec doc's rendering conventions. */
export const ENGINEER_DETAILS_LABEL = '▸ Engineer details';
export const SUGGESTED_FIX_PREFIX = 'Fix: ';

/** Render a ForgeError into a panel entry: cause (error styling) +
 *  suggested fix always visible; details behind a native <details>
 *  disclosure, collapsed by default (the browser owns the toggle —
 *  no JS needed). No details → no disclosure element at all. */
export function renderForgeError(host: ErrorRenderHost, err: ForgeError): void {
  host.addClass('is-error');
  host.createEl('p', { text: err.cause, cls: 'forge-output-error' });
  host.createEl('p', {
    text: `${SUGGESTED_FIX_PREFIX}${err.suggested_fix}`,
    cls: 'forge-output-message',
  });
  if (err.details && err.details.trim().length > 0) {
    const disclosure = host.createEl('details', {
      cls: 'forge-output-engineer-details',
    });
    disclosure.createEl('summary', { text: ENGINEER_DETAILS_LABEL });
    disclosure.createEl('pre', {
      text: err.details,
      cls: 'forge-output-stdout',
    });
  }
}
