// score_first M10 slice 1 (drain 2026-10-29-0820) - what "New kit" and "New arrangement" DO once the person has chosen: validate, make the folder if the vault lacks it, pick a free name, write the note, print the evidence line, open it, say so. Pure: the
// vault is injected (the Obsidian glue is kits-arrangements.ts; the choosing is kit-dom.ts / arrangement-dom.ts). Nothing here throws: every trouble is one sentence returned and shown. Score-first vaults only (the gates below; P3).
import { ARRANGEMENT_FOLDER, arrangementCreatedLine, arrangementPath, nextArrangementName, newArrangementNote, validateArrangement, type ArrangementTrack } from './arrangement-core.ts';
import { KIT_FOLDER, freeKitName, kitCreatedLine, kitFromChoice, kitPath, newKitNote } from './kit-core.ts';

export interface CreatePorts<F = unknown> {
  folderExists(folder: string): boolean;
  createFolder(folder: string): Promise<void>;
  exists(path: string): boolean;
  create(path: string, content: string): Promise<F>;
  open(file: F): Promise<void>;
  notify(message: string): void;
  /** One evidence line (`[forge-kit] created ...`), printed as Info. */
  trace(line: string): void;
  isAlreadyExists(e: unknown): boolean;
}
export type CreateResult = { ok: true; path: string } | { ok: false; message: string };

const msg = (e: unknown): string => (e as Error)?.message ?? String(e);
async function ensureFolder(ports: CreatePorts, folder: string): Promise<void> {
  if (ports.folderExists(folder)) return;
  try { await ports.createFolder(folder); } catch (e) { if (!ports.isAlreadyExists(e)) throw e; }
}
const fail = (ports: CreatePorts, message: string): CreateResult => { ports.notify(message); return { ok: false, message }; };

/** How many times a name is retried when another writer takes it between the check and the write. */
const NAME_TRIES = 20;

export async function createKit<F>(ports: CreatePorts<F>, choice: { name: string; channels: readonly string[] }): Promise<CreateResult> {
  const kit = kitFromChoice(choice.name, choice.channels);
  if (kit.ok === false) return fail(ports, `New kit: ${kit.message}`);
  try {
    await ensureFolder(ports, KIT_FOLDER);
    const refused = new Set<string>();                       // every name the vault turned down: a listing that is stale must not send us back to one
    let name = freeKitName(kit.value.name, (p) => ports.exists(p));
    for (let tries = 0; tries < NAME_TRIES; tries++) {
      const p = { ...kit.value, name };
      try {
        const file = await ports.create(kitPath(name), newKitNote(p));
        ports.trace(kitCreatedLine(p));
        await ports.open(file);
        ports.notify(name === kit.value.name ? `Created the ${name} kit (${kitPath(name)}).` : `A kit called ${kit.value.name} already exists; created ${kitPath(name)} instead.`);
        return { ok: true, path: kitPath(name) };
      } catch (e) {
        if (!ports.isAlreadyExists(e)) throw e;
        refused.add(kitPath(name));
        name = freeKitName(kit.value.name, (q) => ports.exists(q) || refused.has(q));      // another writer took the name: the next free one
      }
    }
    return fail(ports, 'New kit: could not find a free kit name.');
  } catch (e) {
    return fail(ports, `New kit failed: ${msg(e)}`);
  }
}

export async function createArrangement<F>(ports: CreatePorts<F>, tracks: readonly ArrangementTrack[]): Promise<CreateResult> {
  const valid = validateArrangement({ kind: 'arrangement', tracks: tracks.map((t) => ({ kit: t.kit, phrase: t.phrase })) });
  if (valid.ok === false) return fail(ports, `New arrangement: ${valid.message}`);
  try {
    await ensureFolder(ports, ARRANGEMENT_FOLDER);
    const refused = new Set<string>();
    for (let tries = 0; tries < NAME_TRIES; tries++) {
      const name = nextArrangementName((p) => ports.exists(p) || refused.has(p));
      try {
        const file = await ports.create(arrangementPath(name), newArrangementNote(name, valid.value));
        ports.trace(arrangementCreatedLine(name, valid.value));
        await ports.open(file);
        ports.notify(`Created ${arrangementPath(name)}.`);
        return { ok: true, path: arrangementPath(name) };
      } catch (e) {
        if (!ports.isAlreadyExists(e)) throw e;                 // the name was taken between the check and the write: ask again, the next number is free
        refused.add(arrangementPath(name));
      }
    }
    return fail(ports, 'New arrangement: could not find a free arrangement name.');
  } catch (e) {
    return fail(ports, `New arrangement failed: ${msg(e)}`);
  }
}

// ---- when the commands are offered ---------------------------------------------------------------------------------------------------------------------------------------------

/** "New kit" is offered in a score-first vault, nowhere else (P3). */
export const newKitAvailable = (i: { scoreFirst: boolean }): boolean => i.scoreFirst;
/** "New arrangement" needs something to arrange: at least one kit and one phrase. */
export const newArrangementAvailable = (i: { scoreFirst: boolean; kitCount: number; phraseCount: number }): boolean => i.scoreFirst && i.kitCount > 0 && i.phraseCount > 0;
/** "Open arrangement as Score" is offered on an arrangement note in a score-first vault. */
export const openArrangementAvailable = (i: { scoreFirst: boolean; activePath: string | null }): boolean => i.scoreFirst && i.activePath !== null && /^arrangements\/[^/]+\.md$/.test(i.activePath) && i.activePath !== `${ARRANGEMENT_FOLDER}/README.md`;

export const NEW_KIT_COMMAND_ID = 'new-kit';
export const NEW_KIT_COMMAND_NAME = 'New kit';
export const NEW_ARRANGEMENT_COMMAND_ID = 'new-arrangement';
export const NEW_ARRANGEMENT_COMMAND_NAME = 'New arrangement';
export const OPEN_ARRANGEMENT_COMMAND_ID = 'open-arrangement-as-score';
export const OPEN_ARRANGEMENT_COMMAND_NAME = 'Open arrangement as Score';
