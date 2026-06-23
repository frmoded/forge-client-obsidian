---
prompt: 2026-06-25-1400-v0335-section-a-method-name-prefix-sweep-bulk.md
shipped_version: v0.2.136 (release.sh auto-bumped past v0.2.135 because v0334's renamed-as-v0336 drain shipped first)
session: drain-2026-06-25-1400
date: 2026-06-25
status: shipped
---

# v0335 feedback — Section A bulk sweep: method-name prefix work across 8 files

## §1 — What shipped (v0.2.136)

Mechanical precision pass per v0.2.120 console.error HARD RULE. Each enumerated catch block's error message now carries a method-name prefix so future debugging can grep src/ by method name.

### §1.1 — Per-file updates

**welcome.ts (4 sites)**:
- `runFirstRunCheck: legacy .bak sweep failed`
- `deleteExtractedDir: rmdir ${targetDir} failed`
- `sweepLegacyBakDirs: failed to sweep ${folder}`
- `sweepLegacyBakDirs: vault root list failed`

**edges.ts (1 site)**:
- `walkSnapshots: failed to read snapshot ${file}`

**facet-mutex-view-plugin.ts (3 sites)** — all inside `makeFacetMutexViewPlugin`; prefixed `facet-mutex view-plugin:` per prompt §2.3 outer-method rule:
- `facet-mutex view-plugin: initial state failed`
- `facet-mutex view-plugin: file-change reattach failed`
- `facet-mutex view-plugin: deferred dispatch failed`

**forge-action.ts (3 sites)**:
- `applyDiff: domain-activation action ${action.type}/${action.domain} failed` (note: actual enclosing method is `applyDiff`, not `openForgeAction` — prompt's enumeration had it as the latter; corrected to match source)
- `openForgeAction (open-vault button): app:open-vault failed`
- `copyLibraryRoots: could not list library dir ${libraryDirName}`

**modal.ts (2 sites)** — both inside `ForgeSnippetModal`:
- `ForgeSnippetModal.submit: could not open newly created snippet`
- `ForgeSnippetModal.submitBinary: could not open newly created snippet`

**main.ts (~14 sites)** — fresh grep mapped line numbers since they'd shifted from prompt's v0.2.134 enumeration:
- `onload (modify handler): MEMFS sync on modify failed`
- `sanitizePythonTabs: write failed`
- `createNewSnippet: connect failed before opening New Snippet modal`
- `loadActiveDomains: could not read forge.toml domains`
- `forgeSnippet: pre-flight disk→MEMFS sync failed`
- `generate: pre-flight sync failed before /generate`
- `writeGeneratedCode: MEMFS sync after write failed for '${id}'`
- `writeGeneratedCode: frontmatter reconciliation failed for '${id}'`
- `writeGeneratedCode: sync_dependencies failed for '${id}'`
- `writeCanonicalPythonBack: MEMFS sync after canonical write failed`
- `maybePreviewDataSnippet: binary data snippet preview failed`
- `maybePreviewDataSnippet: could not read data snippet for preview`
- `maybePreviewDataSnippet: data snippet preview failed`
- `computeSnippetWithArgs (post-install refresh): post-install refresh failed`
- `handleSlotCacheMiss: failed to read snippet for cache write`
- `handleSlotCacheMiss: # Python / english_hash write failed`
- `handleSlotCacheMiss: post-write MEMFS sync failed`

**output-view.ts (2 sites)**:
- `openSaveAsDataModal: could not open new data snippet`
- `renderMusicXML: MIDI player init failed; score will render without playback`

**pyodide-host.ts (1 site)**:
- `PyodideHost._init: could not read forge.toml from user vault`

Total: ~30 catch sites updated across 8 files.

### §1.2 — Notes from the sweep

**Method-name corrections vs. prompt enumeration**:
- forge-action.ts L530 was attributed to `openForgeAction` in the prompt's enumeration but actually lives inside `applyDiff` (a method on a private class within forge-action.ts). Used `applyDiff` since that's the lexically-enclosing method.
- main.ts line numbers shifted (the prompt noted this in §2.6 — used a fresh `grep -n "console\.error" src/main.ts` to map current state).

**Sites NOT updated in this drain** (already have method-style context):
- main.ts L1251/L1262/L1280 `Forge canonicalize: ...` — already qualified by sub-method context.
- main.ts L844/L1776 `Forge ${verb} error` — verb is a method-name-equivalent runtime value.
- main.ts L1690 `Forge chips: load failed` — has sub-system context.
- main.ts L323 `Forge: restoreInlinedAssets failed` — already has method name as the error subject (could be future-cleaned but isn't a pure brand prefix).
- output-view.ts L33/L211/L384/L400/L407 sites already updated in same pass or already qualified.

All sites still pass the §4 "greppable by method name" verification.

## §2 — Tests + release

- 710 plugin tests passing (unchanged — mechanical message-text change).
- Build clean.
- Tag `v0.2.136` + GH release with assets.
- INSTALL.md synced.
- release.sh inlined-version preflight (v0.2.134 §5) passed cleanly for v0.2.136.

## §3 — Release surprise: v0.2.136 instead of v0.2.135

The v0334 drain (small bugs bundle) was renamed v0334 → v0336 mid-flight to match release.sh's auto-bump-ahead pattern after v0.2.134 shipped + v0.2.135 was claimed by that drain. Per shared-remote dynamics with parallel work, this drain's release.sh bumped past v0.2.135 → v0.2.136.

Working as intended; the version-numbering noise is the cost of shared-remote multi-drain workflow.

## §4 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): each site read in context before edit; method names verified via grep against enclosing function/method signatures.
- ✓ §76 (don't ship speculative fix): all changes mechanical per the v0.2.120 rule.
- ✓ §347 (version-bump sanity check): release.sh handled the auto-bump correctly.
- ✓ §321 (feedback before move): this file written before the prompt move.
- ✓ v0.2.120 console.error HARD RULE: THIS IS the prefix part of the rule. Combined with v0.2.130 (log-level) + v0.2.134 (Sections B+C+D+E + driver-flagged L2678), the HARD RULE is now fully retroactively applied.
- ✓ release.sh inlined-version preflight (v0.2.134 §5): auto-applied; v0.2.136 main.js carries `0.2.136`.

## §5 — User-side smoke (deferred to driver)

Per §6 of prompt:
1. Trigger any fail path (e.g. temporarily break hello_world's English with `}}}}}`).
2. Forge-click.
3. Open DevTools console.
4. Expected: each red error line begins with a method-name prefix that lets you grep src/ and find the catch block.

Light smoke; primary value is institutional (faster future debugging) not user-visible UX.

## §6 — Open follow-ups + carry-forward survivors

Unchanged from prompt §8:
- v0.2.99 follow-up #14 (migrate inert facet_form fields)
- moda bridge pytest (deferred indefinitely)
- v0.2.119 persistent expanded-state (feature backlog)
- v0.2.122 granular toggle commands (feature backlog)
- Harness Obsidian-shim build (deferred indefinitely)
- v0.2.131 §4 #2 status-bar persistent indicator (defer until cohort feedback)
- v0.2.91 + v0.2.92 CDN resilience (3 items — bundle as publish-readiness prompt when publish push starts)
- SELECTION-based chip insertion (QoL feature)
- Cohort staleness signal for slot-free `# Python` (publish-readiness UX)

Closed in this drain:
- ~~v0.2.134 §10 Section A method-name prefix sweep~~ → THIS DRAIN

## §7 — Architectural framing

V1 institutional hygiene completion. The v0.2.120 console.error HARD RULE is now fully retroactively applied across the existing codebase:
- v0.2.130: log-level sweep (console.warn → console.error in catch blocks)
- v0.2.134: Sections B+C+D+E + driver-flagged log-level miss
- v0.2.135 → v0.2.136: this Section A bulk sweep

Future enforcement is per-PR. No behavior change; just precision.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §8 — Hand-off

v0.2.136 ships the bulk prefix sweep. Queue empty after this drain.
