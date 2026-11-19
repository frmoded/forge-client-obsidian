// 2026-10-31-1100 (M17b, item 3); 2026-11-19-0960 made it an EMPTY note - what "New composition" DOES: make the folder if the vault lacks it, pick a free name, write the empty note, mark it as the root if asked,
// print the evidence line, open it, say so. The vault is injected (the Obsidian glue is compositions.ts). Nothing here throws: every trouble is one sentence returned and shown. Score-first vaults only (P3).
import { COMPOSITION_FOLDER, compositionPath, nextCompositionName } from './composition-core.ts';
import { withRoot } from './composition-root-core.ts';
import { emptyCompositionNote } from './empty-note-core.ts';
import { nameTakenMessage } from './note-name-rules-core.ts';
import type { CreatePorts, CreateResult } from './kit-arrangement-flow-core.ts';

const msg = (e: unknown): string => (e as Error)?.message ?? String(e);
const NAME_TRIES = 20;
const fail = (ports: CreatePorts, message: string): CreateResult => { ports.notify(message); return { ok: false, message }; };

export interface NewCompositionChoice {
  /** Mark this composition as the ROOT of the piece (`root: true`). The caller says so only when no composition is the root yet (the old dialog ticked the box in exactly that case). */
  root?: boolean;
  /** 2026-11-19-0991: the name the person typed in the name dialog: the note is made with exactly that name (a taken path is said in words, no other number is tried). Absent = the next free comp_NNN, as before. */
  name?: string;
}
export type NewCompositionResult = CreateResult & { name?: string };

/** 2026-11-19-0960: "New composition" makes an EMPTY composition (no sections yet: its first sentence makes them) and opens it. Nothing to choose, nothing for the engine to draw; the first composition of a vault is the root of its piece. */
export async function createEmptyComposition<F>(ports: CreatePorts<F>, choice: NewCompositionChoice = {}): Promise<NewCompositionResult> {
  try {
    if (!ports.folderExists(COMPOSITION_FOLDER)) {
      try { await ports.createFolder(COMPOSITION_FOLDER); } catch (e) { if (!ports.isAlreadyExists(e)) throw e; }
    }
    const extraFront = choice.root === true ? ['root: true'] : [];
    if (choice.name !== undefined) {
      const name = choice.name, path = compositionPath(name);
      if (ports.exists(path)) return fail(ports, nameTakenMessage(name, path));
      try {
        const file = await ports.create(path, emptyCompositionNote(name, extraFront));
        ports.trace(`[forge-composition] created ${path} (empty${choice.root === true ? ', the root of the piece' : ''})`);
        await ports.open(file);
        ports.notify(`Created ${path}.`);
        return { ok: true, path, name };
      } catch (e) {
        if (ports.isAlreadyExists(e)) return fail(ports, nameTakenMessage(name, path));
        throw e;
      }
    }
    const refused = new Set<string>();
    for (let tries = 0; tries < NAME_TRIES; tries++) {
      const name = nextCompositionName((p) => ports.exists(p) || refused.has(p));
      try {
        const file = await ports.create(compositionPath(name), emptyCompositionNote(name, choice.root === true ? ['root: true'] : []));
        ports.trace(`[forge-composition] created ${compositionPath(name)} (empty${choice.root === true ? ', the root of the piece' : ''})`);
        await ports.open(file);
        ports.notify(`Created ${compositionPath(name)}.`);
        return { ok: true, path: compositionPath(name), name };
      } catch (e) {
        if (!ports.isAlreadyExists(e)) throw e;
        refused.add(compositionPath(name));                    // taken between the check and the write: the next number is free
      }
    }
    return fail(ports, 'New composition: could not find a free composition name.');
  } catch (e) {
    console.error('createEmptyComposition failed', e);
    return fail(ports, `New composition failed: ${msg(e)}`);
  }
}

/** The root mark moved to `target`: every composition text given (path -> text) with the mark set on the target and removed from the others; only the ones that change are returned. */
export function moveRoot(notes: ReadonlyArray<{ path: string; text: string }>, target: string): Array<{ path: string; text: string }> {
  return notes.map((n) => ({ path: n.path, text: withRoot(n.text, n.path === target) })).filter((n, i) => n.text !== notes[i].text);
}

// ---- when the commands are offered ---------------------------------------------------------------------------------------------------------------------------------------------

/** "New composition" is offered in every score-first vault (2026-11-19-0960: it makes an EMPTY note, so it needs no phrase and no arrangement first). */
export const newCompositionAvailable = (i: { scoreFirst: boolean }): boolean => i.scoreFirst;
/** "Open composition as Score" is offered on a composition note in a score-first vault. */
export const openCompositionAvailable = (i: { scoreFirst: boolean; activePath: string | null }): boolean => i.scoreFirst && i.activePath !== null && /^compositions\/[^/]+\.md$/.test(i.activePath) && i.activePath !== `${COMPOSITION_FOLDER}/README.md`;

export const NEW_COMPOSITION_COMMAND_ID = 'new-composition';
export const NEW_COMPOSITION_COMMAND_NAME = 'New composition';
export const OPEN_COMPOSITION_COMMAND_ID = 'open-composition-as-score';
export const OPEN_COMPOSITION_COMMAND_NAME = 'Open composition as Score';
