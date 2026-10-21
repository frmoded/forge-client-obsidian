// Drain 2026-10-21-1200 — the guard that keeps the missing-`# Python` gap from silently reopening, as a pure function (the test reads the bundled vaults).
//
// Every `type: action` note in a bundled vault either HAS a `# Python` section or is named, with a reason, in scripts/action-notes-without-python.txt; and every entry
// on that list must really lack one (a stale entry fails). It parses the real files with the plugin's own readers (src/v2-note-core.ts), not a regex of its own, and it
// throws when it was handed nothing: "found no gap" and "looked at nothing" must never look the same.
import { extractPythonSection, getFrontmatterField } from '../src/v2-note-core.ts';

/** `Map<rel, reason>` from the allow-list text. A line is `<vault>/<path>.md | <reason>`; `#` lines and blanks are skipped; a line without a reason THROWS. */
export function parseAllowList(text) {
  const out = new Map();
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const bar = line.indexOf(' | ');
    const rel = bar < 0 ? line : line.slice(0, bar).trim();
    const reason = bar < 0 ? '' : line.slice(bar + 3).trim();
    if (reason === '') throw new Error(`action-notes-without-python.txt line ${i + 1}: "${rel}" has no reason (format: <vault>/<path>.md | <reason>)`);
    if (out.has(rel)) throw new Error(`action-notes-without-python.txt line ${i + 1}: "${rel}" is listed twice`);
    out.set(rel, reason);
  }
  return out;
}

/** `files`: `[{ rel, text }]`, `rel` = `<vault>/<path inside the vault>.md`. Returns the counts and the three kinds of problem. Throws on an empty input. */
export function pythonGuard(files, allow) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('pythonGuard: no notes were given — it looked at nothing, so it cannot say there is no gap');
  const action = [];
  const hasPython = new Set();
  for (const f of files) {
    if (getFrontmatterField(f.text, 'type') !== 'action') continue;
    action.push(f.rel);
    if (extractPythonSection(f.text) !== null) hasPython.add(f.rel);
  }
  const without = action.filter((r) => !hasPython.has(r));
  return {
    actionCount: action.length,
    withoutPython: without.length,
    /** an action note with no # Python that is not on the allow-list: the gap reopened */
    missingNotAllowed: without.filter((r) => !allow.has(r)).sort(),
    /** an allow-list entry whose note has a # Python now, or is not an action note in the bundle at all */
    staleEntries: [...allow.keys()].filter((r) => !action.includes(r) || hasPython.has(r)).sort(),
  };
}
