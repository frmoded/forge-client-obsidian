# Clean-Laptop Smoke — End-to-End Forge Validation

This document walks a validator (you, a colleague, or future-you on a
borrowed laptop) through every step of getting Forge working on a
mint machine — fresh macOS user account, no Obsidian installed, no
prior Forge state — with explicit expected outcomes at each step.

**Forge** is an LLM-augmented snippet authoring system delivered as
an Obsidian plugin: write a snippet's behavior in plain English, click
**Forge**, get Python that runs locally inside Obsidian via Pyodide.

**Pinned to plugin version v0.2.44 + forge-music vault v0.3.8.**
When future versions ship, this document needs a refresh — see *Doc
version pin* at the bottom.

**Success criterion:** when you finish *Phase 7*, Forge is fully
validated for V1 closed-beta on this machine. You can stop after any
earlier phase if the validator's scope is narrower (e.g., "moda only,
no music").

## Pre-conditions

Before starting, gather:

- **A mint laptop or fresh macOS user account.** This means no
  pre-installed Obsidian, no prior Forge install, no leftover `.obsidian`
  folders in `~`, no transpile token in keychain. If you're running on
  a long-used machine, the smoke can still work but masks the gaps a
  closed-beta student would hit — that's exactly the failure mode this
  document exists to prevent.
- **Internet access.** Phase 5 (Greet authoring) and Phase 6 (music
  audio playback) both need outbound HTTPS to `forge.thecodingarena.com`
  and `storage.googleapis.com` respectively. Air-gapped machines can
  complete Phases 1-4 only.
- **The transpile token.** A short string you should have received by
  email from the Forge service operator. Required from Phase 5 onward;
  Phases 1-4 work without it.
- **The download URL for the v0.2.44 release zip:**
  https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.44

**Estimated time:** 20-30 minutes if everything works on first try.
1-2 hours if you hit issues that require digging into the *Failure
modes* section at the bottom.

---

## Phase 1 — Install Obsidian

**Step 1.1 — Download Obsidian.** Open https://obsidian.md in a
browser. Click the **Download** button for macOS (the page should
auto-detect). A `.dmg` file downloads to your `~/Downloads` folder.
Expected: filename like `Obsidian-1.x.x.dmg`. Pin: any 1.x release
should work; 1.5+ has been validated against v0.2.44.

**Step 1.2 — Mount + install.** Double-click the `.dmg`. Drag the
Obsidian app icon into the **Applications** folder. Eject the disk
image. Open the Applications folder; double-click **Obsidian**.
Expected: a "Obsidian is an app downloaded from the Internet" dialog
appears the first time. Click **Open** to proceed past macOS
Gatekeeper.

**Step 1.3 — First-run flow: create a new vault.** Obsidian's first
launch shows a vault picker dialog. Click **Create new vault** (the
"+" icon or button labeled "Create"). Give it a name like
`forge-clean-smoke`. Choose a location like `~/forge-vaults/` (or
the default `~/Documents/`). Click **Create**.
Expected: Obsidian opens with the new vault active, empty file tree
on the left, a default Welcome note open in the editor. The vault's
filesystem path is now `~/forge-vaults/forge-clean-smoke/` (or
wherever you chose).

---

## Phase 2 — Install the Forge plugin

This phase mirrors `INSTALL.md` steps 1-4 verbatim with explicit
expected-outcome assertions added.

**Step 2.1 — Download the release zip.** Open
https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.44
in a browser. Under **Assets**, click `forge-client-obsidian-v0.2.44.zip`
to download.
Expected: a ~33 MB zip downloads to `~/Downloads/`. Filename:
`forge-client-obsidian-v0.2.44.zip`.

**Step 2.2 — Find the vault's plugin directory.** In Obsidian, open
**Settings** (gear icon at bottom-left, or `Cmd+,`). Click **About**
in the left sidebar. Click **Open vault folder**. A Finder window
opens showing your vault's contents.

In Finder, enable hidden files: `Cmd+Shift+.` (the `.obsidian/` folder
is hidden because it starts with a dot). Navigate into `.obsidian/`,
then into `plugins/`.

If `plugins/` doesn't exist yet, create it (right-click → New Folder →
name it `plugins`).
Expected: an empty `plugins/` folder inside `.obsidian/`. Full path:
`~/forge-vaults/forge-clean-smoke/.obsidian/plugins/`.

