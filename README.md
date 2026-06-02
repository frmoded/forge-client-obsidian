# forge-client-obsidian

Obsidian plugin for the [Forge](https://github.com/frmoded/forge) snippet system. Embeds the Pyodide-based Forge engine + bundled libraries (forge-moda, forge-music) directly into the plugin so closed-beta users can install with a single zip — no separate Python or engine deployment needed.

## For end-users

See **[INSTALL.md](INSTALL.md)** — three-step zip install + token setup.

## For plugin development

### Build

```bash
npm install
npm run setup-assets       # one-time: vendor Pyodide + wheels (~14 MB)
npm run build              # produces main.js + assets/manifest.json
npm test                   # node --test src/*.test.ts
```

### Release zip

```bash
npm run release-zip        # produces dist/forge-client-obsidian-v<version>.zip
```

The release-zip step runs two preflights: file-existence (`REQUIRED_FILES`) and engine-bundle drift (the bundled engine under `assets/engine/forge/` must be byte-equal to the source-of-truth at `../forge/forge/`). Both fail loudly with actionable hints if anything is missing or out of sync.

### Engine bundle sync

The plugin's bundled engine lives at `assets/engine/forge/` — a subset of `~/projects/forge/forge/` containing `core/`, `moda/`, `music/`, and the top-level `__init__.py`. This is what Pyodide imports at runtime.

When you edit `~/projects/forge/forge/` (any file under the in-scope dirs above), run:

```bash
npm run sync-engine-bundle
```

This idempotently copies every in-scope source file into the bundle and deletes any orphans. The release-zip preflight refuses to ship a zip with engine drift, so running this script regularly is the dev workflow that keeps the preflight clean.

Scope filter (mirrored in `src/engine-bundle-drift-core.ts` and `scripts/sync-engine-bundle.mjs`):

- **In scope**: `__init__.py`, `core/**/*.py`, `moda/**/*.py`, `music/**/*.py`.
- **Excluded**: `api/`, `installer/`, `sdk/`, `builtins/`, `config.py`, `__pycache__/`, `tests/`. (The engine source has more than the plugin needs; bundle is intentionally a subset.)

### Pure-core test convention

Non-trivial logic lives in pure-TS files (`src/<name>.ts` or `src/<name>-core.ts`) with no `import 'obsidian'`. Obsidian-coupled glue files in `src/` re-export the helpers and wire them into the plugin lifecycle. Tests in `src/*.test.ts` import only from the pure-core files; `node --test` runs cleanly without any Obsidian shim. See `src/engine-bundle-drift-core.ts` + `src/engine-bundle-drift.test.ts` for the canonical shape.

## License

See [LICENSE](LICENSE) and the engine repo for upstream attribution.

## Part of the Forge ecosystem

- Engine: https://github.com/frmoded/forge
- Vaults: https://github.com/frmoded/forge-moda, https://github.com/frmoded/forge-music
