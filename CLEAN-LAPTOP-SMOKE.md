# Clean-Laptop Smoke — End-to-End Forge Validation

This document walks a validator (you, a colleague, or future-you on a
borrowed laptop) through every step of getting Forge working on a
mint machine — fresh macOS user account, no Obsidian installed, no
prior Forge state — with explicit expected outcomes at each step.

**Forge** is an LLM-augmented snippet authoring system delivered as
an Obsidian plugin: write a snippet's behavior in plain English, click
**Forge**, get Python that runs locally inside Obsidian via Pyodide.

**Install path used by this smoke:** the canonical closed-beta
student path — **BRAT → Forge Installer → auto-fetched Forge Client
release**. BRAT installs latest by default; the smoke targets
"current latest stable" with **v0.2.44 as the floor**. Pin to a
specific version via Forge Installer's settings tab if you need
cohort consistency.

The manual direct-zip path (documented in `INSTALL.md`) is the
power-user / debugging fallback for operators who can't use BRAT —
it's NOT exercised here. Validating the BRAT path is the V1-ship
gate.

**Success criterion:** when you finish *Phase 8*, Forge is fully
validated for V1 closed-beta on this machine. You can stop after any
earlier phase if the validator's scope is narrower (e.g., "moda only,
no music").

## Pre-conditions

Before starting, gather:

- **A mint laptop or fresh macOS user account.** This means no
  pre-installed Obsidian, no prior Forge install, no leftover
  `.obsidian` folders in `~`, no transpile token in keychain. If
  you're running on a long-used machine, the smoke can still work
  but masks the gaps a closed-beta student would hit — that's
  exactly the failure mode this document exists to prevent.
- **Internet access.** BRAT and Forge Installer both fetch from
  GitHub; Phase 6 (Greet authoring) needs the transpile service;
  Phase 7 (music audio playback) needs `storage.googleapis.com`.
  Air-gapped machines can't complete the BRAT install path at all
  — they need the manual fallback in `INSTALL.md`.
- **The transpile token.** A short string you should have received
  by email from the Forge service operator. Required from Phase 6
  onward; Phases 1-5 work without it.

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

## Phase 2 — Turn on Community plugins + install BRAT

This phase mirrors `closed-beta-onboarding.md` §3.1 + §3.2 with
explicit expected-outcome assertions added per step.

**Step 2.1 — Open Community plugins settings.** Click the gear icon
at the bottom-left to open **Settings**. Click **Community plugins**
in the left sidebar.
Expected: the right pane shows a panel that either offers a "Turn
on community plugins" button (fresh install) or already shows the
**Browse** / **Installed** / **Updates** tabs (Community plugins
were enabled previously, e.g., on a re-smoke).

**Step 2.2 — Turn on community plugins.** If you see a **Turn on
community plugins** button, click it. A warning dialog appears
explaining that community plugins are third-party code; click
**Turn on community plugins** to confirm.
Expected: the warning dialog dismisses; the right pane now shows
**Browse** / **Installed** / **Updates** tabs. Community plugins
are enabled.

**Step 2.3 — Install BRAT.** Click **Browse** in the Community
plugins panel. In the search box, type `BRAT`. Find
**Obsidian42 - BRAT** in the list. Click **Install**, wait for it
to download, then click **Enable**.
Expected: BRAT installs (~1-2 seconds — it's tiny), enables, and
its plugin entry now shows the toggle in the on position. A new
**BRAT** entry appears in the left sidebar under "Community
plugins". BRAT's command palette entries (e.g.,
`BRAT: Add a beta plugin to install`) are now available via
`Cmd+P` (macOS) / `Ctrl+P` (Linux/Windows).

---

## Phase 3 — Install Forge via BRAT → Forge Installer

This phase mirrors `closed-beta-onboarding.md` §3.3 + §3.4. The two-
indirection install (BRAT installs Forge Installer; Forge Installer
auto-downloads Forge Client) is the canonical path because Forge
Client ships ~33 MB of bundled assets (Pyodide WASM, engine bundle,
forge-moda and forge-music vault content, music21 wheels) that BRAT
alone can't carry. Forge Installer is a ~20 KB bootstrapper that
BRAT *can* carry; on enable it downloads the full Forge Client
release zip and unpacks it into the vault's plugin directory.

