# Add `simulation` snippet + featured Forge button

## Scope

One coherent change across three repos, shipping together: introduce
a meta `simulation` snippet in forge-moda that expresses the moda
event-loop wiring as a bounded-tick action snippet, plus a generic
`featured: true` frontmatter field that the moda simulator iframe
surfaces as a prominent "Run simulation" button.

Three phased changes, in this order:

1. **forge-moda content** — new `simulation.md` (action, `role: root`,
   `inputs: []`, `compute(context)` with hardcoded temp/dt/num_ticks
   and a tick loop that fires clicks read from a sibling data
   snippet) plus `sample_clicks.md` (data, JSON content_type, canned
   click scenario). Both mirrored into `forge-moda-vault/`. Version
   bump, registry publish.
2. **forge-moda-client (React iframe)** — render a "Run simulation"
   button in the simulator header when the currently-resolved
   featured snippet has `featured: true` in its frontmatter. Wires
   to compute on that snippet via the existing compute endpoint.
3. **forge-client-obsidian (plugin)** — expose the featured-snippet
   identification to the iframe so it knows what to call. If the
   iframe can read frontmatter itself via the existing vault-loading
   path, this phase may be a no-op; otherwise add a small bridge.

Then publish + reinstall the three consumer vaults using the
existing `bootstrap/scripts/reinstall-vault.py` harness.

Does NOT:

- Change the live event loop in the moda simulator iframe. The
  existing Start/Stop affordances stay. The new button is a
  one-shot Forge-run of the `simulation` snippet — bounded, returns
  a final state — sitting alongside the live loop.
- Touch the engine, the constitution, the wire protocol, or the
  generic compute endpoint.
- Pipe stdout from compute to Forge Output. That's a separate prompt.
- Retire the simulator iframe's console panel. Same — separate.
- Tighten C7 / A7 around serializable returns. Separate.
- Touch any vault other than forge-moda + forge-moda-vault mirror.
- Touch user shadows at vault root in foo/bluh/dry-run-vault. The
  install path covers library subdirs only.

## Why

Two things converge:

**Pedagogy.** The moda simulator's wiring (call `setup` once → loop
of `go` per tick → fire `on_mouse_click` on canvas clicks) lives in
plugin TypeScript + FastAPI `/moda/*` endpoints, invisible to the
student reading the vault. Making the wiring a first-class snippet —
readable English, runnable Python, shadowable — turns an opaque
runtime into a small piece of legible code. Students who want to
understand "what does the simulator do" open `simulation.md` and
read three steps.

**Discoverability.** Today there's no obvious "click here to see
the simulation run" affordance. The live iframe has Start/Stop, but
that begins an interactive session. Sometimes students want a
single-shot run that produces an inspectable result. A featured
button that fires `simulation` (returns the final state, no live
animation) gives them that path, and incidentally introduces a
generic mechanism (`featured: true`) any future vault can use to
flag its own entry point.

## Files to modify

### Phase 1 — forge-moda content

**Add `/Users/odedfuhrmann/projects/forge-moda/simulation.md`** (new
action snippet):

Frontmatter:
```yaml
---
type: action
role: root
inputs: []
featured: true
forge_action_label: "Run simulation"
description: "One bounded run of the moda simulator: setup, then 300 ticks of go with scheduled clicks."
generation_notes: |
  Python signature must be:
    def compute(context)
  Zero parameters by design — this snippet is the moda event-loop
  wiring expressed as a one-shot bounded run, not a parametric
  simulator. Constants live as literals inside the body so a
  student reading the snippet sees real values (300 ticks, dt 1/30,
  temperature "medium"). Click scenario is delegated to
  sample_clicks (a data snippet) so students customize the scenario
  by shadowing sample_clicks rather than editing this loop.
---
```

English facet (body):
```
This snippet is the moda simulator expressed as one bounded run.
It ties together setup, go, and on_mouse_click in the same order
the live React simulator does — but it runs for a fixed number of
ticks and returns the final state, instead of looping forever.

Steps:

1. Call [[setup]] to create the starting chamber and water particles.
2. Read the click scenario from [[sample_clicks]] — a list of clicks, each tagged with the tick they fire on.
3. For each of 300 ticks:
     For any click scheduled at this tick, call [[on_mouse_click]] with its x and y.
     Call [[go]] to advance the simulation by one tick.
4. Return the final state.

The live simulator (the React iframe) runs the same wiring
continuously and reacts to real canvas clicks. This snippet is the
inspectable, shadowable version of that same loop. Customize the
click scenario by shadowing sample_clicks.
```

