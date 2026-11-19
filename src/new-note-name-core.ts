// 2026-11-19-0991 - "New phrase", "New arrangement" and "New composition" ask for the NAME first (driver 2026-11-19, R1). Pure (no obsidian, no DOM): which kinds there are and what each says, the DEFAULT name the field starts with (today's numbering
// rule, and a name that is free anywhere in the vault), and the verdict on what is typed. The dialog around it is new-note-name-dom.ts; the Modal around that is new-note-name-modal.ts.
//   - the default is what the action chose before there was a dialog: the next `phrase_NNN` (one past the highest in phrases/), the first free `arr_NNN`, the first free `comp_NNN`; and, because note names are unique in the whole vault, the first
//     one of those that no note ANYWHERE has (a `phrase_004` in a stray folder moves the default to `phrase_005`): the field never starts on a refusal;
//   - the verdict (checkNewNoteName) is the spelling rules, then the vault: empty, forbidden characters, a leading dot, a name that any note already has.
import { ARRANGEMENT_FOLDER, arrangementPath, nextArrangementName } from './arrangement-core.ts';
import { COMPOSITION_FOLDER, compositionPath, nextCompositionName } from './composition-core.ts';
import { PHRASE_FOLDER, nextPhraseName, phrasePath } from './phrase-core.ts';
import { basenameOfPath, nameSpellingProblem, nameTakenMessage, noteWithName } from './note-name-rules-core.ts';

export type NewNoteKind = 'phrase' | 'arrangement' | 'composition';
export interface NewNoteKindInfo { readonly kind: NewNoteKind; /** The dialog's title (and the command's name). */ readonly title: string; readonly noun: string; readonly folder: string; readonly pathOf: (name: string) => string }
export const NEW_NOTE_KINDS: Readonly<Record<NewNoteKind, NewNoteKindInfo>> = {
  phrase: { kind: 'phrase', title: 'New phrase', noun: 'phrase', folder: PHRASE_FOLDER, pathOf: phrasePath },
  arrangement: { kind: 'arrangement', title: 'New arrangement', noun: 'arrangement', folder: ARRANGEMENT_FOLDER, pathOf: arrangementPath },
  composition: { kind: 'composition', title: 'New composition', noun: 'composition', folder: COMPOSITION_FOLDER, pathOf: compositionPath },
};

/** How many numbers are tried before giving up on a default (a vault with this many notes of one kind is not a vault this is for): the field then starts empty. */
const DEFAULT_TRIES = 10000;

/** The name the field starts with: today's rule for the kind, moved on until no note anywhere has it. `notePaths` = the path of every note in the vault (fresh on every call). */
export function defaultNewNoteName(kind: NewNoteKind, notePaths: readonly string[]): string {
  const info = NEW_NOTE_KINDS[kind];
  const paths = new Set(notePaths);
  const basenames = new Set(notePaths.map((p) => basenameOfPath(p).toLowerCase()));
  const free = (name: string): boolean => !basenames.has(name.toLowerCase());
  if (kind === 'phrase') {
    const taken = new Set(notePaths.filter((p) => p.startsWith(`${PHRASE_FOLDER}/`)).map(basenameOfPath));          // what the action did: the listing of phrases/, one past its highest
    for (let i = 0; i < DEFAULT_TRIES; i++) { const name = nextPhraseName(taken); if (free(name) && !paths.has(info.pathOf(name))) return name; taken.add(name); }
    return '';
  }
  const next = kind === 'arrangement' ? nextArrangementName : nextCompositionName;
  const name = next((p) => paths.has(p) || !free(basenameOfPath(p)));
  return name;
}

export type NameCheck =
  | { ok: true; name: string; path: string; message: string }
  | { ok: false; reason: 'empty' | 'chars' | 'dot' | 'exists'; message: string };

/** What the dialog says about the text in the field: valid (with the path the note will have, said in the muted line) or the one thing wrong with it. The spaces at the ends are not part of the name. */
export function checkNewNoteName(kind: NewNoteKind, raw: string, notePaths: readonly string[]): NameCheck {
  const info = NEW_NOTE_KINDS[kind];
  const bad = nameSpellingProblem(raw, info.noun);
  if (bad !== null) return { ok: false, reason: bad.reason, message: bad.message };
  const name = raw.trim();
  const taken = noteWithName(name, notePaths);
  if (taken !== null) return { ok: false, reason: 'exists', message: nameTakenMessage(basenameOfPath(taken), taken) };
  return { ok: true, name, path: info.pathOf(name), message: `It will be made as ${info.pathOf(name)}` };
}
