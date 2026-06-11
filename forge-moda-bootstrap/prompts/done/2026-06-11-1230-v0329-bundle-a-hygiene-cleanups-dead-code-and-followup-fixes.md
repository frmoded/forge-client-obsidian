---
timestamp: 2026-06-11T12:30:00Z
session_id: drain-2026-06-11-1230
status: pending
priority: MEDIUM — backlog hygiene; nothing user-facing blocking
---

# v0.2.129 — Bundle A: hygiene cleanups (dead code + small follow-up fixes)

## §0 — Context

Driver-authorized backlog cleanup, themed bundle A: pure hygiene. Dead code removal + small follow-up fixes flagged across recent drains. No user-facing behavior change. Safe single-release drain.

This is part 1 of a larger "huge backlog cleanup" — Bundle B (console.error audit across plugin) and Bundle C (risk-surface audits) ship as separate prompts.

## §1 — Items in this bundle

### §1.1 — Delete `facet-form-core.ts` module (v0.2.121 §8 #3)

`src/facet-form-core.ts` exports `getFacetForm` + `FacetForm` type. Post-v0.2.121 facet_form removal, no plugin code imports these (verified at v0.2.121 ship time). CC's v0.2.121 §8 #3: "Could be deleted in a future cleanup drain if no external consumers remain."

Verify no consumers + delete:
```bash
grep -rn "facet-form-core\|getFacetForm\|FacetForm" forge-client-obsidian/src/
```

If grep returns 0 hits outside of `facet-form-core.ts` itself → delete the file. If hits remain, audit + decide per-call-site.

### §1.2 — `main.ts:1842` console.warn → console.error (v0.2.126 §4 #2)

English-mode branch's writeCanonicalPythonBack catch logs as `console.warn`. v0.2.120 HARD RULE: caught runtime errors MUST be `console.error` with originating method name.

Fix:
```typescript
// at main.ts:1842 (approximate; verify line)
catch (e) {
  console.error('forgeSnippet (english-mode): writeCanonicalPythonBack failed', e);
  // ... existing rest ...
}
```

### §1.3 — markDriftAsync removal (v0.2.102 follow-up)

`markDriftAsync` body was emptied at v0.2.102. The empty function shell + caller-less status remain. Full removal:
```bash
grep -rn "markDriftAsync" forge-client-obsidian/src/
```

Delete the function declaration + any imports. If any callers remain (shouldn't after v0.2.102), document + decide.

### §1.4 — canonicalActionTemplate export cleanup (v0.2.108 partial)

`modal-templates-core.ts:canonicalActionTemplate` retained at v0.2.108 in case "other code may import it for non-modal authoring paths." Audit:
```bash
grep -rn "canonicalActionTemplate" forge-client-obsidian/src/
```

If no consumers: delete the export.

### §1.5 — v0.2.19 generate-internal pre-flight sync dead code (v0.2.102 §6 #2)

Per v0.2.102 retrospective: "The redundant per-branch sync inside `generate()` is now dead code but harmless (best-effort, idempotent); leaving for one cycle for backwards-stability." That cycle is over. Remove the dead sync.

```bash
grep -n "v0.2.19\|preflight\|pre.flight" forge-client-obsidian/src/main.ts forge-client-obsidian/src/pyodide-host.ts | head -20
```

Identify the inside-`generate()` sync; remove if it's the v0.2.19 redundant copy. Top-level sync at forgeSnippet (v0.2.102) stays.

## §2 — Investigation phase (per §78)

Grep audits per each §1.X item above. Each item's grep determines whether to delete (no consumers) or document (consumers remain).

If any item turns out to have consumers, surface in feedback + decide per-case. Don't ship deletions with broken imports.

## §3 — Implementation phases

### §3.1 — Phase 1: per-item investigation

Run all 5 grep audits per §1.1–§1.5. Document findings.

### §3.2 — Phase 2: deletions

For each item with no remaining consumers:
- Delete the file/function/export
- Update any imports that reference the deleted symbol (should be zero by audit assumption)
- Run `npm run build` to confirm clean compile

### §3.3 — Phase 3: tests

No new tests needed for pure deletions (existing tests cover behavioral surfaces).

For the console.warn → console.error change (§1.2): regression-guard test if practical. If not, leave as integration test territory.

### §3.4 — Phase 4: build + release

`npm run build` + `bash scripts/release.sh 0.2.129`. Verify tests pass at the count appropriate for whatever was deleted.

## §4 — Tests required

- Zero new tests for pure deletions (§1.1, §1.3, §1.4, §1.5)
- One regression-guard for §1.2 if practical
- Test count likely DECREASES if any deleted files had associated tests (verify)

## §5 — User-side smoke

```
# Step 1 — install v0.2.129.
grep version ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.129

# Step 2 — sanity: Forge-click hello_world.md. Expected: computes via E--.
# Step 3 — sanity: Forge-click forge-moda/simulation.md. Expected: simulation runs with fresh logic (v0.2.128 self-heal + force-flag intact).
# Step 4 — sanity: New Snippet via Cmd-P. Expected: dialog opens, free-English template emitted.
```

If any sanity check fails after this drain, the deletion broke something. Roll back.

## §6 — Open follow-ups

This drain closes 5 hygiene items. Carry-forward unchanged:
- v0.2.117 follow-up (obsolete per v0.2.122 — eligible for deletion if confirmed unused; skipped here for conservatism)
- v0.2.119 persistent expanded-state across file switches
- v0.2.122 granular toggle commands
- Plugin-side path-lookup audit (v0.2.104) — folds into Bundle C
- moda iframe e2e test + bridge pytest (deferred indefinitely)
- forge-tutorial `_meta/_chips.md` v3 parse error (separate focused drain)

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 grep audits per item.
- ✓ §76 (don't ship speculative fix): each item gated on grep audit confirming no consumers.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.128; release.sh bumps to 0.2.129.
- ✓ §321 (feedback file before move): standard.
- ✓ NEW v0.2.120 (console.error HARD RULE): §1.2 applies the rule (fixing a known violation).

## §8 — Architectural framing

V1 hygiene. No V2 commitments. Reduces surface area for future audits.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Single drain. Each item is independent — if any one has unexpected consumers, ship the others + carry that one forward. Estimated CC time: 1-1.5 hours.
