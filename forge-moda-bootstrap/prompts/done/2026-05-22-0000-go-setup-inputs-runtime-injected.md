# Make `go` and `setup` Forge-click run with defaults (no input dialog)

## Scope

Two surgical edits in forge-moda so clicking the Forge button on
`go` or `setup` runs the snippet immediately with defaults, instead
of opening the `ForgeRunModal` asking for `state`/`dt`/`temperature`
(go) or `temperature` (setup). Plus a Python default for setup's
`temperature` parameter, plus the English-facet trim that drops the
now-non-interactive parameters from the student-visible body, plus
`generation_notes` plumbing so `/generate` reproduces the right
Python after the English trim. Then version bump, registry
publish, and reinstall the three consumer vaults.

The fix uses the **existing** `inputs:` frontmatter semantics: it
declares **UI inputs the student types into the modal**, distinct
from the Python signature. The simulator's moda fast-path
(`_run_snippet("go", args=(state, dt, temperature))`,
`_run_snippet("setup", args=("medium",))`) passes positional args
directly and doesn't read frontmatter `inputs:`. So `inputs: []`
correctly declares "no UI inputs; runtime injects the args" — which
is exactly true for the two event roots.

`on_mouse_click` is **out of this prompt**. It's a click event with
no sensible default for x/y; the modal stays so manual Forge-click
still works as an exploratory tool.

Does NOT:

- Change the plugin. The plugin's existing rule
  (`main.ts:1195 → inputs.length > 0 ? modal : run`) does the right
  thing once we declare the inputs list correctly.
- Change the engine, the wire protocol, or any other vault.
- Refactor dt to ambient `context.dt`. Separate architectural
  discussion, deferred.
- Touch `on_mouse_click.md`.
- Touch user shadows at vault root (`bluh/go.md`, etc.). Install
  path covers library subdirs only.

## Why

MoDa event roots (`go`, `setup`, `on_mouse_click`) are fired by the
simulation runtime — they're event handlers, not interactive
snippets. The simulator computes args and passes them positionally;
`go(state, dt, temperature)` runs every tick with simulator-derived
values. Clicking the Forge button on `go` should "run go," not
"ask me what state/dt/temperature to use."

Currently `go.md`'s frontmatter declares
`inputs: [state, dt, temperature]`, so the plugin's `ForgeRunModal`
opens asking for those three values. Same for setup
(`inputs: [temperature]`). This conflates two concepts that the
existing `inputs:` field already distinguishes between: **UI inputs
the student types** vs. **Python signature parameters the runtime
passes**.

The fix is to declare what's true: `inputs: []` (no UI inputs) on
the two event roots that have sensible runtime defaults. Python
signature keeps the parameters so the runtime can pass values
positionally. Forge-click runs with defaults; simulator runs with
whatever values it computes.

This works because the gating in the plugin is "are there any UI
inputs?" not "is this a parameterless snippet?" — and it works
without any plugin change.

## Files to modify

### Library — `/Users/odedfuhrmann/projects/forge-moda/`

**`go.md`:**

- Frontmatter: change `inputs: [state, dt, temperature]` to
  `inputs: []`.
- English body — current (lines 23-30):
  ```
  # English

  Inputs: state (optional), dt (optional), temperature (optional)

  Defaults when omitted: `state` → None, `dt` → 1/30, `temperature` → "medium".

  Call [[ask_all_particles]] with dt.
  Call [[ask_water_particles]] with temperature.
  ```
  After:
  ```
  # English

  Call [[ask_all_particles]] with dt.
  Call [[ask_water_particles]] with temperature.
  ```
  (Keep `with dt` and `with temperature` in the Call lines — those
  are runtime values the snippet threads through to its callees;
  removing them would require deeper changes the callees can't
  absorb cleanly.)
- `generation_notes` — preserve the existing block, append a
  signature constraint so `/generate` produces the right Python
  even though the English body no longer mentions the parameters.
  Append after the existing content:
  ```
  Python signature must be:
    def compute(context, state=None, dt=1/30, temperature="medium")
  These parameters are runtime-injected by the moda simulator's
  /moda/compute fast-path. The English body intentionally doesn't
  mention them — they're not student-visible knobs. Defaults:
  state=None triggers the snapshot read, dt=1/30 is the 30Hz
  default, temperature="medium" matches the simulator's default
  slider position and is used when a student clicks the Forge
  button manually.
  ```
