---
timestamp: 2026-05-22T01:34:31Z
session_id: unknown
prompt_modified: 2026-05-21T18:30:24Z
status: success
---

# go + setup runtime-injected inputs; Forge-click runs with defaults

## 1. `go.md` changes

**Frontmatter:** `inputs: [state, dt, temperature]` → `inputs: []`.

**English body:** dropped two lines (the `Inputs:` declaration
line and the `Defaults when omitted:` declaration line). Body
now reads exactly:
```
# English

Call [[ask_all_particles]] with dt.
Call [[ask_water_particles]] with temperature.
```

**`generation_notes`:** preserved the existing pass-through +
resolution-order block verbatim. Appended a Python-signature
constraint paragraph:
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

**Python facet:** unchanged. The signature already had all
defaults (`def compute(context, state=None, dt=1/30,
temperature="medium")`); no edit warranted.

## 2. `setup.md` changes

**Frontmatter:** `inputs: [temperature]` → `inputs: []`. Added a
new `generation_notes` block (didn't exist before):
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

**English body:** dropped the `Inputs: temperature` declaration
line and the blank line that followed it. Kept the chamber-
narrative paragraph, the three `Call …` lines (including
`Call [[set_water_speed]] with temperature.` — runtime threads
the value to that callee), and the trailing ORIGIN paragraph
verbatim.

**Python signature:** `def compute(context, temperature):` →
`def compute(context, temperature="medium"):`. Single-line
change; function body unchanged.

## 3. `forge-moda-vault` mirror

`go.md` and `setup.md` copied from `forge-moda/` into
`forge-vaults/forge-moda-vault/`. `diff` between source and
mirror reports zero differences for both files post-copy.

## 4. Version bump

`forge-moda/forge.toml`: `0.4.10` → `0.4.11` in my source
commit, then auto-bumped by `publish-vault.sh` to **`0.4.12`**
on publish (same auto-patch-bump pattern as the prior two
publishes). Released as v0.4.12.

## 5. Registry publish

`bash publish-vault.sh --all` script output (final block):
```
=== Committing registry updates ===
[main dc7c81a] Publish: forge-moda
 1 file changed, 5 insertions(+), 1 deletion(-)
To github.com:frmoded/forge-registry.git
   8bb6e89..dc7c81a  main -> main

=== Summary ===
Published: forge-moda
Skipped:   forge-core (no changes since v0.1.1)
Skipped:   forge-music (no changes since v0.2.1)
```

`forge-registry/index.json`'s `latest` for forge-moda now
`0.4.12`. Tarball SHA recorded by the script.

## 6. Reinstall results

Per-vault sequence ran cleanly (foo → bluh → dry-run-vault):

| Vault | Pre-install pin | Install result version | Post-install pin |
|---|---|---|---|
| `foo` | `forge-moda 0.4.10` | `0.4.12` | `forge-moda 0.4.12` |
| `bluh` | `forge-moda 0.4.10` | `0.4.12` | `forge-moda 0.4.12` |
| `dry-run-vault` | `forge-moda 0.4.10` | `0.4.12` | `forge-moda 0.4.12` |

Verification per vault:
- `<vault>/forge-moda/go.md` frontmatter carries `inputs: []`; English body has only the two wikilinked Call lines (no `Inputs:` / `Defaults:`).
- `<vault>/forge-moda/setup.md` frontmatter carries `inputs: []`; Python signature reads `def compute(context, temperature="medium"):`.

## 7. Stale shadow punch list

Six user-shadow files at vault root now lag the library's v0.4.12
frontmatter. **No action taken** — per the prompt, shadows are
user territory. Punch list for manual reconciliation:

| Shadow | Lag | Notes |
|---|---|---|
| `foo/go.md` | `inputs: [state, dt, temperature]` (was correct pre-v0.4.12) | A4 means a student opening this file → Forge-click still opens the modal. To fix: delete the shadow, or hand-edit frontmatter to `inputs: []` + trim the English body to match the library. |
| `foo/setup.md` | `inputs: [temperature]` | Same. Hand-edit frontmatter to `inputs: []` + drop the `Inputs: temperature` body line. Python signature in shadow also needs the `="medium"` default if you keep the shadow. |
| `bluh/go.md` | `inputs: [state, dt, temperature]` PLUS `print("foo")` lines in body + Python | **User has actual customizations**. Don't replace wholesale. Hand-merge: change `inputs:` to `[]`, drop the body's `Inputs:`/`Defaults:` lines, preserve `print("foo")` lines. |
| `bluh/setup.md` | `inputs: [temperature]` | Hand-edit as above. |
| `dry-run-vault/go.md` | `inputs: [state, dt, temperature]` | Hand-edit as above. |
| `dry-run-vault/setup.md` | `inputs: [temperature]` | Hand-edit as above. |

`on_mouse_click.md` shadows (`foo`, `bluh`, `dry-run-vault`) are
**up-to-date** — this prompt didn't touch on_mouse_click, so
library + shadow still match.

## 8. Smoke-test guidance

The 6-step manual checklist below is ready for you to walk in
Obsidian. Each step verifies one slice of the change:

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

**Caveat for step 2:** if you have `bluh/go.md` (the root shadow)
open instead of `bluh/forge-moda/go.md` (the library), you'll see
the STALE frontmatter — A4 resolves to the shadow, which this
prompt didn't update. The Forge button on the shadow will still
open the modal until you reconcile the shadow per the punch list
in §7.

## Commit SHAs

| Repo | SHA | What |
|---|---|---|
| `forge-moda` | `392b96d` | Source commit: inputs:[], body trims, generation_notes |
| `forge-moda` | `3d36963` | Release v0.4.12 (auto-bumped by publish-vault.sh) |
| `forge-moda` (tag) | `v0.4.12` | Release tag, pushed |
| `forge-registry` | `dc7c81a` | `Publish: forge-moda` (index.json bump to 0.4.12) |

All pushed to `main`.

## Automated test result

`pytest tests/api/test_moda.py tests/moda/ tests/core/test_llm.py -q`
→ **68 passed**, 1 warning (the pre-existing `urllib3 + LibreSSL`
note unrelated to this work). The test vault uses its own fixture
frontmatter (with `inputs: [temperature]` on its setup snippet)
which is isolated from the library change.

## Deviations

None. The plan + spec matched the executable shape exactly; the
only auto-bump surprise (v0.4.11 → v0.4.12 by the publish script)
was anticipated in the prompt's parenthetical note.

## Observation

Two patterns worth surfacing for a follow-up:

**(a) `on_mouse_click` and center-of-chamber default.** The prompt
explicitly kept on_mouse_click out of scope because there's no
sensible default for x/y. But a future polish could pick a
deliberate default — `x=400.0, y=300.0` (chamber center) — and
declare `inputs: []` there too, so Forge-click runs a
center-of-chamber ink drop as an exploration aid. Pedagogically
that might be more useful than the modal, since the modal exposes
`state` as a knob too, which students shouldn't fiddle with
directly. Open question; needs your call on whether "Forge-click
fires an event with defaults" reads as inviting or as confusing.

**(b) Other places `inputs:` may double-duty.** This prompt fixed
the two snippets where `inputs:` was conflated with the Python
signature. Scanning the rest of the forge-moda library, the leaf
blocks (`set_speed_*`, `set_water_*`, `set_ink_*`, the `if_temp_*`
control blocks, `move`, `bounce_off_*`, `interact`) all have
`inputs: []` already — their Python takes positional args (state +
some non-ambient) that the controlling parent passes via
`context.compute`, never via a UI. The control blocks
(`ask_*`, `if_*_then_*`) all declare their non-state inputs via
the `inputs:` frontmatter (e.g. `inputs: [pairs]` on
`if_particle_then_bounce`, `inputs: [temperature]` on
`ask_water_particles`). These are arguably ALSO runtime-injected
(the parent's `context.compute` passes them), but a student might
plausibly Forge-click `ask_water_particles` with a chosen
temperature as an exploration. So the modal there is debatably
useful. Probably leave as-is until use signals otherwise.

The cleaner long-term answer might be a frontmatter distinction
(e.g. a separate `runtime_injected: [...]` list, OR a hint like
`runnable_with_defaults: true`), but per the prompt's explicit
"don't add a new frontmatter field" constraint, the
inputs:[] + Python-default pattern is the right v1.

## Verification status

**Automated:** 68/68 tests pass.

**Manual GUI:** deferred to user per the 6-step checklist in §8.
The headless side surfaces clean install across all three vaults,
correct frontmatter/body shape on the library copies, and the
expected stale-shadow situation. The GUI walk-through (Forge-click
on go and setup, modal-still-opens on on_mouse_click, simulator
still ticks) is the load-bearing UX check.