**Step 3.1 — Add Forge Installer via BRAT.** Open the command
palette (`Cmd+P` (macOS) / `Ctrl+P` (Linux/Windows)) and type
**BRAT: Add a beta plugin to install**. Select that command. A
dialog appears asking for a repository.
In the dialog, paste the bootstrap repo: `frmoded/forge-installer`
Click **Add Plugin**.
Expected: the dialog dismisses. Forge Installer is fetched from
GitHub (~1-2 seconds) and auto-enables.

**Step 3.2 — Wait for the first Notice.** Watch the bottom-right of
the Obsidian window for a Notice toast reading
**"Forge Installer: downloading v0.X.Y …"** (where `v0.X.Y` is the
current Forge Client release tag, e.g., `v0.2.44`).
Expected: this Notice appears within ~5 seconds of the previous
step. If it doesn't appear, the installer didn't auto-run on enable
— see Failure mode F2 below.

**Step 3.3 — Wait for the install-completion Notice.** ~30 seconds
later (depending on your connection), a second Notice appears:
**"Forge Client installed — fresh → v0.X.Y"**.
Expected: this confirms the ~33 MB release zip was downloaded,
SHA-verified, unpacked into
`<vault>/.obsidian/plugins/forge-client-obsidian/`, and the
plugin is now ready to load. If the Notice never appears, see
Failure mode F3 below.

**Step 3.4 — Reload Obsidian.** Open the command palette (`Cmd+P`)
and select **Reload app without saving**. Obsidian reloads.
Expected: after reload, both **Forge Installer** AND **Forge Client**
appear in Settings → Community plugins → Installed, both with
their toggles in the on position. Forge Client's plugin process
starts; you'll see a "Forge: initializing Pyodide…" indicator
briefly, then nothing — the plugin is loaded.

**Footnote on rate-limiting.** GitHub's API rate-limits unauthenticated
requests. If Step 3.2 or 3.3 fails with a Notice mentioning
**"Forge Installer failed: GitHub API: …"**, that's almost always
transient. Open the command palette and run
**Check for Forge Client updates now** to manually re-trigger the
install flow. Same path; just on-demand instead of auto-fire.

---

## Phase 4 — Token setup

**Step 4.1 — Open Forge Client settings.** In Obsidian Settings,
scroll the left sidebar to **Forge Client** under "Community
plugins" (it'll appear below "Forge Installer"). Click it.
Expected: the right pane shows Forge Client's settings UI with a
section labeled **Transpile service** at the top.

**Step 4.2 — Paste the token.** Click the **Transpile service
token** field and paste your token from the email. The input is
masked (shows ●●●● after paste).
Expected: the field displays the masked-out token. Leave the
**Transpile service URL** field at its default
(`https://forge.thecodingarena.com`) unless you've been told
otherwise.

**Step 4.3 — Verify persistence.** Close Settings (`Esc` or click
the X). Reopen Settings → Community plugins → Forge Client. The
token field should still show ●●●●.
Expected: persistence works. The token is now in
`<vault>/.obsidian/plugins/forge-client-obsidian/data.json` —
vault-local, not in keychain. Forge Installer preserves
`data.json` across plugin updates, so your token survives future
Forge Client upgrades.

---

## Phase 5 — Verify base install (moda simulator)

This phase exercises the bundled `forge-moda` vault content without
needing the transpile token. If Phase 5 passes, the install is
healthy; you can confidently proceed to Phases 6-8 (which depend on
the token).

**Step 5.1 — Open the moda simulator.** Open the command palette
(`Cmd+P` / `Ctrl+P`). Type **Forge** — matching commands appear.
Select **Forge: Open MoDa simulation**.
Expected: a panel opens with a particle-simulation canvas — roughly
500 small pale-blue water particles in a rectangle, plus a header
bar with a **Run simulation** button.

**Step 5.2 — Run a simulation.** Click **Run simulation** in the
panel header. The first run pays a one-time ~1-2 second Pyodide
warmup; after ~8 seconds the canvas redraws with three distinct ink
dispersions overlaid on the water.
Expected: visible dispersion of three colored ink injections. If
you see this, base install is healthy.
Interpretation: the canvas stays static or shows only water →
Pyodide didn't fully boot. See Failure mode F4.

---

## Phase 6 — Author + Forge-click a Greet snippet

Load-bearing core workflow validation. Requires the transpile token
from Phase 4.