- Python facet — **NO CHANGE**. The signature already has all
  defaults (`def compute(context, state=None, dt=1/30, temperature="medium")`).

**`setup.md`:**

- Frontmatter: change `inputs: [temperature]` to `inputs: []`.
- English body — current (lines 8-17):
  ```
  # English

  Inputs: temperature

  Establish an empty chamber: a brand-new simulation state with no particles, 800 units wide and 600 units tall, tick 0. (These are the v1 defaults; there is no scenario lookup.)
  Call [[create_water_particles]].
  Call [[set_water_speed]] with temperature.
  Call [[set_water_mass]].

  This is the initial-population event and the ORIGIN of the simulation state — it takes no incoming state. It builds the empty 800×600 chamber itself.
  ```
  After: drop the `Inputs: temperature` line and the empty line
  that follows it. Keep everything else verbatim, including
  `with temperature` in the Call line.
- `generation_notes` — setup.md doesn't currently have a
  `generation_notes` block. ADD one:
  ```yaml
  generation_notes: |
    Python signature must be:
      def compute(context, temperature="medium")
    The `temperature` parameter is runtime-injected by /moda/init
    (which passes args=("medium",) at session-start). The English
    body intentionally doesn't list it as a student input — it's a
    simulator-provided value. Default "medium" matches the
    simulator's default slider position and is used when a student
    clicks the Forge button manually.
  ```
- Python facet — change `def compute(context, temperature):` to
  `def compute(context, temperature="medium"):`. Single signature
  edit; nothing else in the function body changes.

### Authoring vault — `/Users/odedfuhrmann/projects/forge-vaults/forge-moda-vault/`

Mirror the same edits to `forge-moda-vault/go.md` and
`forge-moda-vault/setup.md`.

### Version

`forge-moda/forge.toml`: bump from `0.4.10` to `0.4.11`. Patch
bump — non-breaking content/frontmatter change. (Note: if
`publish-vault.sh` auto-bumps again as it did in the v0.4.9 →
v0.4.10 round, the published version may end up higher; report
whatever lands.)

## Publish + reinstall

After the file edits and version bump:

1. **Publish** to registry:
   ```bash
   bash ~/projects/forge-registry/scripts/publish-vault.sh --all
   ```
2. **Reinstall** the three consumer vaults using the script from
   the prior reconcile prompt:
   ```bash
   cd /Users/odedfuhrmann/projects/forge && source .venv/bin/activate
   for vault in foo bluh dry-run-vault; do
     python /Users/odedfuhrmann/projects/forge-moda-bootstrap/scripts/reinstall-vault.py \
       /Users/odedfuhrmann/forge-vaults/$vault forge-moda
   done
   ```
3. **Verify** each vault's `forge.toml` dep pin updates to the
   newly-published version.
4. **Verify** each vault's `<vault>/forge-moda/go.md` and
   `<vault>/forge-moda/setup.md` carry the new `inputs: []`
   frontmatter and the trimmed English body.

## Shadows

User shadows at vault root are **NOT touched** by this prompt.
Specifically:

- `bluh/go.md` still has the user's `print("foo")` lines and the
  pre-polish narrative. Out of scope; user reconciles by hand or
  deletes the shadow.
- `bluh/setup.md`, `bluh/on_mouse_click.md` were polished in the
  v0.4.10 round. After this prompt, `bluh/setup.md` will be stale
  relative to v0.4.11 (carries the old `inputs: [temperature]`
  frontmatter). User reconciles by deleting the shadow or
  hand-applying the change.
- Same for any `foo/` and `dry-run-vault/` shadows.

**Flag the stale shadows in the report** so the user has a punch
list. Don't delete or modify any of them.

## Tests

### Automated (forge)

Run:

```bash
cd /Users/odedfuhrmann/projects/forge && source .venv/bin/activate
pytest tests/api/test_moda.py tests/moda/ tests/core/test_llm.py -q
```

The test vault's setup snippet uses its own frontmatter
(`inputs: [temperature]`, `def compute(context, temperature)` —
test isolation), so this prompt's library frontmatter change should
not affect tests. If anything fails, stop, route to `failed/`, and
report concretely.

### Manual GUI verification (deferred to user)

To be run after the reinstall lands. List in the report; the user
will walk through them:

