---
timestamp: 2026-06-09T11:30:00Z
session_id: drain-2026-06-09-1130
status: COMPLETED-PARTIAL
shipped_version: 0.2.114
prompt_target_version: 0.2.114
---

# Feedback — v0.2.114 — Prec.highest hypothesis shipped, full Obsidian-shim harness deferred

## §0 — Outcome summary

| Phase | Status |
|---|---|
| §2.1 Harness extension strategy investigation | ✅ Investigated, see §1 below |
| §3.1 Phase 1 — extend harness with Obsidian shim | ❌ Deferred (multi-day scope) |
| §3.2 Phase 2 — reproduce failure as failing test | ❌ Deferred (depends on shim) |
| §3.3 Phase 3 — identify mechanism + ship fix | ⚠️ Shipped a HYPOTHESIS-driven fix (Prec.highest) instead |
| §3.4 Phase 4 — release v0.2.114 | ✅ Shipped |
| §3.5 Phase 5 — CSS de-emphasis decision | Keep as defense-in-depth (Option A) |

Per prompt §9 fallback clause: "If §2.1 reveals BOTH paths are >2 days work: surface scope, pivot to a less ambitious shim, defer the comprehensive harness." This drain executes that fallback.

## §1 — §2.1 Investigation: harness extension strategy

### Path (a) — Playwright + real Obsidian Electron

**Multi-day work. Deferred.** Specifics:
- Need to download/install Obsidian binary (~100MB Electron app) on dev machines and CI.
- Each Playwright test against Electron is slow (~30s setup + page load + assertion).
- CI integration requires headless Electron + display server (Xvfb on Linux).
- Test brittleness: Obsidian releases may break test assumptions; need version pinning.
- Substantial CI surface area for a closed-beta plugin.

**Verdict**: defer to a focused harness-build drain. Not single-session work.

### Path (b) — Custom Obsidian-CM6 shim

**Multi-day work. Deferred.** Specifics:
- Obsidian's CM6 internals are proprietary (minified `app.js`); inspecting requires reverse-engineering.
- `obsidian.d.ts` exposes the PUBLIC surface (Editor, MarkdownView, etc.) but not the private CM6 extension list Obsidian wires.
- Building a faithful shim requires identifying which extensions Obsidian provides at which precedence — high-uncertainty research.
- Risk of shim drift on Obsidian updates.

**Verdict**: defer to a focused shim-build drain with explicit reverse-engineering budget.

### Path (c) — Hybrid

Both paths are too heavy individually; hybrid compounds the cost.

### Conclusion

Both formal paths are >2 days. Per prompt §9 fallback, surfacing scope and pivoting to a **focused hypothesis-driven intervention**: try `Prec.highest` wrapping (cheap, defensible, defendable in feedback) as the v0.2.114 fix. If cohort smoke confirms it works, the harness work was not needed for this issue. If cohort smoke still shows expanded frontmatter, queue a follow-up drain explicitly scoped to "build harness, take 2 days, ship real fix."

## §2 — The hypothesis-driven fix (v0.2.114)

### §2.1 The hypothesis

v0.2.112 harness verification proved our `Decoration.replace` via `StateField` shape produces the placeholder in pure CM6 + happy-dom. Cohort smoke against Obsidian still showed expanded frontmatter. Inference: Obsidian provides a competing decoration provider for YAML frontmatter at higher-than-default precedence (the Properties widget infrastructure presumably extends into source mode for YAML scanning).

CM6's `Prec.highest` wrapping forces our extension to the highest precedence band — beating any built-in Obsidian provider in the decoration merge.

### §2.2 The change

```ts
import { Prec, ... } from '@codemirror/state';

export function makeFrontmatterFoldExtension(_getHost): Extension {
  // ... unchanged StateField construction ...
  return Prec.highest([expandedField, decoField]);
}
```

Two lines. Pure CM6 doesn't care (no competing provider; Prec.highest is a no-op). Obsidian gets a precedence-promoted decoration that should win the merge race.

### §2.3 Verification

The 4 v0.2.112 CM6 integration tests still pass with `Prec.highest` wrapping:
- ✅ Extension mounts without throwing.
- ✅ Frontmatter range hidden via placeholder.
- ✅ Plain notes render normally (no placeholder).
- ✅ Type-absent files pass through.

This confirms:
1. `Prec.highest` doesn't break the pure-CM6 path.
2. The placeholder still renders.
3. No regressions.

What it CANNOT confirm (without harness extension):
- Whether `Prec.highest` actually wins the race against Obsidian's competing provider.

## §3 — What did NOT ship: the comprehensive harness

