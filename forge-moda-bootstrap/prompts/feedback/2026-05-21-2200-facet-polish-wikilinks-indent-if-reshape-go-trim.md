---
timestamp: 2026-05-21T20:35:58Z
session_id: unknown
prompt_modified: 2026-05-21T13:29:30Z
status: success
---

# Facet polish — wikilinks, for-loop indent, if-reshape, go.md trim

## 1. Files touched per category

| File | Wikilink | For-loop indent | If-reshape | go-trim |
|---|---|---|---|---|
| `setup.md` | ✓ (3 calls) | | | |
| `on_mouse_click.md` | ✓ (3 calls) | | | |
| `go.md` | ✓ (2 calls) | | | ✓ |
| `ask_all_particles.md` | ✓ (3 calls) | ✓ | | |
| `ask_water_particles.md` | ✓ (4 calls) | ✓ | | |
| `interact.md` | ✓ (1 call) | ✓ | | |
| `if_wall_then_bounce.md` | ✓ | | ✓ | |
| `if_particle_then_bounce.md` | ✓ | | ✓ | |
| `if_temp_high_set_speed.md` | ✓ | | ✓ | |
| `if_temp_medium_set_speed.md` | ✓ | | ✓ | |
| `if_temp_low_set_speed.md` | ✓ | | ✓ | |
| `if_temp_zero_set_speed.md` | ✓ | | ✓ | |
| `_meta/_chips.md` | ✓ (all 16 insertions) | | | |

**`create_water_particles.md` skipped:** my scan found no `Call <id>.`
lines in its English body. The file mentions `set_water_speed`,
`set_water_mass` in trailing narrative prose ("Speed and mass are
set by later blocks (set_water_speed, set_water_mass)…"), which the
polish rules deliberately don't touch (the rule keys on the
imperative `Call <id>` shape, not on any token that happens to
match a snippet ID).

## 2. Mirror confirmation

Polished facets + `_meta/_chips.md` synced to four library copies:

- `/Users/odedfuhrmann/projects/forge-vaults/forge-moda-vault/` (authoring vault)
- `/Users/odedfuhrmann/forge-vaults/foo/forge-moda/`
- `/Users/odedfuhrmann/forge-vaults/bluh/forge-moda/`
- `/Users/odedfuhrmann/forge-vaults/dry-run-vault/forge-moda/`

User shadows at vault root:

| Shadow | Status |
|---|---|
| `foo/go.md` | Polished (was stale pre-Part-F content; no user marks) |
| `foo/setup.md` | Polished |
| `foo/on_mouse_click.md` | Polished |
| `bluh/go.md` | **SKIPPED — see §3** |
| `bluh/setup.md` | Polished |
| `bluh/on_mouse_click.md` | Polished |
| `dry-run-vault/go.md` | Polished (stale pre-Part-F content; no user marks) |
| `dry-run-vault/setup.md` | Polished |
| `dry-run-vault/on_mouse_click.md` | Polished |

## 3. Shadow skip list

**`bluh/go.md` — skipped, flagged.** The file contains user-added
`print("foo")` calls in both the English body and the Python facet.
Polishing it via library overwrite would clobber those edits. Per
the spec's "Shadow safety" rule the file is left untouched.

Concretely, the divergence (with the new polished library) includes:
- `print("foo")` line in the English body between the resolution-
  order narrative and the procedural Call lines.
- `print("foo")` inside the Python `compute()` function body.
- The verbose C8 narrative paragraph still in the English body
  (pre-Part-F shape) — which was the pre-trim state, but the print
  lines mean we can't safely tell apart "user wants the old narrative"
  from "user just didn't update."

You can reconcile by hand: open `bluh/go.md`, apply the polish
manually (wikilink the two Call lines, trim the C8 narrative,
preserve your `print("foo")` lines), then it'll match the library
shape. Or delete the shadow and `bluh/go.md` reverts to library
behavior via A4.

No other shadows had user marks (`grep -E "print\(|TODO|FIXME|XXX"` on
all 9 shadow candidates flagged only the two `print("foo")` lines in
`bluh/go.md`).

## 4. `_meta/_chips.md` insertion strings

All 16 chips updated. Verified:
```
insertion: "Call [[create_water_particles]]."
insertion: "Call [[set_water_speed]] with temperature."
insertion: "Call [[set_water_mass]]."
insertion: "Call [[create_ink_particles]] with x and y."
insertion: "Call [[set_ink_speed]]."
insertion: "Call [[set_ink_mass]]."
insertion: "Call [[ask_all_particles]] with dt."
insertion: "Call [[ask_water_particles]] with temperature."
insertion: "Call [[move]] with dt."
insertion: "Call [[interact]]."
insertion: "Call [[if_wall_then_bounce]]."
insertion: "Call [[if_particle_then_bounce]]."
insertion: "Call [[if_temp_high_set_speed]] with temperature."
insertion: "Call [[if_temp_medium_set_speed]] with temperature."
insertion: "Call [[if_temp_low_set_speed]] with temperature."
insertion: "Call [[if_temp_zero_set_speed]] with temperature."
```

