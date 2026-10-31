// 2026-10-31-1100 (M17b, item 4) - the ROOT of a piece. A vault may mark ONE composition as the root of its piece: `root: true` in that composition note's frontmatter (a note's own property travels with the note, shows in Obsidian's
// Properties and survives every write, because the one note renderer keeps every frontmatter line it does not own; vault-level settings today live in forge.toml, which holds the vault's PROFILE and nothing per note). The command
// "Open the piece" opens the root's Score; "Make this composition the root of the piece" moves the mark. Pure; no `obsidian` import.
import { splitFront } from './phrase-notes-core.ts';

export const ROOT_KEY = 'root';
const ROOT_LINE = /^root:\s*(.*?)\s*$/;

/** Is this note marked as the root? Only `root: true` (any case) counts; `root: false`, a missing key and a note without frontmatter do not. */
export function isRootNote(text: string): boolean {
  const front = splitFront(text);
  if (!front) return false;
  return front.lines.some((l) => { const m = ROOT_LINE.exec(l); return m !== null && /^true$/i.test(m[1].replace(/^["']|["']$/g, '')); });
}

/** The note with its root mark set (`on`) or removed: every other line is kept, in its place; a mark already there is replaced where it stands, so a second call changes nothing. */
export function withRoot(text: string, on: boolean): string {
  const m = /^---(\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(text);
  if (!m) return text;
  const kept: string[] = [];
  let placed = false;
  for (const line of m[2].split(/\r?\n/)) {
    if (ROOT_LINE.test(line)) { if (on && !placed) { kept.push(`${ROOT_KEY}: true`); placed = true; } continue; }
    kept.push(line);
  }
  if (on && !placed) {
    const after = kept.findIndex((l) => /^content_type:/.test(l));
    kept.splice(after >= 0 ? after + 1 : kept.length, 0, `${ROOT_KEY}: true`);
  }
  return `---${m[1]}${kept.join(m[1])}${m[3]}${text.slice(m[0].length)}`;
}

export type RootAnswer = { kind: 'none' } | { kind: 'one'; path: string } | { kind: 'many'; paths: string[] };
/** The vault's root among its compositions (`notes`: their paths and texts). */
export function rootOf(notes: ReadonlyArray<{ path: string; text: string }>): RootAnswer {
  const roots = notes.filter((n) => isRootNote(n.text)).map((n) => n.path).sort();
  return roots.length === 0 ? { kind: 'none' } : roots.length === 1 ? { kind: 'one', path: roots[0] } : { kind: 'many', paths: roots };
}

/** What "Open the piece" says when there is nothing single to open. */
export const noRootMessage = 'Open the piece: no composition is the root of this piece yet. Open a composition and run "Make this composition the root of the piece".';
export const manyRootsMessage = (paths: readonly string[]): string => `Open the piece: more than one composition is marked as the root (${paths.map((p) => p.replace(/^compositions\//, '').replace(/\.md$/, '')).join(', ')}). Keep it on one: open that composition and run "Make this composition the root of the piece".`;
export const OPEN_PIECE_COMMAND_ID = 'open-the-piece';
export const OPEN_PIECE_COMMAND_NAME = 'Open the piece';
export const MAKE_ROOT_COMMAND_ID = 'make-composition-root';
export const MAKE_ROOT_COMMAND_NAME = 'Make this composition the root of the piece';
/** Both commands are offered in a score-first vault, nowhere else (P3); "Make ... root" needs a composition to be the active note. */
export const openPieceAvailable = (i: { scoreFirst: boolean; compositionCount: number }): boolean => i.scoreFirst && i.compositionCount > 0;
export const makeRootAvailable = (i: { scoreFirst: boolean; activePath: string | null }): boolean => i.scoreFirst && i.activePath !== null && /^compositions\/[^/]+\.md$/.test(i.activePath) && i.activePath !== 'compositions/README.md';