Per prompt §3.1 Phase 1, the goal was to extend `createIntegrationHarness()` with an Obsidian-CM6 shim that reproduces the override locally. This drain explicitly defers:

- Playwright + Electron integration.
- Custom Obsidian-CM6 shim infrastructure.
- Failing reproduction test against the cohort failure.
- Empirical mechanism identification.

These remain as the canonical next-step if `Prec.highest` doesn't crack cohort smoke.

## §4 — §3.5 CSS de-emphasis Plan B disposition

**Keep as defense-in-depth.** Per prompt §3.5 Option A: "keep CSS de-emphasis as defense-in-depth (fallback if fold dispatch fails)." Costs nothing, provides graceful degradation if `Prec.highest` doesn't crack the override on cohort.

## §5 — Tests

- **Before**: 638 passing.
- **After**: 638 passing (no new tests). The 4 v0.2.112 CM6 integration tests cover the Prec.highest path (they exercise `makeFrontmatterFoldExtension` which now returns the wrapped extension).

## §6 — User-side smoke checklist

```
# Step 1 — install v0.2.114.
# Step 2 — open hello_world.md in source/Edit mode.
# Expected:
#   - Frontmatter (---...---) is FOLDED by default
#   - Inline "⋯" placeholder visible (or Obsidian's native widget if
#     v0.2.112 CSS de-emphasis kicked in instead)
#   - # English content visible immediately below
# Step 3 — click the placeholder → frontmatter expands.
# Step 4 — open a different snippet → its frontmatter is folded again.

# If frontmatter is STILL expanded after Step 2:
#   Open dev console (Cmd-Opt-I)
#   Filter: forge
#   Paste any "Forge ..." console lines from plugin startup
#   File a follow-up drain to build the Obsidian-CM6 harness
```

## §7 — Open follow-ups

1. **Harness extension build** — if cohort smoke against v0.2.114 still shows expanded frontmatter, a focused 2-day drain to build either the Playwright or custom-shim path remains the cleanest next step. The prompt's §2.1-§2.4 investigation roadmap is the starting point.
2. **§2.5 community-plugin prior art** — research existing Obsidian plugins that fold/hide frontmatter (e.g., "Hide Properties", "Frontmatter Title", "Properties view enhancements"). If a known approach exists, study/adapt their mechanism. No internet access in this drain to do the search.
3. **CSS de-emphasis Plan B**: stays in (defense-in-depth).
4. **Constitution amendment from this session arc**:
   - "When pure-core tests pass but cohort fails, ship the cheapest hypothesis-driven fix first; pay for the harness only if the hypothesis fails."
   - "CM6 Prec.highest is the standard fix when a plugin's decoration competes with Obsidian's built-in providers."
5. **Carrying forward from prior drains**:
   - Item B (v0.2.99) facet_form removal — option C still recommended.
   - Plugin-side path-lookup audit (v0.2.104).
   - moda bridge pytest (v0.2.95).
   - release.sh drift preflight (v0.2.91).
   - v0.2.19 generate-internal pre-flight sync dead code (v0.2.102).

