// v0.2.83 (Q-renumbered from prompt's v0.2.80) — pure-core decision
// logic for the facet-mutex gestural model. Given a snippet's current
// fold state + edit_mode, decide the desired fold state and whether
// edit_mode should flip in frontmatter.
//
// Pure functions — no Obsidian, no CodeMirror, no I/O. The
// controller in main.ts is the integration layer that subscribes to
// CM6 fold-effect transactions and applies these decisions.
//
// Semantics (per the v0.2.80 prompt §3.1):
//   - On file open: fold the non-source heading; don't change edit_mode.
//     If a heading is missing (slot-free canonical without # Python),
//     gracefully skip the fold.
//   - On fold-change event: only the EXPAND gesture on the currently-
//     folded heading triggers a mutex flip. Collapse gestures are
//     idempotent no-ops.

/** 1-based line numbers of the # English and # Python headings.
 *  `null` when the heading isn't present in the body. */
export interface SnippetHeadings {
  englishLine: number | null;
  pythonLine: number | null;
}

/** Current fold state of the two headings. Both true = both headings
 *  collapsed (typical for "user just wants whitespace"). */
export interface FoldState {
  englishFolded: boolean;
  pythonFolded: boolean;
}

/** What the controller should do. `newEditMode` of `null` means
 *  "leave frontmatter alone." */
export interface DesiredState {
  englishFolded: boolean;
  pythonFolded: boolean;
  newEditMode: 'english' | 'python' | null;
}

/** On file open: decide which heading should be folded so the
 *  non-source facet stays out of the user's way. Never writes
 *  edit_mode (caller's frontmatter is the source of truth on open).
 *
 *  Rules:
 *   - both headings present + editMode='english': fold # Python only.
 *   - both headings present + editMode='python':  fold # English only.
 *   - only one heading present: don't fold anything (graceful — there's
 *     nothing to "hide", and folding the sole heading would obscure
 *     all the content).
 *   - neither heading present: don't fold anything.
 */
export function decideInitialState(
  editMode: 'english' | 'python',
  headings: SnippetHeadings,
): DesiredState {
  const hasEnglish = headings.englishLine !== null;
  const hasPython = headings.pythonLine !== null;
  const bothPresent = hasEnglish && hasPython;

  if (!bothPresent) {
    return { englishFolded: false, pythonFolded: false, newEditMode: null };
  }
  if (editMode === 'english') {
    return { englishFolded: false, pythonFolded: true, newEditMode: null };
  }
  // editMode === 'python'
  return { englishFolded: true, pythonFolded: false, newEditMode: null };
}

/** On fold-change event: decide whether the user just performed an
 *  EXPAND gesture on the currently-folded heading (the gesture that
 *  signals a mode flip), and if so produce the new desired state.
 *
 *  Rules:
 *   - Only fires the flip when the user EXPANDED the heading that
 *     was previously folded under the current edit_mode. e.g.
 *     english mode → # Python was folded → user expands # Python →
 *     flip to python mode + fold # English.
 *   - Collapse gestures (user shrinks the active facet, leaving
 *     both folded) are no-ops. Don't flip edit_mode just because
 *     the user wants less visual noise.
 *   - If the edit_mode-implied fold state already matches the new
 *     state, no-op (idempotent — avoid re-write loops).
 *   - If a heading isn't present, no flip is possible — return the
 *     newFold unchanged + newEditMode=null.
 */
export function decideOnFoldChange(
  prevFold: FoldState,
  newFold: FoldState,
  currentEditMode: 'english' | 'python',
  headings: SnippetHeadings,
): DesiredState {
  const bothHeadingsPresent =
    headings.englishLine !== null && headings.pythonLine !== null;

  // No flip possible without both headings — the gestural mutex
  // requires a partner to fold.
  if (!bothHeadingsPresent) {
    return {
      englishFolded: newFold.englishFolded,
      pythonFolded: newFold.pythonFolded,
      newEditMode: null,
    };
  }

  // Detect the EXPAND gesture on each heading. A heading was
  // expanded when it was folded before AND isn't folded now.
  const englishExpanded = prevFold.englishFolded && !newFold.englishFolded;
  const pythonExpanded = prevFold.pythonFolded && !newFold.pythonFolded;

  // Mutex flip: user expanded # Python while in english mode (the
  // gesture that says "I want python mode now").
  if (pythonExpanded && currentEditMode === 'english') {
    return {
      englishFolded: true,
      pythonFolded: false,
      newEditMode: 'python',
    };
  }
  // Symmetric: user expanded # English while in python mode.
  if (englishExpanded && currentEditMode === 'python') {
    return {
      englishFolded: false,
      pythonFolded: true,
      newEditMode: 'english',
    };
  }

  // No mutex-triggering expand. Leave the new fold state as-is,
  // no frontmatter flip. Covers collapse gestures + same-mode
  // expands (which can't happen if initial state matched mode, but
  // defensive).
  return {
    englishFolded: newFold.englishFolded,
    pythonFolded: newFold.pythonFolded,
    newEditMode: null,
  };
}