**Step 2.3 — Unzip into the plugins directory.** Double-click the
`forge-client-obsidian-v0.2.44.zip` in `~/Downloads/`. macOS unzips it
to `~/Downloads/forge-client-obsidian/`. Drag the unzipped folder into
the `plugins/` directory from Step 2.2.

After the move, the directory tree should look like:

```
~/forge-vaults/forge-clean-smoke/.obsidian/plugins/forge-client-obsidian/
  ├── main.js              (~12 MB)
  ├── manifest.json        (small)
  ├── styles.css           (small)
  └── assets/
      ├── engine/          (Python source bundle)
      ├── iframe/          (Moda-web bundle)
      ├── pyodide/         (~15 MB WASM + stdlib)
      ├── vaults/          (forge-moda + forge-music bundled content)
      └── wheels/          (~23 MB Python wheels including music21)
```

If after the move the path reads
`.obsidian/plugins/forge-client-obsidian/forge-client-obsidian/main.js`
(nested twice), move the inner folder up one level — this is a common
mistake.

**Step 2.4 — Enable the plugin.** Back in Obsidian, go to
**Settings → Community plugins**. If a "Turn on community plugins"
button appears, click it. You should see **Forge Client** in the
installed-plugins list with its toggle in the off position. Click the
toggle to enable.
Expected: a brief "Forge: initializing Pyodide…" notice or similar
appears at the bottom-right. After ~10 seconds the plugin is loaded.
Open the DevTools panel with `Cmd+Opt+I` (macOS) /
`Ctrl+Shift+I` (Linux/Windows) and switch to the **Console** tab.
You should see `Forge: runFirstRunCheck starting` and other
`Forge:`-prefixed log lines. The exact lines depend on whether music
is gated on (Phase 6) — for now, just confirm the plugin loaded
without red errors.

---

## Phase 3 — Token setup

**Step 3.1 — Open the Forge Client settings.** In Obsidian
**Settings**, scroll the left sidebar to **Community plugins**, find
**Forge Client** in the list of installed plugins, and click it. The
right pane should show Forge Client's settings UI.
Expected: a section labeled **Transpile service** at the top with two
fields — **Transpile service token** (a masked input) and
**Transpile service URL** (default `https://forge.thecodingarena.com`).

**Step 3.2 — Paste the token.** Click the **Transpile service token**
field and paste your token from the email. The input is masked
(shows ●●●● after paste) — that's expected, not a bug.
Expected: the field displays the masked-out token. Leave the
**Transpile service URL** field at its default unless instructed
otherwise.

**Step 3.3 — Verify persistence.** Close the Settings window
(`Esc` or click the X). Reopen Settings → Community plugins → Forge
Client. The token field should still show ●●●●.
Expected: persistence works. The token is now in
`<vault>/.obsidian/plugins/forge-client-obsidian/data.json` (not in
keychain — vault-local).

---

## Phase 4 — Verify base install (moda simulator)

This phase exercises the bundled `forge-moda` vault content without
needing the transpile token. If Phase 4 passes, the install is
healthy; you can confidently proceed to Phases 5-7 (which depend on
the token).

**Step 4.1 — Open the moda simulator.** Open the command palette:
`Cmd+P` (macOS) / `Ctrl+P` (Linux/Windows). Type **Forge** —
matching commands appear. Select **Forge: Open MoDa simulation**.
Expected: a panel opens in Obsidian with a particle-simulation
canvas: roughly 500 small pale-blue water particles arranged inside
a rectangle, plus a header bar with a **Run simulation** button.

**Step 4.2 — Run a simulation.** Click the **Run simulation** button
in the panel header. The first run pays a one-time ~1-2 second
Pyodide warmup. After ~8 seconds the canvas redraws with three
distinct ink dispersions (colored particles) overlaid on the water.
Expected: visible dispersion of three ink injections. If you see
this, base install is healthy.
Interpretation: the canvas stays static or shows only water → Pyodide
didn't fully boot; see Failure mode F4 below.

---

## Phase 5 — Author + Forge-click a Greet snippet

This phase exercises the load-bearing core workflow:
English-facet authoring → transpile to Python via the hosted service
→ run via Pyodide → output panel renders. Requires the transpile
token from Phase 3.

**Step 5.1 — Create a snippet file.** In Obsidian's file tree
(left sidebar), right-click the vault root → **New note**. Name the
file `greet.md`. The note opens in the editor.

**Step 5.2 — Paste the snippet content.** Copy the block below
(triple-backtick-fenced YAML + markdown) and paste it as the
ENTIRE content of `greet.md`, overwriting any default Obsidian
welcome text:

