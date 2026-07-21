// CW-slot-cache-panel-treatment (2026-07-20-1710).
//
// Derives human-readable guidance from a slot-cache-writer file-not-
// found miss. Mirror of `llm-rejection-guidance-core.ts`: pure-core
// with no `obsidian` imports, testable in isolation; the output-view
// renderer (`appendSlotCacheNotFound`) calls this to produce the
// "Likely cause" prose + "Fix options" list.
//
// The three-attempt trace is what makes the guidance actionable —
// naming which lookup missed, and with what input, lets a user (or
// forge-core reviewing a FEEDBACK) diagnose why the slot-cache
// writer couldn't find the source file. Without it, the surface
// devolves back to the drain-1230 Notice: "could not locate X.md".

import type { LocateAttempt } from './locate-snippet-file-core.ts';

export interface SlotCacheNotFoundInput {
  snippetId: string;
  /** Absolute-in-vault path of the caller-provided TFile, or null
   *  if the caller didn't have one to pass. */
  providedFilePath: string | null;
  /** Full trace from `locateSnippetFile`, in-order. */
  attempts: readonly LocateAttempt[];
  /** Total .md file count scanned in the basename walk. Helps the
   *  user tell "vault empty" from "no basename match". */
  markdownFileCount: number;
}

export interface SlotCacheNotFoundGuidance {
  likelyCause: string;
  fixOptions: string[];
}

/**
 * Derive guidance for a slot-cache-writer file-not-found miss.
 *
 * Three shapes of failure, distinguished by the attempt trace:
 *
 *   A. Empty vault (markdownFileCount === 0):
 *      the user opened the plugin on a vault with no .md files. The
 *      lookup can't succeed. Point at vault-selection rather than
 *      snippet-authoring.
 *
 *   B. Vault has files but neither exact-path nor basename hit:
 *      the snippetId doesn't correspond to any note in the vault.
 *      Most common cause: a stale wikilink or a rename since the
 *      caller last stored the id. Guide toward creating the note or
 *      fixing the reference.
 *
 *   C. Caller-supplied file was null but vault has files — same as
 *      (B) from the user's perspective; the provided-file lane
 *      wasn't eligible, so exact-path + basename are the only signal.
 *
 * The guidance ALWAYS lists the concrete inputs that were tried, so
 * the user can pattern-match against their vault contents.
 */
export function deriveSlotCacheNotFoundGuidance(
  input: SlotCacheNotFoundInput,
): SlotCacheNotFoundGuidance {
  const { snippetId, attempts, markdownFileCount, providedFilePath } = input;

  const exactAttempt = attempts.find((a) => a.step === 'exact-path');
  const basenameAttempt = attempts.find((a) => a.step === 'basename');
  const exactTried = exactAttempt?.tried ?? `${snippetId}.md`;
  const basenameTried = basenameAttempt?.tried ?? snippetId;

  // Case A — empty vault.
  if (markdownFileCount === 0) {
    return {
      likelyCause:
        `The vault has no .md files, so no lookup could match `
        + `${tick(snippetId)}. The slot-cache writer needs a `
        + 'concrete source note to persist the resolved slot into.',
      fixOptions: [
        'Confirm the correct vault is open in Obsidian — the plugin '
        + 'scans the active vault.',
        `Create the note at ${exactTried} (or wherever `
        + `${tick(snippetId)} should live) and try again.`,
      ],
    };
  }

  // Case B/C — vault has files but neither lookup hit.
  const providedNote = providedFilePath === null
    ? 'The caller did not supply a source file, so the lookup fell '
      + 'back to path/basename scanning.'
    : `The caller supplied ${tick(providedFilePath)} `
      + 'but that path was empty/falsy at the check site.';

  return {
    likelyCause:
      `${providedNote} No .md file in the vault had path `
      + `${tick(exactTried)}, and no file had basename `
      + `${tick(basenameTried)} (${markdownFileCount} `
      + '.md files scanned). Most common trigger: a stale wikilink '
      + `to ${tick(snippetId)} that no longer resolves, or a `
      + 'note that has since been renamed / moved.',
    fixOptions: [
      `Check the vault for a note named ${tick(basenameTried)} `
      + '— it may live at an unexpected path, in which case the '
      + 'snippetId should be qualified to match.',
      `If ${tick(snippetId)} was renamed or deleted, update or `
      + 'remove the wikilink that referenced it before re-forging.',
      `Create ${tick(exactTried)} if the note should exist but doesn't yet.`,
    ],
  };
}

/**
 * Wrap a value in backticks for user-facing prose. Not a full quote-
 * escape (we never build shell / code here); just visual delimiting
 * so paths + identifiers stand out from the surrounding sentence.
 */
function tick(v: string): string {
  return '`' + v + '`';
}
