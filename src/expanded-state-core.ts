// v0.2.138 — pure-core: persist the `forge-expanded` class state
// per snippet path across file switches AND Obsidian restarts.
//
// Carry-forward from v0.2.119 (Cmd-P toggle introduced) + v0.2.122
// (granular toggle queued, deferred to v0339). The current UI ships
// ONE `forge-expanded` class that controls BOTH frontmatter AND
// dependencies visibility — so v0.2.138's state is binary per path:
// `{expanded: boolean}`. When v0339's granular split lands, this
// pure-core's shape extends to `{frontmatter: boolean, dependencies:
// boolean}` without breaking the existing keys (forward-compatible
// migration: missing fields default to `false`).
//
// Storage: localStorage with key prefix `forge:expanded:`. Per the
// v0338 prompt §2.2 defensive contract:
//   - localStorage unavailable → graceful default-false; writes
//     are no-ops.
//   - Malformed JSON → graceful default-false.
//   - Path with special chars → encodeURIComponent for the key
//     suffix (defensive against `:` or `/` collisions in the
//     storage key namespace).
//
// Future migration path (V2): if sync across devices becomes a
// need, swap the localStorage backend for a vault-local config
// file. The pure-core's interface is storage-agnostic; only the
// `storage` injection changes.

/** v0.2.139 — granular per-section state. Legacy `expanded` field
 *  is preserved on read as a back-compat shim: an old `{expanded:
 *  true}` stored under v0.2.138 reads back as `{frontmatter: true,
 *  dependencies: true, expanded: true}` so existing user choices
 *  survive the schema bump. */
export interface ExpandedState {
  /** v0.2.139 — frontmatter visible? Independent toggle. */
  frontmatter: boolean;
  /** v0.2.139 — # Dependencies visible? Independent toggle. */
  dependencies: boolean;
  /** v0.2.138 — legacy "show both" shorthand. Maintained on writes
   *  to preserve back-compat: `expanded` is set to `frontmatter &&
   *  dependencies` so v0.2.138-aware readers see the same truth. */
  expanded: boolean;
}

/** Build a fresh, fully-collapsed state. */
function emptyState(): ExpandedState {
  return { frontmatter: false, dependencies: false, expanded: false };
}

export interface ExpandedStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_PREFIX = 'forge:expanded:';

/** Build the localStorage key for a given snippet path. URL-encoded
 *  so paths with `:` (Windows drive) or other unusual chars don't
 *  collide with sibling keys. */
export function expandedStorageKey(snippetPath: string): string {
  return STORAGE_PREFIX + encodeURIComponent(snippetPath);
}

/** Normalize a partial state into a full ExpandedState. Used both
 *  on read (legacy `{expanded: true}` → both fields true) and on
 *  write (ensure expanded reflects both fields, so v0.2.138-aware
 *  readers see the correct truth). */
function normalizeState(partial: Partial<ExpandedState>): ExpandedState {
  // Backward-compat read: legacy v0.2.138 storage shape was
  // `{expanded: bool}` with no granular fields. Map that to both
  // sections expanded.
  const legacyExpanded = partial.expanded === true;
  const frontmatter = partial.frontmatter === true || legacyExpanded;
  const dependencies = partial.dependencies === true || legacyExpanded;
  return {
    frontmatter,
    dependencies,
    // `expanded` (shorthand) is true iff BOTH granular fields are true.
    expanded: frontmatter && dependencies,
  };
}

/** Read the persisted expanded state for a snippet. Returns a
 *  fully-collapsed `{frontmatter: false, dependencies: false,
 *  expanded: false}` on missing/malformed/storage-unavailable.
 *
 *  Backward-compat: legacy v0.2.138 storage written as
 *  `{expanded: bool}` is normalized to set both granular fields
 *  to the legacy value (preserves user choice across the schema
 *  bump). */
export function readExpandedState(
  storage: ExpandedStateStorage | null | undefined,
  snippetPath: string,
): ExpandedState {
  if (!storage) return emptyState();
  let raw: string | null = null;
  try {
    raw = storage.getItem(expandedStorageKey(snippetPath));
  } catch {
    // Storage unavailable / quota issue / SecurityError. Graceful
    // default.
    return emptyState();
  }
  if (raw === null) return emptyState();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const r = parsed as Record<string, unknown>;
      return normalizeState({
        frontmatter: r.frontmatter === true,
        dependencies: r.dependencies === true,
        expanded: r.expanded === true,
      });
    }
  } catch {
    // Malformed JSON. Default.
  }
  return emptyState();
}

/** Persist the expanded state for a snippet. No-op if storage is
 *  unavailable. */
export function writeExpandedState(
  storage: ExpandedStateStorage | null | undefined,
  snippetPath: string,
  state: Partial<ExpandedState>,
): void {
  if (!storage) return;
  const normalized = normalizeState(state);
  try {
    storage.setItem(
      expandedStorageKey(snippetPath),
      JSON.stringify({
        frontmatter: normalized.frontmatter,
        dependencies: normalized.dependencies,
        expanded: normalized.expanded,
      }),
    );
  } catch {
    // Storage unavailable / quota issue. No-op.
  }
}

/** v0.2.138 — flip the "both sections" shorthand. Sets BOTH
 *  granular fields to !(both currently visible).
 *
 *  Semantics per v0339 §2.2 Toggle both: if either section is
 *  hidden, show both; if both are visible, hide both. */
export function toggleExpanded(
  storage: ExpandedStateStorage | null | undefined,
  snippetPath: string,
): ExpandedState {
  const current = readExpandedState(storage, snippetPath);
  const bothVisible = current.frontmatter && current.dependencies;
  const next: ExpandedState = normalizeState({
    frontmatter: !bothVisible,
    dependencies: !bothVisible,
  });
  writeExpandedState(storage, snippetPath, next);
  return next;
}

/** v0.2.139 — flip ONLY the frontmatter section. Dependencies
 *  state is preserved. */
export function toggleFrontmatter(
  storage: ExpandedStateStorage | null | undefined,
  snippetPath: string,
): ExpandedState {
  const current = readExpandedState(storage, snippetPath);
  const next = normalizeState({
    frontmatter: !current.frontmatter,
    dependencies: current.dependencies,
  });
  writeExpandedState(storage, snippetPath, next);
  return next;
}

/** v0.2.139 — flip ONLY the dependencies section. Frontmatter
 *  state is preserved. */
export function toggleDependencies(
  storage: ExpandedStateStorage | null | undefined,
  snippetPath: string,
): ExpandedState {
  const current = readExpandedState(storage, snippetPath);
  const next = normalizeState({
    frontmatter: current.frontmatter,
    dependencies: !current.dependencies,
  });
  writeExpandedState(storage, snippetPath, next);
  return next;
}
