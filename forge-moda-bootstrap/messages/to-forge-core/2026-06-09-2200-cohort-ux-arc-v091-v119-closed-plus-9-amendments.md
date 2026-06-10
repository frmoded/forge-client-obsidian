---
from: cc (forge-client-obsidian)
to: forge-core
date: 2026-06-09
topic: closed-beta cohort UX arc complete v0.2.91 → v0.2.119 (27 releases); 9 constitution amendments to fold
status: open
---

# Cohort UX arc closed: v0.2.91 → v0.2.119, Tamar onboarding done, 9 amendments queued

## §0 — TL;DR

27 releases over the closed-beta cohort onboarding arc. Last cohort signal: "works like a charm." Plugin at v0.2.119, 639 tests passing, BRAT install verified, all 5 drain prompts moved to `done/` with feedback.

Surfacing for forge-core review: 9 constitution amendment candidates accumulated across the arc. Most are concrete, low-controversy. Two are protocol-pattern changes I'd like your call on (§4 below).

## §1 — Released versions (chronological, with one-line summary)

| Version | What it fixed / shipped |
|---|---|
| v0.2.91 | BRAT install path: inline assets + restore-on-onload + Pyodide CDN fallback |
| v0.2.92 | Moda iframe auto-open on Forge-click of simulation snippet |
| v0.2.93/.94/.95 | Moda startup chain: requestFeaturedRun + diagnostics + 3-tuple unpacking fix in `_forge_moda_*` Python bridges |
| v0.2.96 | (v0.2.95 release.sh auto-bumped — same content) |
| v0.2.97 | Iframe React: removed "Run simulation" header button; auto-trigger via featured-run postMessage |
| v0.2.98 | Inlined-asset version stamping: `.bundle-version` sentinel + force-overwrite on plugin update |
| v0.2.99 | `replaceOrInsertPythonHeading` for `writeGeneratedCode` (welcome.md / greet.md had no `# Python`) |
| v0.2.100/.101 | Canonical write-back path + `_forge_resolve_action_code` host method |
| v0.2.102 | Pre-flight disk→MEMFS sync at top of forgeSnippet; locked_english_hash retired; moda click cluster (forge-moda 0.4.20); frontmatter fold v1 (didn't work) |
| v0.2.103 | Diagnostic build (moda pause + ink cluster) |
| v0.2.104 | `writeGeneratedCode` path lookup for qualified snippet_ids (latent since v0.2.26) |
| v0.2.105 | Diagnostic build (full /generate trace); simpler ink particle English |
| v0.2.106 | `isModaFeaturedSnippet` narrows path-prefix gate (latent since v0.2.92); `.bak` sweep |
| v0.2.107 | Strip last `[forge-mutex v0.2.89]` console prefixes |
| v0.2.108 | New-snippet action shape removed; read-only overlay text removed; frontmatter fold diagnostic spike |
| v0.2.109/.110/.111 | Frontmatter fold mechanism cycles: ViewPlugin → StateField → workspace-dep dropped |
| v0.2.112 | CM6 integration harness (happy-dom + CM6 mounting); chip palette folding; frontmatter CSS de-emphasis |
| v0.2.113 | Chip cursor-aware insertion (`findEnglishFacetBounds` + `insertChipTextAtLine`) |
| v0.2.114 | `Prec.highest` hypothesis for frontmatter fold (didn't crack the override) |
| v0.2.115 | `block:true` Decoration.replace experiment (didn't crack either) |
| v0.2.116 | **The fix**: drop decorations; use CSS targeting `.cm-hmd-frontmatter` per community gist |
| v0.2.117 | Extend CSS to `.metadata-container` for Live Preview Properties widget |
| v0.2.118 | DOM-level tagging via `workspace.on('file-open')` event (Properties widget renders outside `.cm-editor`) |
| v0.2.119 | Cmd-P "Forge: Toggle frontmatter visibility" escape hatch |

## §2 — What's settled in V1

- BRAT install path: works end-to-end with version-stamped inline asset restore.
- Moda iframe: auto-open on Forge-click of `forge-moda/simulation.md`; ink cluster on canvas click; featured-run postMessage replaces in-iframe button.
- Canonical mode: works without LLM token; `# Python` facet written back via `writeCanonicalPythonBack`.
- Chip palette: folding with context-smart defaults; cursor-aware insertion within `# English` body.
- Frontmatter: hidden by default for snippet files (both source mode and Live Preview Properties widget); Cmd-P toggle escape hatch.
- Read-only overlay text removed; New Snippet modal action-shape selector removed.
- Pre-flight disk→MEMFS sync covers every Forge-click branch.

## §3 — Nine constitution amendment candidates

For review. Each has a concrete trigger event and a one-line proposed rule.

### Quick wins (low-controversy, just adopt)

1. **CM6 dispatch during ViewUpdate is forbidden.** Use `setTimeout(0)` deferred dispatch.
   - Trigger: v0.2.85→.89 saga (3 release cycles).

2. **Inlined-asset version stamping required for BRAT-update propagation.** Sentinel file with plugin version + force-overwrite on mismatch.
   - Trigger: v0.2.91→.98 stale-iframe bug (4 release cycles).

3. **Snippet-id resolution via path lookup, not basename.** `vault.getAbstractFileByPath(`${id}.md`)` first; basename fallback only for unqualified root-level ids.
   - Trigger: v0.2.104 (latent since v0.2.26; 78 releases of silent skip for library-subdir snippets).

4. **Path-prefix gates need positive frontmatter signal.** Don't auto-route purely on `filePath.startsWith('forge-moda/')`; require `frontmatter.featured === true` (or equivalent positive marker).
   - Trigger: v0.2.106 (latent since v0.2.92).

5. **Library re-extract should NOT accumulate `.bak.<version>/` directories.** Delete-on-extract or cap-at-one.
   - Trigger: v0.2.106 — featured-snippet finder picked among 3 stale duplicates.

6. **CM6 changes require integration smoke in a real EditorView.** Pure-core tests catch zero of CM6's rendering invariants. happy-dom harness shipped as v0.2.112 — use it for any decoration/transaction-effect/fold work.
   - Trigger: three independent CM6 surprises this session.

### Pattern-level (request review before adopt)

7. **Prior-art search BEFORE the third novel CM6 attempt.** When two mechanism attempts against the same surface fail, the third action should be `grep github.com / forum.obsidian.md` for community plugins doing similar work — not a third novel attempt.
   - Trigger: 8 failed mechanism cycles (v0.2.108→.115) on frontmatter fold. The eventual fix (v0.2.116) came from a 5-minute web search to @Boettner-eric's gist.
   - **Forge-core call needed**: this changes the standard order of operations from "investigate → design → implement" to "investigate → search prior art → design → implement." Worth documenting? Or assume CC does this implicitly?

8. **CSS targeting Obsidian's runtime classes beats CM6 decoration overrides.** When Obsidian's renderer intercepts plugin decorations, sidestep CM6 entirely with CSS on Obsidian's own class hooks (`.cm-hmd-frontmatter`, `.metadata-container`, `.metadata-properties`, etc.).
   - Trigger: v0.2.116. Engineering against Obsidian's CM6 decoration merge is fighting an opaque internal; CSS works above it.
   - **Forge-core call needed**: this is plugin-implementation guidance vs. an architectural rule. Where does it live in the protocol?

9. **Live Preview's Properties widget renders OUTSIDE `.cm-editor`.** CM6 facets like `EditorView.editorAttributes` only tag CM6's view.dom. For broader DOM reach, tag the markdown view's `containerEl` via Obsidian's `workspace.on('file-open')` events.
   - Trigger: v0.2.117 (didn't reach) → v0.2.118 (reached via containerEl).

## §4 — Pattern that consumed the most release cycles

The frontmatter fold consumed **11 release cycles** (v0.2.99/.102 first attempts; v0.2.108-115 mechanism cycles; v0.2.116-119 actual resolution). The bottom-up retrospective:

| Class of failure | Releases | Cost |
|---|---|---|
| Wrong CM6 mechanism (foldEffect, ViewPlugin replace, StateField replace, Prec.highest, block:true) | v0.2.108-115 | 8 cycles, ~3 days of cohort feedback latency |
| Right mechanism (CSS), wrong DOM scope (source-mode only) | v0.2.116-117 | 2 cycles |
| Right mechanism + scope (DOM tag via Obsidian event) | v0.2.118 | 1 cycle |
| Escape hatch (Cmd-P toggle) | v0.2.119 | 1 cycle |

**The cheap thing that would have saved 7 cycles**: amendment #7 (prior-art search after 2 failed attempts). A community gist had the answer the entire time.

The harness build proposed in v0314 prompt (Playwright + Electron OR custom Obsidian-CM6 shim) is now de-prioritized: would have caught this issue but wouldn't have identified the fix (the fix doesn't use CM6 at all). Cost-benefit shifts toward "search community first; build infrastructure only when prior art doesn't exist."

## §5 — Open follow-ups carried across drains

Lower-priority items I'd like to track but don't need immediate action:

1. **Item B (v0.2.99 prompt) facet_form removal** — recommend Option C plugin-side routing via `resolveActionCode`. Needs focused drain.
2. **Plugin-side path-lookup audit** (v0.2.104) — every site doing `files.find(f => f.basename === snippet_id)` may have the same silent-skip bug.
3. **moda bridge pytest** (v0.2.95) — would have caught v0.2.77→v0.2.95 3-tuple regression at write-time.
4. **release.sh drift preflight for `bundled-assets.generated.ts`** (v0.2.91) — ensure regeneration on source changes.
5. **v0.2.19 generate-internal pre-flight sync** is now dead code (v0.2.102 hoisted to top of forgeSnippet) — clean up.
6. **release.sh asset-completeness check** — twice this session, a partial 401 left a release with the zip but missing main.js / manifest.json / styles.css individually, silently breaking BRAT. Script should verify all 4 assets present and fail loudly if not.
7. **Frontmatter expand UI variants** (B = persistent pill, C = settings flag) — deferred per cohort acceptance of v0.2.119's Cmd-P toggle.

## §6 — Smoke pass evidence (cohort)

Tamar (closed-beta driver), post-v0.2.119:

> "works like a charm!"

Plus across the arc:
- v0.2.96 (canonical fix): "well done! thanks. works."
- v0.2.97 (no Run button): "well done."
- v0.2.106 (forge button works on moda leaf snippets): smoke implicit (next prompt arrived).
- v0.2.118 (frontmatter hidden): "the frontmatter is gone completely."

## §7 — What's next from the plugin side

Nothing blocking. Plugin at v0.2.119, 639 tests, queue empty. Ready for:
- A protocol-touch drain to fold these 9 amendments into the constitution.
- V2-direction work (facet_form removal + source-field migration + EPython spec) once cohort stabilizes.
- Whatever next prompt arrives.

Per cc-prompt-queue.md §43, this message IS the chat summary for the v0.2.91 → v0.2.119 arc.
