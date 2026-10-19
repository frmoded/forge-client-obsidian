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
import { getSourceFacet, type SourceLayer } from './facet-hash-core.ts';
import { effectiveSourceFacet } from './effective-source-core.ts';

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
    // Drain 2026-10-15-2100 §1 — a `synced` probe verdict is a FRESHNESS finding (no facet drifted), not a statement of which facet
    // the note derives from; that is the stored `source_facet`. Reading `synced` as Description re-rooted every hash-consistent
    // recipe-source note (every shipped one) at the Description hash on the first hammer click. One definition: effective-source-core.
    const stored = getSourceFacet(content, (b, k) => { const v = getFrontmatterField(b, k); return typeof v === 'string' ? v : null; });
    const layer = effectiveSourceFacet(input.sourceLayer, stored);
    let sourceHash: string | null = null;
    if (layer === 'description' || layer === 'synced') {
      sourceHash = typeof dh === 'string' ? dh : null;   // 'synced' with no stored source_facet stays Description (the §3.1 convention)
    } else if (layer === 'recipe') {
      sourceHash = typeof rh === 'string' ? rh : null;
    }
    // 'python' → no stamp: Python driving itself is terminal.
    if (sourceHash !== null) {
      next = setFrontmatterField(next, 'python_derived_from_source_hash', sourceHash);
    }
    // v11.6 hexa-state: Python's parent is the Recipe — stamp it whenever we write Python back, except when Python is the source
    // (no derivation happened).
    if (layer !== 'python' && typeof rh === 'string') {
      next = setFrontmatterField(next, 'python_derived_from_recipe_hash', rh);
    }
  }
  return next;
}

// ---- the write-nothing guard ------------------------------------------------------------------------------------------------

/** Frontmatter keys that only record WHERE a facet was derived from. A library note whose only difference is one of these is not
 *  worth a write: the content the cohort sees and runs is identical. */
const LINEAGE_KEY_RE = /^(recipe|python)_derived_from_(source|description|recipe)_hash\s*:/;

/** Drop the blank lines at the END of every ```python fence (those directly before the closing fence). Drain 2026-10-19-1800: the pre-Iteration-82
 *  writer fenced the engine's Python verbatim and baked such a line into every library note it ever wrote back; the current writer does not, so a library
 *  note carrying one differs from what the writer produces by that line alone — whitespace, not content. Only python fences, only at their end: a blank
 *  line inside the code, or at the end of any other fence, is not touched. */
function dropBlankLinesAtEndOfPythonFences(lines: string[]): string[] {
  const out: string[] = [];
  let inPython = false;
  for (const line of lines) {
    if (!inPython) {
      if (/^```python\s*$/.test(line)) inPython = true;
      out.push(line);
      continue;
    }
    if (/^```\s*$/.test(line)) {
      while (out.length > 0 && out[out.length - 1] === '') out.pop();           // (lines are already right-trimmed by cosmeticForm)
      inPython = false;
    }
    out.push(line);
  }
  return out;
}

/** The comparison form: lineage lines dropped, trailing whitespace trimmed per line, blank lines at the end of a python fence and at EOF dropped. */
function cosmeticForm(body: string): string {
  return dropBlankLinesAtEndOfPythonFences(
    body
      .split('\n')
      .filter((line) => !LINEAGE_KEY_RE.test(line))
      .map((line) => line.replace(/[ \t\r]+$/, '')),
  )
    .join('\n')
    .replace(/\n+$/, '');
}

export function differsOnlyCosmetically(before: string, after: string): boolean {
  return cosmeticForm(before) === cosmeticForm(after);
}

export interface PythonWritePlan {
  /** False → do not touch the file at all. */
  write: boolean;
  /** What the file should contain (the unchanged `content` when `write` is false). */
  next: string;
}

/**
 * Drain 2026-10-15-2100 §1 — decide whether a Run / transpile write-back should reach the disk.
 *
 * A shipped library note is a FIXED artifact: the cohort edits their own copy, not the library's, and a click that dirties the
 * library tree shows up as a git diff the author never made (CCQA, hello_world). So for a note under a bundled-library directory,
 * when the writer's result differs from what is on disk ONLY in derived-lineage stamps or trailing whitespace, nothing is written.
 * A real difference — different Python, a changed `python_hash`, an English hash — still persists (the transpile result IS the
 * product of the click); a cohort note (`library: false`) keeps its lineage maintenance.
 */
export function planPythonWriteBack(content: string, input: PythonWriteBackInput, opts: { library: boolean }): PythonWritePlan {
  const next = applyPythonWriteBack(content, input);
  if (next === content) return { write: false, next: content };
  if (opts.library && differsOnlyCosmetically(content, next)) return { write: false, next: content };
  return { write: true, next };
}
