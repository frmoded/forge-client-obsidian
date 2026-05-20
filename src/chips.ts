// Obsidian-coupled chip reader. Pure parse + merge live in
// chips-core.ts; this module wires them to the vault adapter.

import { App } from 'obsidian';
import { extractDataBody } from './data-snippet';
import {
  Chip,
  ChipPaletteGroup,
  ChipsParseError,
  parseChipsBody,
  mergeChipSources,
} from './chips-core';

const CHIPS_FILENAME = '_chips.md';

interface ChipSource {
  filePath: string;     // path relative to vault root
  sourceName: string;   // group header in the palette
}

/** Enumerate the canonical chip source paths for a vault: one at the
 *  vault root plus one under each declared-domain subdirectory
 *  (matches the installer's <vault>/<domain-vault>/ layout — e.g.
 *  forge-moda chips live at <vault>/forge-moda/_chips.md). `null`
 *  declared domains (back-compat: no `domains` field) is treated as
 *  "no installed-domain chip lookups" so we don't probe arbitrary
 *  subdirs. */
export function chipSourcesFor(
  vaultName: string,
  domains: string[] | null,
): ChipSource[] {
  const out: ChipSource[] = [
    { filePath: CHIPS_FILENAME, sourceName: vaultName },
  ];
  if (domains) {
    for (const d of domains) {
      out.push({
        filePath: `forge-${d}/${CHIPS_FILENAME}`,
        sourceName: `forge-${d}`,
      });
    }
  }
  return out;
}

/** Snapshot of vault state the chip loader needs. */
export interface ChipsManifest {
  vaultName: string;
  domains: string[] | null;
}

/** Read every present chip source for the active vault and produce
 *  the palette groups. Missing files are silent (a vault without
 *  `_chips.md` just contributes no group). Parse errors are logged
 *  and the offending source is skipped so the rest of the palette
 *  still renders. */
export async function loadChipsForActiveVault(
  app: App,
  manifest: ChipsManifest,
): Promise<ChipPaletteGroup[]> {
  const adapter = app.vault.adapter;
  const sources = chipSourcesFor(manifest.vaultName, manifest.domains);
  const collected: Array<{ sourceName: string; chips: Chip[] }> = [];

  for (const src of sources) {
    let raw: string;
    try {
      if (!(await adapter.exists(src.filePath))) continue;
      raw = await adapter.read(src.filePath);
    } catch (e) {
      console.warn(`Forge chips: read failed for ${src.filePath}`, e);
      continue;
    }
    const body = extractDataBody(raw);
    const parsed = parseChipsBody(body);
    if (isParseError(parsed)) {
      console.warn(
        `Forge chips: ${src.filePath} parse error: ${parsed.error}`);
      continue;
    }
    collected.push({ sourceName: src.sourceName, chips: parsed.chips });
  }
  return mergeChipSources(collected);
}

function isParseError(
  x: { chips: Chip[] } | ChipsParseError,
): x is ChipsParseError {
  return (x as ChipsParseError).error !== undefined;
}
