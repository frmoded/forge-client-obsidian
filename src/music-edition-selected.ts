// The ONE file the rest of the plugin imports the music edition from. Committed pointing at the
// LEAN implementation so tsc, node --test and a plain `npm run build` all behave like today's
// `main`. scripts/build-main.mjs redirects THIS module to ./music-edition.full.ts when the build
// runs with FORGE_EDITION=music; no source edit is needed to switch editions.
export { musicEdition } from './music-edition.lean.ts';
