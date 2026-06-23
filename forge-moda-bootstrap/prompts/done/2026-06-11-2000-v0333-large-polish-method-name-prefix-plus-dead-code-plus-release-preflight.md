---
timestamp: 2026-06-11T20:00:00Z
session_id: drain-2026-06-11-2000
status: pending
priority: MEDIUM — polish bundle; carry-forward consolidation
---

# v0.2.133 — Large polish bundle: method-name prefix + dead-code consumer-recheck + release.sh preflight

## §0 — Scope rationale

Carry-forward backlog has accumulated five distinct polish items across v0.2.117 / v0.2.122 / v0.2.129 / v0.2.130 / v0.2.131 feedback files. This bundle consolidates them into one focused drain. Each item is low-risk; the value is reducing institutional debt + closing tracking-lane noise.

Estimated bundle size: ~25 method-name prefixes + 2-3 dead-code investigations + 1 release.sh preflight. CC may split per §9 if any single section exceeds expectations.

## §1 — Section A: method-name prefix work (~25 sites)

Carry-forward from v0.2.130 §2 (full enumeration). v0.2.130 shipped the LOG-LEVEL part of the console.error HARD RULE (sed-batch console.warn → console.error in catch blocks across 42 sites). The METHOD-NAME prefix part (each catch's message body should self-document the originating method) was deferred.

### §1.1 — Site list (from v0.2.130 §2, plus driver-flagged additions)

**§1.1.1 — welcome.ts (4 sites)**
- L275 `legacy .bak sweep failed` → `runFirstRunCheck: legacy .bak sweep failed`
- L308 `rmdir ${targetDir} failed` → `deleteExtractedDir: rmdir ${targetDir} failed`
- L339 `failed to sweep ${folder}` → `sweepLegacyBakDirs: failed to sweep ${folder}`
- L343 `vault root list failed during .bak sweep` → `sweepLegacyBakDirs: vault root list failed`

**§1.1.2 — edges.ts (1 site)**
- L96 `failed to read snapshot ${file}` → `walkSnapshots: failed to read snapshot ${file}`

**§1.1.3 — facet-mutex-view-plugin.ts (3 sites)**
- L57, L142, L274: all inside `makeFacetMutexViewPlugin`. Prefix as `facet-mutex view-plugin: ...` per v0.2.130 §2.4 outer-method rule.

**§1.1.4 — forge-action.ts (3 sites)**
- L530 — context: `openForgeAction`. Prefix: `openForgeAction: ...`
- L677 — context: `runDomainActivationAction`. Prefix: `runDomainActivationAction: ...`
- L712 — context: `listLibrary`. Prefix: `listLibrary: ...`

**§1.1.5 — modal.ts (2 sites)**
- L388, L444 `could not open newly created snippet`: confirm outer method via grep + read context. Likely `NewSnippetModal.openCreated` or similar. Prefix per actual method name.

**§1.1.6 — main.ts (~13 sites + 1 driver-flagged addition)**
- L579 (modify handler)
- L1271 (sanitize handler)
- L1296 (New Snippet connect)
- L1347 (domain registration)
- L1768 (pre-flight sync)
- L1987 (generate pre-flight)
- L2137 (post-write MEMFS sync)
- L2153 (frontmatter reconcile)
- L2176 (sync_dependencies)
- L2225 (canonical write MEMFS)
- L2474 (data preview)
- L2634 (post-install refresh)
- L2779 (cache write)
- L2798 (Python hash write)
- L2817 (post-write MEMFS)
- **NEW**: `Forge Compute non-2xx` at ~L131883 (driver flagged in 2026-06-11-1900 smoke Step 9 as yellow icon — log-level conversion missed this site). Audit + fix log level + add method-name prefix in same pass.

**§1.1.7 — output-view.ts (2 sites)**
- L211 `could not open new data snippet`: identify outer method.
- L384 `MIDI player init failed`: identify outer method.

**§1.1.8 — pyodide-host.ts (1 site)**
- L387 `could not read forge.toml from user vault`: identify outer method.

### §1.2 — Investigation rule per site

For each site:
1. Read 10-20 lines of context around the catch block.
2. Identify the lexically-enclosing function/method. If it's an inline lambda, walk up to the outer named factory/method.
3. Replace the message body to include `<methodName>: <existing message>` prefix.
4. Verify the catch is `console.error` (the v0.2.130 sed pass should have already converted; the driver's L131883 finding is a likely exception — fix log level there too).

### §1.3 — Bulk verification

After the pass:
```bash
grep -rn "console\.error" src/ | grep -v "\.test\.ts" | wc -l
# Should match v0.2.130's baseline of 73 + any newly-correct sites
```

Spot-check 5 random sites for the prefix pattern. Each error message should be greppable by method name.

## §2 — Section B: `canonicalActionTemplate` consumer recheck (v0.2.129 §2.2 carry-forward)

v0.2.129 audit found `canonicalActionTemplate` referenced in `modal.ts` (re-export), `modal-templates-core.ts` (definition), and `modal.test.ts` (3 tests). The v0.2.108 comment in `modal.ts:169` says it's a "stable plugin API surface". v0.2.129 chose to skip deletion.

### §2.1 — Re-audit

Is the re-export still serving a purpose? Investigation:
```bash
# Inside forge-client-obsidian repo:
grep -rn "canonicalActionTemplate" src/ --include="*.ts"
# Also check: does any consumer import it from main.ts or modal.ts?
grep -rn "import.*canonicalActionTemplate" src/ --include="*.ts"
```

If only internal use remains (no public-API consumer), delete the re-export. Modal-templates-core stays as the implementation; modal.ts stops re-exporting.

### §2.2 — Delete conditionally

If audit shows zero external consumers:
- Delete the re-export line in `modal.ts`
- Drop the v0.2.108 comment
- Verify build clean + tests green
- Note in feedback: "v0.2.108 hedge no longer needed; canonicalActionTemplate is fully internal"

If consumers ARE still found: keep + update the comment to name them explicitly. End the speculation.

## §3 — Section C: v0.2.19 generate-internal sync migration (v0.2.129 §2.3 carry-forward)

v0.2.129 found that `generate()` has a command-palette caller path (line 641) that doesn't pass through `forgeSnippet`'s v0.2.102 top-level pre-flight sync. Removing the in-`generate()` sync would break the command palette.

### §3.1 — Options

**A. Migrate the command-palette path** to wrap `generate()` with the v0.2.102 sync helper. Once both callers wrap, drop the in-`generate()` sync.

**B. Document the dual call paths** more explicitly in the source comment. Don't change behavior.

**C. Leave as-is** and remove from carry-forward (final disposition: "by design").

### §3.2 — Investigation

```bash
grep -n "this\.generate\|generate(" src/main.ts | head -20
```

Identify all `generate()` callers. Read context for each. Determine whether each:
- Already wraps with the v0.2.102 sync
- Doesn't wrap because it can't (e.g., the command-palette caller's context)
- Could trivially wrap

If all but the command-palette caller already wrap: choose **A**. Wrap the command-palette caller too; drop the in-`generate()` sync.

If multiple non-wrapping callers exist with structural reasons not to wrap: choose **B**. Document and close the carry-forward.

If unclear: choose **C** and remove from tracking lane.

## §4 — Section D: v0.2.117 obsolete check (carry-forward)

v0.2.117 was superseded by v0.2.122. The v0.2.129 feedback flagged it as "eligible for deletion if confirmed unused".

### §4.1 — Audit

```bash
grep -rn "v0\.2\.117\|0\.2\.117" src/ | grep -v "CHANGELOG\|releases"
```

If only historical comments remain (no live code paths annotated as v0.2.117), proceed to §4.2. If any live code reference exists, document why it's still around and CLOSE the carry-forward.

### §4.2 — Delete if pure-comment

Pure-comment-only references can be deleted if the historical context isn't useful. If the comment captures a non-obvious decision, leave it but drop the version marker.

Low-risk; mechanical.

## §5 — Section E: release.sh preflight check (v0.2.131 §4 #1)

v0.2.131 introduced build-time version inlining via `scripts/inline-plugin-version.mjs` → `PLUGIN_VERSION_AT_BUILD` constant baked into main.js. Defense-in-depth: release.sh should fail if main.js's inlined version doesn't match manifest.json.

### §5.1 — Implementation

In `release.sh`, after `npm run build` and after the `manifest.json` version bump, add:

```bash
INLINED_VERSION=$(grep -o 'PLUGIN_VERSION_AT_BUILD[ ]*=[ ]*"[^"]*"' main.js | head -1 | sed 's/.*"\(.*\)"/\1/')
MANIFEST_VERSION=$(node -e "console.log(require('./manifest.json').version)")

if [ "$INLINED_VERSION" != "$MANIFEST_VERSION" ]; then
  echo "ERROR: main.js inlined version ($INLINED_VERSION) != manifest version ($MANIFEST_VERSION)"
  echo "Likely cause: inline-plugin-version.mjs didn't run before esbuild, or build script ordering is broken."
  exit 1
fi
echo "✓ Inlined version $INLINED_VERSION matches manifest"
```

Place BEFORE the git tag step. Catches drift before release publish.

### §5.2 — Test

Synthetic drift test (run locally, not in CI):
- Manually edit `version-constant.generated.ts` to a different version
- Run `release.sh` (in dry-run mode if available, or stop after the preflight check)
- Verify preflight fails with clear error
- Revert

Document in commit message.

## §6 — Tests required

- Section A: no new tests (mechanical message-text change; existing tests unaffected). Smoke after pass: error messages should be greppable by method name.
- Section B: existing tests cover canonicalActionTemplate; if deleted, those tests delete with it.
- Section C: pending design decision. If A: 1 test for the command-palette path wrap. If B/C: no new tests.
- Section D: no new tests (comment cleanup).
- Section E: release.sh preflight is shell-script; cover via integration smoke (dry-run an intentional mismatch).

Plugin suite: 697 → ~697-700 depending on Section C choice + Section B deletion.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): each section has explicit audit step.
- ✓ §76 (don't ship speculative fix): each carry-forward item gated on audit confirming no consumers OR explicit deletion criterion.
- ✓ §347 (version-bump sanity check): release.sh bumps to v0.2.133.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: Section A IS the prefix part of the rule.
- ✓ v0.2.116 prior-art rule: each section reviews the v0.2.X prompt or feedback that surfaced it.

## §8 — User-side smoke

After ship:

```bash
# Section A spot-check: error messages should self-document method origin
# Trigger any fail path (e.g., temporarily break hello_world's English)
# Check DevTools console: each red error line should begin with a method-name prefix.

# Section B verification: if deleted, build clean + 697-ish tests pass.
grep -n "canonicalActionTemplate" src/main.ts src/modal.ts
# Expected: 0 hits if deleted; otherwise updated comment.

# Section C verification: depends on choice.

# Section D verification: no live code references to v0.2.117.

# Section E verification: dry-run a build with mismatched version → preflight fails.
```

## §9 — Open follow-ups + carry-forward survivors

Items that intentionally remain in the tracking lane (not bundled here):

- v0.2.99 follow-up #14 (migrate inert facet_form fields)
- Plugin-side path-lookup audit (v0.2.104) — folds into a future Bundle if it grows
- moda iframe e2e test + bridge pytest (deferred indefinitely)
- forge-tutorial `_meta/_chips.md` v3 parse error (separate focused drain)
- v0.2.119 persistent expanded-state across file switches
- v0.2.122 granular toggle commands
- Harness Obsidian-shim build (deferred indefinitely)
- v0.2.131 §4 #2 status-bar persistent indicator (defer until cohort feedback)

## §10 — Architectural framing

V1 institutional hygiene. No V2 commitments. Each section closes a documented carry-forward item with audit-gated logic. The bundle pattern follows v0.2.129's example (audit each item; conservative on ambiguous ones; document survivors clearly).

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §11 — Hand-off

Suggested order (lowest-risk first):
1. §5 release.sh preflight (~15 min) — pure shell script addition
2. §4 v0.2.117 audit (~15 min) — pure-comment likely
3. §2 canonicalActionTemplate audit + decision (~20 min)
4. §3 generate-internal sync audit + decision (~30 min)
5. §1 method-name prefix sweep (~45-60 min — the bulk)

Total estimated CC time: 2-2.5 hours.

If §1 expands beyond the enumerated sites (CC's audit may surface 5-10 more catches added since v0.2.130), surface count and SPLIT — keep §1 as a separate v0.2.134 drain to keep the diff reviewable. The mechanical/audit split worked well for v0.2.129/130; same pattern applies here.

NOTE: Issue 1 (english_hash) and Issue 2 (transpile UX) from v0.2.132 are NOT in this bundle — they're targeted fixes with cohort impact; this bundle is polish.
