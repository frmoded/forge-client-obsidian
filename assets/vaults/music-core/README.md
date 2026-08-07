# music-core

The composition-authoring surface of the Forge music domain — the vault
where new composition primitives are authored, exercised, and hardened
**before** promotion into the `forge.music.lib` engine library.

Sibling to [music-theory](https://github.com/frmoded/music-theory)
(pedagogical content: exercises, quizzes, worked pieces). The two ship
as separate Obsidian vaults — there is no in-vault cross-linking;
switch vaults in Obsidian to move between them (Phase 5 two-vault
split, driver adjudication 2026-08-06).

## What lives here

- **Future composition primitives**, authored as Forge V2 notes
  (`# Description` + `# Recipe` + generated `# Python`) with
  `type: action` frontmatter.
- Nothing yet — the vault intentionally starts empty. Engine
  primitives that already exist stay in `forge.music.lib`; this vault
  is the authoring surface for what comes next.

## Workflow

1. Author a primitive here as a V2 note; iterate with Forge-click.
2. When it stabilizes, promote it to `forge/forge/music/lib.py` in the
   engine (with tests), re-vendor to forge-transpile, and retire or
   thin the vault note.

## Part of the Forge ecosystem

- Main engine: https://github.com/frmoded/forge
- Plugin (bundled distribution path): https://github.com/frmoded/forge-client-obsidian
- Sibling vaults: https://github.com/frmoded/music-theory, https://github.com/frmoded/forge-moda
