---
timestamp: 2026-06-10T11:00:00Z
session_id: drain-2026-06-10-1100
status: COMPLETED-PARTIAL
shipped_version: 0.2.120
prompt_target_version: 0.2.120
---

# Feedback — v0.2.120 — Items B + C shipped; Item A (facet_form removal) deferred to v0.2.121

## §0 — Outcome summary

| Item | Status | Notes |
|---|---|---|
| **A** facet_form removal (Option C) | ⏸ Deferred to v0.2.121 | Plugin's `resolveActionCode` exists but has no E-- → /generate fallback. Building the routing module is genuine focused work; surfaced scope per prompt §9 fallback. |
| **B** Constitution + protocol amendments | ✅ Shipped | 2 to constitution.md, 10 to cc-prompt-queue.md. All 12 entries cite originating release(s). |
| **C** Chip empty-line polish | ✅ Shipped | `insertChipTextAtLine` detects whitespace-only cursor lines + replaces; 3 new tests. |

## §1 — Item A: deferred with reason

### §1.1 What I verified

Per prompt §2.1, audited facet_form references + the prerequisite `resolveActionCode` infrastructure.

**Plugin side (`forge-client-obsidian/src/`):**
- `pyodide-host.ts` lines 667, 793, 805, 818-836, 840, 1073 — facet_form references (Python-side warning surface, JS-side dispatch).
- `main.ts` line 9 + line 1691 — `getFacetForm` import + canonical-branch check in `forgeSnippet`.
- `pyodide-host.ts:1221-1227` — `resolveActionCode(snippet_id)` exists but **only forwards** to the engine's `_forge_resolve_action_code` Python global. No JS-side error handling, no fallback path.

**Engine side (`~/projects/forge/`):**
- `forge/forge/core/executor.py` — facet_form gates the canonical-vs-LLM transpile decision.
- `forge/tests/core/test_e_minus_minus_integration.py` — 6 tests explicitly gate on facet_form values.
- `forge/tests/core/test_facet_form_strip_trap.py` — 8 tests for the strip-trap warning (to be deleted in Option C).

### §1.2 Why deferred

Option C requires a NEW plugin-side routing wrapper:
1. Try `resolveActionCode(snippetId)` (E-- transpile, no LLM).
2. If returns empty / throws → fall back to `/generate` (LLM call, requires token).
3. Wire into `forgeSnippet`'s English-edit-mode branch (replaces the current `facet_form: canonical` gate).

This is a focused module — error-handling around the engine call, the routing decision, the token-presence check for the fallback, plus rewriting `forgeSnippet`'s branch dispatch.

Plus engine-side: stripping facet_form from `resolve_action_code`'s cache validity + transpile-trigger logic, deleting `test_facet_form_strip_trap.py`, rewriting `test_e_minus_minus_integration.py`'s 6 gated tests.

Plus plugin-side cleanup: removing `_forge_facet_form_warning_set` + the console.warn in pyodide-host.ts, removing `getFacetForm` from main.ts, removing facet_form from the new-snippet template.

Total estimated: 3-4 hours focused work. Per prompt §9 fallback clause, the cleanest path is a v0.2.121 drain dedicated to Item A.

## §2 — Item B: amendments shipped

### §2.1 Constitution (`~/projects/forge/docs/specs/constitution.md`)

**Added 2 entries:**

1. **B7.3 trailing paragraphs** (lines 530-545 of the updated file):
   - "Cache invalidation on switch-to-English" — codifies the plugin-side `delete fm.english_hash` rule on `edit_mode` python → english transition (v0.2.90 + v0.2.119 arc).
   - "Symmetric facet-mutex invariant" — codifies the expand-inactive + collapse-active gestural model and the "exactly one facet visible at any time" invariant (v0.2.83 + v0.2.87 arc).

2. **B10** (line 600+) — *Inlined-asset version stamping*. Three-clause invariant: (a) inline + restore on onload, (b) sentinel-stamp every successful restore, (c) force-overwrite on mismatch — explicitly forbids the skip-if-exists antipattern that broke every BRAT update v0.2.91 → v0.2.97. Per v0.2.98 root-cause discovery.

Each entry includes an "added 2026-06-10 per <release>" citation for traceability.

### §2.2 Protocol (`~/projects/forge-moda-bootstrap/cc-prompt-queue.md`)

**Added 10 entries** under the "Hard rules" section (matching existing bullet+bold convention), preserved before the closing "Never delete a prompt file" + "Respect normal CC safety rules" entries:

| # | Entry | Type | Originating release |
|---|---|---|---|
| 1 | Log caught runtime errors as `console.error` | HARD RULE | v0.2.90 |
| 2 | Python-bridge return-shape changes need call-site sweep | HARD RULE | v0.2.95 |
| 3 | Snippet-id resolution via path lookup, not basename | HARD RULE | v0.2.104 |
| 4 | Path-prefix gates need positive frontmatter signal | HARD RULE | v0.2.106 |
| 5 | Library re-extract MUST NOT accumulate backup directories | HARD RULE | v0.2.106 |
| 6 | CM6 extension changes need integration test | HARD RULE | v0.2.112 |
| 7 | `workspace.getActiveViewOfType` unsafe from CM6 StateField | HARD RULE | v0.2.111 |
| 8 | Community-plugin prior-art search before 4th CM6 attempt | HARD RULE | v0.2.116 |
| 9 | CSS class gating beats decoration competition | PATTERN | v0.2.116-118 |
| 10 | Default-hide + Cmd-P escape hatch + per-file scoping | PATTERN | v0.2.119 |

