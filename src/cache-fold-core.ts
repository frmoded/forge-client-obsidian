// 2026-11-05-1177 - the `# Cache` section of a score-first note is generated (the json fence and its comment "edit the Description, not this"); nobody edits it, so a note of the kinds below is OPENED with that heading folded. The decisions, without
// Obsidian (no `obsidian` import): which notes qualify, which line range to fold, and whether this leaf has already been given its one chance. The fold is Obsidian's own view state (`currentMode.applyFoldInfo`), never a write to the note.
import { isBarPath } from './phrase-core.ts';
import { isKitPath } from './kit-core.ts';
import { familyOfPath } from './note-family-core.ts';

export type CacheFoldKind = 'phrase' | 'bar' | 'kit' | 'arrangement' | 'composition';

/** Which of the five score-first kinds a note path is (null = a note of any other kind: it is never folded). */
export function cacheFoldKind(path: string | null | undefined): CacheFoldKind | null {
  if (!path) return null;
  const family = familyOfPath(path);
  if (family !== null) return family;
  if (isBarPath(path)) return 'bar';
  if (isKitPath(path)) return 'kit';
  return null;
}

/** THE RULE: fold when the vault is score-first, the note is one of the five kinds, and this leaf has not yet been given its chance at this note in this session (a person who unfolds it keeps it open; it is never folded a second time). */
export function shouldFoldCache(vaultIsScoreFirst: boolean, noteKind: CacheFoldKind | null, alreadyHandledInThisLeaf: boolean): boolean {
  return vaultIsScoreFirst && noteKind !== null && !alreadyHandledInThisLeaf;
}

/** Obsidian's fold state of a markdown view (`getFoldInfo`/`applyFoldInfo`): 0-based line numbers, and the line count it was taken at (a state for another line count is ignored by Obsidian). */
export interface FoldInfo { folds: Array<{ from: number; to: number }>; lines: number }

const lineCount = (text: string): number => text.split('\n').length;

/**
 * Where the `# Cache` section is in `text`: the 0-based line of the heading and the last line of its section (the line before the next heading of level 1, or the last line), or null when the note has no such heading.
 * Only a level-1 heading named exactly `Cache` counts, and never one inside a code fence (a json cache may quote anything).
 */
export function cacheSection(text: string): { from: number; to: number } | null {
  const lines = text.split('\n');
  let fence: string | null = null;
  let from = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) { const mark = f[1][0]; if (fence === null) fence = mark; else if (fence === mark) fence = null; continue; }
    if (fence !== null) continue;
    const heading = /^#\s+(.*?)\s*#*\s*$/.exec(line);
    if (from < 0) { if (heading && heading[1] === 'Cache') from = i; }
    else if (heading) return { from, to: i - 1 };
  }
  return from < 0 ? null : { from, to: lines.length - 1 };
}

/**
 * The fold state to give the view: what it has (`current`, from `getFoldInfo`) plus the Cache section. null = nothing to do (no such heading, or it is folded already). Other folds the person made are kept;
 * a `current` taken at another line count is not trusted (Obsidian would ignore a state for a different text), so it starts from none.
 */
export function cacheFoldInfo(text: string, current?: FoldInfo | null): FoldInfo | null {
  const section = cacheSection(text);
  if (section === null) return null;
  const lines = lineCount(text);
  const kept = current && current.lines === lines ? current.folds : [];
  if (kept.some((f) => f.from === section.from)) return null;
  return { folds: [...kept, section], lines };
}
