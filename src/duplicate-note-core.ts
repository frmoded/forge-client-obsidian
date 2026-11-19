// 2026-11-19-0992 - DUPLICATE A BAR FROM THE COMPOSER: the EFFECT, the pure part (no obsidian, no vault: the vault is `DuplicatePorts`). `Duplicate [[bar_007]].` makes ONE new note and changes no note that exists:
//
//   a bar            `bars/bar_NNN` (one past the highest, the rule of New bar and Edit this bar): the JSON BLOCK of the source byte for byte (steps, kit rows, tempo, swing, every velocity), FRESH front matter (a description that says it is
//                    a copy, `copied_from`), the copy's own provenance sections ("A copy of [[bar_007]], to edit by hand."): a Beat Box save keeps that origin (bar-provenance-core.ts).
//   a phrase         `phrases/phrase_NNN` (one past the highest), an arrangement `arr_NNN` and a composition `comp_NNN` (the first number not taken: each kind's own rule). A list note's copy is its OWN list: the same lines, the whole note made again
//                    from them for the new name by the writers the controls use (sentence-list-note-core.ts); a composition copy is never the root of the piece. A note whose Description, Recipe or Python was edited by hand, a custom note, and a
//                    note with a line nobody can read are refused in words (a copy of them would be a guess).
// Nothing is opened (the dialog's link opens the copy) and nothing is claimed about undo: a copy is a new note, so the words say how to delete it.
import { withBarProvenance } from './bar-provenance-core.ts';
import { barLinesBlock } from './bar-list-note-core.ts';
import { extractJsonBlock, readRhythmNote } from './rhythm-edit-core.ts';
import { nextBarName } from './phrase-fork-core.ts';
import { nextPhraseName } from './phrase-core.ts';
import { nextArrangementName } from './arrangement-core.ts';
import { nextCompositionName } from './composition-core.ts';
import { withRoot } from './composition-root-core.ts';
import { handEditRefusalOf } from './phrase-notes-core.ts';
import { isEmptyNote } from './empty-note-core.ts';
import { replayGrammar, stopNotice, type ReplayCtx } from './sentence-list-core.ts';
import { listOfNote, writeListNote } from './sentence-list-note-core.ts';
import type { DuplicateFamily, ResolvedDuplicate } from './duplicate-sentence-core.ts';

/** The notes the sentences of a list may name (the grammar's own shape, taken from the replay's context so this core does not import the grammar). */
type GrammarVault = ReplayCtx['vault'];

export interface DuplicatePorts {
  /** A note's text by path; rejects when it is not there. */
  read(path: string): Promise<string>;
  /** Basenames of the notes in a vault folder right now (fresh on every call: a retry must see the note that just took the name). */
  listBasenames(folder: string): string[];
  exists(path: string): boolean;
  /** Create a new note (never overwrite): rejects with Obsidian's "File already exists." when the name was taken in the same instant. */
  create(path: string, content: string): Promise<unknown>;
  isAlreadyExists(e: unknown): boolean;
  trace?(line: string): void;
}
export interface Copied { ok: true; family: DuplicateFamily; name: string; id: string; path: string; sourceName: string; sourceId: string }
export type DuplicateResult = Copied | { ok: false; message: string };
type Text = { ok: true; text: string } | { ok: false; message: string };

const FOLDER: Record<DuplicateFamily, string> = { bar: 'bars', phrase: 'phrases', arrangement: 'arrangements', composition: 'compositions' };

/** A bar's copy: the source's json block untouched, everything above it new. */
export function copyBarNote(source: string, newName: string, sourceName: string): Text {
  const read = readRhythmNote(source);
  if (read.ok === false) return { ok: false, message: `[[${sourceName}]] is not a bar I can read (${read.message.replace(/\.$/, '')}), so it was not copied.` };
  const block = extractJsonBlock(source);
  if (block.ok === false) return { ok: false, message: `[[${sourceName}]] is not a bar I can read (${block.message.replace(/\.$/, '')}), so it was not copied.` };
  const list = barLinesBlock(source);                                                          // 2026-11-19-0993: a listed bar's `lines:` travel with its json, byte for byte (a bar with none gets none)
  const head = ['---', 'type: data', 'content_type: json', `description: ${JSON.stringify(`${newName} — a copy of [[${sourceName}]]; edit it in the Beat Box. The original is untouched.`)}`, `copied_from: ${JSON.stringify(`[[${sourceName}]]`)}`, ...(list === null ? [] : [list]), '---', '', ''].join('\n');
  return { ok: true, text: withBarProvenance(head + source.slice(block.fenceStart), { kind: 'copy', of: sourceName }, read.value.data) };
}