**Step 6.1 — Create a snippet file.** In Obsidian's file tree,
right-click the vault root → **New note**. Name it `greet.md`. The
note opens in the editor.

**Step 6.2 — Paste the snippet content.** Replace the file's content
with:

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
Expected: file saved. Live preview shows the YAML frontmatter,
`# English` heading + paragraph, separator, `# Python` heading +
fenced code block.

**Step 6.3 — Forge-click.** With `greet.md` active, click the
**Forge** (flame) icon in the editor's right-side action bar.
Expected: a small modal appears with a `name` input field
(because the snippet's frontmatter declares `inputs: [name]`).
Type `world` and click **Run**.

**Step 6.4 — Observe the output.** A network round-trip happens —
the hosted transpile service receives the English facet and returns
Python. The Python is written back to the `# Python` section of
`greet.md`. Pyodide executes it.
Expected: a **Forge Output** panel opens on the right showing
`Hello world` (no trailing punctuation). The `greet.md` file's
`# Python` section may show a slightly different `def compute`
implementation than what you pasted (the LLM-generated one) — the
printed output is the load-bearing assertion.
Interpretation: see Failure mode F5 if you see `Error: transpile
failed` or no output panel.

**Step 6.5 — Re-Forge-click to confirm idempotency.** Click the
**Forge** flame icon a second time. The same modal appears.
Expected: type `world` again → same output (`Hello world`). The
transpile step still happens (LLM re-generates), but the
printed output is identical.

---

## Phase 7 — Music domain (stretch but recommended for V1)

Enables the music domain, triggers auto-extraction of the bundled
`forge-music` vault, and exercises a score-rendering snippet.

**Step 7.1 — Edit `forge.toml`.** In the vault file tree, locate
`forge.toml` at the vault root (create it if missing: right-click
vault → New note → name it `forge.toml`). Edit to include
`domains = ["music"]`. Minimal valid content:

```
name = "forge-clean-smoke"
version = "0.0.1"
description = "smoke vault"
domains = ["music"]
```

Save with `Cmd+S`.
Expected: file saved. The `domains = ["music"]` declaration gates
forge-music extraction on next plugin load.

**Step 7.2 — Quit Obsidian completely.** Press `Cmd+Q` (macOS) —
NOT `Cmd+W`. `Cmd+W` only closes the current window; the plugin
process stays warm and won't re-evaluate `forge.toml`. `Cmd+Q`
fully quits.
Expected: Obsidian's dock icon disappears.

**Step 7.3 — Relaunch + observe extraction.** Reopen Obsidian (it
remembers the vault). Open Developer Tools with `Cmd+Opt+I`
(macOS) / `Ctrl+Shift+I` (Linux/Windows). Switch to the **Console**
tab. Filter on `Forge:` in the console's search box.
Expected log lines on this first music-enabled boot:
- `Forge: runFirstRunCheck starting`
- `Forge: forge-moda already at version 0.4.16; skipping` (moda
  is always bundled regardless of the music gate)
- `Forge: extracted bundled forge-music into vault` (first install)
- File tree on the left now shows `forge-music/` at the vault root
  with subdirectories `blues/`, `percussion/`, plus top-level
  snippets and a `forge.toml`.

Subsequent restarts (no version change) show
`Forge: forge-music already at version 0.3.8; skipping` — the
v0.2.38 auto-re-extract match case.

**Step 7.4 — Forge-click a music snippet.** Open
`forge-music/blues/song.md`. Click the **Forge** flame icon.
Expected: after ~5-10 seconds of computation (music21 is heavy),
the Forge Output panel shows a rendered SVG score — multiple
staves with notation, plus an audio playback widget at the bottom.

**Step 7.5 — Audio playback (caveat).** Click the play button on
the audio widget. The first play fetches a SoundFont file from
`storage.googleapis.com/magentadata/` (~1-2 MB). After the fetch
completes, the score plays through your speakers.
Expected: audible blues song.
Caveat: documented closed-beta network dependency. Air-gapped
machines fail this step but the visual score still renders.

---

## Phase 8 — Freeze affordance (stretch but recommended for V1)

Exercises the v0.2.41+ wikilink-context-menu freeze affordance, the
v0.2.40 engine-side auto-qualify under the hood, and the v0.2.44
state-aware menu items.

**Step 8.1 — Confirm `forge-music/blues/song.md` has Dependencies.**
Scroll to the bottom of `song.md`. You should see a `# Dependencies`
heading followed by wikilinks like
`[[chorus]] [[solo_chorus]] [[drum_chorus]]`.
Expected: the block is present (forge-music ships it). If you
authored a different snippet without the block, append one
manually per the **Authoring notes** section of INSTALL.md — this
is the v0.2.41 hand-authored-snippet gotcha.

**Step 8.2 — Forge-click song.md to capture edges.** With `song.md`
active, Forge-click. Wait for the score to render (~5-10 seconds).
Expected: score renders. This Forge-click writes snapshot files
for each `context.compute()` call in song's Python — the edges
you'll freeze.

**Step 8.3 — Right-click a wikilink.** In the `# Dependencies`
block, position the cursor inside `[[chorus]]`. Click directly on
the link text, then right-click.
Expected: context menu shows two new entries:
- `Forge: Freeze edge song → chorus` (enabled — currently live)
- `Forge: Unfreeze edge song → chorus` (grayed out — nothing to
  unfreeze yet; v0.2.44 state-aware behavior)

**Step 8.4 — Click Freeze.** Select
`Forge: Freeze edge song → chorus`.
Expected: a Notice toast: `Forge: frozen song → chorus`. No
errors in DevTools.

**Step 8.5 — Forge-click again to confirm freeze.** Forge-click
`song.md`.
Expected: chorus output is identical to its previous value (the
frozen snapshot is read instead of chorus re-running). The rest
of the song (solo, drums) re-runs freshly, so total output may
still vary subtly — but the chorus part is pinned.

**Step 8.6 — Right-click → Unfreeze.** Right-click `[[chorus]]`
again. This time:
- `Forge: Freeze edge song → chorus` (grayed — already frozen)
- `Forge: Unfreeze edge song → chorus` (enabled)

Click the Unfreeze item.
Expected: Notice `Forge: lived song → chorus`. The cosmetic
"lived" verb construction (`${verb}d` from state name `live`) is
a known minor wart, not a bug.

**Step 8.7 — Confirm randomness restored.** Forge-click `song.md`
again.
Expected: chorus can re-randomize each call. Song re-runs fresh;
chorus differs from the previously-frozen value.

---

## Failure modes — keyed to specific steps

**F1 (Phase 1.2) — First Obsidian launch hangs or shows "Obsidian.app
cannot be opened because the developer cannot be verified."**
Likely cause: macOS Gatekeeper blocks unsigned downloads on first
open. Fix: right-click `Obsidian.app` in Applications → select
**Open** → confirm in the dialog.

**F2 (Phase 3.2) — "Forge Installer: downloading …" Notice never
appears.**
The `frmoded/forge-installer` plugin didn't auto-run on enable.
Open the command palette and run **Check for Forge Client updates
now** — that's the same flow, manually triggered. (Canonical
workaround per `closed-beta-onboarding.md` §6.)