Python facet:
```python
def compute(context):
    state = context.compute("setup")
    clicks = context.compute("sample_clicks")

    num_ticks = 300
    dt = 1/30
    temperature = "medium"

    clicks_by_tick = {}
    for ev in clicks:
        clicks_by_tick.setdefault(ev["tick"], []).append(
            (ev["x"], ev["y"])
        )

    for tick in range(num_ticks):
        for x, y in clicks_by_tick.get(tick, []):
            state = context.compute(
                "on_mouse_click", state=state, x=x, y=y
            )
        state = context.compute(
            "go", state=state, dt=dt, temperature=temperature
        )

    return state
```

Dependencies section: auto-synced by B7 after the Python is in
place (`Forge: Sync edges` or post-`/generate`). Should resolve to
`[[setup]] [[sample_clicks]] [[on_mouse_click]] [[go]]`.

**Add `/Users/odedfuhrmann/projects/forge-moda/sample_clicks.md`**
(new data snippet):

```yaml
---
type: data
content_type: json
read_only: true
description: Canned click scenario for the bounded simulation snippet. Three clicks at varied positions over 300 ticks.
---

# Body

```json
[
  {"tick": 50,  "x": 400.0, "y": 300.0},
  {"tick": 150, "x": 200.0, "y": 200.0},
  {"tick": 250, "x": 600.0, "y": 400.0}
]
```
```

Three clicks: one in chamber center early, one upper-left mid-run,
one lower-right late. Enough variation that the final state shows
three distinct ink dispersions interacting with the water population.

**Mirror both files** into
`/Users/odedfuhrmann/projects/forge-vaults/forge-moda-vault/`.

**Version bump:** `forge-moda/forge.toml` from current (`0.4.14`) to
`0.4.15`. Patch bump — additive content, no breaking changes.
Note: if `publish-vault.sh` auto-bumps again on publish (per the
last several rounds), the published version may land at `0.4.16`.
Report whatever lands.

### Phase 2 — forge-moda-client (React iframe)

Locate the existing iframe component
(`/Users/odedfuhrmann/projects/forge-moda-client/forge-moda-web/src/components/Simulator.tsx`
or wherever the simulator header lives). Read it before editing —
the exact button placement should fit the existing layout idiom.

Add a "Run simulation" button to the simulator header. The button
should:

1. Be visible only when the currently-active vault has a featured
   snippet (some snippet with `featured: true` in its frontmatter).
2. Use the snippet's `forge_action_label` field as the button text,
   falling back to `"Run"` or the snippet's `description` if the
   label is missing.
3. On click, invoke compute on the featured snippet via the
   existing compute endpoint (the same path Forge-click uses
   elsewhere, OR `/moda/compute` if that's the natural moda hook —
   investigate and pick the right one; both should produce the
   same result given the snippet has `inputs: []`).
4. Render the returned state — final tick's `ParticleState` — into
   the canvas as a static frame. Don't start the live loop; this
   is a one-shot.

How the iframe discovers the featured snippet is up to the
implementation:

- Cleanest: the plugin tells the iframe which snippet is featured
  via a postMessage or query param at session-open. Requires a
  Phase 3 plugin change.
- Acceptable shortcut: the iframe queries an HTTP endpoint that
  scans the active vault's frontmatter and reports the featured
  snippet ID. No plugin change needed but adds an endpoint.
- Quick-and-dirty: hardcode `snippet_id = "simulation"` in the
  iframe. Works for now but defeats the generalize-via-frontmatter
  goal. **Only use this if both cleaner paths are non-trivial.**

Document the chosen path in the feedback.

**Tests:** add a vitest case for the new button (renders when a
featured snippet is present; calls compute on click; renders the
returned state). Keep it minimal — don't over-mock.