1. Open Bluh in Obsidian.
2. Open `bluh/forge-moda/go.md`. Confirm frontmatter has
   `inputs: []` and the English body has only the two
   `Call [[...]]` lines (no `Inputs:`/`Defaults:` lines).
3. Click the Forge button on the open `go.md`. Confirm:
   - **No modal opens.**
   - Snippet runs (output panel populates, no errors).
4. Same checks for `bluh/forge-moda/setup.md`. Forge-click runs
   with `temperature="medium"` default.
5. Open `bluh/forge-moda/on_mouse_click.md`. Click Forge.
   Confirm the modal **still opens** asking for x/y/state — sanity
   check that the change is scoped.
6. Open the MoDa simulator (Cmd+P → Forge: Open MoDa simulation).
   Confirm:
   - `/moda/init` still works (sets up the chamber).
   - `/moda/compute` ticks advance normally.
   - `/moda/click` still works (canvas click adds ink).

## Out of scope

- `on_mouse_click.md`. Stays as-is; manual Forge-click still asks
  for x/y/state.
- Plugin code changes. The existing
  `inputs.length > 0 → ForgeRunModal` rule is correct.
- Engine, wire protocol, React iframe, any backend changes.
- Ambient `context.dt` refactor. Separate architectural
  discussion.
- Other vaults (music, forge-core, etc.). Pure forge-moda change.
- Re-running `/generate` on the modified snippets. The
  English-trim + generation_notes addition makes the Python
  regenerable, but verification is a separate optional step.
- Reconciling bluh shadows. Per the prior reconcile prompt's
  pattern, shadows are user territory.
- The `# Dependencies` block in either file. Auto-synced from
  Python; don't touch.
- Adding `runnable_with_defaults: true` or any other new
  frontmatter field. Use existing `inputs:` semantics.

## Report when done

Per protocol 8-section CC report. Specifically:

1. **`go.md` changes** — exact lines edited: frontmatter `inputs:`,
   English body lines dropped, `generation_notes` append.
2. **`setup.md` changes** — frontmatter, English body line drop,
   `generation_notes` ADDED, Python signature default.
3. **`forge-moda-vault` mirror** — confirm same two files edited
   identically.
4. **Version bump** — `forge.toml` v0.4.10 → v0.4.11 (note auto-bump
   if `publish-vault.sh` adds another).
5. **Registry publish** — script output snippet showing the final
   published version.
6. **Reinstall results** — for each of foo, bluh, dry-run-vault:
   pre-install manifest pin, install result line, post-install
   manifest pin.
7. **Stale shadow punch list** — files now lagging the library
   version, no action taken on them.
8. **Smoke-test guidance** — confirm the 6-step manual checklist
   above is ready for the user to walk.

Plus the standard:

- **Commit SHAs** — forge-moda (and forge-moda-vault if separate
  repo); the source commit and any publish-script auto-bump
  commit.
- **Automated test result** — pass/fail counts from the pytest run.
- **Any deviation and why.**
- **One observation** — anything you noticed during the change
  that suggests a follow-up. For instance: does on_mouse_click
  want similar treatment with a center-of-chamber default
  (`x=400.0, y=300.0`)? Are there other places `inputs:` is being
  used as "Python signature" rather than "UI declaration" in
  forge-moda?

## Don'ts

- **Don't touch `on_mouse_click.md`.** Scope is two files in
  forge-moda + two mirrors in forge-moda-vault.
- **Don't touch shadows at vault root.** Install path is
  library-subdir-only.
- **Don't hand-edit Python in `go.md`.** Its signature already has
  all defaults.
- **Don't change the plugin code.** Frontmatter declaration is
  the fix; no TS edit warranted.
- **Don't add a new frontmatter field** (`runnable_with_defaults`,
  `forge_action: run`, etc.). Use existing `inputs:` semantics.
- **Don't run `/generate`** on either snippet. The
  `generation_notes` append is for future regen; this prompt does
  the trim by hand.
- **Don't auto-commit without bumping the version and publishing.**
  Both are part of "done."
- **Don't proceed past a per-vault install failure.** Stop, route
  to `failed/`, report concretely.
- **Don't re-publish if the new version already exists in the
  registry.** Sanity-check first.
- **Don't touch any other vault** (music, forge-core,
  forge-registry beyond the publish script invocation).
