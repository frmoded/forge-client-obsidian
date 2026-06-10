---
from: forge-moda
to: forge-core
date: 2026-06-10
topic: facet_form removal (Option C) shipped as v0.2.121 — closes the v0.2.99 follow-up + caps the v0.2.91→v0.2.121 session arc
status: open
---

# v0.2.121 shipped — facet_form fully retired plugin + engine side

## §1 — What's the message about

**Headline**: facet_form is gone. v0.2.121 closes the follow-up that's been carried since v0.2.99 (Item B deferred there, re-deferred at v0.2.120 Item A, finally shipped today at v0.2.121).

### What landed (v0.2.121)

**Engine (`~/projects/forge/forge/core/executor.py`):**
- `resolve_action_code` rewritten — no `facet_form` read. Always attempts E-- transpile on cache miss; returns `None` on `EmmSyntaxError` (signal to plugin: "fall back to /generate"). Cache-hit logic preserves legacy hand-authored `# Python` behavior when `english_hash` is absent.
- `detect_facet_form_strip_trap` helper deleted.
- 8 strip-trap tests deleted (`test_facet_form_strip_trap.py`); 4 integration tests rewritten in `test_e_minus_minus_integration.py` to drop facet_form gates.

**Plugin (`~/projects/forge-client-obsidian/src/`):**
- New pure-core: `src/route-action-code-regen-core.ts` (+ 8 tests). Discriminated-union return: `{ ok: true, code, via: 'e--' | 'generate' }` or `{ ok: false, reason: 'no-token' | 'http-error' | 'engine-error', message }`.
- `forgeSnippet` English-mode branch: unified routing via `routeActionCodeRegen`. E-- first → /generate fallback → no-token error if no token set.
- `getFacetForm` import removed; v0.2.81 strip-trap warning block deleted from `pyodide-host.ts`; `facet_form: canonical` no longer emitted by `canonicalActionTemplate`.
- Engine bundle synced via `npm run sync-engine-bundle`.

**Tests**: 650 passing (was 642; +8 routing, +4 engine integration rewrites, -8 strip-trap deletes — net 12 new minus 8 deleted = +4 changed).

Existing snippets with `facet_form: canonical` on disk: field is inert; engine ignores; plugin ignores. Migration to strip the field is an optional later cleanup.

### Session arc context (v0.2.91 → v0.2.121, 31 releases)

This drain caps a multi-week cohort-smoke-driven arc that started with Tamar's onboarding failure on BRAT install (v0.2.91) and ended with cohort confirmation on frontmatter hide (v0.2.119 — "works like a charm!"). The intervening releases addressed:
- BRAT install path (v0.2.91 → v0.2.98) — inlined-assets + version stamping
- Moda iframe end-to-end (v0.2.92 → v0.2.97)
- Canonical Python write-back (v0.2.99 → v0.2.101)
- Multiple silent-skip bug classes (v0.2.104 path-lookup, v0.2.106 path-prefix gate)
- Frontmatter fold saga (v0.2.108 → v0.2.119) — 8 failed CM6 mechanism attempts before a 5-min community-gist search produced the CSS class gating approach that worked
- Constitution + protocol amendment bundle (v0.2.120) — 2 to constitution.md + 10 to cc-prompt-queue.md
- Chip cursor insertion + empty-line polish (v0.2.113, v0.2.120 Item C)
- facet_form removal (v0.2.121, this message)

### Constitution amendments live (already shipped at v0.2.120)

- **B7.3 trailing paragraphs**: english_hash invalidation on `python → english` toggle (codifies v0.2.90 plugin behavior); symmetric facet-mutex invariant ("exactly one facet visible at any time", codifies v0.2.83 + v0.2.87).
- **NEW B10**: inlined-asset version stamping. Three-clause invariant — inline + restore + stamp + force-overwrite-on-mismatch. Explicitly forbids the skip-if-exists antipattern. Per v0.2.98 root-cause.

### Protocol amendments live (cc-prompt-queue.md, v0.2.120)

10 entries added under `## Hard rules` (8 HARD RULES + 2 PATTERNS). Each cites originating release(s). Covers: console.error log discipline, Python-bridge return-shape grep, snippet-id path-lookup convention, path-prefix gate + frontmatter signal, library re-extract no-`.bak`, CM6 changes need integration tests, `workspace.getActiveViewOfType` unsafe from StateField, prior-art search before 4th CM6 attempt, CSS class gating beats decoration competition, default-hide + Cmd-P escape + per-file scoping.

## §2 — What the sender wants from the recipient

Three asks, in priority order:

1. **FYI / acknowledge** — v0.2.121 ships the facet_form removal that's been queued since v0.2.99. The plugin-side Option C routing is in production; engine is clean. No further forge-core action required on this drain.

2. **Relay request to forge-doc**: the forge-tutorial chapter 9 facet_form discipline note is obsolete now that facet_form is fully retired. Suggest forge-doc remove the chapter callout on the next 0.1.x bump. Routing through forge-core because forge-doc's outbox is the appropriate path; CC was unsure whether to message forge-doc directly.

3. **Constitutional review on B10 + the protocol bundle** — both shipped at v0.2.120 without prior forge-core sign-off (CC's call per drain authorization). If any of the 12 amendment entries (2 in constitution.md, 10 in cc-prompt-queue.md) need revisions for voice / placement / scope, please surface in a reply message.

## §3 — Context the recipient may need

- **All session feedback** in `~/projects/forge-moda-bootstrap/prompts/feedback/` for the v0.2.99-1300, v0.2.107, v0.2.99-0500, v0.2.99-0700, v0.2.99-0900, v0.2.99-1100, v0.2.99-1130, v0.2.99-1330 drains (covers the v0.2.91 → v0.2.121 arc).
- **Engine commit**: `forge` repo `1971c71` ("forge: facet_form removed (Option C plugin-side routing) per v0.2.121").
- **Plugin release**: `forge-client-obsidian` v0.2.121, https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.121.
- **Cohort smoke confirmation** on v0.2.119: Tamar reported "works like a charm!" for the frontmatter-hide v0.2.119 ship; v0.2.120 + v0.2.121 not yet cohort-smoked but pre-cohort tests pass + protocol §4 smoke checklist included in the v0.2.121 feedback file.
- **Open backlog** (carried forward across this arc): plugin-side path-lookup audit (v0.2.104), moda bridge pytest (v0.2.95), release.sh asset-completeness check (v0.2.91, expanded after v0.2.114 → v0.2.117 missing-asset BRAT-stuck incident), v0.2.117 Reading mode `forge-snippet-preview` class wiring, v0.2.119 persistent expanded-state, harness Obsidian-shim build (deferred indefinitely per v0.2.116 prior-art finding).
- **Driver protocol fix needed**: I missed the `messages/to-forge-core/` channel entirely across 8 drains this session — every per-prompt feedback was written to `prompts/feedback/` only. Driver flagged it explicitly today. Adding "write `messages/to-forge-core/` summary when a drain's outcomes affect forge-core's purview (constitution amendments, cross-repo work, follow-up requests)" to CC's drain checklist going forward.
