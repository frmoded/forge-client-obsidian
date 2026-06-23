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

export interface ExpandedState {
  expanded: boolean;
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

/** Read the persisted expanded state for a snippet. Returns
 *  `{expanded: false}` on missing/malformed/storage-unavailable. */
export function readExpandedState(
  storage: ExpandedStateStorage | null | undefined,
  snippetPath: string,
): ExpandedState {
  if (!storage) return { expanded: false };
  let raw: string | null = null;
  try {
    raw = storage.getItem(expandedStorageKey(snippetPath));
  } catch {
    // Storage unavailable / quota issue / SecurityError. Graceful
    // default.
    return { expanded: false };
  }
  if (raw === null) return { expanded: false };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const r = parsed as Record<string, unknown>;
      return { expanded: r.expanded === true };
    }
  } catch {
    // Malformed JSON. Default.
  }
  return { expanded: false };
}

/** Persist the expanded state for a snippet. No-op if storage is
 *  unavailable. */
export function writeExpandedState(
  storage: ExpandedStateStorage | null | undefined,
  snippetPath: string,
  state: ExpandedState,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      expandedStorageKey(snippetPath),
      JSON.stringify({ expanded: state.expanded }),
    );
  } catch {
    // Storage unavailable / quota issue. No-op.
  }
}

/** Read, flip the `expanded` field, write back, return the new
 *  state. Used by the Cmd-P toggle command so the keyboard toggle
 *  persists. */
export function toggleExpanded(
  storage: ExpandedStateStorage | null | undefined,
  snippetPath: string,
): ExpandedState {
  const current = readExpandedState(storage, snippetPath);
  const next: ExpandedState = { expanded: !current.expanded };
  writeExpandedState(storage, snippetPath, next);
  return next;
}