**F3 (Phase 3.3) — Notice says "Forge Installer failed: GitHub
API: …" or the install-completion Notice never appears.**
Almost always a transient GitHub rate-limit or network blip. Open
the command palette → **Check for Forge Client updates now** to
retry. If it persistently fails, contact the cohort operator.

**F4 (Phase 3.4) — After reload, Forge Client doesn't appear in
Settings → Community plugins.**
Likely cause: partial unzip or Obsidian didn't re-scan the plugin
directory. Two fixes in order:
- Toggle **Community plugins** off and back on once; Obsidian
  re-scans on enable.
- If still missing, disable + re-enable Forge Installer to
  re-trigger the download and unpack flow.

**F5 (Phase 5.2) — Moda simulation canvas stays static after Run
simulation.**
Likely cause: Pyodide didn't finish booting. Open DevTools →
Console; look for red errors. If you see `Forge: initializing
Pyodide…` still pending, wait 30 more seconds. If you see a stack
trace, the bundled engine may be corrupt — disable + re-enable
Forge Installer to re-fetch the release zip.

**F6 (Phase 6.4) — Forge-click on greet.md produces `Error:
transpile failed` or no output panel.**
Three possible causes, check in order:
- Network blocked: confirm `curl -I https://forge.thecodingarena.com`
  returns `HTTP/1.1 200 OK` from Terminal.
- Token invalid: copy the token from your email more carefully (no
  leading/trailing spaces); re-paste in Settings → Forge Client →
  Transpile service token; verify persistence per Step 4.3.
