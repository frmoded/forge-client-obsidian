# Three fixes: diagnose print-not-showing, brighten console, spread ink particles

## Scope

Three independent fixes bundled because they share a
publish + reinstall tail (only Part C ships content):

**Part A — Diagnose: `print()` added to `on_mouse_click` doesn't
show in the React simulator console.** Investigative. Find where
the print actually lives on disk, find where the running simulator
resolves `on_mouse_click` from, report the mismatch (or, if no
mismatch, dig deeper into the stdout flow). Do not blindly move
the user's print — report the diagnosis and recommended fix, the
user decides.

**Part B — Bright theme for the React simulator console.** The
current console panel in `Simulator.module.css` is a very dark
surface (`oklch(0.18 0.01 240)`); the user wants it bright. Use
Obsidian theme variables with light-biased oklch fallbacks so the
panel reads as a light surface in both light and dark themes.

**Part C — Spread ink particles by giving each its own heading.**
Currently `create_ink_particles` draws a single shared heading per
click (`shared_heading = random.uniform(0, 2*π)`), so all 50
particles move as one coherent puff in one direction. Mirror the
pattern in `create_water_particles` — per-particle random heading
— so the puff disperses radially from the click point. Also a
light position jitter so the spawn doesn't look like a perfect
point.

`on_mouse_click` itself stays untouched (other than Part A's
diagnostic). The fix lives in `create_ink_particles`.

Does NOT:

- Change `on_mouse_click.md` content unilaterally. Part A's job
  is diagnosis; if a content edit is needed, that's a follow-up
  the user fires after seeing Part A's report.
- Change the plugin code (forge-client-obsidian).
- Change the engine or wire protocol.
- Change other vaults (music, etc.).
- Touch the existing chip pane or the simulator's other panels —
  only the console panel's colors and the ink-spawn snippet.

## Why

**Part A.** The user added a `print()` somewhere in
`on_mouse_click` to verify the v0.4.10 print-output feature, and
nothing appears in the simulator console. Most likely failure
mode: the print lives in a file that isn't the file the running
forge server resolves to. Per `forge/api/moda.py` line ~41, the
server reads `FORGE_MODA_VAULT_PATH` (env var, defaulting to
`~/projects/forge-vaults/forge-moda-vault/`). That's the
**authoring vault**, NOT Bluh. So if the user edited
`bluh/forge-moda/on_mouse_click.md` (or any other installed copy
or shadow), the simulator never sees their edit. Diagnose
explicitly.

