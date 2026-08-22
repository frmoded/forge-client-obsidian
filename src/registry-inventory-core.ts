// src/registry-inventory-core.ts
//
// Drain 2026-08-23-0900 — the registry-inventory probe's formatting
// half. NO OBSIDIAN IMPORTS (pure-core convention).
//
// What the probe is for: `_build_snippet_shims` (engine
// forge/core/executor.py) installs one lambda per snippet BASENAME
// across every vault, and those shims are spread into the exec
// namespace AFTER the domain globals. So a snippet whose basename
// equals an engine chip name does not merely coexist with the chip —
// it SHADOWS it, and a bare call in emitted Python reaches the snippet
// instead. Drain 1600 is blocked on whether that is what happens in a
// failing session; this turns "we think" into a reading.
//
// The engine chip set is NOT listed here. It arrives in the dump,
// derived at runtime from the engine's own _DOMAIN_GLOBALS, because a
// copy in the plugin goes stale the first time a chip is added and
// would then report a shadow as clean.

export interface InventoryEntry {
  id: string;
  type: string;
  inputs: string[];
}

export interface RegistryInventoryDump {
  /** vault name -> its snippets, the registry's own list_snippets() shape. */
  snippets: Record<string, InventoryEntry[]>;
  /** The registry's `_order` — the vault walk A4 resolution follows. */
  resolutionOrder: string[];
  /** The vault-name keys the registry holds, which is not necessarily
   *  the same list as the order (a mounted-but-unscanned vault shows up
   *  in one and not the other, which is the forge-tutorial question). */
  vaultKeys: string[];
  /** Every name the engine injects as a chip, from _DOMAIN_GLOBALS. */
  chipNames: string[];
  domains: string[];
}

export interface ShadowCandidate {
  basename: string;
  id: string;
  vault: string;
}

export interface VaultSummary {
  vault: string;
  count: number;
  ids: string[];
}

/** The shim key for a bare id: its last path segment, matching
 *  `bare_id.rsplit("/", 1)[-1]` in _build_snippet_shims. */
function basenameOf(id: string): string {
  return id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
}

/**
 * Snippets whose basename collides with an engine chip name.
 *
 * Order follows the vault walk, then id, so the reading is stable
 * between sessions and two dumps can be diffed.
 */
export function shimShadowCandidates(dump: RegistryInventoryDump): ShadowCandidate[] {
  const chips = new Set(dump.chipNames);
  const hits: ShadowCandidate[] = [];
  for (const vault of orderedVaultNames(dump)) {
    for (const entry of dump.snippets[vault] ?? []) {
      const basename = basenameOf(entry.id);
      if (chips.has(basename)) hits.push({ basename, id: entry.id, vault });
    }
  }
  hits.sort((a, b) => a.basename.localeCompare(b.basename) || a.id.localeCompare(b.id));
  return hits;
}

/** Every vault the registry knows, resolution order first, then any
 *  key the order does not mention. A vault present in one and not the
 *  other is a finding, so neither list is allowed to hide the other. */
function orderedVaultNames(dump: RegistryInventoryDump): string[] {
  const names: string[] = [];
  for (const v of dump.resolutionOrder) if (!names.includes(v)) names.push(v);
  for (const v of dump.vaultKeys) if (!names.includes(v)) names.push(v);
  for (const v of Object.keys(dump.snippets)) if (!names.includes(v)) names.push(v);
  return names;
}

/** Per-vault counts + the full id list. A vault with no entries is
 *  reported AS zero rather than omitted (L32): "this vault is mounted
 *  and empty" and "this vault does not exist" are different findings
 *  and must not render identically. */
export function summarizeVaults(dump: RegistryInventoryDump): VaultSummary[] {
  return orderedVaultNames(dump).map(vault => {
    const ids = (dump.snippets[vault] ?? []).map(e => e.id).sort();
    return { vault, count: ids.length, ids };
  });
}

/** The panel text. Plain lines — the Forge panel renders this as a
 *  message, and a reading that has to be un-formatted to be pasted into
 *  a report is a reading nobody pastes. */
export function formatRegistryInventory(dump: RegistryInventoryDump): string {
  const vaults = summarizeVaults(dump);
  const total = vaults.reduce((n, v) => n + v.count, 0);
  const shadows = shimShadowCandidates(dump);

  const lines: string[] = [];
  lines.push('Forge registry inventory (debug)');
  lines.push('');
  lines.push(`${total} snippets across ${vaults.length} vaults.`);
  lines.push(`Resolution order: ${dump.resolutionOrder.join(' → ') || '(none)'}`);
  lines.push(`Vault keys: ${dump.vaultKeys.join(', ') || '(none)'}`);
  lines.push(`Active domains: ${dump.domains.join(', ') || '(none)'}`);
  lines.push(`Engine chip names: ${dump.chipNames.length}`);
  lines.push('');

  // First, because it is the open question.
  lines.push('SHIM SHADOW candidates — snippet basenames that collide with an engine chip:');
  if (shadows.length === 0) {
    lines.push('  none — no snippet basename matches any engine chip name.');
  } else {
    for (const hit of shadows) {
      lines.push(`  ${hit.basename}  ←  ${hit.id}  (vault: ${hit.vault})`);
    }
    lines.push('');
    lines.push('  Each of these installs a context.compute() shim under the chip\'s own');
    lines.push('  name. Shims are spread after the domain globals, so the snippet wins');
    lines.push('  and a bare call in emitted Python reaches it instead of the chip.');
  }
  lines.push('');

  for (const v of vaults) {
    lines.push(`${v.vault} — ${v.count} snippet${v.count === 1 ? '' : 's'}`);
    if (v.count === 0) {
      lines.push('  (empty — the registry holds this vault name with no entries)');
      continue;
    }
    for (const id of v.ids) lines.push(`  ${id}`);
  }

  return lines.join('\n');
}
