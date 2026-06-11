---
prompt: 2026-06-10-2200-v0325-readfrontmatter-fastpath-gap-plus-console-error-fix-plus-stale-cache-harness-test.md
shipped_version: v0.2.125
session: drain-2026-06-10-2200
date: 2026-06-10
status: shipped
---

# v0325 feedback — readFrontmatterForRouting fast-path gap closed + console.error fix

## §1 — What shipped (v0.2.125)

### §1.1 — Fast-path key-presence guard (§1.1 of prompt)

`main.ts:readFrontmatterForRouting` fast-path replaced:
```ts
// before (v0.2.124 — too permissive):
if (cachedFm) return cachedFm;

// after (v0.2.125 — closes the gap):
if (hasRoutingKeys(cachedFm)) return cachedFm;
```

A stale-non-null cache returning `{ type: 'action' }` (missing `featured`) no longer short-circuits the disk fallback. The prime-suspect failure mode forge-core's v0124 review identified is closed.

### §1.2 — `console.warn` → `console.error` (§1.2 of prompt)

Per cc-prompt-queue.md HARD RULE #1 (v0.2.120 — caught runtime errors MUST be `console.error` with method name):
```ts
console.error('readFrontmatterForRouting: vault.read failed', e);
```

### §1.3 — Pure-core extraction (deviation from prompt §1.3 + §2.2)

Prompt §1.3 asked for harness-based integration tests; prompt §2.2 acknowledged the harness extension might be non-trivial and §9 said "if §2.2 reveals harness extension is substantially more work (>2 hours), split."

I confirmed via `Read` on `src/test-helpers/cm6-harness.ts` that the harness is purely CM6 + happy-dom and has zero shimming for `TFile`, `Vault`, or `MetadataCache`. Adding those mocks is the "Harness Obsidian-shim build" already on the carry-forward backlog as **deferred indefinitely**.

Per the prompt's split clause, I took a different route that still ships the test coverage: **extracted the structural logic to pure-core**. New helpers in `forge-snippet-routing-core.ts`:
- `hasRoutingKeys(fm)` — does the cached frontmatter object carry `featured` or `edit_mode`?
- `parseRoutingFrontmatter(body)` — minimal inline YAML head parser (top-level scalar `key: value`, quote-stripping, `featured` bareword → boolean coercion).

`main.ts:readFrontmatterForRouting` now calls these helpers instead of inline logic.

**18 new pure-core tests** (the prompt asked for ~2-3 integration tests; pure-core route landed ~6× the coverage):
- 9 `hasRoutingKeys` tests including the explicit gap reproducer: `hasRoutingKeys({ type: 'action' }) → false (THE v0.2.124 GAP)`.
- 9 `parseRoutingFrontmatter` tests covering: missing delimiter → null, canonical simulation.md frontmatter → `{type, featured:true}`, `featured: false` coerces, `edit_mode` stays string, quoted values strip, empty `---` block → `{}`, no-colon lines skipped, `featured: "true"` quoted form still coerces (deliberate permissive read).

Total test count: **671 → 689 passing**.

### §1.4 — Why pure-core over harness extension

Pros of the path taken:
- Avoids the deferred-indefinitely Obsidian-shim work.
- Matches the institutional pattern v0.2.123 already established (`decideForgeRouting` extracted from inline `main.ts`).
- Tests are faster, hermetic, and easier to maintain.
- Forge-core's v0124 review explicitly endorsed pure-core extraction as the discipline rule.

Cons / what's NOT covered:
- The I/O glue between `hasRoutingKeys` and `parseRoutingFrontmatter` (5 lines in `main.ts`) is not directly tested. Both pure halves are; the wiring is small + reviewable.
- An actual round-trip through `app.metadataCache.getFileCache(file)?.frontmatter` is not exercised. If Obsidian's metadataCache returns a frontmatter shape we don't anticipate, the pure-core tests won't catch it. Pure-core is a structural safety net, not a contract-with-Obsidian one.

## §2 — Tests + release

- 689 passing (671 + 18 new).
- Build clean.
- Tag `v0.2.125` + GH release with `dist/forge-client-obsidian-v0.2.125.zip` + main.js + manifest.json + styles.css.
- INSTALL.md synced.

## §3 — Per-protocol HARD RULE compliance

Following the prompt's §7 self-audit:

- ✓ §78 (investigation-before-design): line numbers confirmed (1573 fast-path, 1602 catch), harness capabilities probed before coding.
- ✓ §57–74 (TDD): failing-first tests added alongside the code change.
- ✓ §86–118 (pure-core convention): two new pure-core helpers added, replacing inline logic. STRONGER compliance than the prompt asked for — the prompt accepted leaving `readFrontmatterForRouting` as integration-only.
- ✓ §76 (don't ship speculative fix): both fixes target concrete documented gaps.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.124; release.sh bumped to 0.2.125 cleanly.
- ✓ §321 (feedback before move): this file written before the prompt move.
- ✓ NEW v0.2.120 `console.error` HARD RULE: applied (was the violation being fixed).
- ✓ NEW v0.2.124 metadataCache defensive-fallback HARD RULE: applied (was the gap being closed).

## §4 — Carry-forward backlog (unchanged + new entries)

- v0.2.99 follow-up #14: migrate inert facet_form fields
- Plugin-side path-lookup audit (v0.2.104)
- moda bridge pytest (v0.2.95)
- v0.2.119 persistent expanded-state across file switches
- `facet-form-core.ts` deletion (v0.2.121 §8 #3)
- Granular toggle commands (v0.2.122 §6 #4)
- Harness Obsidian-shim build (deferred indefinitely; this drain confirmed the deferral)
- forge-tutorial `_meta/_chips.md` v3 parse error (v0.2.123 prompt §6 #4)
- **v0.2.124 simulation smoke** (still pending separately): v0.2.125 closes the latent gap but doesn't itself fix anything user-visible IF the v0.2.124 null-cache fallback was already sufficient.

## §5 — Hand-off

v0.2.125 is the defensive cleanup the v0124 review asked for. Going next: v0326 (v0.2.126 — moda branch must re-transpile English → Python before opening iframe). That's a separate prompt, queued at 2300.
