# music-core

The composition-authoring surface of the Forge music domain — the vault
where composition primitives are authored, exercised, and hardened
**before** promotion into the `forge.music.lib` engine library.

Sibling to [music-theory](https://github.com/frmoded/music-theory)
(pedagogical content: exercises, quizzes, worked pieces). The two ship
as separate Obsidian vaults, but they are linked: `music-theory`
declares `music-core = { local = "../music-core" }` under `[imports]`
in its `forge.toml`, so its Recipes can `Call [[note-in-music-core]]`
(the plugin mounts the sibling checkout when that vault opens, desktop
only; edits to music-core need a close-and-reopen of the importing
vault). `music-playground`, the score-first experiment vault, imports it
the same way. `music-core` itself imports nothing.

## What lives here

Ten V2 action notes (`# Description` + `# Recipe` + generated
`# Python`, `type: action`); no data notes.

- **`percussion_lab/`** — nine sections of the *murmuration* percussion
  arc, one note each, which `music-theory`'s `percussion/murmuration`
  stitches together: `solitary` (one bird, the kick alone), `companions`
  (a few birds join), `gathering` (dozens), `swarming` (the full kit
  minus crash), `peak` (full kit plus crash), `dispersing` (the flock
  thinning), `resting` (kick alone, quieter), `threading` (threads
  weaving back together) and `wake` (what is left after the peak).
- **`pitched_line`** — returns a rhythmic line: a list of
  `{"pitch": ..., "duration": ...}` pairs built from note names and
  rhythm codes (W, H, Q, E, S), ready for multi-voice rendering. It is
  the one note here with `{{ }}` slots.

Engine primitives that already exist stay in `forge.music.lib`
(`forge/forge/music/lib.py` in the engine repo); this vault is the
authoring surface for what comes next.

## Workflow

1. Author a primitive here as a V2 note; iterate with Forge-click.
2. When it stabilizes, promote it to `forge/forge/music/lib.py` in the
   engine (with tests), re-vendor to forge-transpile, and retire or
   thin the vault note.

## Part of the Forge ecosystem

- Main engine: https://github.com/frmoded/forge
- Plugin (bundled distribution path): https://github.com/frmoded/forge-client-obsidian
- Sibling vaults: https://github.com/frmoded/music-theory, https://github.com/frmoded/forge-moda