- Service down: contact the operator. Phases 1-5 still work
  without the transpile service.

**F7 (Phase 7.3) — Plugin reload doesn't show `Forge: extracted
bundled forge-music into vault` log line.**
Likely cause: `forge.toml` doesn't actually have the domains line,
or Obsidian wasn't fully quit. Check `forge.toml` content (the
`domains = ["music"]` line must NOT be commented out or inside a
multi-line array). Then `Cmd+Q` (not `Cmd+W`) and relaunch.

**F8 (Phase 7.4) — `forge-music/blues/song.md` Forge-click produces
`SnippetResolutionError: Snippet 'chorus' not found`.**
Likely cause: forge-music extraction was incomplete. Check
`<vault>/forge-music/blues/` contains `chorus.md`, `solo_chorus.md`,
etc. If not, manually delete the entire `<vault>/forge-music/`
directory, `Cmd+Q`, relaunch — the auto-extract will redo the
install from the bundle. If `<vault>/forge-music/` is still missing
content after relaunch, that points back to F3 (incomplete install
from Forge Installer); re-run the Forge Installer update flow.

**F9 (Phase 8.3) — Right-click on `[[chorus]]` shows no
`Forge: Freeze edge` items in the context menu.**
Likely cause: cursor wasn't inside the wikilink bracket span at
right-click time (live preview hides the `[[` `]]` brackets, so
the click target visual differs from the cursor position). Click
directly on the link text (the word `chorus`), then right-click
without moving the mouse much. If still missing, in DevTools
Console run `app.metadataCache.getFileCache(app.workspace.getActiveFile()).frontmatter.type`
and verify it prints `"action"` — anything else and the file isn't
detected as a snippet.

---

## End-state cleanup

After completing the smoke, the vault `forge-clean-smoke` is reusable
for re-validation. Persistent state:

- **Transpile token** lives in
  `<vault>/.obsidian/plugins/forge-client-obsidian/data.json` —
  survives Obsidian restarts AND Forge Client upgrades (Forge
  Installer preserves `data.json` across release zip unpacks).
- **forge-music vault** lives at `<vault>/forge-music/` — survives.
  Future Forge Client versions with newer `forge-music` bundles
  trigger the v0.2.38 auto-re-extract path (`<vault>/forge-music/`
  backed up to `<vault>/forge-music.bak.0.3.8/`, fresh copy
  extracted). You can delete accumulated `.bak.*` directories;
  they're not re-used.
- **Snapshot files** from Phase 8 freeze/unfreeze are written to
  Pyodide's MEMFS and do NOT persist across Obsidian quit-and-
  reopen (known MEMFS-to-disk persistence gap; separate audit
  item). Re-doing Phase 8 after a restart starts fresh.

To reset for a clean re-smoke from Phase 5 onward:
- Delete `<vault>/greet.md` (Phase 6 artifact).
- Delete `<vault>/forge.toml` (Phase 7 setup).
- Delete `<vault>/forge-music/` (Phase 7 extraction).
- Restart Obsidian.

To reset everything (Phase 1+):
- Drag the vault folder to Trash.
- Drag Obsidian.app to Trash.
- Empty Trash.

---

## Doc version pin

This document targets:

- **forge-client-obsidian** v0.2.44 or later (manifest.json floor;
  BRAT installs latest by default).
- **forge-music** v0.3.8 or later (bundled vault forge.toml floor).

The `frmoded/forge-installer` plugin can pin to a specific Forge
Client version via its settings tab (**Pin to specific version**)
— useful for cohort-wide rollback to a known-good release. Leave
the pin empty to track latest.

When future versions ship with substantively different behavior
(modal labels, command names, log lines, etc.), refresh this
document to match. The structure (Phases 1-8 + failure modes +
cleanup) should remain stable; the version-specific details shift
per release.

---

## Revision history

**2026-06-04**: rewrote Phases 2-3 to use the canonical
BRAT → Forge Installer install path. Earlier version (commit
`75264da`) used direct-zip download which is the manual / fallback
path documented in `INSTALL.md`, not the canonical student flow
documented in `closed-beta-onboarding.md`. The protocol-level "no
BRAT" rule from `cc-prompt-queue.md` and the original 1930 prompt's
direct-zip-only framing were both based on a misreading of
INSTALL.md as canonical; this revision corrects to the actual
canonical path.
