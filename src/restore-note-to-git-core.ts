// Drain 2026-08-27-0200 — "Restore to last commit", pure core.
//
// Motivation: the hammer re-roll is a designed feature ("possibly not
// deterministic" regeneration), so an in-app undo is its companion. The
// driver's v0.2.379 read-and-play left six notes with undesired drift and
// discarding it meant `git checkout --` in a terminal.
//
// SAFETY PROPERTY THIS MODULE EXISTS FOR: the vault-wide variant must
// never touch an untracked file. The driver keeps in-progress notes in the
// vault (this session's `test_random.md`), and losing one to a "restore"
// would be far worse than the drift being undone.
//
// Verified empirically against a real repo, not assumed (drain 2300's
// rule): `git checkout -- .` restores tracked modifications and deletions
// and leaves untracked files — including untracked files in untracked
// subdirectories — completely alone. Given an untracked path explicitly it
// exits non-zero with "pathspec … did not match any file(s) known to git"
// rather than doing anything. Both behaviours are pinned by tests here.
//
// Pure core: no `obsidian` import, runs under `node --test`.

/** One entry of `git status --short`. */
export interface GitStatusEntry {
  /** Two-character status code, e.g. ' M', 'M ', '??', ' D'. */
  code: string;
  path: string;
}

/** Parse `git status --short` output.
 *
 *  Renames (`R  old -> new`) report the NEW path: that is the file
 *  present in the working tree and therefore the one a restore acts on. */
export function parseGitStatusShort(raw: string): GitStatusEntry[] {
  const out: GitStatusEntry[] = [];
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    const code = line.slice(0, 2);
    let path = line.slice(3).trim();
    const arrow = path.indexOf(' -> ');
    if (arrow !== -1) path = path.slice(arrow + 4);
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
    out.push({ code, path });
  }
  return out;
}

/** True when git considers this entry untracked. */
export function isUntracked(entry: GitStatusEntry): boolean {
  return entry.code === '??';
}

/** The paths a restore may act on: tracked, and changed in some way.
 *
 *  Untracked entries are dropped here rather than relied upon to fail at
 *  the git layer. Defence in depth: `git checkout --` does refuse them,
 *  but a caller that ever switches to `checkout -- .` would sweep a whole
 *  directory, and this list is what the confirmation shows the user. The
 *  set they approve must be the set that changes. */
export function selectRestorablePaths(statusShort: string): string[] {
  return parseGitStatusShort(statusShort)
    .filter((e) => !isUntracked(e))
    .map((e) => e.path)
    .sort();
}

export type RestoreDecision =
  | { restorable: true; path: string }
  | { restorable: false; reason: 'untracked' | 'unchanged' };

/** Single-note eligibility, from `git status --short -- <path>`.
 *
 *  Empty output means git knows the file and it matches HEAD — nothing to
 *  restore, which is a refusal rather than a no-op so the command can say
 *  why instead of appearing to have worked. */
export function decideRestoreNote(path: string, statusShort: string): RestoreDecision {
  const entries = parseGitStatusShort(statusShort);
  if (entries.length === 0) return { restorable: false, reason: 'unchanged' };
  const entry = entries.find((e) => e.path === path) ?? entries[0];
  if (isUntracked(entry)) return { restorable: false, reason: 'untracked' };
  return { restorable: true, path: entry.path };
}

/** Confirmation text. Names what is LOST, not what is done — the user is
 *  approving a discard, and "restore" alone reads like a safe word. */
export function describeRestore(paths: readonly string[]): string {
  if (paths.length === 0) return 'Nothing to restore — no tracked changes.';
  if (paths.length === 1) {
    return `Discards uncommitted changes to ${paths[0]}. This cannot be undone.`;
  }
  return `Discards uncommitted changes to ${paths.length} notes. This cannot be undone.\n`
    + paths.map((p) => `  • ${p}`).join('\n');
}

/** The ordered steps a caller must perform. Encoded here so the ordering
 *  is testable and cannot be silently reordered at the call site.
 *
 *  `flush` is FIRST and is not optional. Obsidian holds an in-memory
 *  buffer; a disk-level restore racing an unflushed buffer loses to the
 *  next autosave. `MarkdownView.save()` flushes synchronously — the same
 *  primitive v0.2.219 added at main.ts:2550 for exactly this race.
 *
 *  `reload` is LAST and is explicit rather than left to
 *  `vault.on('modify')`. That event does fire for external writes, but it
 *  is ASYNCHRONOUS: post-write-memfs-sync-core.ts documents the v0.2.71
 *  hotfix where an immediate follow-up beat the handler and read stale
 *  state. A restore that leaves the old text on screen would read as a
 *  command that did nothing. */
export const RESTORE_STEPS = ['flush', 'checkout', 'reload'] as const;
export type RestoreStep = (typeof RESTORE_STEPS)[number];
