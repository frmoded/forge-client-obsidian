// 2026-10-31-1100 (M17b, item 3) - what "New composition" DOES once the person has chosen: validate, make the folder if the vault lacks it, pick a free name, write the note through the one writer path, mark it as the root if asked,
// print the evidence line, open it, say so. The vault is injected (the Obsidian glue is compositions.ts; the choosing is composition-dialog-dom.ts). Nothing here throws: every trouble is one sentence returned and shown. Score-first vaults only (P3).
import { COMPOSITION_FOLDER, COMPOSITION_NAME_PATTERN, compositionCreatedLine, compositionPath, newCompositionNote, nextCompositionName, validateComposition, type CompositionSection } from './composition-core.ts';
import { withRoot } from './composition-root-core.ts';
import type { CreatePorts, CreateResult } from './kit-arrangement-flow-core.ts';

const msg = (e: unknown): string => (e as Error)?.message ?? String(e);
const NAME_TRIES = 20;
const fail = (ports: CreatePorts, message: string): CreateResult => { ports.notify(message); return { ok: false, message }; };

export interface NewCompositionChoice {
  /** A name the person typed; empty or absent = the next free `comp_NNN`. */
  name?: string;
  sections: readonly CompositionSection[];
  /** Mark this composition as the ROOT of the piece. The caller clears the mark on the others (compositions.ts `moveRoot`) when it is told this one is the root. */
  root?: boolean;
}
export type NewCompositionResult = CreateResult & { name?: string };

export async function createComposition<F>(ports: CreatePorts<F>, choice: NewCompositionChoice, afterRoot?: (path: string) => Promise<void>): Promise<NewCompositionResult> {
  const valid = validateComposition({ kind: 'composition', sections: choice.sections.map((s) => ({ source: s.source, ...(s.length !== undefined ? { length: s.length } : {}), ...(s.repeat !== undefined ? { repeat: s.repeat } : {}) })) });
  if (valid.ok === false) return fail(ports, `New composition: ${valid.message}`);
  const wanted = (choice.name ?? '').trim();
  if (wanted !== '' && !COMPOSITION_NAME_PATTERN.test(wanted)) return fail(ports, `New composition: the name "${wanted}" can only have letters, digits, _ and -.`);
  if (wanted !== '' && ports.exists(compositionPath(wanted))) return fail(ports, `New composition: a composition called ${wanted} already exists (${compositionPath(wanted)}). Pick another name.`);
  try {
    if (!ports.folderExists(COMPOSITION_FOLDER)) {
      try { await ports.createFolder(COMPOSITION_FOLDER); } catch (e) { if (!ports.isAlreadyExists(e)) throw e; }
    }
    const refused = new Set<string>();
    for (let tries = 0; tries < NAME_TRIES; tries++) {
      const name = wanted !== '' ? wanted : nextCompositionName((p) => ports.exists(p) || refused.has(p));
      try {
        const file = await ports.create(compositionPath(name), newCompositionNote(name, valid.value, choice.root === true ? ['root: true'] : []));
        ports.trace(compositionCreatedLine(name, valid.value));
        if (choice.root === true && afterRoot) await afterRoot(compositionPath(name));
        await ports.open(file);
        ports.notify(`Created ${compositionPath(name)}.`);
        return { ok: true, path: compositionPath(name), name };
      } catch (e) {
        if (!ports.isAlreadyExists(e)) throw e;
        if (wanted !== '') return fail(ports, `New composition: a composition called ${wanted} already exists (${compositionPath(wanted)}). Pick another name.`);
        refused.add(compositionPath(name));                    // taken between the check and the write: the next number is free
      }
    }
    return fail(ports, 'New composition: could not find a free composition name.');
  } catch (e) {
    return fail(ports, `New composition failed: ${msg(e)}`);
  }
}

/** The root mark moved to `target`: every composition text given (path -> text) with the mark set on the target and removed from the others; only the ones that change are returned. */
export function moveRoot(notes: ReadonlyArray<{ path: string; text: string }>, target: string): Array<{ path: string; text: string }> {
  return notes.map((n) => ({ path: n.path, text: withRoot(n.text, n.path === target) })).filter((n, i) => n.text !== notes[i].text);
}

// ---- when the commands are offered ---------------------------------------------------------------------------------------------------------------------------------------------

/** "New composition" needs something to play: at least one phrase or arrangement. */
export const newCompositionAvailable = (i: { scoreFirst: boolean; phraseCount: number; arrangementCount: number }): boolean => i.scoreFirst && i.phraseCount + i.arrangementCount > 0;
/** "Open composition as Score" is offered on a composition note in a score-first vault. */
export const openCompositionAvailable = (i: { scoreFirst: boolean; activePath: string | null }): boolean => i.scoreFirst && i.activePath !== null && /^compositions\/[^/]+\.md$/.test(i.activePath) && i.activePath !== `${COMPOSITION_FOLDER}/README.md`;

export const NEW_COMPOSITION_COMMAND_ID = 'new-composition';
export const NEW_COMPOSITION_COMMAND_NAME = 'New composition';
export const OPEN_COMPOSITION_COMMAND_ID = 'open-composition-as-score';
export const OPEN_COMPOSITION_COMMAND_NAME = 'Open composition as Score';
