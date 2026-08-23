// Drain 2026-08-23-2100 — the fresh-note Description placeholder.
//
// The blank shell (three empty headings) is the cohort's first
// authoring moment and it teaches nothing. This is the prose that
// replaces the empty Description section: it says what to write AND
// prompts naming inputs in plain English, because /generate turns
// Description-named inputs into typed `Input` declarations as of
// forge-transpile 0.2.30 (drain 2026-08-23-2000).
//
// NO concrete `Input` line goes in the template — adjudicated
// 2026-08-23. A placeholder declaration lies about the note's
// interface, and under the all-or-nothing rule a leftover placeholder
// suppresses free-variable promotion of the real variables the cohort
// writes next. The template points at the door; the generators walk
// through it.
//
// ONE DEFINITION. The plugin's `actionTemplate`, the Pyodide
// generate-inventory guard, and forge-mcp's `create_note_shell` all
// resolve to this string:
//   - `modal-templates-core.ts` imports it directly.
//   - `pyodide-host.ts` interpolates it into the embedded Python as a
//     JSON literal, so the Python constant cannot drift from this one.
//   - forge-mcp defines its own copy and pins it against THIS FILE
//     with a drift test (separate repo, no import path).

/** The authoring hint seeded into a fresh note's `# Description`.
 *
 *  Kept to three lines and free of backticks — it is interpolated into
 *  the JS template literal that carries `pyodide-host.ts`'s embedded
 *  Python, where a backtick would terminate the literal mid-Python
 *  (the trap this repo has hit twice; see cc-prompt-queue.md). */
export const DESCRIPTION_PLACEHOLDER = [
  'Describe what this note should do, in plain English.',
  'Name any inputs it takes and what they mean — e.g. "...multiplied by an input scale (a number, default 1)".',
  'Forge turns this into a runnable Recipe with typed inputs.',
].join('\n');

/** True when a note's Description body is the untouched placeholder.
 *
 *  Exact match after trimming, deliberately. The moment the cohort
 *  edits a single word the note carries real intent and this returns
 *  false — which is the behaviour we want, and it needs no marker
 *  syntax polluting the visible prose.
 *
 *  Callers use this to decide whether a Description is CONTENT or
 *  INSTRUCTIONS-TO-THE-AUTHOR. Sending the hint to /generate would ask
 *  the model to write a Recipe for the sentence "Describe what this
 *  note should do" — the same class of defect as v0.2.329's
 *  YAML-title-shadows-body bug, where /generate was asked to implement
 *  a note's title. */
export function isDescriptionPlaceholder(description: string): boolean {
  return description.trim() === DESCRIPTION_PLACEHOLDER.trim();
}
