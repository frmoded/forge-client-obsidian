// v0.2.206 — pure-core decision: given a wikilink target string, the
// vault-resolution state, and the library-note catalog, decide what
// happens on Cmd-click:
//
//   - 'open-library-note' → the plugin opens LibraryNoteView for this chip
//   - 'open-vault-note'  → defer to Obsidian's default behavior
//                          (existing note opens; missing creates one)
//
// v0.2.212 — extended with the forensic-shadow heuristic from the
// v0.2.211 driver smoke. Pre-v0.2.206 (or first-click before the
// catalog loaded), Obsidian's default Cmd-click on `[[chip]]` created
// empty `<chip>.md` files at the vault root. The original "vault
// wins" rule treated those shadows as intentional and kept opening
// them — cohort never discovered LibraryNoteView. New 4th param
// `vaultNoteRawContent` lets the caller hand in the resolved file's
// markdown; if the classifier says 'forensic', we open LibraryNoteView
// instead AND flag the shadow for cleanup.
//
// The decision is intentionally pure (no Obsidian dependency) so the
// matching rules are easy to test in isolation.

import { bareWikilinkTarget } from './python-builtins-core.ts';
import { classifyVaultShadow } from './vault-shadow-classifier-core.ts';

export type LibraryNoteClickDecision =
  | { action: 'open-library-note'; chipName: string; shadowToCleanup: boolean }
  | { action: 'open-vault-note'; reason: 'vault-note-exists' | 'no-chip-match' | 'empty-target' };

/** Decide what to do on a wikilink click.
 *
 * @param rawTarget  raw wikilink target (`name#section|alias` shape allowed)
 * @param vaultHasNoteFor  true iff Obsidian resolves the target to an
 *   existing vault file. When true, default to vault-note open (cohort
 *   can shadow an library note with a vault note if they choose; vault
 *   wins for explicit override) UNLESS the shadow classifies as forensic.
 * @param chipExists  true iff the bare-stripped target is in the
 *   library-note catalog.
 * @param vaultNoteRawContent  v0.2.212: raw markdown of the resolved
 *   vault note (null when no resolved note OR caller couldn't read).
 *   When provided + classifies as 'forensic', overrides the vault-wins
 *   default and routes to LibraryNoteView with shadowToCleanup=true.
 */
export function decideLibraryNoteClick(
  rawTarget: string,
  vaultHasNoteFor: boolean,
  chipExists: boolean,
  vaultNoteRawContent: string | null = null,
): LibraryNoteClickDecision {
  const bare = bareWikilinkTarget(rawTarget);
  if (!bare) {
    return { action: 'open-vault-note', reason: 'empty-target' };
  }
  if (vaultHasNoteFor) {
    // v0.2.212 — forensic-shadow heuristic. If the chip exists in the
    // catalog AND the vault note classifies as forensic (auto-created
    // garbage from a pre-v0.2.206 Cmd-click), prefer LibraryNoteView
    // over the empty note + flag for cleanup. Conservative: when
    // content is null (caller couldn't read) OR not in catalog, fall
    // through to the original vault-wins rule.
    if (chipExists && vaultNoteRawContent !== null) {
      const classification = classifyVaultShadow(vaultNoteRawContent, bare);
      if (classification === 'forensic') {
        return {
          action: 'open-library-note',
          chipName: bare,
          shadowToCleanup: true,
        };
      }
    }
    // Vault override wins. Cohort intentionally created a note that
    // shadows the library note (e.g. wraps it with vault-specific
    // documentation). Don't surprise them with our view.
    return { action: 'open-vault-note', reason: 'vault-note-exists' };
  }
  if (!chipExists) {
    return { action: 'open-vault-note', reason: 'no-chip-match' };
  }
  return { action: 'open-library-note', chipName: bare, shadowToCleanup: false };
}
