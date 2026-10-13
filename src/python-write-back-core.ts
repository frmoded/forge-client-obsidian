// Drain 2026-10-13-2100 §2 — the body of `writeSourcePythonBack`'s `vault.process` callback, extracted so "does Run rewrite this note?"
// is answerable headless, by the SAME function the plugin calls (it was inline in main.ts, reachable only inside Obsidian).
//
// What it does, unchanged from the inline version: write the `# Python` section and the `english_hash` decision
// (`writePythonAndEnglishHash`), persist any just-resolved slots (`slots_cache`), and — only when the result carries a `# Python`
// section — stamp `python_hash` plus the two lineage fields:
//   python_derived_from_source_hash = the ROOT source's hash (Description for 'description'/'synced', Recipe for 'recipe',
//                                     none for 'python': Python driving itself derives from nothing)
//   python_derived_from_recipe_hash = the current recipe_hash (the immediate parent), skipped for 'python'
//
// PURE: no Obsidian, no I/O, no hashing (SubtleCrypto is async; the caller hashes `python` and passes `pythonHash`).
import { writePythonAndEnglishHash } from './python-cache-writer-core.ts';
import { writeSlotsSection } from './slots-section-writer-core.ts';
import { extractPythonSection, getFrontmatterField, setFrontmatterField } from './v2-note-core.ts';
import type { SourceLayer } from './facet-hash-core.ts';

export interface PythonWriteBackInput {
  /** The just-resolved Python (the engine's transpile, or the cached body). */
  python: string;
  /** computeFacetHash(python), computed by the caller. */
  pythonHash: string;
  /** englishHashForStamp(...) — null means "this note has no English facet": write none, heal the empty-SHA remnant. */
  englishHash: string | null;
  /** whichLayerIsSource(body) read BEFORE the write; decides which hash roots the lineage. */
  sourceLayer: SourceLayer | null;
  /** Slots the second pass resolved, persisted so the next run is a cache hit; null when none were resolved. */
  resolvedSlots: Record<string, string> | null;
}

export function applyPythonWriteBack(content: string, input: PythonWriteBackInput): string {
  let next = writePythonAndEnglishHash(content, {
    pythonCode: input.python,
    englishHash: input.englishHash,
    stripStaleSlots: false,
  });
  // persist, don't discard (drain 2026-08-24-2350): the resolution paid for here is used once and thrown away otherwise.
  if (input.resolvedSlots !== null) {
    next = writeSlotsSection(next, input.resolvedSlots);
  }
  // Only stamp python_hash if the resulting body actually has a # Python section (V2 visible-mode): a V1 note whose # Python is
  // written by the V1 cache path does not participate in the 3-layer state machine.
  if (extractPythonSection(next) !== null) {
    next = setFrontmatterField(next, 'python_hash', input.pythonHash);
    const rh = getFrontmatterField(next, 'recipe_hash');
    const dh = getFrontmatterField(next, 'description_hash');
    let sourceHash: string | null = null;
    if (input.sourceLayer === 'description' || input.sourceLayer === 'synced') {
      sourceHash = typeof dh === 'string' ? dh : null;   // 'synced' is treated as Description (§3.1 convention)
    } else if (input.sourceLayer === 'recipe') {
      sourceHash = typeof rh === 'string' ? rh : null;
    }
    // 'python' → no stamp: Python driving itself is terminal.
    if (sourceHash !== null) {
      next = setFrontmatterField(next, 'python_derived_from_source_hash', sourceHash);
    }
    // v11.6 hexa-state: Python's parent is the Recipe — stamp it whenever we write Python back, except when Python is the source
    // (no derivation happened).
    if (input.sourceLayer !== 'python' && typeof rh === 'string') {
      next = setFrontmatterField(next, 'python_derived_from_recipe_hash', rh);
    }
  }
  return next;
}
