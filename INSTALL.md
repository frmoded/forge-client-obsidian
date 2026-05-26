# Installing the Forge Client Plugin

This plugin runs inside Obsidian. No terminal, git, npm, or Python
needed on your machine — everything is bundled into a single zip.

## Three-step install

### 1. Download the release zip

Open the [v0.2.5 release page](https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.5)
and download `forge-client-obsidian-v0.2.5.zip` from the **Assets**
section. Save it somewhere convenient (e.g. your Downloads folder).

> **Closed-beta note:** this guide pins to **v0.2.5** specifically.
> Newer releases may exist on the [Releases page](https://github.com/frmoded/forge-client-obsidian/releases)
> but haven't been verified for this cohort — use v0.2.5 unless the
> link in this doc has been updated.

### 2. Find your Obsidian vault's plugin directory

- Open Obsidian.
- **Settings** → **About** → click **Open vault folder**.
- A file browser opens showing your vault's contents.
- Navigate into `.obsidian/plugins/`. You may need to enable "Show
  hidden files" in your file browser — `.obsidian` starts with a dot.
- If `.obsidian/plugins/` doesn't exist yet, create it.

### 3. Unzip into the plugins directory

- Unzip `forge-client-obsidian-v0.2.5.zip`. You'll get a folder
  called `forge-client-obsidian`.
- Move (or extract directly to) that folder so it lives at
  `<your-vault>/.obsidian/plugins/forge-client-obsidian/`.
- After this step you should have files like:
  - `<your-vault>/.obsidian/plugins/forge-client-obsidian/main.js`
  - `<your-vault>/.obsidian/plugins/forge-client-obsidian/manifest.json`
  - `<your-vault>/.obsidian/plugins/forge-client-obsidian/assets/`

### 4. Enable the plugin in Obsidian

- In Obsidian: **Settings** → **Community plugins**.
- If Community plugins are disabled, click **Turn on community plugins**
  first.
- You should see **Forge Client** in the installed plugins list.
  Toggle the switch on the right to enable it.
- Reload Obsidian if prompted (or `Cmd-P` → "Reload app without saving").

## Token setup (one-time)

The plugin uses a hosted service to transpile English snippet
descriptions into Python via an LLM. You should have received a
token by email.

1. Open Obsidian → **Settings** → scroll the left sidebar to
   **Forge Client** (under Community plugins).
2. In the right pane, find the **Transpile service** section at
   the top.
3. Paste your token into the **Transpile service token** field.
   The input is masked (●●●●) — that's expected.
4. Leave **Transpile service URL** at the default
   (`https://forge.thecodingarena.com`) unless instructed
   otherwise.

The token is stored locally in this vault's plugin data; it never
leaves your machine except as the `Authorization` header on
`/generate` requests to the service URL above.

> **No token yet?** The moda simulator works without one — the
> simulation runs locally via bundled snippets. Only English →
> Python authoring (the **Forge** button on a snippet's English
> facet) needs the token. Contact the service operator if you
> need one.

## Verifying it works

1. Open the command palette: **Cmd-P** (Mac) or **Ctrl-P** (Windows/Linux).
2. Type **Forge** — you should see commands like "Forge: Open MoDa
   simulation".
3. Run **Forge: Open MoDa simulation**. A panel opens with a
   simulation canvas (~500 small pale-blue water particles in a
   rectangle).
4. Click the **Run simulation** button in the panel header. Wait a
   few seconds — first run initializes Python (one-time, takes 1-2
   seconds), then runs a 300-tick simulation in ~8 seconds. The
   canvas redraws with three distinct ink dispersions overlaid on
   the water.

If you see the ink dispersions, the install is healthy.

## Troubleshooting

### Plugin doesn't appear in Settings → Community plugins

The unzip likely landed in the wrong place. Check that
`<your-vault>/.obsidian/plugins/forge-client-obsidian/main.js`
exists. If it's at
`<your-vault>/.obsidian/plugins/forge-client-obsidian/forge-client-obsidian/main.js`
(nested twice), move the inner folder up one level.

### Simulation panel is blank / canvas doesn't appear

Open Obsidian's Developer console: **Cmd-Opt-I** (Mac) or
**Ctrl-Shift-I** (Windows/Linux). Switch to the **Console** tab.
Look for red error messages.

Most common cause: the `assets/` directory didn't come along with
the unzip. Verify
`<your-vault>/.obsidian/plugins/forge-client-obsidian/assets/`
exists and contains subdirectories `engine/`, `iframe/`,
`pyodide/`, `vaults/`.

### "Forge: initializing Pyodide…" hangs past 30 seconds

Everything Pyodide needs is bundled locally — there's no network
fetch. A hang past 30 seconds means something failed silently.
Paste the dev console output (Console tab content) and reach out
for support.

### Updating to a new version

Repeat steps 1-3: download the new zip, unzip, and replace the
existing `forge-client-obsidian/` folder. Obsidian picks up the
changes on next reload.

## What this plugin does (V1 closed beta)

Forge is an Obsidian plugin for **moda** — a particle-simulation
sandbox. After install you can:

- Open the moda simulator and watch the live particle loop.
- Click the canvas to inject ink droplets.
- Adjust temperature with the slider.
- Click **Run simulation** to play a canned 300-tick scenario and
  see the final state.
- Forge-click any snippet under `<vault>/forge-moda/` to run it
  directly; the result shows in the Forge Output panel.

All compute happens locally inside your Obsidian (via Pyodide).
No data leaves your machine.

V1 is the moda-only release. Music (`forge-music`) bundling lands
in a later release.
