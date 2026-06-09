# Forge-moda facet polish — wikilinks, for-loop indent, if-reshape, go.md body trim

## Scope

Four content-only polish passes on forge-moda English facets, applied
across the library, the authoring vault, all installed vault copies,
and any user shadows. Then version-bump and registry publish.

Polish rules:

1. **Wikilinks.** Every `Call <id>...` line in an English facet gets
   the identifier wikilinked: `Call create_water_particles.` →
   `Call [[create_water_particles]].`; `Call set_water_speed with
   temperature.` → `Call [[set_water_speed]] with temperature.`
2. **For-loop indentation.** Lines following `For each <X>:` indent
   their `Call …` body by 2 spaces.
3. **If-reshape.** Single-line `If <cond>: call <X>.` (and variants
   ending in `: call <X>.`) become two lines: `If <cond>:` then
   `  Call [[X]].` on the next line.
4. **go.md body trim.** Drop the C8 resolution-order narrative from
   go.md's English body. Move the resolution-order detail into
   frontmatter `generation_notes` (appended to the existing
   `generation_notes` block — don't replace it). The English body
   becomes: `Inputs:` line, `Defaults:` line, two wikilinked `Call`
   lines. Nothing else.

This is **English-facet only** plus the chip insertion strings in
`_meta/_chips.md`. Python facets are not touched.

Does NOT:

- Hand-edit Python facets. Regeneration via `/generate` is the user's
  GUI step after this lands.
- Change snippet IDs, `description` fields, `role`, `inputs`, or
  anything in frontmatter except go.md's `generation_notes`.
- Touch engine, plugin, or React code. No code build needed.
- Address items 4 (dt abstraction) or 6 (/compute defaults) from
  the 7-item polish list — those need separate prompts after design.

## Why

Three readability problems with the current facets, plus a
content-distribution problem on go.md:

- `Call X.` plain-text references aren't navigable. Wikilinking
  matches the convention already used in the `# Dependencies`
  sections of every snippet (`[[move]] [[if_wall_then_bounce]]
  [[interact]]`), so this generalizes a pattern that already exists.
- Loops and conditionals without indentation visually flatten the
  procedural structure. A reader of `ask_all_particles.md` sees four
  flush-left `Call …` lines and has to infer they're inside the
  `For each particle in state:` block. 2-space indent makes it
  obvious.
- The C8 resolution-order narrative in go.md belongs in
  `generation_notes` (machine-targeted authoring context) not the
  English body (human procedural reading). The English facet should
  read like instructions to compose the per-tick pipeline, not like a
  spec about state lifecycle.

## Files to modify

### Library — `forge-moda/` (the canonical source)

English-facet polish across these files. Files I've spot-checked
have current state quoted; apply the same patterns to any I missed.

- **`go.md`** — (a) trim body, (b) wikilink the two `Call` lines,
  (c) move C8 narrative to `generation_notes`. Current English body:
  ```
  Inputs: state (optional), dt (optional), temperature (optional)

  History-dependent per C8. State resolution order:
    - If `state` is explicitly provided, use it.
    - Otherwise read the latest snapshot via `context.read_snapshot()` and continue accumulating from the previous tick.
    - Otherwise (first call, no prior snapshot) fall back to `sample_state`.

  Defaults when omitted: `state` → None, `dt` → 1/30, `temperature` → "medium".

  Call ask_all_particles with dt.
  Call ask_water_particles with temperature.
  ```
  After:
  ```
  Inputs: state (optional), dt (optional), temperature (optional)

  Defaults when omitted: `state` → None, `dt` → 1/30, `temperature` → "medium".

  Call [[ask_all_particles]] with dt.
  Call [[ask_water_particles]] with temperature.
  ```
  Append the resolution-order detail to existing `generation_notes`
  (preserve the snapshot-default explanation that's already there).
  Suggested addition: a "State resolution order:" paragraph with
  the three-bullet list, framed as guidance for the LLM generating
  Python.

- **`setup.md`** — wikilink the three `Call` lines. Current body
  lines 12-15:
  ```
  Establish an empty chamber: a brand-new simulation state with no particles, 800 units wide and 600 units tall, tick 0. (These are the v1 defaults; there is no scenario lookup.)
  Call create_water_particles.
  Call set_water_speed with temperature.
  Call set_water_mass.
  ```
  Just wikilink each `Call`; leave the narrative paragraphs alone.

- **`on_mouse_click.md`** — wikilink the three `Call` lines.
  Current body lines 12-14:
  ```
  Call create_ink_particles with x and y.
  Call set_ink_speed.
  Call set_ink_mass.
  ```

- **`ask_all_particles.md`** — for-loop indent + wikilink. Current
  lines 12-15:
  ```
  For each particle in state:
  Call move with dt.
  Call if_wall_then_bounce.
  Call interact.
  ```
  After:
  ```
  For each particle in state:
    Call [[move]] with dt.
    Call [[if_wall_then_bounce]].
    Call [[interact]].
  ```

- **`ask_water_particles.md`** — for-loop indent + wikilink. Current
  lines 12-16:
  ```
  For each water particle in state:
  Call if_temp_high_set_speed with temperature.
  Call if_temp_medium_set_speed with temperature.
  Call if_temp_low_set_speed with temperature.
  Call if_temp_zero_set_speed with temperature.
  ```
  After: same shape but indented + wikilinked.

- **`interact.md`** — for-loop indent + wikilink. Current lines 22-23:
  ```
  For each other particle in state:
  Call if_particle_then_bounce.
  ```
  After:
  ```
  For each other particle in state:
    Call [[if_particle_then_bounce]].
  ```
  Leave the trailing collision-filter explanation paragraph
  untouched.

- **`if_wall_then_bounce.md`** — if-reshape + wikilink. Current
  line 12:
  ```
  If the current particle is touching a wall (its position is at or past any chamber bound): call bounce_off_wall.
  ```
  After:
  ```
  If the current particle is touching a wall (its position is at or past any chamber bound):
    Call [[bounce_off_wall]].
  ```
  Note `call` → `Call` (sentence-start capitalization) on the
  second line.

- **`if_particle_then_bounce.md`** — same reshape pattern. Read
  the file to confirm exact wording.

- **`if_temp_high_set_speed.md`** — if-reshape + wikilink. Current
  line 12:
  ```
  If `temperature == "high"`: call set_speed_high.
  ```
  After:
  ```
  If `temperature == "high"`:
    Call [[set_speed_high]].
  ```

- **`if_temp_medium_set_speed.md`**, **`if_temp_low_set_speed.md`**,
  **`if_temp_zero_set_speed.md`** — same reshape pattern, with
  `medium` / `low` / `zero` and the corresponding `set_speed_*` ref.

- **`create_water_particles.md`** — wikilink any `Call` lines.
  (Spot-check edge captures showed it calls `speed_for_temperature`;
  read the file to confirm.) Apply the wikilink polish.

- **`_meta/_chips.md`** — wikilink each chip's `insertion` field.
  All 16 chips have `Call <id>...` insertions; each `<id>` becomes
  `[[<id>]]`. Examples:
  ```yaml
  - label: "Move"
    insertion: "Call [[move]] with dt."
    group: "Particle actions"
    refs: [move]
  - label: "If colliding, bounce off particle"
    insertion: "Call [[if_particle_then_bounce]]."
    group: "Particle actions"
    refs: [if_particle_then_bounce]
  ```
  All 16 entries get the same treatment.

If you find a snippet I haven't listed that has any of the same
patterns (`Call <id>` line, `For each <X>:` block, single-line
`If <cond>: call <X>.`), apply the matching polish. Flag in the
report.

### Authoring vault — `forge-moda-vault/`

Mirror the same edits, same files.

### Installed vault copies — library subdirs

- `bluh/forge-moda/*` — same set of files (these get refreshed from
  the registry, but apply the edits in place so the user doesn't
  need to wait for a registry-pull cycle to see them).
- `foo/forge-moda/*` if present.
- `dry-run-vault/forge-moda/*` if present.

### Installed vault copies — user shadows at vault root

Apply the same polish to user shadows where present:

- `bluh/go.md`, `bluh/setup.md`, `bluh/on_mouse_click.md` — known
  to exist.
- Check `foo/` and `dry-run-vault/` for shadows of these three (or
  any other snippet) and polish if found.

**Shadow safety.** If a shadow file's content materially diverges
from the library (e.g. user has added `print()` calls, custom
narrative, hand-tuned Python the polish would clobber), **flag the
file in the report and skip it.** Don't blindly replace a divergent
shadow.

For shadows that are essentially identical to the library save for
trivial differences (whitespace, an extra blank line), apply the
polish.

## Implementation notes

### Pattern detection

- **Wikilink target:** the identifier in `Call <id>` where `<id>` is
  a snake_case word matching the head of an existing snippet file
  in `forge-moda/`. Don't wikilink parameter names (`dt`,
  `temperature`, `state`, `x`, `y`).
- **For-loop body:** lines immediately following `For each ...:`
  that start with `Call ` (case-insensitive) until the next blank
  line or non-`Call` line.
- **If-reshape candidates:** lines matching `If .*?: call <id>\.`
  (case-insensitive `call`). Reshape to two lines with the second
  line indented 2 spaces and `Call <id>.` capitalized + wikilinked.

### go.md generation_notes append

Current frontmatter has a `generation_notes` block. **Preserve it
verbatim**, then append the resolution-order content. Suggested
final shape:

```yaml
generation_notes: |
  Keep go a pass-through (return the last context.compute result
  directly) — do NOT post-process state after the last call. The
  snapshot-default reads go's outbound edge directory, which equals
  the terminal callee's return only while go stays pass-through.
  Any post-processing (e.g. state.tick += 1) would cause
  read_snapshot() to lag the true return by one tick.

  State resolution order (history-dependent per C8):
    - If `state` is explicitly provided, use it.
    - Otherwise read the latest snapshot via
      `context.read_snapshot()` and continue accumulating from the
      previous tick.
    - Otherwise (first call, no prior snapshot) fall back to
      `sample_state`.
```

## Tests

No automated tests to add. This is content polish; no surface code
is touched.

**Manual verification (defer to user GUI):**

1. Open `go.md` in Obsidian. English body has only `Inputs:`,
   `Defaults:`, and two wikilinked `Call` lines. Hover one of the
   wikilinks → preview pop. Click the wikilink → navigates to the
   right snippet.
2. Open `ask_all_particles.md`. Confirm the four body lines render
   indented in preview.
3. Open one of the `if_temp_*_set_speed.md` files. Confirm
   two-line if-block with indented Call.
4. Open the chips pane in Bluh. Click any chip. Confirm the
   inserted text in the editor includes a wikilink, e.g.
   `Call [[set_ink_mass]].`
5. The chip pane v3 hover tooltip should still work (this prompt
   doesn't touch the plugin).
6. Optional: regenerate any snippet via `/generate` to confirm the
   LLM still produces correct Python from the polished English.
   Skip if you trust the moda-domain fragment + existing generation_notes.

If any verification step fails (e.g. wikilink doesn't navigate
because of a typo, indent doesn't render, regenerated Python is
wrong), flag in the report.

## Out of scope

- Regenerating Python via `/generate`. English-facet polish only.
- Plugin / React / engine changes. No code touched.
- Items 4 (dt abstraction) and 6 (/compute defaults) from the
  7-item polish list. Separate prompts after design.
- Music-vault or any other content domain.
- Trimming setup.md or on_mouse_click.md narrative beyond
  wikilinking. The user explicitly asked for the C8 trim on go.md,
  not on the other roots.
- Building forge-moda-web or forge-client-obsidian. No code change
  necessitates a build.

## Report when done

Per protocol's 8-section CC report convention. Specifically:

1. **Files touched per category.** A table or list showing each
   modified file and which polish category it received (wikilink,
   for-loop indent, if-reshape, go-trim).
2. **Mirror confirmation.** Files synced to forge-moda-vault, bluh
   (library + shadows), foo, dry-run-vault.
3. **Shadow skip list.** Any shadow files flagged as too divergent
   to polish automatically.
4. **_chips.md insertion strings.** Confirm all 16 chips have
   wikilink form in their `insertion` fields.
5. **Version bump.** Suggested forge-moda v0.4.7 → v0.4.8 (patch:
   non-breaking content polish).
6. **Registry publish confirmation** per standing publish-by-default
   policy. State the version and target.
7. **Commit SHAs** across forge-moda (and forge-moda-vault if it's
   a separate repo).
8. **One observation:** any English-facet pattern that came up
   during the polish that isn't covered by the four rules. Could
   inform a follow-up.

## Don'ts

- **Don't hand-edit Python facets.** They get refreshed via
  `/generate` afterward if the user wants. The Python and English
  may briefly drift; that's expected and self-resolves on
  regeneration.
- **Don't wikilink non-snippet identifiers.** Parameter names
  (`dt`, `temperature`, `state`, `x`, `y`) stay bare. If unsure
  whether a token is a snippet ID, check whether
  `forge-moda/<token>.md` exists.
- **Don't overwrite a divergent user shadow.** Flag and skip; the
  user reconciles manually.
- **Don't change snippet IDs, descriptions, frontmatter (other than
  go.md's `generation_notes`), or the `# Dependencies` block.** The
  Dependencies block is auto-synced from Python; leaving it alone
  is intentional.
- **Don't auto-commit without bumping version + publishing.** Both
  are part of "done" per standing policy. Don't publish without
  also committing.
- **Don't touch any non-forge-moda content** (music vault, etc.).