Plugin chip-loader passes the `insertion` string through to the
editor verbatim, so clicking any chip now inserts a wikilinked
form into the active snippet's `# English` section.

## 5. Version bump

`forge.toml`: v0.4.8 → v0.4.9 (intermediate, in the source commit) →
v0.4.10 (auto-bumped by publish-vault.sh to land in the registry).
Patch bump: non-breaking content polish.

## 6. Registry publish

`bash publish-vault.sh --all` ran successfully. Final state:

```
=== Summary ===
Published: forge-moda   → v0.4.10
Skipped:   forge-core   (no changes since v0.1.1)
Skipped:   forge-music  (no changes since v0.2.1)
```

`forge-registry/index.json` updated; `latest` for forge-moda now
`0.4.10`. Tarball SHA recorded by the publish script.

## 7. Commit SHAs

| Repo | SHA | Description |
|---|---|---|
| `forge-moda` | `7d50497` | Facet polish v0.4.9 (my source commit) |
| `forge-moda` | `72e77e5` | Release v0.4.10 (auto-bumped by publish-vault.sh) |
| `forge-moda` (tag) | `v0.4.10` | Release tag, pushed |
| `forge-registry` | `8bb6e89` | `Publish: forge-moda` (index.json bump) |

All pushed to `main`.

## 8. Observation

One pattern came up during the polish that isn't covered by the
four rules: **inline-prose snippet mentions in trailing
narrative paragraphs**. Example from `create_water_particles.md`'s
body:

> Speed and mass are set by later blocks (set_water_speed,
> set_water_mass); leave them at 0.0 / 'medium' placeholders here.

Those `set_water_speed` / `set_water_mass` tokens are snippet IDs
referenced in a narrative sentence, not in the imperative
`Call <id>.` form. The polish rules deliberately don't touch them
— wikilinking them would change the prose's voice (no longer
narrative; reads like a sentence with embedded code refs). But it
does mean the file gets no navigability benefit from the polish
even though it talks about other snippets.

Three viable v2 stances:

- **Don't wikilink narrative mentions** (current behavior). Prose
  stays prose. Navigability is through the `# Dependencies` block
  (auto-synced) and through the chip palette. Cost: narrative
  references aren't clickable; reader has to mentally cross-ref.
- **Wikilink narrative mentions of OTHER snippets**. A snippet's
  narrative mentioning a sibling snippet wikilinks it. Cost: prose
  becomes denser with link syntax; risk of false positives on
  any snake_case token that happens to match a snippet name.
- **Frontmatter `see_also: [snippet_id, ...]`** — a new explicit
  cross-reference field. Plugin renders these as a small
  "Related" pill row in the snippet header or in the chip pane's
  hover tooltip. Cleanly separates navigation from prose; opt-in
  per snippet. Cost: more frontmatter, has to be maintained as
  snippets are renamed.

Probably not urgent. The `# Dependencies` auto-sync + chip refs
hover already cover the navigation paths students need. Flag for
a future polish prompt if/when narrative cross-refs become a
noticeable friction.

## Verification status

**Automated:** 50/50 moda + api tests pass (engine + Python +
behavior unchanged by an English-facet polish; tests don't assert
English content).

**Manual GUI:** deferred to user. The load-bearing verification
points per the prompt's "Manual verification" section are:
1. Open `go.md` in Obsidian → body has only Inputs, Defaults, two
   wikilinked Call lines. Hover/click a wikilink to navigate.
2. Open `ask_all_particles.md` → four body lines render indented
   in preview.
3. Open one `if_temp_*_set_speed.md` → two-line if-block with
   indented Call.
4. Open chips pane in Bluh → click any chip → inserted text has
   wikilink form (`Call [[set_ink_mass]].` etc.).
5. The chip-pane v3 hover tooltip should still work (plugin
   unchanged; the polish doesn't affect the tooltip mechanism).
6. Optional: `/generate` on any polished snippet → confirm the
   LLM still produces correct Python. Should be safe given the
   moda-domain fragment already documents `Call X.` → `state =
   context.compute("X", state=state, ...)` mapping; the wikilink
   syntax `[[X]]` was already used in the worked-example comments
   in the fragment. Flag if regen drifts.