```
---
type: action
inputs: [name]
description: Reusable logic component that generates a personalized greeting.
---

# English

Print "Hello " followed by name.

---

# Python

```python
def compute(context, name):
  print(f"Hello {name}")
```
```

Save with `Cmd+S`.
Expected: the file is saved. Obsidian's live-preview shows the YAML
frontmatter at the top, then a **# English** heading with a one-line
paragraph, then a separator (`---`), then a **# Python** heading
with a fenced code block.

**Step 5.3 — Forge-click the snippet.** With `greet.md` open and
active in the editor, click the **Forge** (flame) icon in the
right-side action-bar at the top of the editor. (Alternatively:
`Cmd+P` → **Forge: Run only (active snippet)** if you've already
transpiled; for this first Forge-click on a fresh snippet, use the
flame icon to trigger Generate + Run.)
Expected: a small modal appears with a `name` input field (because
the snippet's frontmatter declares `inputs: [name]`). Type `world`
and click **Run**.

**Step 5.4 — Observe the output.** A network round-trip happens — the
hosted transpile service receives the English facet and returns
Python. The Python is written back to the `# Python` section of
`greet.md`. Then Pyodide executes it.
Expected: a **Forge Output** panel opens on the right showing
`Hello world` (no trailing punctuation). The `greet.md` file's
`# Python` section may show a slightly different `def compute`
implementation than what you pasted (the LLM-generated one), but
the printed output is the load-bearing assertion.
Interpretation: see Failure mode F5 if you see `Error: transpile
failed` or no output panel.

**Step 5.5 — Re-Forge-click to confirm idempotency.** Click the
**Forge** flame icon a second time on the same `greet.md`. The same
modal appears.
Expected: type `world` again → same output (`Hello world`). The
transpile step still happens — the LLM re-generates the Python — but
the output is identical. This is the expected baseline; it confirms
the workflow is repeatable.

---

## Phase 6 — Music domain (stretch but recommended for V1)

This phase enables the music domain, triggers auto-extraction of the
bundled `forge-music` vault (v0.3.8 at this pin), and exercises a
score-rendering snippet.

**Step 6.1 — Edit `forge.toml`.** In Obsidian's file tree, locate
`forge.toml` at the vault root. If it doesn't exist, create it
(right-click vault → New note → name it `forge.toml`). Edit the
contents to include a `domains = ["music"]` line. Minimal valid
content:

```
name = "forge-clean-smoke"
version = "0.0.1"
description = "smoke vault"
domains = ["music"]
```

Save with `Cmd+S`.
Expected: file saved. The `domains = ["music"]` declaration is the
gate that triggers forge-music extraction on next plugin load.

**Step 6.2 — Quit Obsidian completely.** Press `Cmd+Q` (macOS) —
NOT `Cmd+W`. `Cmd+W` only closes the current window; the plugin
process stays warm and won't re-evaluate `forge.toml`. `Cmd+Q` fully
quits.
Expected: Obsidian's dock icon disappears (or the application stops
appearing in `Activity Monitor` if you check).

**Step 6.3 — Relaunch + observe extraction.** Reopen Obsidian (it
should remember the vault). Open DevTools (`Cmd+Opt+I`) → **Console**
tab. Filter on `Forge:` in the console's search box.
Expected log lines on this first music-enabled boot:
- `Forge: runFirstRunCheck starting`
- `Forge: forge-moda already at version 0.4.16; skipping` (moda is
  always bundled regardless of the music gate)
- `Forge: extracted bundled forge-music into vault` (first install
  of the music vault — no prior extraction to compare against)
- File tree on the left now shows a new `forge-music/` directory at
  the vault root with subdirectories `blues/`, `percussion/`, plus
  some top-level snippets and a `forge.toml`.

On subsequent Obsidian restarts (with no version change), you'll
instead see `Forge: forge-music already at version 0.3.8; skipping`
— that's the v0.2.38 auto-re-extract path's match case.

**Step 6.4 — Forge-click a music snippet.** Open
`forge-music/blues/song.md`. This is a hand-authored snippet
(English + Python facets) that composes the whole 12-bar blues
song. Click the **Forge** flame icon (or `Cmd+P` →
**Forge: Run only (active snippet)**).
Expected: a Forge Output panel opens. After ~5-10 seconds of
computation (music21 is heavy), the panel shows a rendered SVG
score: multiple staves with notation, plus an audio playback
widget (`html-midi-player`) at the bottom with a play button.

