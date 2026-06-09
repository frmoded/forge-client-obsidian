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

/** On fold-change event: decide whether the user just performed a
 *  mutex-triggering gesture and, if so, produce the new desired state.
 *
 *  v0.2.87 symmetric mutex: the invariant is "exactly one facet
 *  visible at any time." Two gestures trigger the flip:
 *
 *  1. **Expand of the inactive facet** (v0.2.83 semantics):
 *     english mode + user expands # Python → flip to python + fold
 *     # English. Symmetric for python mode + expand # English.
 *
 *  2. **Collapse of the active facet** (v0.2.87 spec extension):
 *     english mode + user collapses # English → flip to python +
 *     EXPAND # Python. Driver decision: both-folded is an invalid
 *     state; the collapse gesture must take the user to the OTHER
 *     facet rather than leave them with nothing visible.
 *
 *  Both gestures produce the same post-mutex state for a given mode
 *  transition — the only difference is which heading the user
 *  clicked. The pure-core handles both shapes uniformly.
 *
 *  Rules:
 *   - If a heading isn't present, no flip is possible — return the
 *     newFold unchanged + newEditMode=null. (Slot-free snippets
 *     have only # English; the mutex needs both headings to have
 *     anywhere to flip TO.)
 *   - Idempotent: if newFold already matches the existing edit_mode's
 *     expected state, no-op (avoid re-write loops).
 *   - "Same-mode expand" (e.g. python mode + user expands # Python
 *     that's already unfolded) is a no-op. */
export function decideOnFoldChange(
  prevFold: FoldState,
  newFold: FoldState,
  currentEditMode: 'english' | 'python',
  headings: SnippetHeadings,
): DesiredState {
  const bothHeadingsPresent =
    headings.englishLine !== null && headings.pythonLine !== null;

  // No flip possible without both headings — the gestural mutex
  // requires a partner facet to switch to.
  if (!bothHeadingsPresent) {
    return {
      englishFolded: newFold.englishFolded,
      pythonFolded: newFold.pythonFolded,
      newEditMode: null,
    };
  }

  // Detect both shapes of gesture on each heading.
  const englishExpanded = prevFold.englishFolded && !newFold.englishFolded;
  const pythonExpanded = prevFold.pythonFolded && !newFold.pythonFolded;
  const englishCollapsed = !prevFold.englishFolded && newFold.englishFolded;
  const pythonCollapsed = !prevFold.pythonFolded && newFold.pythonFolded;

  // Shape 1 — expand inactive: user expanded # Python while in
  // english mode (the original v0.2.83 trigger).
  if (pythonExpanded && currentEditMode === 'english') {
    return {
      englishFolded: true,
      pythonFolded: false,
      newEditMode: 'python',
    };
  }
  if (englishExpanded && currentEditMode === 'python') {
    return {
      englishFolded: false,
      pythonFolded: true,
      newEditMode: 'english',
    };
  }

  // Shape 2 — collapse active (v0.2.87 spec): user collapsed
  // # English while in english mode → flip to python + expand it.
  if (englishCollapsed && currentEditMode === 'english') {
    return {
      englishFolded: true,
      pythonFolded: false,
      newEditMode: 'python',
    };
  }
  if (pythonCollapsed && currentEditMode === 'python') {
    return {
      englishFolded: false,
      pythonFolded: true,
      newEditMode: 'english',
    };
  }

  // Any other transition: no mutex flip. Covers collapse of inactive
  // (no-op; nothing visible to lose) + same-mode expands (no-op).
  return {
    englishFolded: newFold.englishFolded,
    pythonFolded: newFold.pythonFolded,
    newEditMode: null,
  };
}
