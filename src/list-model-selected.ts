// The ONE file the shared composer path imports the list model from (src/music-edition.ts, `ListModel`). Committed pointing at the FULL implementation (the reverse of music-edition-selected.ts: see the
// comment on `ListModel`): tsc, `node --test` and the music build see the real cores. scripts/build-main.mjs redirects THIS module to ./list-model.lean.ts when the build runs with FORGE_EDITION=lean (the default), so the
// lean bundle never reaches the cores.
export { listModel } from './list-model.full.ts';