**Build + commit:** as in the prior 0100 prompt, the iframe is
served by the Vite dev server on `localhost:5173`. CSS/TS edits
ship via HMR on user reload. Confirm `npm test` passes; commit the
change to `forge-moda-client/main` and push.

### Phase 3 — forge-client-obsidian (plugin) — conditional

Only needed if Phase 2 chose the "plugin tells iframe via postMessage"
path. The plugin would:

1. After loading the active vault's snippets, scan their frontmatter
   for `featured: true`.
2. Identify the first such snippet (sorted by snippet ID for
   deterministic resolution if multiple are flagged — warn in the
   developer console if more than one).
3. Pass the featured snippet's ID + frontmatter to the iframe via
   the existing iframe-mount bridge or a new postMessage on session
   open.

If Phase 2 took a different path (HTTP endpoint or hardcode), Phase
3 is a no-op — flag in the report and move on.

### Publish + reinstall (Phase 1 content)

After Phase 1's file edits and version bump:

1. **Publish:**
   ```bash
   bash ~/projects/forge-registry/scripts/publish-vault.sh --all
   ```
2. **Reinstall** the three consumer vaults via the harness:
   ```bash
   cd /Users/odedfuhrmann/projects/forge && source .venv/bin/activate
   for vault in foo bluh dry-run-vault; do
     python /Users/odedfuhrmann/projects/forge-moda-bootstrap/scripts/reinstall-vault.py \
       /Users/odedfuhrmann/forge-vaults/$vault forge-moda
   done
   ```
3. **Verify** each vault now has:
   - `<vault>/forge-moda/simulation.md` + `<vault>/forge-moda/sample_clicks.md`
   - `<vault>/forge.toml` dep pin bumped to the published version

## Tests

### Automated

**Engine side (forge):**

Add `tests/moda/test_simulation_snippet.py` with cases that exercise
the new snippet end-to-end through the existing compute pathway.
Don't reuse the `/moda/*` fast-path; go through the generic compute
endpoint to verify the snippet is a well-formed action snippet.
Suggested cases:

- `test_simulation_returns_particle_state` — calling compute on
  `simulation` returns a `ParticleState` with `tick == 300`,
  particles present, ink particles distributed (not all at the
  three click positions — they've moved since spawn).
- `test_simulation_respects_click_scenario` — with the default
  `sample_clicks`, the final state has more ink particles than a
  no-click control (which would require shadowing sample_clicks to
  `[]` for the test fixture). If shadowing fixtures is awkward,
  skip this case and just assert the click locations have nearby
  ink, which is a weaker but easier check.
- `test_simulation_dependencies_block_sync` — after writing the
  snippet, the `Dependencies` block at the bottom resolves to the
  four expected wikilinks (`setup`, `sample_clicks`, `on_mouse_click`,
  `go`). Run `Forge: Sync edges` (or the equivalent test hook) and
  diff.

Run all moda + core tests:
```bash
cd ~/projects/forge && source .venv/bin/activate
pytest tests/api/test_moda.py tests/moda/ tests/core/ -q
```

**Iframe side (forge-moda-client):**

```bash
cd ~/projects/forge-moda-client/forge-moda-web && npm test
```

Add a vitest for the featured button.

### Manual GUI (user runs after this lands)

1. Open Bluh in Obsidian.
2. Open the moda simulator iframe.
3. Confirm a **"Run simulation"** button appears in the simulator
   header (or wherever Phase 2 placed it).
4. Click it. Confirm:
   - Canvas updates to show the final state of a 300-tick run.
   - Three ink dispersions visible (from the three clicks) plus the
     evolved water population.
   - No live event loop kicked off; the canvas is static after the
     render.
5. Open `bluh/forge-moda/simulation.md`. Confirm the English body
   reads as documented and the Python facet matches.
6. Forge-click on `simulation.md` directly (via the generic Forge
   button, not the featured button). Same result should land in
   Forge Output as a `ParticleState`.
7. (Optional) Shadow `sample_clicks` at the bluh root with a
   different scenario (e.g., 10 clicks at the same location). Click
   the "Run simulation" button again. Confirm the new shadow takes
   effect — the bluh root copy wins via A4.

## Out of scope

- **Stdout-to-Forge-Output piping.** Separate prompt; this prompt
  doesn't change where prints go.
- **Retiring the simulator console panel.** Separate prompt.
- **C7 / A7 constitutional changes** (serializable-required, opt-out
  semantics). Separate prompt; this prompt doesn't touch the spec.
- **Multiple featured snippets per vault.** Phase 2/3 picks the
  first featured snippet sorted by ID; warn on multiples in dev
  console but don't render multiple buttons. Generalization is a
  separate prompt when a use case justifies it.
- **Featured-button surface beyond the moda iframe.** Don't add a
  featured button to the chip palette, the file view, or the
  Obsidian ribbon. Iframe header only.
- **Touching user shadows** at vault root in foo/bluh/dry-run-vault.
  Install path covers library subdirs only. Stale shadows are user
  territory; flag any that now lag relative to v0.4.15 (the new
  shadow-able files `simulation.md` and `sample_clicks.md`) but
  don't modify them.
- **`on_mouse_click.md`, `go.md`, `setup.md`, or any other moda
  snippet.** This prompt only adds two new files.
- **Plugin or engine refactors.** Phase 3 is a small frontmatter-
  read bridge if needed; nothing more.

## Report when done

Per protocol 8-section CC report. Specifically:

1. **`simulation.md` + `sample_clicks.md` content** — exact final
   shape (frontmatter, English, Python for simulation; frontmatter
   + JSON body for sample_clicks). Confirm `Dependencies` block on
   `simulation.md` resolves to the four expected wikilinks.
2. **forge-moda-vault mirror** — both files copied; `diff` confirms
   zero drift.
3. **Version bump** — published version (may be `0.4.15` or
   `0.4.16` after publish-vault.sh auto-bump).
4. **Registry publish** — script output snippet, final published
   version, registry index update.
5. **Reinstall results** — per-vault pre/post pin, post-flight
   confirmation both new files present in each `<vault>/forge-moda/`.
6. **Featured-button implementation path chosen** for Phase 2
   (postMessage / HTTP / hardcode), with rationale.
7. **forge-client-obsidian changes (Phase 3)** — what landed, or
   "no-op" if Phase 2 didn't require plugin changes.
8. **Stale-shadow punch list** — any new shadows at vault root that
   now lag the library shape. Probably empty since these are NEW
   files.

Plus:

- **Commit SHAs** — forge-moda (source + auto-bump), forge-moda-
  vault if separately tracked, forge-moda-client, forge-client-
  obsidian, forge-registry (publish bump).
- **Automated test results** — pytest pass count, vitest pass count.
- **Any deviation and why.**
- **One observation** — anything noticed during implementation that
  suggests a follow-up (e.g., does the iframe's featured-button
  discovery feel like it wants a generic `/vaults/featured-snippet`
  HTTP endpoint? Should `forge_action_label` accept a key into a
  translations file someday?).

## Don'ts

- **Don't run `/generate` on `simulation.md`.** The Python facet is
  hand-authored to match the English wiring step-for-step; regen
  would just reproduce what's already written (or drift).
- **Don't hand-edit the `Dependencies` block.** It's auto-synced
  from Python.
- **Don't touch shadows at vault root.** Install path is
  library-subdir-only.
- **Don't change the snippet IDs** (`simulation`, `sample_clicks`).
  The featured-button mechanism resolves by snippet ID indirectly
  via frontmatter; renaming would invalidate any documentation
  written about them.
- **Don't make `simulation` accept parameters.** The whole point is
  zero-param compute. If you find yourself wanting parameters,
  stop and ask — that's a design pivot, not an implementation
  detail.
- **Don't proceed past a per-vault install failure.** Stop, route
  to `failed/`, report concretely.
- **Don't auto-commit without publishing.** Phase 1 commits +
  publishes + tags as a unit. Phase 2 and 3 each commit to their
  own repo separately.
- **Don't bundle a Phase 2 build pipeline fix** with this prompt.
  If `npm run build` is still broken (the tsc error reported in the
  0100 prompt), work around with `npx vite build` and flag in the
  report.
- **Don't touch any vault other than forge-moda + forge-moda-vault
  mirror.** No music, no forge-core, no forge-registry beyond the
  publish-script invocation.
- **Don't add `featured` to any existing snippet.** Only
  `simulation.md` gets it in this prompt.
