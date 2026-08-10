// Drain 2026-08-10-1430 (Phase 4b plugin mount) — pure-core for the
// TS side of cross-vault [imports].
//
// WHY A TS PARSER EXISTS AT ALL: the canonical [imports] parser is
// forge.core.vault_imports.parse_imports (Python; also vendored in
// forge-mcp). The plugin cannot reuse it for the chip palette because
// the palette loads at layout-ready while Pyodide is LAZY-init — and
// the Pyodide copy also can't validate import targets that aren't
// mounted yet (chicken-and-egg). So this module implements the
// MINIMAL subset the plugin needs: the local-form declaration list,
// nothing else. No validation beyond shape (the engine's
// _scan_declared_imports re-validates everything inside MEMFS and is
// the authority); git-form entries are skipped exactly like the
// engine's Phase 2 posture. If the [imports] grammar grows, extend
// forge.core.vault_imports FIRST and mirror only what the plugin
// needs here.

import { deriveChip } from './chips-core.ts';
import type { Chip, ChipPaletteGroup, SnippetMetaForChips } from './chips-core.ts';

export interface LocalImportDecl {
  name: string;
  local: string;
}

// Mirrors forge.core.vault_imports.RESERVED_IMPORT_NAMES: `[[local:x]]`
// names the containing vault, so an import called `local` is ambiguous.
const RESERVED_IMPORT_NAMES = new Set(['local']);

/** Parse the `[imports]` table of a forge.toml, local-form entries
 *  only. Returns [] when the section is absent (the common case) or
 *  commented out. Tolerant by design — malformed lines are skipped,
 *  not fatal: the plugin degrades to no-imports and the engine-side
 *  parser surfaces the real diagnostics. */
export function parseLocalImports(tomlText: string): LocalImportDecl[] {
  const lines = tomlText.split('\n');
  const out: LocalImportDecl[] = [];
  let inImports = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('#')) continue;
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      inImports = header[1].trim() === 'imports';
      continue;
    }
    if (!inImports) continue;
    const entry = line.match(/^([A-Za-z0-9_-]+)\s*=\s*\{([^}]*)\}/);
    if (!entry) continue;
    const name = entry[1];
    if (RESERVED_IMPORT_NAMES.has(name)) continue;
    const local = entry[2].match(/\blocal\s*=\s*"([^"]+)"/);
    if (!local) continue; // git-only form — Phase 2 posture: skip
    out.push({ name, local: local[1] });
  }
  return out;
}

/** Resolve an import's `local` path against the vault's on-disk base
 *  path. Pure string normalization (no node:path) so it unit-tests
 *  headless; handles `..`/`.` segments; absolute `local` passes
 *  through normalized. */
export function resolveImportHostPath(
  vaultBasePath: string,
  local: string,
): string {
  const joined = local.startsWith('/') ? local : `${vaultBasePath}/${local}`;
  const parts: string[] = [];
  for (const seg of joined.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return '/' + parts.join('/');
}

/** Which files of an imported vault get mounted into MEMFS / walked
 *  for the palette. The engine's registry scan needs forge.toml (name
 *  + manifest) and .md notes; assets are dead weight for resolution.
 *  Dot-dirs (.obsidian/.git/.forge) and `.bak.` dirs mirror the
 *  engine scan's own exclusions. */
export function shouldMountImportFile(relPath: string): boolean {
  const segs = relPath.split('/');
  for (const seg of segs.slice(0, -1)) {
    if (seg.startsWith('.')) return false;
    if (/\.bak(\.|$)/.test(seg)) return false;
  }
  const base = segs[segs.length - 1];
  if (base.startsWith('.')) return false;
  return base === 'forge.toml' || base.endsWith('.md');
}

/** Build the chip-palette group for one imported vault from its
 *  synthesized snippet metas. Reuses deriveChip so S7 underscore /
 *  chip:false / snapshot exclusions behave identically to every
 *  other palette source. */
export function buildImportChipGroup(
  importName: string,
  metas: SnippetMetaForChips[],
): ChipPaletteGroup {
  const chips: Chip[] = [];
  for (const meta of metas) {
    const chip = deriveChip(meta);
    if (chip) chips.push(chip);
  }
  return { sourceName: `Import: ${importName}`, chips };
}
