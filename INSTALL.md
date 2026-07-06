# Installing the Forge Client Plugin

This plugin runs inside Obsidian. No terminal, git, npm, or Python
needed on your machine — everything is bundled into a single zip.

## Three-step install

### 1. Download the release zip

Open the [Releases page](https://github.com/frmoded/forge-client-obsidian/releases)
and download the most recent `forge-client-obsidian-vX.Y.Z.zip` from
its **Assets** section. Save it somewhere convenient (e.g. your
Downloads folder).

### 2. Find your Obsidian vault's plugin directory

- Open Obsidian.
- **Settings** → **About** → click **Open vault folder**.
- A file browser opens showing your vault's contents.
- Navigate into `.obsidian/plugins/`. You may need to enable "Show
  hidden files" in your file browser — `.obsidian` starts with a dot.
- If `.obsidian/plugins/` doesn't exist yet, create it.

### 3. Unzip into the plugins directory

- Unzip the release zip. You'll get a folder called
  `forge-client-obsidian`.
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

The plugin uses a hosted service to transpile note Descriptions into
Recipes (and Recipes into Python) via an LLM. You should have received
a token by email.

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
> simulation runs locally via bundled notes. Only Description → Recipe
> → Python authoring (the **Forge** button on an action note) needs
> the token. Contact the service operator if you need one.

## First Forge-click

When you open a fresh vault for the first time after install, the
plugin extracts two starter notes to vault root: `welcome.md` and
`greet.md`. Try them as your first Forge interaction.

1. In Obsidian's file tree, click `welcome.md`.
2. Click the **Forge** button at the top of the editor.
3. The Forge Output panel on the right shows two lines:

   ```
   Welcome to Forge.
   Hello world
   ```

That's the call graph in action: `welcome.md` prints its line, then
calls `greet.md` with `name = "world"`. Edit either file (rename
"world" to your own name, change the welcome text) and re-click
Forge to see your change.

If you don't see `welcome.md` and `greet.md` at vault root: the
extraction only runs when BOTH files are absent. Deleting one and
keeping the other signals "I'm past welcome" — the plugin won't
restore. Delete both and reload Obsidian to get them back.

## Verifying it works

1. Open the command palette: **Cmd-P** (Mac) or **Ctrl-P** (Windows/Linux).
2. Type **Forge** — you should see commands like "Forge: Run only
   (active snippet)" and "Forge: Open 3D View".
3. Run **Forge: Open 3D View**. A panel opens with a simulation
   canvas (~500 small pale-blue water particles in a rectangle).
4. Click the **Run simulation** button in the panel header. Wait a
   few seconds — first run initializes Python (one-time, takes 1-2
   seconds), then runs a 300-tick simulation in ~8 seconds. The
   canvas redraws with three distinct ink dispersions overlaid on
   the water.

If you see the ink dispersions, the install is healthy.

## State suffix legend

Every V2 action note has three facets — **Description** (prose intent),
**Recipe** (structured grammar that compiles to Python), **Python**
(the compiled or hand-authored code). All three are always visible in
the editor. Each facet renders a state suffix after its `#` heading
that tells you TWO things at once: which facet this one derives from
(its parent in the D → R → P chain), and whether that derivation
reflects current source content.

The six suffixes:

- **`— source`** (full color) — this facet drives runtime; content is
  authoritative.
- **`— derived from Description`** (60% opacity, Recipe only) — Recipe
  reflects current Description; regeneration was successful.
- **`— derived from Recipe`** (60% opacity, Python only) — Python
  reflects current Recipe.
- **`— derived from Description, out of date`** (50% opacity, Recipe
  only) — Recipe was derived from Description at some prior point;
  Description has since been edited. Forge to refresh.
- **`— derived from Recipe, out of date`** (50% opacity, Python only)
  — Python was derived from Recipe at some prior point; either Recipe
  was edited OR Recipe is transitively out of date from Description.
  Forge to refresh.
- **`— ignored`** (40% opacity) — this facet is upstream of the
  current canonical in the D → R → P chain and has no derivation
  relationship to it. Content preserved on disk but not participating
  in runtime.

### Worked example

You open an aligned action note:
- Description: `— source`
- Recipe: `— derived from Description`
- Python: `— derived from Recipe`

You edit Description. Save:
- Description: `— source`
- Recipe: `— derived from Description, out of date` (Recipe's lineage
  points at the old Description)
- Python: `— derived from Recipe, out of date` (Python is transitively
  out of date — the whole chain needs regeneration)

Click Forge. The pipeline re-runs: Description → Recipe → Python.
All three settle back to sync state.

If instead you edit Recipe:
- Description: `— ignored` (upstream of Recipe-canonical, no lineage)
- Recipe: `— source`
- Python: `— derived from Recipe, out of date`

Same rule for Python: edit Python and both Description + Recipe render
`— ignored`. Whichever facet you last hand-edit becomes the source.
Upstream facets go `— ignored`; downstream facets go `— out of date`
until you re-forge.

## Network requirements

The Pyodide compute path is fully offline once installed: all Python,
the music21 library, and the forge engine run inside your browser
without contacting any server. **One exception**: audio playback (the
play button on rendered music scores) uses `html-midi-player`, which
fetches SoundFont samples from `storage.googleapis.com/magentadata/`
on first play. The samples are browser-cached, so subsequent plays
work offline. If you're behind a strict firewall or air-gapped, audio
playback won't initialize — visual score rendering, all computation,
and freezing notes still work without network access.

## Authoring notes — hand-authored notes

**`# Dependencies` is engine-emitted, not author-emitted.** When you
write a note by hand (creating `.md` files in your vault without going
through `/generate`), the note won't have a `# Dependencies` block at
the bottom of its body. That's expected — per constitution B7, the
block is generated by static analysis on the Python facet at
`/generate` time, not authored manually.

**What you lose without it.** The wikilink right-click freeze
affordance needs wikilinks in the note body to operate on. If your
hand-authored note's body has no `[[note_name]]` references — only
backticked code like `context.compute('note_name', ...)` — the
right-click menu has nothing to target, so the freeze / unfreeze items
won't appear. **Workaround**: append a `# Dependencies` block manually
with the wikilinks your Python calls. For example:

```
# Dependencies

[[callee_one]] [[callee_two]]
```

The block doesn't change note behavior; it only enables the
right-click affordance. The `Cmd+P` → "Forge: Freeze edge"
command-palette path works regardless of whether `# Dependencies` is
present.

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

## What this plugin does

Forge is an Obsidian plugin for authoring **action notes** — small
executable notes with three facets (Description, Recipe, Python).
After install you can:

- Author notes in three linked facets and see the D → R → P lineage
  in real-time via the state suffix legend.
- Open the moda simulator (Cmd-P → "Forge: Open 3D View") and watch a
  live particle loop.
- Click the canvas to inject ink droplets; adjust temperature with
  the slider.
- Forge-click any action note in the vault to run it directly; the
  result shows in the Forge Output panel.
- Compose notes across the bundled `forge-moda`, `forge-music`, and
  `forge-tutorial` libraries plus your own vault notes.

All compute happens locally inside your Obsidian (via Pyodide).
No data leaves your machine except LLM-mediated `/generate` calls
authenticated with your transpile-service token.
