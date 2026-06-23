---
prompt: 2026-06-11-2000-v0333-large-polish-method-name-prefix-plus-dead-code-plus-release-preflight.md
shipped_version: v0.2.134 (release.sh auto-bumped past v0.2.133 due to two intermediate drift-sync commits)
session: drain-2026-06-11-2000
date: 2026-06-11
status: shipped — SPLIT per §11 NOTE; v0.2.135 will carry Section A
---

# v0333 feedback — polish bundle SPLIT: Sections B+C+D+E + driver-flagged fix shipped; Section A deferred

## §1 — Split rationale (per prompt §11 NOTE)

Section A (method-name prefix sweep, ~25 sites in 8 files) is too large to bundle with the rest while keeping the diff reviewable. Per prompt §11 NOTE: "If §1 expands beyond the enumerated sites... surface count and SPLIT — keep §1 as a separate v0.2.134 drain to keep the diff reviewable. The mechanical/audit split worked well for v0.2.129/130; same pattern applies here."

Verified by sampling 3 sites (welcome.ts:275, facet-mutex-view-plugin.ts:57, forge-action.ts:530) — none have prefix yet. Plus driver-flagged Forge Compute non-2xx site (main.ts:2678) was still console.warn, log-level missed by v0.2.130's Bundle B sweep.

Shipping as v0.2.134:
- Section B (canonicalActionTemplate re-export deletion)
- Section C (generate() dual-path documentation)
- Section D (v0.2.117 close-by-absence)
- Section E (release.sh inlined-version preflight)
- Driver-flagged Forge Compute non-2xx site (log-level + prefix in same edit)

Carry forward to v0.2.135:
- Section A bulk sweep (~25 sites with the full enumeration from prompt §1.1)

## §2 — Section B (canonicalActionTemplate audit + delete)

`grep -rn "canonicalActionTemplate" src/`:
- `modal.ts:166-169`: re-export from `modal-templates-core`
- `modal-templates-core.ts:45`: pure-core definition
- `modal.test.ts:10,33,36,40-64`: tests, imports DIRECTLY from `modal-templates-core` (not modal.ts)

Zero internal consumers of the modal.ts re-export. Same for `actionTemplate` re-export on line 168.

Deleted both re-exports + import block in `modal.ts`. Comment updated to document the v0.2.133 decision. Modal-templates-core remains the single source of truth. 697 tests still passing (modal.test.ts imports from the correct path already).

## §3 — Section C (generate() dual-path audit + document)

`this.generate()` callers:
1. **Line 680** — `forge-generate` command-palette callback. No upstream pre-flight sync.
2. **Line 1887** — `routingDeps().generate` lambda inside forgeSnippet's english-mode flow. forgeSnippet already pre-syncs at line 1764 (v0.2.102 top-level).

The in-`generate()` pre-flight sync (v0.2.19 — around line 2019-2025) is REDUNDANT for caller 2 (forgeSnippet already synced) but ESSENTIAL for caller 1 (command-palette has no upstream sync).

Per prompt §3.1 options:
- **A. Migrate** — wrap command-palette callback with pre-flight, drop the in-generate() sync. ❌ Higher regression risk; pre-flight logic would have to be duplicated.
- **B. Document dual paths** — extend the existing comment. ✅ Chose this.
- **C. Leave as-is** — no doc update. Less clear for future readers.

Updated the comment block at the in-`generate()` pre-flight to document the dual-path purpose explicitly: "by design, not duplication to refactor away". Closed carry-forward.

## §4 — Section D (v0.2.117 obsolete check)

`grep -rn "v0\.2\.117\|0\.2\.117" src/` → ZERO matches. The v0.2.117 references mentioned in v0.2.129 feedback were already cleaned in subsequent commits. Closed carry-forward as already-resolved.

## §5 — Section E (release.sh inlined-version preflight)

Added preflight block in `scripts/release.sh` AFTER `npm run build` and BEFORE the git tag step:

```bash
INLINED_VERSION="$(grep -o 'PLUGIN_VERSION_AT_BUILD[[:space:]]*=[[:space:]]*"[^"]*"' main.js | head -1 | sed 's/.*"\(.*\)"/\1/')"
if [ -z "$INLINED_VERSION" ]; then
  echo "ERROR: PLUGIN_VERSION_AT_BUILD not found in compiled main.js."
  ...
  exit 1
fi
if [ "$INLINED_VERSION" != "$NEW_VERSION" ]; then
  echo "ERROR: main.js inlined version ($INLINED_VERSION) != manifest version ($NEW_VERSION)"
  ...
  exit 1
fi
echo "✓ Inlined version $INLINED_VERSION matches manifest"
```

