// CW-chip-drift-diagnostic (2026-07-16): parse chip names from the
// bundled executor.py so the plugin can surface a chip-inventory
// summary at startup. Motivated by CW-f-shuffle-runtime-namerror,
// where a stale plugin install silently lacked `walking_bass_line`
// and the driver only learned by hitting a runtime NameError.
//
// Pure regex parser over the source text of `engine/forge/core/executor.py`
// (as inlined into BUNDLED_ASSETS at build time by
// scripts/inline-bundled-assets.mjs). No Pyodide dependency: fires
// instantly at plugin load, before any Recipe compute.

export interface ChipInventory {
  music: string[];
  moda: string[];
}

// Match the two dict literals in executor.py:
//   _FORGE_MUSIC_LIB_NAMES = { "name": _music_lib.name, ... }
//   _FORGE_MODA_LIB_NAMES = { "name": _moda_lib.name, ... }
// The dicts appear TWICE per domain — once at module-load (top-level
// try/except) and once inside the lazy-hydration retry (_domain_globals_for).
// We parse the FIRST occurrence; both dicts must stay in sync per the
// executor's own invariants (asserted by tests in the forge repo).
function extractChipNames(source: string, dictName: string): string[] {
  const dictStart = source.indexOf(`${dictName} = {`);
  if (dictStart < 0) return [];
  // Slice from the opening `{` to its matching `}`. The dict body is
  // a flat block of `"name": <expr>,` entries with no nested braces,
  // so a first-close-brace scan is sufficient.
  const braceStart = source.indexOf("{", dictStart);
  const braceEnd = source.indexOf("}", braceStart);
  if (braceStart < 0 || braceEnd < 0) return [];
  const body = source.slice(braceStart + 1, braceEnd);
  // Match `"chip_name":` — the key of each entry. Skip `# comment` lines.
  const chips: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("#") || line.length === 0) continue;
    const m = line.match(/^"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:/);
    if (m) chips.push(m[1]);
  }
  return chips;
}

export function parseChipInventory(executorSource: string): ChipInventory {
  return {
    music: extractChipNames(executorSource, "_FORGE_MUSIC_LIB_NAMES"),
    moda: extractChipNames(executorSource, "_FORGE_MODA_LIB_NAMES"),
  };
}

// Short one-line summary for the startup log. Example:
//   "music: 34 chips, moda: 15 chips"
export function formatChipInventorySummary(inv: ChipInventory): string {
  return `music: ${inv.music.length} chips, moda: ${inv.moda.length} chips`;
}

// Full multi-line dump for the Cmd-P command. Example:
//   music (34):
//     bar, voices, ... walking_bass_line, ...
//   moda (15):
//     temperature_to_speed, ...
export function formatChipInventoryFull(inv: ChipInventory): string {
  return [
    `music (${inv.music.length}):`,
    `  ${inv.music.join(", ")}`,
    `moda (${inv.moda.length}):`,
    `  ${inv.moda.join(", ")}`,
  ].join("\n");
}