Each entry cites specific release numbers + the originating incident context.

### §2.3 Voice + format compatibility check

Both files use the existing convention: constitution.md uses `**B-class.** Body...` prose style; cc-prompt-queue.md uses `- **Rule name (HARD RULE).** Explanation...` bulleted list under `## Hard rules`. New entries match both conventions exactly.

### §2.4 Files NOT touched

- `cowork-forge-protocol.md` — per prompt §2.3 explicit exclusion. Forge-core handles that file.
- forge-doc materials — no protocol changes there.

## §3 — Item C: chip empty-line polish

### §3.1 Implementation

`src/chips-core.ts:insertChipTextAtLine` — after the existing inside-body check, an additional branch:

```ts
// v0.2.120 — empty-line polish.
if ((lines[cursorLine] ?? '').trim() === '') {
  const before = lines.slice(0, cursorLine);
  const after = lines.slice(cursorLine + 1);
  return { ok: true, body: [...before, chipInsertion, ...after].join('\n') };
}
```

Whitespace-only cursor lines are REPLACED (no `cursorLine + 1` offset). Non-empty cursor lines keep the v0.2.113 below-cursor behavior unchanged.

### §3.2 Tests

3 new tests in `src/chips.test.ts`:

1. `cursor on empty line in English body replaces the empty line` — primary case.
2. `empty-line polish only triggers for whitespace-only lines` — regression guard for v0.2.113 behavior.
3. `cursor on whitespace-only (spaces/tabs) line also triggers replace` — robustness edge case.

All 3 pass; total **642 passing** (was 639 at v0.2.119, +3).

## §4 — Cross-cutting verification

- Build clean (`npm run build` exit 0).
- Tests 642 passing.
- Asset version stamping auto-handles inlined-asset refresh on BRAT update per v0.2.98 mechanism.
- Constitution + protocol amendments committed and pushed.

## §5 — User-side smoke checklist

```
# Step 1 — install v0.2.120 via BRAT.
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.120

# === Item C: chip empty-line polish ===
# Step 2 — open a snippet with # English body. Place cursor on a line
# with text. Open chip palette; click a chip.
# Expected: chip lands on line BELOW cursor (v0.2.113 behavior unchanged).

# Step 3 — Cmd-Z undo. Place cursor on an EMPTY line in # English body.
# Click a chip.
# Expected: chip lands AT the empty line (no double-spacing).

# === Item B: constitution amendments ===
# Step 4 — verify constitution.md has the new entries:
grep -c "exactly one facet visible\|inlined-asset version stamping\|switch-to-English" \
  ~/projects/forge/docs/specs/constitution.md
# Expected: 3+ matches

# Step 5 — verify cc-prompt-queue.md has the 10 amendments:
grep -c "console.error\|return-shape\|path lookup, not basename\|prior-art search" \
  ~/projects/forge-moda-bootstrap/cc-prompt-queue.md
# Expected: 4+ matches
```

## §6 — Open follow-ups

1. **Item A — facet_form removal (Option C)** — focused v0.2.121 drain. Estimated 3-4 hours. Engine + plugin + test rewrites.
2. **forge-doc chapter 9 facet_form discipline note** — becomes obsolete after Item A ships. Send relay message to forge-doc.
3. **Carrying forward from prior drains**:
   - Plugin-side path-lookup audit (v0.2.104).
   - moda bridge pytest (v0.2.95).
   - release.sh drift preflight + asset-completeness check (v0.2.91 + new).
   - v0.2.19 generate-internal pre-flight sync dead code (v0.2.102).
   - v0.2.117 Reading mode `forge-snippet-preview` class wiring.
   - v0.2.119 persistent expanded-state across file switches.
4. **Harness extension build** — deferred indefinitely per v0.2.116 retrospective; the cheaper "prior-art search first" discipline gets us there for ~99% of cases.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §1.1 audited resolveActionCode infrastructure before declaring Item A scope.
- ✓ §57–74 (TDD): Item C failing-first tests landed before implementation; Item B is documentation (no tests).
- ✓ §86–118 (pure-core convention): `insertChipTextAtLine` empty-line check stays pure-core.
- ✓ §76 (don't ship speculative fix): Item C targeted at concrete cohort polish ask; Item B captures verified amendments; Item A explicitly deferred (no speculation).
- ✓ §347 (version-bump sanity check): manifest 0.2.119 → 0.2.120.
- ✓ §321 (feedback file before move): this file written before prompt move.
- ✓ NEW v0.2.112 rule (CM6 integration tests): N/A — none of the shipped items touch CM6.
- ✓ NEW v0.2.116 pattern: N/A — Item C touches insertion logic, not rendering.

## §8 — Architectural framing

V1 polish + protocol codification:
- Item C is small cohort-UX polish closing a v0.2.113 follow-up ask.
- Item B captures the session's lessons in the canonical doc surfaces; future drains inherit the discipline.
- Item A deferral is honest scope acknowledgment — Option C is the right choice but needs focused attention.

No V2 architectural commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.