Catches two failure modes:
1. PLUGIN_VERSION_AT_BUILD missing from main.js entirely (build-script ordering broken — inline-plugin-version.mjs didn't run, or the constant was renamed).
2. PLUGIN_VERSION_AT_BUILD present but != manifest's NEW_VERSION (drift between the two).

This release (v0.2.134) successfully passed the preflight check — confirms the build pipeline is healthy and the inlining mechanism survives the release cycle.

## §6 — Driver-flagged Forge Compute non-2xx fix

`main.ts:2678` was `console.warn('Forge Compute non-2xx:', ...)`. v0.2.130's Bundle B sweep missed this site. Driver flagged in 2026-06-11-1900 smoke Step 9 (yellow icon next to red engine stack). Fixed: `console.error('runSnippet: Forge Compute non-2xx:', ...)` — log-level AND method-name prefix in the same edit. Comment cites the v0.2.130 miss + driver's flag.

## §7 — Release surprise: v0.2.134 instead of v0.2.133

release.sh auto-bumped past v0.2.133 because of two intermediate sync commits:
1. First release.sh run failed at the forge-music bundled-vault drift preflight (3 percussion_lab snippets had drift).
2. Ran `node scripts/sync-bundled-vault.mjs forge-music`, committed as a separate sync commit.
3. Second release.sh run found the manifest already pre-bumped to 0.2.134 (from the first run's bump-before-fail), produced v0.2.134.

This is the same shape as v0.2.124's bump-past pattern from the v0323 drain. Working as intended; just notable that drift-preflight failures can offset version numbers when retries land.

## §8 — Tests + release

- 697 plugin tests still passing (no test changes in this section split).
- Build clean.
- Tag `v0.2.134` + GH release.
- INSTALL.md synced.
- release.sh preflight verified: inlined version 0.2.134 matches manifest 0.2.134.

## §9 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): each section audited before code change.
- ✓ §76 (don't ship speculative fix): every change gated on audit (Sections B/D used grep to confirm; C audited callers).
- ✓ §347 (version-bump sanity check): release.sh handled the version bump correctly even through the drift retry.
- ✓ §321 (feedback before move): this file written before the prompt move.
- ✓ v0.2.120 console.error HARD RULE: Driver-flagged site fixed (log-level + method-name prefix).
- ✓ v0.2.116 prior-art rule: each carry-forward referenced its origin prompt.
- ✓ Split decision per §11 NOTE: applied with sample-site evidence.

## §10 — v0.2.135 follow-up: Section A bulk sweep

Carry forward from this drain — full §1.1 site list to be processed:

- §1.1.1 welcome.ts (4 sites): L275, L308, L339, L343
- §1.1.2 edges.ts (1 site): L96
- §1.1.3 facet-mutex-view-plugin.ts (3 sites): L57, L142, L274
- §1.1.4 forge-action.ts (3 sites): L530, L677, L712
- §1.1.5 modal.ts (2 sites): L388, L444
- §1.1.6 main.ts (~13 sites): L579, L1271, L1296, L1347, L1768, L1987, L2137, L2153, L2176, L2225, L2474, L2634, L2779, L2798, L2817 (driver-flagged site L2678 ALREADY DONE in this drain — exclude from v0.2.135 list)
- §1.1.7 output-view.ts (2 sites): L211, L384
- §1.1.8 pyodide-host.ts (1 site): L387

Total: ~29 sites minus the 1 already-done driver-flagged = ~28 sites for v0.2.135.

## §11 — Carry-forward (unchanged + survivors)

- v0.2.99 follow-up #14 (migrate inert facet_form fields)
- Plugin-side path-lookup audit (v0.2.104)
- moda iframe e2e + bridge pytest (deferred indefinitely)
- forge-tutorial `_meta/_chips.md` v3 parse error
- v0.2.119 persistent expanded-state across file switches
- v0.2.122 granular toggle commands
- Harness Obsidian-shim build (deferred indefinitely)
- v0.2.131 §4 #2 status-bar persistent indicator (defer until cohort feedback)

Closed in this drain:
- ~~v0.2.129 §2.2 canonicalActionTemplate audit~~ → Section B
- ~~v0.2.129 §2.3 generate-internal sync migration~~ → Section C (by design)
- ~~v0.2.129 §2.4 v0.2.117 obsolete check~~ → Section D (already cleaned)
- ~~v0.2.131 §4 #1 release.sh preflight~~ → Section E
- ~~Driver-flagged Forge Compute non-2xx log-level miss~~

## §12 — Hand-off

v0.2.134 ships the polish bundle (split). v0.2.135 will carry Section A's method-name prefix sweep across ~28 enumerated sites. Queue otherwise empty.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.
