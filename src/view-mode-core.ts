// v0.2.143 — pure-core: per-snippet score view-mode persistence.
//
// Mirrors v0.2.138 expanded-state-core's localStorage-backed
// per-snippet state shape. The view mode lives per snippet path:
// each snippet remembers whether the user last viewed it in
// multi-staff or kit notation.
//
// Storage: localStorage with key prefix `forge:scoreView:`. Per the
// v0338 § defensive contract, all paths are graceful:
//   - localStorage unavailable → default ('multi_staff') / no-op
//     on writes.
//   - Malformed JSON → default.
//   - Unknown string value (e.g. legacy migration) → default.
//   - Path with special chars → encodeURIComponent for the key.
//
// Default is `'multi_staff'`: zero regression for existing snippets.
// Users opt INTO kit view via the toolbar button. Per v0.2.143 §1.2
// driver decision.

export type ScoreViewMode = 'multi_staff' | 'kit';

export interface ScoreViewModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_PREFIX = 'forge:scoreView:';

const VALID_MODES: ReadonlyArray<ScoreViewMode> = ['multi_staff', 'kit'];

/** Build the localStorage key for a given snippet path. URL-encoded
 *  to defend against paths with `:` (Windows drives) or `?` / `#`
 *  that could collide with sibling keys in the global storage
 *  namespace. */
export function scoreViewModeKey(snippetPath: string): string {
  return STORAGE_PREFIX + encodeURIComponent(snippetPath);
}

function isValidMode(s: unknown): s is ScoreViewMode {
  return typeof s === 'string'
    && (VALID_MODES as readonly string[]).indexOf(s) !== -1;
}

/** Read the persisted score view mode for a snippet. Returns the
 *  caller's `defaultMode` (or `'multi_staff'` if omitted) on any
 *  missing/malformed/disabled-storage path. */
export function readScoreViewMode(
  storage: ScoreViewModeStorage | null | undefined,
  snippetPath: string,
  defaultMode: ScoreViewMode = 'multi_staff',
): ScoreViewMode {
  if (!storage) return defaultMode;
  let raw: string | null = null;
  try {
    raw = storage.getItem(scoreViewModeKey(snippetPath));
  } catch {
    return defaultMode;
  }
  if (raw === null) return defaultMode;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const r = parsed as Record<string, unknown>;
      if (isValidMode(r.mode)) {
        return r.mode;
      }
    }
  } catch {
    // Malformed JSON. Default.
  }
  return defaultMode;
}

/** Persist the view mode for a snippet. No-op when storage is null
 *  or throws (QuotaExceededError, SecurityError). */
export function writeScoreViewMode(
  storage: ScoreViewModeStorage | null | undefined,
  snippetPath: string,
  mode: ScoreViewMode,
): void {
  if (!storage) return;
  if (!isValidMode(mode)) return;
  try {
    storage.setItem(
      scoreViewModeKey(snippetPath),
      JSON.stringify({ mode }),
    );
  } catch {
    // No-op.
  }
}

/** v0.2.226 — path-based heuristic for the initial render mode.
 *  Percussion-domain snippets (path includes `/percussion/`,
 *  `/percussion_lab/`, or a filename starting with `drum_`) default
 *  to `'kit'` notation — drum-kit is more legible for percussion than
 *  a treble-staff with non-standard noteheads. Everything else
 *  defaults to `'multi_staff'`, preserving the v0.2.143 zero-regression
 *  baseline for non-percussion music (vocal, instrumental solo).
 *
 *  Mixed snippets (vocal + drum staves, like song.md) stay on
 *  multi-staff — the vocal line is the primary surface and drums are
 *  the accompaniment. Driver chose this in the §9 ambiguity callout. */
export function pickDefaultScoreViewMode(snippetPath: string): ScoreViewMode {
  const p = snippetPath.toLowerCase();
  // Path-segment match avoids matching `percussion` inside a sibling
  // filename like `percussion_notes.md` at vault root.
  if (p.includes('/percussion/') || p.includes('/percussion_lab/')) {
    return 'kit';
  }
  // Filename match for blues drum-* files (drum_chorus.md, etc.) +
  // forward-compat for any other domain that names drum-* snippets.
  const lastSlash = p.lastIndexOf('/');
  const basename = lastSlash === -1 ? p : p.slice(lastSlash + 1);
  if (basename.startsWith('drum_') || basename.startsWith('drums_')) {
    return 'kit';
  }
  return 'multi_staff';
}

/** Flip the score view mode between 'multi_staff' and 'kit'. Reads
 *  the current value, computes the toggle, writes back, returns the
 *  new mode. Used by the toolbar button's click handler. */
export function toggleScoreViewMode(
  storage: ScoreViewModeStorage | null | undefined,
  snippetPath: string,
): ScoreViewMode {
  const current = readScoreViewMode(storage, snippetPath);
  const next: ScoreViewMode = current === 'kit' ? 'multi_staff' : 'kit';
  writeScoreViewMode(storage, snippetPath, next);
  return next;
}