**Step 6.5 — Audio playback (caveat).** Click the play button on
the audio widget. The first play fetches a SoundFont file from
`storage.googleapis.com/magentadata/` (~1-2 MB). After the fetch
completes, the score plays through your speakers.
Expected: audible blues song.
Caveat: this is a documented closed-beta network dependency (see
INSTALL.md → Network requirements). Air-gapped machines fail this
step but the visual score still renders. If the SoundFont fetch
fails (firewall blocking `storage.googleapis.com`), you'll see a
red error in DevTools but the score itself is unaffected.

---

## Phase 7 — Freeze affordance (stretch but recommended for V1)

This phase exercises the v0.2.41+ wikilink-context-menu freeze
affordance, then the v0.2.40 engine-side auto-qualify under the
hood, then the v0.2.44 state-aware menu items.

**Step 7.1 — Confirm `forge-music/blues/song.md` has a Dependencies
block.** Scroll to the bottom of `song.md`. You should see a
`# Dependencies` heading followed by wikilinks like
`[[chorus]] [[solo_chorus]] [[drum_chorus]]`.
Expected: the block is present. (If you authored a different snippet
without `# Dependencies`, append one manually per the **Authoring
notes** section of INSTALL.md — this is the v0.2.41 gotcha.)

**Step 7.2 — Forge-click song.md to capture edges.** With `song.md`
active, Forge-click it (flame icon). Wait for the Forge Output
panel to show the rendered score (~5-10 seconds).
Expected: score renders. This Forge-click writes snapshot files
for each `context.compute()` call in the song's Python — those are
the edges you'll freeze.

**Step 7.3 — Right-click a wikilink in the Dependencies block.**
In the `# Dependencies` section at the bottom of `song.md`, position
the cursor inside one of the wikilinks — for example, `[[chorus]]`.
Click directly on the link text, then right-click.
Expected: a context menu appears with two new entries:
- `Forge: Freeze edge song → chorus` (enabled — the edge is currently
  live)
- `Forge: Unfreeze edge song → chorus` (grayed out / disabled —
  nothing to unfreeze yet, state-aware menu from v0.2.44)

**Step 7.4 — Click Freeze.** Select the `Forge: Freeze edge song →
chorus` item.
Expected: a brief Obsidian Notice toast in the bottom-right reads
`Forge: frozen song → chorus`. No errors in DevTools.

**Step 7.5 — Forge-click again to confirm freeze.** Forge-click
`song.md` again. The compute runs.
Expected: the chorus output is identical to its previous value (the
frozen snapshot is being read instead of the chorus snippet
re-running). The rest of the song (solo, drums) re-runs freshly each
time, so total output may still vary subtly — but the chorus part
is pinned.

**Step 7.6 — Right-click → Unfreeze.** Right-click `[[chorus]]` in
the Dependencies block again. This time the menu shows:
- `Forge: Freeze edge song → chorus` (grayed / disabled — already
  frozen)
- `Forge: Unfreeze edge song → chorus` (enabled)

Click the Unfreeze item.
Expected: Notice `Forge: lived song → chorus`. The cosmetic "lived"
verb construction is `${verb}d` from the state name `live` — it's a
known minor wart, not a bug.

**Step 7.7 — Confirm randomness restored.** Forge-click `song.md`
again. The chorus part can now re-randomize each call.
Expected: the whole song re-runs fresh; chorus differs from the
frozen value.

---

## Failure modes — keyed to specific steps

**F1 (Phase 1.2) — First Obsidian launch hangs or shows "Obsidian.app
cannot be opened because the developer cannot be verified."**
Likely cause: macOS Gatekeeper blocks unsigned downloads on first
open. Fix: right-click `Obsidian.app` in Applications → select
**Open** → confirm in the dialog that appears. Subsequent launches
work normally.

**F2 (Phase 2.2) — Settings → About has no "Open vault folder"
button.**
Likely cause: you skipped Phase 1.3 (no vault was created). Open
the vault picker (Obsidian icon → File → Open Vault…) and create one
before continuing.

**F3 (Phase 2.3) — Plugin installs but Obsidian Community plugins
list doesn't show Forge Client.**
Likely cause: the unzip nested the folder twice. Check
`<vault>/.obsidian/plugins/forge-client-obsidian/main.js` exists at
that exact path; if it's at
`.obsidian/plugins/forge-client-obsidian/forge-client-obsidian/main.js`,
move the inner folder up one level. After fixing, in
Settings → Community plugins click the "Reload" icon to rescan.