/** A phrase's, an arrangement's or a composition's copy: its own list (the same lines), the note made again from them for `newName`. */
export function copyListNote(source: string, newName: string, family: 'phrase' | 'arrangement' | 'composition', vault: GrammarVault, sourceName = 'the note'): Text {
  const refusal = handEditRefusalOf(source, false);
  if (refusal !== null) return { ok: false, message: `[[${sourceName}]] was not copied: ${refusal.charAt(0).toLowerCase()}${refusal.slice(1)}` };
  const list = listOfNote(source, family, vault).list;
  if (list.length === 0) {
    return isEmptyNote(source) ? writeListNote(withRoot(source, false), newName, family, { params: null, list: [] }) : { ok: false, message: `[[${sourceName}]] has no sentences to copy (it is not an empty note either), so it was not copied.` };
  }
  const rp = replayGrammar(list, family, { vault });
  if (rp.stop !== null || rp.params === null) return { ok: false, message: `[[${sourceName}]] was not copied: ${rp.stop !== null ? stopNotice(rp.stop, rp.applied) : 'no line of it can be read.'}` };
  const written = writeListNote(withRoot(source, false), newName, family, rp);
  return written.ok === true ? written : { ok: false, message: `[[${sourceName}]] was not copied: ${written.message}` };
}

/** The copy of a note's text for `newName`, by kind. Also the DRY RUN the preview asks (with a placeholder name): ok, or why not. */
export function copyNoteText(source: string, of: { family: DuplicateFamily; name: string }, newName: string, vault: GrammarVault): Text {
  return of.family === 'bar' ? copyBarNote(source, newName, of.name) : copyListNote(source, newName, of.family, vault, of.name);
}

function nextName(ports: DuplicatePorts, family: DuplicateFamily, taken: Set<string>): string {
  const listed = [...ports.listBasenames(FOLDER[family]), ...taken];
  if (family === 'bar') return nextBarName(listed);
  if (family === 'phrase') return nextPhraseName(listed);
  const used = new Set(listed);
  const isTaken = (path: string): boolean => ports.exists(path) || used.has(path.replace(/^.*\//, '').replace(/\.md$/, ''));
  return family === 'arrangement' ? nextArrangementName(isTaken) : nextCompositionName(isTaken);
}

/** Make the copy: read the source, build the copy's text, create the note at the next free name (a name taken in the same instant tries the next one, three times). Writes nothing else; says why in plain words when it cannot. */
export async function duplicateNote(ports: DuplicatePorts, of: ResolvedDuplicate, vault: GrammarVault): Promise<DuplicateResult> {
  const fail = (message: string): DuplicateResult => ({ ok: false, message });
  let source: string;
  try { source = await ports.read(of.path); } catch (e) { console.error('[forge-duplicate] could not read the source', e); return fail(`Could not read [[${of.name}]]: ${(e as Error)?.message ?? e}`); }
  const taken = new Set<string>();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const name = nextName(ports, of.family, taken);
      const path = `${FOLDER[of.family]}/${name}.md`;
      if (ports.exists(path)) { taken.add(name); continue; }
      const made = copyNoteText(source, of, name, vault);
      if (made.ok === false) return fail(made.message);
      try { await ports.create(path, made.text); } catch (e) { if (ports.isAlreadyExists(e)) { taken.add(name); continue; } throw e; }
      ports.trace?.(`[forge-duplicate] copied ${of.id} to ${FOLDER[of.family]}/${name} (${made.text.length} chars)`);
      return { ok: true, family: of.family, name, id: `${FOLDER[of.family]}/${name}`, path, sourceName: of.name, sourceId: of.id };
    }
    return fail(`Could not find a free ${of.family} name to copy [[${of.name}]] to: the name kept being taken. Try again.`);
  } catch (e) {
    console.error('[forge-duplicate] could not create the copy', e);
    return fail(`Could not copy [[${of.name}]]: ${(e as Error)?.message ?? e}`);
  }
}

/** The dialog's line for a copy: both notes are named (the dialog draws them as links). */
export const createdLine = (r: Pick<Copied, 'name' | 'sourceName'>): string => `Created [[${r.name}]], a copy of [[${r.sourceName}]].`;
/** What is said about undo: it is NOT claimed. A copy is a new note: say how to delete it. */
export const copyUndoNote = (r: Pick<Copied, 'path'>): string => `Cmd/Ctrl+Z does not take a copy back. To remove it, delete ${r.path.replace(/\.md$/, '')} in the file list (right-click it, then Delete).`;
