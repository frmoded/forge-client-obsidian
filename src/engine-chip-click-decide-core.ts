// v0.2.206 — pure-core decision: given a wikilink target string, the
// vault-resolution state, and the engine-chip catalog, decide what
// happens on Cmd-click:
//
//   - 'open-engine-chip' → the plugin opens EngineChipView for this chip
//   - 'open-vault-note'  → defer to Obsidian's default behavior
//                          (existing note opens; missing creates one)
//
// The decision is intentionally pure (no Obsidian dependency) so the
// matching rules are easy to test in isolation.

import { bareWikilinkTarget } from './python-builtins-core.ts';

export type EngineChipClickDecision =
  | { action: 'open-engine-chip'; chipName: string }
  | { action: 'open-vault-note'; reason: 'vault-note-exists' | 'no-chip-match' | 'empty-target' };

/** Decide what to do on a wikilink click.
 *
 * @param rawTarget  raw wikilink target (`name#section|alias` shape allowed)
 * @param vaultHasNoteFor  true iff Obsidian resolves the target to an
 *   existing vault file. When true, default to vault-note open (cohort
 *   can shadow an engine chip with a vault note if they choose; vault
 *   wins for explicit override).
 * @param chipExists  true iff the bare-stripped target is in the
 *   engine-chip catalog.
 */
export function decideEngineChipClick(
  rawTarget: string,
  vaultHasNoteFor: boolean,
  chipExists: boolean,
): EngineChipClickDecision {
  const bare = bareWikilinkTarget(rawTarget);
  if (!bare) {
    return { action: 'open-vault-note', reason: 'empty-target' };
  }
  if (vaultHasNoteFor) {
    // Vault override wins. Cohort intentionally created a note that
    // shadows the engine chip (e.g. wraps it with vault-specific
    // documentation). Don't surprise them with our view.
    return { action: 'open-vault-note', reason: 'vault-note-exists' };
  }
  if (!chipExists) {
    return { action: 'open-vault-note', reason: 'no-chip-match' };
  }
  return { action: 'open-engine-chip', chipName: bare };
}
