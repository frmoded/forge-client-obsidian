# forge-moda

[TAGLINE — one sentence, e.g., "An educational vault for agent-based diffusion simulations in Forge."]

## What's inside

[BRIEF_DESCRIPTION — e.g., "Snippets implementing MoDa Unit 1 (diffusion).
Three roots (`setup`, `on_click`, `go`) mirror MoDa's event blocks. Run
them in an Obsidian vault with Forge installed; visualize via the
forge-moda-client React app embedded in the plugin."]

## Install

The easiest path is via the Forge Obsidian plugin's UI:

1. In a Forge-enabled vault, click the Forge ribbon icon.
2. If the vault has no `forge.toml`: pick "MoDa" in the wizard.
3. If it does: pick "Add domain to this vault…" → select "moda".

The plugin will fetch this vault from the registry and install it as a
subdirectory.

For programmatic install from a snippet:

```python
context.compute("install", "forge-moda")
```

Don't have Forge installed in Obsidian yet? See
[forge-client-obsidian](https://github.com/frmoded/forge-client-obsidian).

## Companion repo: forge-moda-client

The visualization layer — a React app embedded as an iframe inside
Obsidian — lives at https://github.com/frmoded/forge-moda-client.
forge-moda contains the snippets; forge-moda-client renders their output
and handles user interaction.

## Status

[STATUS — e.g., "Exploratory. Pedagogically informed but not yet
validated with classroom users. Active collaboration with [COLLABORATOR_NAMES]."]

## Contributors

[CONTRIBUTOR_LIST]

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.

## Part of the Forge ecosystem

- Main project: https://github.com/frmoded/forge
- Visualization client: https://github.com/frmoded/forge-moda-client
- Other vaults:
  - https://github.com/frmoded/forge-core
  - https://github.com/frmoded/forge-music
