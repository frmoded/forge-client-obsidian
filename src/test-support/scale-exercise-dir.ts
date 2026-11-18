// 2026-11-18-0930 - where the scale exercise tests read the gadget pages: the BUNDLED vault (assets/vaults/music-theory), or, to verify a change before the bundle sync, the vault SOURCE named by the environment variable SCALE_EXERCISE_VAULT
// (a vault root such as ~/projects/music-theory; the pages are under scales/resources/html of it). Read-only: the tests never write there.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SCALE_EXERCISE_VAULT ? path.resolve(process.env.SCALE_EXERCISE_VAULT.replace(/^~(?=$|\/)/, os.homedir())) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/vaults/music-theory');
export const EXERCISE_DIR = path.join(root, 'scales/resources/html');
