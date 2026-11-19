// 2026-11-18-0930 - where the scale exercise tests read the gadget pages: the BUNDLED vault (assets/vaults/music-theory), or, to verify a change before the bundle sync, the vault SOURCE named by the environment variable SCALE_EXERCISE_VAULT
// (a vault root such as ~/projects/music-theory; the pages are under scales/resources/html of it). Read-only: the tests never write there.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SCALE_EXERCISE_VAULT ? path.resolve(process.env.SCALE_EXERCISE_VAULT.replace(/^~(?=$|\/)/, os.homedir())) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/vaults/music-theory');
export const EXERCISE_DIR = path.join(root, 'scales/resources/html');

/** 2026-11-19-0994: the two single-scale files (the SIMPLE template) carry two rule flags in their config block, both false there (wrong taps not counted, no W W H row). The older rules (3 wrong taps end the build as failed, "Wrong taps: n of 3", the step chips) are still in the template behind the flags: this turns both on in a page's source, so the old pins keep covering them. A page without the flags (the FULL files) comes back unchanged. */
export function rulesOn(html: string): string {
  return html.replace('var COUNT_WRONG_TAPS = false;', 'var COUNT_WRONG_TAPS = true;').replace('var SHOW_STEP_CHIPS = false;', 'var SHOW_STEP_CHIPS = true;');
}