**F4 (Phase 4.2) — Moda simulation canvas stays static after Run
simulation.**
Likely cause: Pyodide didn't finish booting (the warmup is sometimes
slow on first run). Open DevTools → Console; look for red errors. If
you see `Forge: initializing Pyodide…` still pending, wait 30 more
seconds. If you see a stack trace, the bundled engine may be corrupt
(re-do Step 2.3 unzip carefully).

**F5 (Phase 5.4) — Forge-click on greet.md produces `Error: transpile
failed` or no output panel.**
Three possible causes, check in order:
- Network blocked: confirm `curl -I https://forge.thecodingarena.com`
  returns `HTTP/1.1 200 OK` from Terminal.
- Token invalid: copy the token from your email more carefully (no
  leading/trailing spaces); re-paste in Settings → Forge Client →
  Transpile service token; click outside the field; reopen Settings
  to verify persistence per Step 3.3.
- Service down: contact the operator. Phases 1-4 still work without
  the transpile service.

**F6 (Phase 6.3) — Plugin reload doesn't show
`Forge: extracted bundled forge-music into vault` log line.**
Likely cause: `forge.toml` doesn't actually have the domains line, or
Obsidian wasn't fully quit. Check `forge.toml` content with the
File menu (the `domains = ["music"]` line must NOT be commented out
or inside an array on multiple lines). Then `Cmd+Q` (not `Cmd+W`)
and relaunch.

**F7 (Phase 6.4) — `forge-music/blues/song.md` Forge-click produces
`SnippetResolutionError: Snippet 'chorus' not found`.**
Likely cause: forge-music extraction was incomplete (a v0.2.38 bug
edge case). Check `<vault>/forge-music/blues/` contains `chorus.md`,
`solo_chorus.md`, etc. If not, manually delete the entire
`<vault>/forge-music/` directory, `Cmd+Q`, relaunch — the auto-
extract will redo the install from the bundle.

**F8 (Phase 7.3) — Right-click on `[[chorus]]` shows no
`Forge: Freeze edge` items in the context menu.**
Likely cause: cursor wasn't actually inside the wikilink bracket
span at right-click time (live preview hides the `[[` `]]` brackets,
so the click target visual differs from the cursor position).
Click directly on the link text (the word `chorus`), then right-
click without moving the mouse much. If still missing, in DevTools
Console run `app.metadataCache.getFileCache(app.workspace.getActiveFile()).frontmatter.type`
and verify it prints `"action"` — if anything else, the file isn't
detected as a snippet.

---

## End-state cleanup

After completing the smoke, the vault `forge-clean-smoke` is reusable
for re-validation. Persistent state:

- **Transpile token** lives in
  `<vault>/.obsidian/plugins/forge-client-obsidian/data.json` —
  survives Obsidian restarts but is vault-local.
- **forge-music vault** lives at `<vault>/forge-music/` — survives.
  If a future version of the plugin bundles a newer forge-music, the
  auto-re-extract path will back up the old version to
  `<vault>/forge-music.bak.0.3.8/` and re-extract fresh. You can
  delete these `.bak.*` directories if they accumulate (they're not
  re-used).
- **Snapshot files** from Phase 7 freeze/unfreeze are written to
  Pyodide's MEMFS and do NOT persist across Obsidian quit-and-
  reopen (known MEMFS-to-disk persistence gap, separate audit item).
  Re-doing Phase 7 after a restart starts fresh.

To reset for a clean re-smoke from Phase 4 onward:
- Delete `<vault>/greet.md` (Phase 5 artifact).
- Delete `<vault>/forge.toml` (Phase 6 setup).
- Delete `<vault>/forge-music/` (Phase 6 extraction).
- Restart Obsidian.

To reset everything (Phase 1+):
- Drag the vault folder to Trash.
- Drag Obsidian.app to Trash.
- Empty Trash.

---

## Doc version pin

This document is pinned to:

- **forge-client-obsidian** v0.2.44 (manifest.json)
- **forge-music** v0.3.8 (bundled vault forge.toml)

When future versions ship, re-validate the steps and refresh the
version numbers, sample log lines, and any UX details that may have
changed (modal labels, command names, etc.). The structure (Phases
1-7 + failure modes + cleanup) should remain stable; the version
specifics shift per release.
