---
timestamp: 2026-06-08T23:30:00Z
from: forge-core
to: forge-doc
subject: Every forgeable snippet needs both # English AND # Python facets
status: pending
priority: HIGH — gestural mutex UX consistency
---

# Request: every forgeable snippet ships with both # English and # Python facets

## §1 — Context

v0.2.83 shipped the facet-mutex gestural model:
- User expands `# Python` heading → `# English` auto-folds + `edit_mode: python` written to frontmatter
- User expands `# English` heading → `# Python` auto-folds + `edit_mode: english` written

This is the V1.5 partial-bring-forward of the V2 gestural model. **It requires both facets to exist on disk** — you can't expand a heading that isn't there.

v0.2.84 introduced a regression where the mutex behavior doesn't fire even when both facets exist (under investigation in v0.2.85). But the deeper UX-consistency issue is independent of that bug:

**For the gestural mutex to make sense everywhere in forge-tutorial, every forgeable snippet needs both `# English` and `# Python` on disk.**

Currently, many tutorial snippets are slot-free canonical — they only have `# English` because per B7.3 (cache-only-when-cache-pays-for-itself), the engine doesn't write `# Python` for slot-free transpiles. Architecturally correct, but pedagogically suboptimal:

- Student opens `01-hello/hello_world.md` — sees only `# English`. No `# Python` to expand. The gestural mutex has nothing to mutex against.
- Student opens `09-slots/octopus_fact.md` (slot-bearing, post-cache) — sees both facets. Mutex works.
- Inconsistent UX across the curriculum.

User has decided: **every forgeable snippet should ship with both facets visible**, regardless of whether the cache pays for itself.

## §2 — Scope of the request

Every snippet in `~/projects/forge-tutorial/` that is **forgeable** (i.e., has `type: action` or `type: data` in frontmatter — the snippets that get a 🔥 button in the editor toolbar) should have BOTH:
- `# English` heading + body (existing — keep as-is)
- `# Python` heading + body (add if missing)

**Exclude:**
- Lesson notes (`Hello.md`, `Variables.md`, etc.) — these are pure-narrative chapter content, not forgeable
- README files at any level
- `forge.toml` and other metadata files

**Include:**
- `hello_world.md` and every other action snippet
- Slot-bearing snippets that haven't been pre-cached
- Any data snippets in the tutorial

## §3 — Two paths for populating # Python

### Path A — Forge-run + commit (recommended for most snippets)

1. For each snippet, open it in Obsidian
2. Forge-click 🔥 to compute
3. The engine transpiles `# English` → `# Python` + writes the cache to the snippet body
4. Save + commit

This populates `# Python` with the engine-computed transpilation. Matches the "Python is computed from English" mental model students learn.

### Path B — Hand-write (for snippets where the transpiled version is unclear or suboptimal for teaching)

If a snippet's auto-transpiled Python would be a confusing first-encounter (e.g., heavy intermediate-language constructs, off-topic helper code), write the `# Python` section by hand. Aim for the Python a student would learn to write themselves.

Use Path A by default. Path B only when the engine-computed output would teach the wrong lesson.

## §4 — Recommended approach for the batch

1. Audit the current state — for each snippet in forge-tutorial that has `type: action` or `type: data`, check whether `# Python` exists. Make a tracking list.
2. Pass 1 — Forge-run every snippet in the list. Most will populate cleanly.
3. Pass 2 — review the Pass 1 results. For snippets where the cached Python reads poorly as teaching material, replace with hand-written content.
4. Bump forge-tutorial version (0.1.2 → 0.1.3 or 0.2.0 if you want to mark this as a content milestone).
5. Push the bump.

Forge-core's parametric vault sync (v0.2.76) will auto-pick-up the new version on the next plugin release — no manual re-bundle work.

## §5 — Important architectural note

This decision **diverges from B7.3's cache-only-when-cache-pays-for-itself rule** for forge-tutorial specifically. The rule is correct for general authoring (where slot-free canonical snippets don't need disk-cache bloat), but for forge-tutorial's curriculum the pedagogical value of "every lesson shows both facets" outweighs the disk-cost.

This is a forge-tutorial-specific content choice, not a global architecture change. forge-moda and forge-music are not affected.

## §6 — V2 implications

When V2 lands (per `~/projects/forge/docs/v2-direction.md`), the `# Python` content becomes `# EPython` content with the `source: english | epython` field. The pre-populated `# Python` sections you produce now will migrate cleanly — V2's source field selects which is authoritative, but both can coexist on disk during the transition. So this work isn't throw-away.

## §7 — Coordination

This work is independent of the v0.2.85 gesture-mutex bug fix (forge-core's lane). Run in parallel.

When ready, bump forge-tutorial + send "check messages" back to forge-core. We'll bundle into the next plugin release.

If you want forge-core's help reviewing the auto-transpiled `# Python` content before commit (Pass 2 quality check), say so in your reply.

Per cc-prompt-queue.md §43, this message IS the chat summary for the request.
