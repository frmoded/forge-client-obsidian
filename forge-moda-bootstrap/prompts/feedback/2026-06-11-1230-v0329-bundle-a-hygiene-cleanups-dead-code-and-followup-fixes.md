---
prompt: 2026-06-11-1230-v0329-bundle-a-hygiene-cleanups-dead-code-and-followup-fixes.md
shipped_version: v0.2.129
session: drain-2026-06-11-1230
date: 2026-06-11
status: shipped — 2 of 5 items deleted, 3 documented as "consumers remain"
---

# v0329 feedback — Bundle A hygiene cleanups

## §1 — What shipped (v0.2.129)

Per prompt §1 + §2 — grep audit gated each deletion. Two items shipped; three documented in §2 below as "carry forward — consumers remain".

### §1.1 — Deleted `facet-form-core.ts` + test (§1.1 of prompt)

Audit: `grep -rn "facet-form-core\|getFacetForm\|FacetForm" src/` returned ONLY `src/facet-form-core.test.ts` self-importing. Zero production consumers post-v0.2.121 facet_form removal.

Deleted both files. Test count: 696 → 687 (−9 deleted tests). Build clean.

### §1.2 — `console.warn` → `console.error` (§1.2 of prompt)

`main.ts:1820` (was the english-mode `writeCanonicalPythonBack` catch). Per v0.2.120 HARD RULE #1: caught runtime errors → `console.error` with originating method name.

```typescript
catch (e) {
  console.error('forgeSnippet (english-mode): writeCanonicalPythonBack failed', e);
}
```

## §2 — Documented as "consumers remain — carry forward" (per prompt §9)

### §2.1 — `markDriftAsync` already fully removed (§1.3 of prompt)

Audit: `grep -rn "markDriftAsync" src/` returned 2 hits, BOTH historical comments:
- `main.ts:991` — comment about MODE_BTN_CLASS history mentioning markDriftAsync path
- `main.ts:1010` — comment "v0.2.102 — markDriftAsync removed alongside locked_english_hash"

No function declaration remains. Already fully removed in v0.2.102. Nothing to delete this drain. Comments left as-is (they're historical context, not dead code).

### §2.2 — `canonicalActionTemplate` has consumers (§1.4 of prompt)

Audit: 5 hits across `modal.ts` (re-export + alias), `modal-templates-core.ts` (definition), and `modal.test.ts` (3 tests). The v0.2.108 comment "in case other code may import it for non-modal authoring paths" remains accurate — `modal.ts:169` re-exports it as a stable plugin API surface.

Skipped per prompt §9. If forge-core ever confirms no external consumer depends on the re-export, this becomes deletable.

### §2.3 — v0.2.19 generate-internal pre-flight sync has consumers (§1.5 of prompt)

Audit: `generate()` (line 1925) has callers from two paths:
1. `forgeSnippet` (line 1845) — wraps generate() with the v0.2.102 top-level pre-flight sync.
2. **Command palette callback** (line 641) — calls `this.generate()` directly with NO parent forgeSnippet wrap.

Removing the in-`generate()` sync would break the command palette path. Skipped per prompt §9. Carry forward.

## §3 — Tests + release

- 687 passing (696 baseline − 9 deleted from facet-form-core.test.ts).
- Build clean.
- Smoke `node scripts/smoke-moda-dispatch.mjs` still 42/42 passing.
- Tag `v0.2.129` + GH release with full assets.
- INSTALL.md synced.

## §4 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): grep audits per item before any code change.
- ✓ §76 (don't ship speculative fix): each deletion gated on audit confirming no consumers; conservative call on the 3 that have consumers.
- ✓ §347 (version-bump sanity check): release.sh bumped 0.2.128 → 0.2.129.
- ✓ §321 (feedback before move): this file written before the prompt move.
- ✓ NEW v0.2.120 (`console.error` HARD RULE): §1.2 APPLIED the rule, closing a documented violation.

## §5 — Open follow-ups

Per prompt §6 carry-forward + new entries:

- **§2.2 `canonicalActionTemplate`**: deletable if/when modal.ts re-export is confirmed unused externally
- **§2.3 v0.2.19 generate-internal sync**: deletable if/when the command palette path migrates to forgeSnippet-style dispatch
- v0.2.117 follow-up (obsolete per v0.2.122 — eligible for deletion if confirmed unused)
- v0.2.119 persistent expanded-state across file switches
- v0.2.122 granular toggle commands
- Plugin-side path-lookup audit (v0.2.104) — folds into Bundle C
- moda iframe e2e test + bridge pytest (deferred indefinitely)
- forge-tutorial `_meta/_chips.md` v3 parse error (separate focused drain)

## §6 — Architectural framing

V1 hygiene. No V2 commitments. Reduces surface area by 1 module + 9 tests. Catches one more HARD RULE violation. Conservative on the 3 ambiguous items per §76 + §9 of prompt.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §7 — Hand-off

v0.2.129 shipped clean. Proceeding to v0330 (Bundle B: console.error audit across plugin) next.
