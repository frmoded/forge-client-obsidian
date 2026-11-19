// 2026-11-19-0991 - the rules for the NAME of a new note, in one leaf module (no obsidian, no DOM, no imports: the phrase / arrangement / composition flows and the name dialog both use it, so the sentence a flow says when a name is taken is the dialog's sentence).
//   - a name is not empty (after the spaces at its ends are taken off), has none of `/ \ : * ? " < > |`, and does not start with a dot;
//   - note names are VAULT-WIDE unique (the snippet registry and the wikilinks index by basename, folders do not matter): the name must not be the basename of any note anywhere. A file system that does not tell `Intro` from `intro` does
//     not either, so the comparison ignores case;
//   - every message is plain words for a muted line under the field: no trailing full stop, no colour, nothing that reads as an alarm.

/** The characters a note name may not contain, in the order the message lists them. */
export const FORBIDDEN_NAME_CHARS: readonly string[] = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
export const FORBIDDEN_NAME_LIST = FORBIDDEN_NAME_CHARS.join(' ');

/** What is wrong with a name's SPELLING (not with the vault): null = nothing. `name` is the text as typed; the verdict is about its trimmed form. */
export type NameProblem = { reason: 'empty'; message: string } | { reason: 'chars'; message: string; found: string[] } | { reason: 'dot'; message: string };
export function nameSpellingProblem(raw: string, noun: string): NameProblem | null {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name === '') return { reason: 'empty', message: `Type a name for the new ${noun}` };
  const found = FORBIDDEN_NAME_CHARS.filter((c) => name.includes(c));
  if (found.length > 0) return { reason: 'chars', found, message: `A name cannot contain ${found.join(' ')} (none of ${FORBIDDEN_NAME_LIST} is allowed)` };
  if (name.startsWith('.')) return { reason: 'dot', message: 'A name cannot start with a dot' };
  return null;
}

/** The basename (no folder, no `.md`) of a note path. */
export const basenameOfPath = (path: string): string => path.replace(/^.*\//, '').replace(/\.md$/i, '');
/** A note's path without its `.md` and the folder it lives in, for the sentence: `compositions/comp_001`, or `Welcome` for a note at the top of the vault. */
export const pathWithoutExtension = (path: string): string => path.replace(/\.md$/i, '');

/** "A note called X already exists (folder/X)": the sentence for a name that is taken. `existingPath` is the path of the note that has it (with or without `.md`). A note at the top of the vault has no folder: the parenthesis says so. */
export function nameTakenMessage(name: string, existingPath: string): string {
  const where = pathWithoutExtension(existingPath);
  return `A note called ${name} already exists (${where.includes('/') ? where : 'at the top of the vault'})`;
}

/** The note that already has this name anywhere in the vault (case-insensitive on the basename), or null. With several, the first by path, so the sentence is the same every time. */
export function noteWithName(name: string, notePaths: readonly string[]): string | null {
  const want = name.trim().toLowerCase();
  let best: string | null = null;
  for (const p of notePaths) if (basenameOfPath(p).toLowerCase() === want && (best === null || p < best)) best = p;
  return best;
}
