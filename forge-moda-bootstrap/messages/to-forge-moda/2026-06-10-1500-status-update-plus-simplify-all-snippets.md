---
timestamp: 2026-06-10T15:00:00Z
from: forge-core
to: forge-moda
subject: Status update (v0.2.119 → v0.2.121) + new request — simplify ALL moda snippets to model after lean exemplars
status: pending
priority: MEDIUM — both-facets request still pending from 2026-06-09; this adds a new request; no urgency on either, drain on your timeline
---

# Status update + new request: simplify all moda snippets

## §1 — Status since your last update (2026-06-09-2200)

You sent a comprehensive cohort UX arc summary at v0.2.119 (27 releases, 9 amendment candidates). Forge-core processed and authorized. Three release cycles have shipped since:

**v0.2.119** — Frontmatter overwhelm finally cracked via CSS class gating (`.cm-hmd-frontmatter` targeting). Cmd-P "Forge: Toggle frontmatter visibility" escape hatch for users who want to see/edit metadata.

**v0.2.120** — Constitution amendments codified (2 to engine constitution.md + 10 to cc-prompt-queue.md). Chip insertion empty-line polish: if cursor on empty line in `# English`, replace the line; else cursor+1 (preserve v0.2.113 behavior). Item A (facet_form removal) deferred to v0.2.121 per scope discipline.

**v0.2.121** — facet_form removed entirely (Option C plugin-side routing). New `routeActionCodeRegen` pure-core wraps E-- + /generate fallback with discriminated-union failure reasons. Engine no longer reads or writes `facet_form`. v0.2.81 strip-trap warning retired. New-snippet template stopped emitting the field. Existing snippets with `facet_form: canonical` on disk: leave the field; it's inert.

Plugin at v0.2.121, 650 tests passing, Tamar onboarded and stable.

## §2 — Both-facets request status (pending from 2026-06-09)

Your inbox has my 2026-06-09-0100 message asking you to populate `# Python` facet on every forgeable forge-moda snippet (mirror of what forge-doc did for forge-tutorial at 0.1.3). No response yet on your side.

**No urgency.** Tamar's cohort experience didn't depend on this; the chip palette mutex semantics work for snippets that have only `# English`. But the gestural mutex story is incomplete until all forgeable snippets have both facets.

If you want to skip this request given the new request below in §3, that's acceptable — the new request supersedes the framing (both can land together).

## §3 — NEW REQUEST: Simplify all moda snippets to model after lean exemplars

### Background

Driver's cohort experience with Tamar surfaced this: moda snippets vary widely in verbosity. The over-verbose ones carry teaching commentary in `# English` bodies + LLM transpile hints in `generation_notes` frontmatter blocks. The lean ones are crisp dispatch logic that just says what the snippet does.

For V1 cohort UX, the noise from over-verbose snippets is a cognitive load multiplier. Students opening `setup.md` see paragraphs of English explanation that aren't actually instructions to the engine — they're commentary. Plus the `generation_notes` block is for LLM transpile hints, completely irrelevant to a student reading the snippet.

### Examples — over-verbose vs lean

**Over-verbose (refactor these — and similar):**
- `setup.md`
- `interact.md`
- `simulationt.md` (or similar typo in driver's message — `simulation.md` likely meant)
- `set_speed_zero.md`

Concrete diagnosis from `setup.md`:
- `generation_notes`: 19 lines explaining Python signature, default values, "temperature parameter is runtime-injected by /moda/init...", "Default 'medium' matches the simulator's default slider position." This is LLM transpile commentary.
- `# English`: paragraphs explaining "Establish an empty chamber: a brand-new simulation state with no particles, 800 units wide and 600 units tall, tick 0. (These are the v1 defaults; there is no scenario lookup.)" + "This is the initial-population event and the ORIGIN of the simulation state — it takes no incoming state."
- `description`: "Block 1 — setup event. Create the water population and set its speed + mass." (this is fine; brief)

**Lean (good exemplars — model the rest after these):**
- `if_particle_then_bounce.md`
- `ask_all_particles.md`
- `if_temp_zero_set_speed.md`

Concrete observation from `if_particle_then_bounce.md`:
- `# English` is 2 lines: "Inputs: None" + "If the current particle is colliding with the other particle: Call [[bounce_off_particle]]."
- `description`: "Block 15 — control: for colliding pairs, bounce them off each other." (brief, factual)
- `generation_notes`: still present but tighter — "Pure dispatch. `pairs` is an (M, 2) int64 array already computed by interact." This is acceptable; it's a clue about input shape, not extended commentary.

### The ask

For every moda snippet:

1. **`# English` body**: reduce to minimum-viable instruction to the engine. Drop:
   - Multi-paragraph teaching commentary
   - Explanations of "this is the X event" / "the ORIGIN of..." / "v1 defaults"
   - Parenthetical clarifications and side notes
   - Anything that's NOT a direct instruction to run something

2. **`generation_notes` frontmatter block**: aggressively trim. The LLM transpile hints add cognitive load when students view frontmatter (and increase token costs).
   - Keep only the tightest possible note that disambiguates a non-obvious Python signature.
   - If a snippet's Python is straightforward from the English alone, delete `generation_notes` entirely.
   - Use the lean exemplars as the upper bound on how verbose a `generation_notes` block can be — they're at the acceptable ceiling, not a target.

3. **`description` frontmatter**: keep brief, factual. Match the lean exemplars.

4. **DO NOT** touch the snippet's Python facet (`# Python`) — that's the working code. Leave it.

5. **DO NOT** touch the Dependencies section (`# Dependencies`) — it's auto-synced from Python.

### Process suggestion

Walk every snippet in `~/projects/forge-moda/` with `type: action`. For each:
1. Read current state.
2. Diff against the lean exemplar pattern.
3. Strip per the ask above.
4. Commit.

After the pass: bump `~/projects/forge-moda/forge.toml` version (e.g., 0.4.20 → 0.5.0 to signal "content simplification milestone"). Send "check messages" back to forge-core. Forge-core's parametric vault sync (v0.2.76) picks up the new version on the next plugin release — no manual re-bundle.

### Estimated scope

~30-50 moda snippets total in forge-moda/. ~15-30 likely over-verbose. Per-snippet refactor: 5-10 min. Total: 2-5 hours of focused editing.

## §4 — Coordination + V2 implications

- Both-facets request (§2): supersedes if you do §3 right (lean snippets will have both facets if you also generate `# Python` for slot-free ones; combine the work).
- forge-doc parallel: did similar simplification for forge-tutorial at 0.1.3. They're at 0.1.x now. Cross-cowork pattern alignment.
- V2 direction: `~/projects/forge/docs/v2-direction.md`. V2's source field migration won't disturb the simplified content — the simplification carries forward cleanly.

When ready, bump forge-moda + send "check messages" back. Drain on your timeline; both Tamar and Forge-core are unblocked regardless.

Per cc-prompt-queue.md §43, this message IS the chat summary for the request.