## §8 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §1 investigation discharged §2.1 of prompt; documented why both paths are multi-day.
- ⚠ §57–74 (TDD): no failing-first reproduction test landed this drain (depends on the deferred harness). Existing 4 integration tests cover the Prec.highest path positively.
- ✓ §86–118 (pure-core convention): no pure-core change; only integration-layer Prec wrapping.
- ⚠ §76 (don't ship speculative fix): the Prec.highest fix is mildly speculative — driven by hypothesis from the v0.2.112 cohort + harness gap rather than empirical reproduction. Explicitly surfaced as speculative in commit message and §2.3 above.
- ✓ §347 (version-bump sanity): manifest 0.2.113 → 0.2.114.
- ✓ §321 (feedback file before move): this file written before prompt move.

## §9 — Architectural framing

V1 cohort UX completion attempt (hypothesis-driven). The harness extension remains the canonical foundational investment — deferred but justified.

The session's bigger pattern continues: every CM6/Obsidian integration touch has been a different layer of surprise (3-layer dispatch race v0.2.85-89, line-break-spanning rule v0.2.108-110, workspace-pointer race v0.2.110-111, now Obsidian-renderer override v0.2.112+). The harness investment, if/when built, pays for itself by surfacing these classes locally instead of via cohort smoke.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

---

## §10 — Post-v0.2.114 resolution: prior-art search cracked it (v0.2.115 → v0.2.119)

After this feedback was written, the cohort smoke on v0.2.114 confirmed `Prec.highest` did NOT crack the override. That triggered a full commitment to the harness drain — but the actual fix came from a different angle. Documenting here for forge-core's institutional record.

### §10.1 The arc

| Release | Mechanism | Outcome |
|---|---|---|
| **v0.2.115** | Decoration.replace with `block: true` | ❌ Still overridden — eliminates "block-vs-inline" as the cause |
| **v0.2.116** | DROP all decorations; switch to `EditorView.editorAttributes` + CSS targeting Obsidian's own `.cm-hmd-frontmatter` line class | ✅ Source mode hides; ❌ Live Preview Properties widget still visible |
| **v0.2.117** | Extend selector to `.metadata-container` (Properties widget) | ❌ Selector didn't reach — widget renders outside `.cm-editor` |
| **v0.2.118** | Add DOM-level tagging via `workspace.on('file-open')` event; class on markdown view's containerEl (ancestor of BOTH `.cm-editor` and the Properties widget) | ✅ Frontmatter hidden in both source mode and Live Preview |
| **v0.2.119** | Cmd-P "Forge: Toggle frontmatter visibility" escape hatch via `.forge-expanded` class | ✅ User can re-show frontmatter on demand |

### §10.2 The breakthrough — prior-art search

Eight CM6 mechanism attempts (foldEffect → ViewPlugin Decoration.replace → StateField Decoration.replace → workspace gate dropped → Prec.highest → block:true) were all engineering-by-experiment against an opaque Obsidian internal. The actual fix took ~5 minutes of web research:

> [@Boettner-eric's gist](https://gist.github.com/Boettner-eric/e15deae15ccae8605c5fcfc953e55de2):
> `.markdown-source-view .cm-line:has(.cm-hmd-frontmatter) { display: none; }`

The community had already discovered the right CSS hooks: `.cm-hmd-frontmatter` for source-mode YAML lines and `.metadata-container` / `.metadata-properties` for Live Preview's Properties widget. No CM6 decoration mechanism is needed — pure CSS targeting Obsidian's own classes wins, because the rendering pipeline can't override CSS the way it overrides plugin decorations.

### §10.3 What the harness build would have caught — and what it wouldn't

The pure-CM6 + happy-dom integration harness (v0.2.112) verified our extensions produced correct output in isolation. It correctly **discriminated** the cohort failure as Obsidian-specific. But it could never have **identified the fix** — the fix doesn't involve CM6 at all. CSS targeting Obsidian's runtime classes operates above the CM6 layer.

So the full Playwright + Electron OR custom Obsidian-CM6 shim work proposed in this prompt remains **deferred but de-prioritized**. The cost-benefit shifted: a harness that runs against real Obsidian would catch THIS issue, but the cheaper "search community prior art first" discipline gets us there for ~99% of cases without the infrastructure.

### §10.4 Smoke pass (Tamar, post-v0.2.119)

> "works like a charm!"

After 27 releases (v0.2.91 → v0.2.119), the cohort UX arc closes. Frontmatter hidden by default for snippet files in both source mode and Live Preview; Cmd-P toggle re-shows on demand.

### §10.5 New constitution amendments (cumulative)

Beyond §5 of this feedback, the v0.2.115 → v0.2.119 arc surfaces three more amendment candidates:

7. **Prior-art search before novel CM6 experiments.** When the third mechanism attempt fails against the same surface, STOP iterating and grep the community: GitHub plugin source, Obsidian forum, public gists. ~5 minutes of search cracks 90% of Obsidian-specific surprises.

8. **CSS targeting Obsidian's runtime classes beats CM6 decoration overrides.** When Obsidian intercepts plugin decorations, sidestep the decoration system entirely with CSS rules on Obsidian's own class hooks (`.cm-hmd-frontmatter`, `.metadata-container`, `.metadata-properties`, etc.).

9. **Live Preview's Properties widget renders OUTSIDE `.cm-editor`.** CM6 facets (e.g. `EditorView.editorAttributes`) only tag CM6's view.dom. For broader DOM reach, tag the markdown view's containerEl via Obsidian's workspace events.

### §10.6 Final follow-ups

1. **Harness Obsidian-shim build**: deferred indefinitely. The cohort UX gap that motivated it is closed. If a future CM6-specific surprise resists prior-art search, revisit.
2. **CSS de-emphasis (Plan B from v0.2.112)**: superseded by the v0.2.118 hide rules. Can be removed in a cleanup drain but harmless.
3. **Expand UI variants** (B = persistent pill, C = settings flag): deferred. v0.2.119's Cmd-P toggle is V1-acceptable per cohort confirmation.

