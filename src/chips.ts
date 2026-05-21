// Obsidian-coupled chip reader. Pure parse + merge live in
// chips-core.ts; this module wires them to the vault adapter.

import { App, parseYaml } from 'obsidian';
import { extractDataBody } from './data-snippet';
import {
  Chip,
  ChipPaletteGroup,
  ChipsParseError,
  parseChipsBody,
  validateChipsList,
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
    const parsed = parseChipsFile(raw, src.filePath);
    if (isParseError(parsed)) {
      console.warn(
        `Forge chips: ${src.filePath} parse error: ${parsed.error}`);
      continue;
    }
    collected.push({ sourceName: src.sourceName, chips: parsed.chips });
  }
  return mergeChipSources(collected);
}

/** Decode a chips-file's body via its frontmatter `content_type`,
 *  then validate the resulting structure via the pure core. YAML and
 *  JSON are both supported — choose whichever reads better when
 *  authoring `_chips.md`. Unknown content_type falls back to a JSON
 *  parse attempt (back-compat with the v1 single-chip shape that
 *  predates content_type being a meaningful hint here). */
function parseChipsFile(
  raw: string,
  filePath: string,
): { chips: Chip[] } | ChipsParseError {
  const body = extractDataBody(raw);
  const contentType = (readFrontmatterField(raw, 'content_type') || '').toLowerCase();
  if (contentType === 'yaml') {
    let parsed: unknown;
    try {
      parsed = parseYaml(body);
    } catch (e) {
      return { error: `chips YAML parse failed: ${(e as Error).message}` };
    }
    return validateChipsList(parsed);
  }
  // JSON path (explicit content_type: json, or unspecified — same
  // shape as the v1 single-chip _chips.md).
  return parseChipsBody(body);
}

/** Minimal scalar-only frontmatter probe — avoids dragging in a YAML
 *  dependency just to read one field. Used here to discover
 *  content_type before deciding which body decoder to run. */
function readFrontmatterField(raw: string, key: string): string | null {
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 4);
  if (end === -1) return null;
  const fm = raw.slice(0, end);
  const re = new RegExp(`^${key}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, 'm');
  const m = fm.match(re);
  return m ? m[1].trim() : null;
}

function isParseError(
  x: { chips: Chip[] } | ChipsParseError,
): x is ChipsParseError {
  return (x as ChipsParseError).error !== undefined;
}