**Part B.** The console added in v0.4.10 (#7 work) uses a dark
oklch surface. The user wants bright. Likely they're in Obsidian's
light theme and the dark console reads as an inserted black
rectangle. Light-biased styling with theme-variable adoption
fixes both the immediate aesthetic and the cross-theme
robustness.

**Part C.** A coherent puff moving in one direction is
pedagogically wrong — ink dropped in water disperses; the model
should show that. Random per-particle heading is the minimum
realistic behavior. Mirrors how `create_water_particles` already
handles its population (heading uniform in `[0, 2π)`).

## Files to modify

### Part A — Diagnosis (investigative; no content writes unless explicitly needed)

Files to **read and report on**:

- `/Users/odedfuhrmann/projects/forge-moda/on_mouse_click.md`
  (library source — what publishes to registry)
- `/Users/odedfuhrmann/projects/forge-vaults/forge-moda-vault/on_mouse_click.md`
  (authoring vault — what `FORGE_MODA_VAULT_PATH` defaults to)
- `/Users/odedfuhrmann/forge-vaults/bluh/forge-moda/on_mouse_click.md`
  (Bluh's library subdir — what the student-facing Bluh shows)
- `/Users/odedfuhrmann/forge-vaults/bluh/on_mouse_click.md`
  (Bluh's root shadow — wins via A4 in Bluh's own Obsidian
  context, but irrelevant to the running forge server)
- Any other `on_mouse_click.md` under `~/forge-vaults/foo` and
  `~/forge-vaults/dry-run-vault`

For each file:
1. `grep -n "print(" <file>` — report any matches with line
   number and surrounding context (1 line before, 1 line after).
2. If the file has been modified since v0.4.12 was published
   (check `git log` for `forge-moda-vault/on_mouse_click.md`
   if it's git-tracked; the others aren't), note that.

Then:
3. Read `forge/forge/api/moda.py` and report the exact value of
   `FORGE_MODA_VAULT_PATH` as the code defaults (no env override
   assumed). State: "The running simulator resolves
   `on_mouse_click` from `<that path>/on_mouse_click.md`."

4. **State the mismatch (or lack thereof).** Compare where the
   `print(` lives vs where the simulator resolves. Two outcomes:

   - **Mismatch found** (most likely): "Your print is in `<file>`,
     but the simulator runs against `<other file>`. Either move
     the print to `<other file>`, or launch uvicorn with
     `FORGE_MODA_VAULT_PATH=<dir of your print's file>` so the
     server resolves there."
   - **No mismatch** (print is in the right file): dig deeper.
     Hit `/moda/click` directly with `curl` or `requests` against
     a running uvicorn (if one is up — check
     `lsof -i :8000` or whatever the project's port is), inspect
     the response. If `stdout` field is missing or empty,
     instrument `_run_snippet` and confirm. Report findings.

5. **Do NOT move the print** as part of Part A. Report only;
   user decides where it should live.

If you find the diagnosis is "no print anywhere in any
on_mouse_click.md," report that — the user may have edited a
different file or undone their change.

### Part B — Bright console (CSS only)

`/Users/odedfuhrmann/projects/forge-moda-client/forge-moda-web/src/components/Simulator.module.css`

Current `.console`, `.consoleHeader`, `.consoleBody` rules use
dark oklch values. Replace with light-biased styling that adopts
Obsidian theme variables where available:

```css
.console {
  margin-top: 12px;
  border-radius: 6px;
  background: var(--background-secondary, oklch(0.96 0.005 240));
  border: 1px solid var(--background-modifier-border, oklch(0.85 0.01 240));
  overflow: hidden;
}

.consoleHeader {
  padding: 4px 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, oklch(0.45 0.02 240));
  background: var(--background-primary-alt, oklch(0.93 0.005 240));
  border-bottom: 1px solid var(--background-modifier-border, oklch(0.85 0.01 240));
}

.consoleBody {
  margin: 0;
  padding: 6px 10px;
  height: 80px;
  overflow-y: auto;
  font-family: var(--font-monospace, ui-monospace, SFMono-Regular, monospace);
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--text-normal, oklch(0.2 0.02 240));
  background: transparent;
}
```

Keep all the existing dimensions (80px body height, 11.5px font,
border radius, padding) — only the colors change.

After the CSS edit, **rebuild forge-moda-web** so the iframe
serves the updated bundle. Path:
```
cd /Users/odedfuhrmann/projects/forge-moda-client/forge-moda-web
npm run build
```

If the build pipeline copies the bundle into
forge-client-obsidian's assets (look for a copy step in
`package.json`, a build script, or an `assets/` directory under
the plugin), follow that too — the user's instruction is "CC
should build the obsidian client" for any change touching
forge-moda-web. If the relationship isn't clear from inspection,
report what you found and what you ran.

### Part C — Spread ink (content)

`/Users/odedfuhrmann/projects/forge-moda/create_ink_particles.md`

**English facet** — current body (lines 9-15):
```
Inputs: x, y

Create 50 ink particles at position `(x, y)`.
Each particle gets a random heading. All 50 particles in one click share a single randomly-drawn heading (so the drop emerges as a coherent puff, not a radial starburst), and each gets its own small random initial speed in `[0, 10)`.

Ink particles are appended to the simulation state; ids continue sequentially from the current maximum id. Mass is set by set_ink_mass; leave it at a 'medium' placeholder here.
```

Replace with:
```
Inputs: x, y

Create 50 ink particles near position `(x, y)`. Each particle gets a small position jitter (within ±3 units of the click) and its own random heading uniform in `[0, 2π)`, so the drop disperses radially from the click point. Each gets a small random initial speed in `[0, 10)`.

Ink particles are appended to the simulation state; ids continue sequentially from the current maximum id. Mass is set by [[set_ink_mass]]; leave it at a 'medium' placeholder here.
```

Note: also wikilinked `set_ink_mass` in the trailing prose since
it's a snippet reference (previously bare, the prior polish
deliberately didn't wikilink narrative prose, but this is an
imperative reference to what the next pipeline stage does — fair
to wikilink).

**Python facet** — change:
```python
    new_xs = numpy.full(count, float(x))
    new_ys = numpy.full(count, float(y))
    shared_heading = random.uniform(0, 2 * math.pi)
    new_headings = numpy.full(count, shared_heading)
```
to:
```python
    new_xs = float(x) + numpy.random.uniform(-3.0, 3.0, count)
    new_ys = float(y) + numpy.random.uniform(-3.0, 3.0, count)
    new_headings = numpy.random.uniform(0, 2 * math.pi, count)
```

Drop the unused `shared_heading` line entirely. Leave
`new_speeds`, `new_masses`, the concatenate block, and the return
unchanged.

**Mirror** the same edits to
`/Users/odedfuhrmann/projects/forge-vaults/forge-moda-vault/create_ink_particles.md`.

## Publish + reinstall (Part C only)

Part C ships content. Therefore:

1. Bump `forge-moda/forge.toml` version: `0.4.12 → 0.4.13`. Patch
   bump — visible-behavior change but non-breaking
   (the wire shape and snippet IDs unchanged). Note: if
   `publish-vault.sh` auto-bumps again (it did in the last two
   publishes), the final published version may end up at 0.4.14;
   report whatever lands.
2. Publish:
   ```bash
   bash ~/projects/forge-registry/scripts/publish-vault.sh --all
   ```
3. Reinstall the three consumer vaults using the harness script:
   ```bash
   cd /Users/odedfuhrmann/projects/forge && source .venv/bin/activate
   for vault in foo bluh dry-run-vault; do
     python /Users/odedfuhrmann/projects/forge-moda-bootstrap/scripts/reinstall-vault.py \
       /Users/odedfuhrmann/forge-vaults/$vault forge-moda
   done
   ```
4. Verify each vault's `forge.toml` pin updates and each
   `<vault>/forge-moda/create_ink_particles.md` carries the new
   Python (per-particle random heading + position jitter).

Parts A and B are NOT subject to publish/reinstall. Part B is a
React-side change deployed via the forge-moda-web build; Part A
is investigative.

## Tests

### Automated

- `cd ~/projects/forge && source .venv/bin/activate && pytest tests/api/test_moda.py tests/moda/ tests/core/test_llm.py -q`
- `cd ~/projects/forge-moda-client/forge-moda-web && npm test`

Should be no regressions. Part C's content change doesn't touch
any test fixtures.

### Manual GUI (user runs after this lands)

1. Open Bluh, open MoDa simulation, click into the canvas
   several times. Each click should produce a **dispersing puff**
   of ink — particles spreading out radially within a tick or
   two, not a single dot moving as a unit.
2. Console panel below the canvas should be a **light surface
   with dark text** (matching Obsidian's light theme or appearing
   light against a dark theme).
3. After Part A's diagnosis, the user moves the print to the
   recommended file and verifies the print line appears in the
   console on each click.

## Out of scope

- Changing `on_mouse_click.md` content. Part A is read-only.
- Changing `set_ink_speed`, `set_ink_mass`, or any other snippet
  in the click chain.
- Plugin-side (forge-client-obsidian) code changes.
- Engine, wire protocol, or stdout-capture mechanism changes
  unless Part A's deep-dive specifically requires one (in which
  case stop and report, don't ship the change in this prompt).
- New frontmatter fields or schema changes.
- Touching shadows at vault root. Per the prior reconcile
  prompt's pattern, shadows are user territory.
- Changes to the `# Dependencies` block in `create_ink_particles.md`
  — auto-synced from Python.
- A second "starburst vs puff" knob (e.g. toggleable cluster
  cohesion). Just ship the dispersion behavior.

## Report when done

Per protocol 8-section CC report. Specifically:

### Part A — Diagnosis findings

1. **`print(` matches per file** — full grep results across all
   on_mouse_click.md candidates, with line numbers and 1-line
   context.
2. **Running simulator resolution** — exact path the server
   reads from (`FORGE_MODA_VAULT_PATH` value + the resolved
   `on_mouse_click.md` path).
3. **Mismatch (or not)** — explicit statement of which file has
   the print vs which file runs.
4. **Recommended fix** — exactly what the user should do
   (e.g. "move your print from `<file_X>` to `<file_Y>`" OR
   "launch uvicorn with `FORGE_MODA_VAULT_PATH=<dir>`").
5. If no `print(` found anywhere in any on_mouse_click.md, say
   so explicitly.

### Part B — Console theme

6. **`Simulator.module.css` diff summary** — before/after for
   `.console`, `.consoleHeader`, `.consoleBody`.
7. **Build output** — what command(s) you ran, any
   bundle-copying step, whether the new bundle is in place for
   Obsidian to load.

### Part C — Ink spread

8. **`create_ink_particles.md` diff summary** — English body,
   Python compute lines changed, in both `forge-moda/` and
   `forge-moda-vault/`.

### Common (across all three parts)

9. **Version bump** — final published forge-moda version.
10. **Registry publish output** — final summary block.
11. **Reinstall results** — per-vault pre/post pin and post-flight
    verification of the new ink spawn shape in
    `<vault>/forge-moda/create_ink_particles.md`.
12. **Commit SHAs** — forge-moda (source + auto-bump), forge-
    moda-client (CSS commit), forge-registry (publish bump).
13. **Test results** — pytest pass count, vitest pass count.
14. **Any deviation and why.**
15. **One observation** — anything that came up during the
    diagnosis or build that's worth a follow-up.

## Don'ts

- **Don't move the user's `print()` statement.** Part A is
  diagnosis only; report findings and recommended action, leave
  the file edit to the user.
- **Don't change `on_mouse_click.md` content** in any way as part
  of this prompt. Out of scope.
- **Don't make Part B affect any other CSS rule** in
  `Simulator.module.css` — only the three console classes.
- **Don't touch root-level shadows** in any installed vault.
- **Don't drop the `# Dependencies` block** from
  `create_ink_particles.md`. Auto-synced; leave alone.
- **Don't auto-commit without bumping version + publishing** for
  Part C. The forge-moda-client Part B commit doesn't need a
  forge-moda publish (it's a separate repo), but DO commit Part B
  to forge-moda-client/main with a clear message.
- **Don't proceed past a per-vault install failure.** Stop, route
  to `failed/`, report.
- **Don't run `/generate`** on `create_ink_particles.md`. The
  English + Python edits are paired; regeneration would just
  reproduce what we already wrote.
- **Don't bundle a `forge-moda-client` build pipeline change**
  with this prompt. If the build pipeline is broken or unclear,
  report it; don't fix it here.
