// 2026-11-05-1181 (score_first M10c, design 4.10 slice 4) - the Beat Box of a score-first vault offers the channels of a chosen KIT when a person adds an instrument. The decisions, without Obsidian
// (no `obsidian` import): which vault notes are kits, in what order the picker offers them, and what rides on the load message. The widget does the drawing; a bar note is untouched by any of this
// (a bar has channels, a kit is how an arrangement plays them), so nothing here is ever written to a note.
import { isKitPath, readKitNote } from './kit-core.ts';

/** One entry of the kit dropdown: the kit note's file name and its channels, in the engine's order (kit-core.ts validates and orders them). */
export interface KitChoice { name: string; channels: string[] }

/** The kit the dropdown starts on, and so the one listed first. */
export const FIRST_KIT = 'rock';

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');

/**
 * The kits the picker offers, from the vault's `kits/*.md` notes: `rock` first, the rest by name, whatever order the vault listed them in. A note that is not a kit path (README, a note elsewhere) or whose json block
 * is not a valid kit is left out - one broken kit never hides the others. An empty list means "no kit dropdown": the widget then behaves exactly as it always did.
 */
export function kitChoices(notes: ReadonlyArray<{ path: string; text: string }>): KitChoice[] {
  const found = new Map<string, KitChoice>();
  for (const note of notes) {
    if (!isKitPath(note.path)) continue;
    const kit = readKitNote(note.text);
    if (kit.ok === false) continue;
    const name = baseName(note.path);
    if (!found.has(name)) found.set(name, { name, channels: [...kit.value.channels] });
  }
  const rank = (k: KitChoice): number => (k.name === FIRST_KIT ? 0 : 1);
  return [...found.values()].sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
