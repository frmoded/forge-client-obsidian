// Pure-core decision: given (old active domains, new active domains,
// inventory of known domains with their activation obligations),
// return the list of actions that need to fire to bring the plugin
// state in line with the new domain set.
//
// v0.2.45 — bug fix. Before this drain, EditVaultDomainsModal.applyDiff
// would update forge.toml and refresh main.ts's activeDomains data,
// but never re-fired the domain-gated onload paths:
//   - main.ts:343-356 — moda commands registered iff isDomainActive('moda')
//     at onload time only.
//   - welcome.ts:122 — ensureBundledForgeMusic runs in runFirstRunCheck
//     iff vaultDeclaresMusic at onload time only.
// User had to fully quit + reopen Obsidian for the modal-driven domain
// change to take effect. This helper drives the applyDiff post-write
// step: compute which actions to fire, then dispatch them
// synchronously without requiring a plugin reload.
//
// Pure-core extraction No. 14. Same `node --test` convention as the
// thirteen prior extractions.

/** What needs to happen for a domain that just became active. */
export type DomainActivationAction =
  | { type: 'extract'; domain: string }            // bundled-vault extraction (e.g. music)
  | { type: 'register-commands'; domain: string };  // command-palette registration

/** Per-domain capabilities used by the activation decision. */
export interface DomainInventoryEntry {
  /** Domain id as it appears in forge.toml (e.g. 'moda', 'music'). */
  id: string;
  /** True if activating this domain requires a bundled-vault extract.
   *  False when the bundled vault is unconditionally extracted at
   *  onload regardless of activation (e.g. forge-moda). */
  extractOnActivate: boolean;
  /** True if activating this domain requires registering command-
   *  palette entries (the moda case today; music when music commands
   *  ship). */
  registerCommandsOnActivate: boolean;
}

/** Production inventory: which Forge domains require which activation
 *  actions. Sync this with main.ts:onload's per-domain conditional
 *  branches and welcome.ts's per-domain ensureBundled* helpers. */
export const DOMAIN_INVENTORY: DomainInventoryEntry[] = [
  // moda: commands registered conditionally (main.ts:343). Bundled
  // vault extracted UNCONDITIONALLY at onload (welcome.ts:104) so
  // adding moda after the fact doesn't need an extract action — the
  // forge-moda directory is already present from first plugin load.
  { id: 'moda',  extractOnActivate: false, registerCommandsOnActivate: true  },
  // music: bundled vault gated on vaultDeclaresMusic (welcome.ts:122 +
  // forge-music-gate.ts). When music is newly activated mid-session,
  // the bundled forge-music vault needs extracting. Commands are
  // currently false (no music-specific commands registered today)
  // but flagged here for forward-compat: if music commands ship,
  // flip the bit.
  { id: 'music', extractOnActivate: true,  registerCommandsOnActivate: false },
];

/** Decide which actions fire given a domain-set transition.
 *
 *  Semantics:
 *  - `null` on either side means "back-compat all-active" — every known
 *    domain is treated as active. null on the OLD side means every
 *    domain was already active; null on the NEW side means every
 *    domain becomes active.
 *  - For each domain newly-active (in new but not old): emit `extract`
 *    if the inventory says extractOnActivate, then `register-commands`
 *    if the inventory says registerCommandsOnActivate.
 *  - Ordering: all extracts before any register-commands, preserving
 *    inventory declaration order within each group. The natural
 *    dependency is that bundled content must exist on disk before
 *    commands referencing it register.
 *  - Removal is DEFERRED — newly-inactive domains emit no actions.
 *    The modal's existing "files stay on disk" semantics for domain
 *    removals are mirrored here; re-adding a domain later re-fires
 *    the activation actions (idempotent).
 *
 *  Idempotent: re-firing with identical old + new sets yields []. */
export function computeDomainActivationActions(
  oldActive: Set<string> | null,
  newActive: Set<string> | null,
  inventory: DomainInventoryEntry[],
): DomainActivationAction[] {
  // null → all-active expansion.
  const allKnown = new Set(inventory.map(d => d.id));
  const oldSet = oldActive === null ? allKnown : oldActive;
  const newSet = newActive === null ? allKnown : newActive;

  // Identify newly-active domains preserving inventory order.
  const newlyActive = inventory.filter(
    d => newSet.has(d.id) && !oldSet.has(d.id),
  );

  const actions: DomainActivationAction[] = [];

  // Extracts first.
  for (const d of newlyActive) {
    if (d.extractOnActivate) {
      actions.push({ type: 'extract', domain: d.id });
    }
  }
  // Then register-commands.
  for (const d of newlyActive) {
    if (d.registerCommandsOnActivate) {
      actions.push({ type: 'register-commands', domain: d.id });
    }
  }

  // Removal-side intentionally deferred — see helper docstring.
  return actions;
}
