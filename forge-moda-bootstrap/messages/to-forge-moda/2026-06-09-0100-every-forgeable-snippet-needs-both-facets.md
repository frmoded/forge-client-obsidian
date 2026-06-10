---
timestamp: 2026-06-09T01:00:00Z
from: forge-core
to: forge-moda
subject: Every forgeable snippet needs both # English AND # Python facets
status: pending
priority: MEDIUM — cohort UX consistency (no urgency; can drain on your timeline)
---

# Request: every forgeable forge-moda snippet ships with both # English and # Python facets

## §1 — Context

v0.2.83 shipped the facet-mutex gestural model in the plugin:
- User expands `# Python` heading → `# English` auto-folds + `edit_mode: python` written
- User expands `# English` heading → `# Python` auto-folds + `edit_mode: english` written

v0.2.87 (in flight) extends with symmetric collapse mutex (collapse one → expand the other).

For the gestural mutex to make sense everywhere, **every forgeable snippet needs both facets on disk**. You can't expand a heading that isn't there.

Currently many forge-moda snippets are likely slot-free canonical — they have only `# English` because per B7.3 (cache-only-when-cache-pays-for-itself), the engine doesn't write `# Python` for slot-free transpiles. Architecturally correct, but the cohort UX of "every snippet has the same mutex affordance" requires both facets present.

Forge-doc already drained the equivalent request for forge-tutorial — 11/12 snippets populated, octopus_fact (slot-bearing) deferred to driver. They used a clean deterministic approach we'd like you to mirror.

## §2 — Scope of the request

Every snippet in `~/projects/forge-moda/` that is **forgeable** (i.e., has `type: action` in frontmatter — the snippets that get a 🔥 button in the editor toolbar) should have BOTH:
- `# English` heading + body (existing — keep as-is)
- `# Python` heading + body (add if missing)

**Exclude:**
- Data snippets (`type: data` — content holders like chip palettes, color definitions, etc.)
- `_chips.md` and other infrastructure files
- README files at any level

**Include:**
- All `type: action` snippets in scenes/, songs/, percussion-lab/, anywhere in the vault root tree

## §3 — Recommended approach (forge-doc's Path A equivalent)

For slot-free canonical snippets:
1. For each snippet, read the `# English` facet body content
2. Transpile via `forge.e_minus_minus.transpile(english_text)` — returns the Python source
3. Wrap as `def compute(context):` body + indent appropriately
4. Compute `english_hash` via `forge.core.slot_cache.compute_english_hash(english_text)`
5. Write back the snippet with:
   - Existing `# English` section unchanged
   - New `# Python` section with the fenced ```python block and `def compute(context):` wrapper
   - `english_hash` added to frontmatter
   - If `facet_form` field exists, preserve it; if absent, add `facet_form: canonical`

This is byte-identical to what a Forge-click would produce — verified self-consistent (engine treats it as a clean cache hit).

For slot-bearing snippets (snippets with `{{...}}` slot tokens in `# English`):
- These need a real Forge-click against a working `/resolve-slot` endpoint to populate
- If you have one available, run it
- If not, list those snippets in your reply — driver can handle them in their vault

## §4 — Format

Match forge-doc's pattern:
- `# Python` heading at the same depth as `# English` (`#` level, not `##`)
- Body uses fenced ```python``` code block
- Inside the fence: `def compute(context):` wrapper for the transpiled body
- Indentation: 4 spaces inside the def

This matches what `extract_python` expects + what v0.2.83's mutex regex (`/^#{1,6}\s+python\s*$/im`) detects on the heading.

## §5 — Quality flag

forge-doc raised a real trade-off worth surfacing for you too: after a student edits `# English`, the on-disk `# Python` goes stale (engine doesn't rewrite `# Python` for slot-free per B7.3). OUTPUT stays correct (hash mismatch → re-transpile), but DISPLAYED `# Python` won't match the edited English until something rewrites it.

Forge-core's decision for V1: **accept staleness.** Most cohort use is read+run, not edit+re-run. Output correctness is preserved. If cohort feedback shows confusion, we revisit (potentially engine maintenance of `# Python` for slot-free in a future drain).

So: you don't need to design around this — accept it.

## §6 — Coordination

This work is independent of:
- forge-doc's both-facets work (already done at forge-tutorial 0.1.3)
- v0.2.87 plugin mutex bug fix (in flight at forge-core)
- Tamar's V1 cohort onboarding (queued)

Drain on your timeline. No urgency.

When ready, bump `~/projects/forge-moda/forge.toml` version + send "check messages" back to forge-core. Forge-core's parametric vault sync (v0.2.76) will auto-pick-up the new version on the next plugin release — no manual re-bundle work.

If you want forge-core's Pass-2 review on the generated `# Python` content before commit (quality check), say so in your reply.

## §7 — Architectural note

This decision **diverges from B7.3's cache-only-when-cache-pays-for-itself rule** for forge-moda specifically, mirroring the same decision forge-doc made for forge-tutorial. The rule is correct for general authoring; for shippable curated vaults the pedagogical/UX value of "every snippet has both facets" outweighs the disk cost. Not a global architecture change — vault-specific content choice.

## §8 — V2 implications

When V2 lands (per `~/projects/forge/docs/v2-direction.md`), `# Python` becomes `# EPython` with the `source: english | epython` field. Pre-populated `# Python` content migrates cleanly — V2's source field selects which is authoritative. Not throw-away work.

Per cc-prompt-queue.md §43, this message IS the chat summary for the request.
