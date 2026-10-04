// The edition this build runs as. COMMITTED AS LEAN so tsc, node --test and a plain build are lean;
// scripts/build-main.mjs redirects this module to edition-selected.music.ts when FORGE_EDITION=music.
// See src/edition-core.ts.
import type { Edition } from './edition-core.ts';

export const EDITION: Edition = 'lean';
