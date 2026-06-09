# E-- integration — Stage 1 (vendor + bundle) + Tiny Stage 2 (opt-in `facet_form: canonical` path)

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end. Recent amendments include 6a/6b paste-able-commands (2026-06-05), bundled-vault forge.toml bump rule (2026-06-05), and the sharpened pre-drain re-read mandate (2026-06-05). This prompt has a §6 RESOLVED-QUESTIONS ADDENDUM at the bottom — read the original §1–§5 first, then §6 which supersedes the design ambiguity Phase 1 surfaced.

## Scope

Per the E-- migration roadmap committed in v1-audit item (s) and constitution V2a v7 Mission preamble: this drain ships **Stage 1** and a **tiny Stage 2** — the foundation for migrating Forge's English facets from free-prose-with-LLM-translation to canonical E--.

**Stage 1 (mechanical infrastructure)**: vendor E-- source from `~/projects/e--/src/*.py` into the forge engine package at `~/projects/forge/forge/e_minus_minus/`. Pin to E-- version 0.1.6 (current as of drain time; CC verifies in Phase 1). Add a `VERSION` file recording version + git SHA + sync date. Add a sync script for future pin bumps. Extend the engine-bundle-drift detection to cover the new subdirectory.

**Tiny Stage 2 (opt-in compile path)**: extend the engine's snippet compile pipeline to recognize `facet_form: canonical` in snippet frontmatter. When set, the engine routes the English facet through E--'s deterministic compiler (`emm.transpiler.transpile(source)`) instead of calling `/generate`'s LLM. Existing free-English snippets continue unchanged. Ship ONE experimental snippet in `forge-moda/` exercising the path end-to-end.

What this prompt does NOT do:
- Migrate any existing snippets to canonical form. v0.4.x territory.
- Rewrite B5/B6/B7 in the constitution. They get atomically rewritten when Stage-5 ships (free-English default flips). For now, B5/B6/B7 describe the LLM path; new `facet_form: canonical` clause goes adjacent.
- Touch the `/generate` server endpoint. The LLM path is untouched; canonical is a parallel path.
- Bundle E-- as a Python wheel. Vendored source files only — same pattern as the existing `forge/forge/` mirror.
- Implement the LLM normalizer-front-end (free English → canonical). That's E--'s job inside its own codebase; Forge only consumes the canonical → Python deterministic path for now. Free-English snippets continue through `/generate` unchanged.

## Why

Per Mission V2a v7: "The canonical form is E--... the deterministic E-- compiler emits Python; the LLM is out of the runtime path." User committed to no backward compatibility going forward. This drain is the prerequisite for every future drain that authors canonical-form snippets — without it, `facet_form: canonical` is just unrecognized frontmatter.

Per the new no-demo-gating rule (cowork-forge-protocol.md): this prompt drafts NOW; firing timing is the user's call. Engineering depends only on (a) E-- source being available at `~/projects/e--/src/` (it is — spec 0.1.6 / implementation 1464 LOC) and (b) the existing engine-bundle pipeline (also already in place per v0.2.30 work).

## Phase shape — two-phase per investigation-before-design rider

### Phase 1 — investigation + Stage 1 (vendor + bundle, no behavior change)

Investigation findings + the mechanical vendoring. End of Phase 1: E-- source files mirrored into `forge/forge/e_minus_minus/`, sync script in place, drift detection extended, VERSION pin recorded. The engine doesn't USE E-- yet — it just has it available.

**Investigation tasks** (cited in §1.2 of feedback):

1. **Verify the E-- vendor target**. Read `~/projects/e--/src/` listing. Confirm 9 files: `ast_nodes.py`, `emitter.py`, `errors.py`, `lexer.py`, `normalizer.py`, `parser.py`, `resolver.py`, `transpiler.py`, plus any `__init__.py` if present. Cite the current E-- version (from `~/projects/e--/docs/spec.md` H1) and HEAD git SHA.

2. **Read the E-- public API**. From `~/projects/e--/src/transpiler.py`, identify the entry point CC will call from Forge engine. Likely `transpile(source: str) -> str` or similar. Cite the function signature.

3. **Pyodide compatibility check**. Read `~/projects/e--/requirements.txt` to confirm E-- has no exotic dependencies. The spec mentions Anthropic API for the `{{ }}` resolver — that's runtime, not import-time. Verify nothing imports `requests` / `urllib` / etc. at module top level (would break Pyodide bundling).

4. **Cross-reference forge engine layout**. Read `~/projects/forge/forge/__init__.py` and `~/projects/forge/forge/core/` to understand where E-- fits. Sibling to `forge/core/` is the most likely shape: `forge/e_minus_minus/`.

5. **Engine-bundle pipeline integration**. Read `~/projects/forge-client-obsidian/scripts/sync-engine-bundle.mjs` to understand the current mirror logic. Determine whether E-- needs a new subdirectory in `forge-client-obsidian/assets/engine/forge/e_minus_minus/` or if the existing mirror script picks it up automatically.

**Stage 1 deliverables** (commit at end of Phase 1):

- `~/projects/forge/forge/e_minus_minus/` — mirror of `~/projects/e--/src/`. Byte-equal where possible (preserve copyright/license headers if any).
- `~/projects/forge/forge/e_minus_minus/VERSION` — text file:
  ```
  e-- version: 0.1.6
  e-- git SHA: <SHA from e-- HEAD at sync time>
  synced: 2026-06-05
  notes: initial pin
  ```
- `~/projects/forge/forge/e_minus_minus/__init__.py` — minimal init exposing the public API (whatever Phase 1.2 identified as the entry point):
  ```python
  from .transpiler import transpile  # or whatever Phase 1 finds
  ```
- `~/projects/forge/scripts/sync-emm.mjs` (NEW) — idempotent sync script. Copies from `~/projects/e--/src/` to `~/projects/forge/forge/e_minus_minus/`, preserving the `VERSION` file's structure. Logs what it copied.
- `~/projects/forge-client-obsidian/scripts/sync-engine-bundle.mjs` — extension to handle the new `e_minus_minus/` subdirectory (or verify it's already picked up automatically).
- Drift-detection preflight in `release-zip.mjs` (or wherever) extended to flag any drift between `forge/forge/e_minus_minus/` and `forge-client-obsidian/assets/engine/forge/e_minus_minus/`.
- Suite still green (`pytest -q` in forge + `npm test` in forge-client-obsidian).

### Phase 2 — tiny Stage 2 (opt-in compile path + one experimental snippet)

**TDD discipline** — failing tests first:

Engine-side tests (`~/projects/forge/tests/core/test_e_minus_minus_integration.py`, new file):

1. `compile_via_emm(canonical_source)` returns Python source (string).
2. Snippet with `facet_form: canonical` frontmatter + valid canonical English facet → engine compiles via E--, NOT via `/generate`. Assert the resulting Python by content.
3. Snippet with `facet_form: canonical` + invalid canonical syntax (e.g., missing period) → engine raises a clear error citing the line number; does NOT fall through to LLM.
4. Snippet without `facet_form` frontmatter → engine uses existing `/generate` path (regression test: legacy behavior preserved).
5. Snippet with `facet_form: canonical` + `{{ slot }}` value slot → engine recognizes the slot and routes to E--'s resolver (cached in `.emm_cache.json` or whatever E-- uses). Note: this case may be deferred to a follow-up if the resolver wiring is more than a few lines; document the deferral in §2 if so.
6. `facet_form: free` (explicit free-English declaration) → same as absent, uses `/generate`.
7. Idempotent rider — same input twice = same output (cache hit on second call).

Plugin-side tests are limited because the compile path runs inside the engine (Pyodide). Add at minimum:

8. Bundled engine includes `forge/e_minus_minus/transpiler.py` (file existence check in release zip).

**Implementation**:

- `~/projects/forge/forge/core/executor.py` — modify the action snippet execution path. Where today it calls `/generate` for snippets without a Python facet, the new logic checks `facet_form: canonical` first. If set, call `forge.e_minus_minus.transpile(english_facet_body)` → use the returned Python string as the "Python facet" for the rest of execution. If absent or `facet_form: free`, current `/generate` path.
- `~/projects/forge/forge/core/snippet_registry.py` (or wherever frontmatter is parsed) — expose `facet_form` to the executor.

**Experimental snippet** — ship ONE canonical-form snippet to validate end-to-end:

`~/projects/forge-moda/canonical_demo.md` (NEW):

```markdown
---
type: action
inputs: []
facet_form: canonical
description: Stage-2 canonical-form demo. First Forge-moda snippet authored in E-- canonical form; deterministic compile, no LLM at compute time.
---

# English

Do [[print]]("Canonical form works.").

# Dependencies

[[print]]
```

Forge-clicking this snippet should compile through E--, produce `print("Canonical form works.")`, execute, render in ForgeOutput. The whole interaction runs without any LLM call.

Bump `forge-moda/forge.toml` version (per the new bundled-vault-content rule in cc-prompt-queue.md). Bundled mirror gets updated. v0.2.38 auto re-extract surfaces the new file to cohort vaults.

**Don't ship `facet_form: canonical` as the default for ANY existing snippet.** Stage 2 is opt-in only. The experimental snippet is the only `facet_form: canonical` in this drain.

## Files likely to touch

Phase 1:
- `~/projects/forge/forge/e_minus_minus/` (NEW directory + files mirrored from e--)
- `~/projects/forge/forge/e_minus_minus/VERSION` (NEW)
- `~/projects/forge/forge/e_minus_minus/__init__.py` (NEW)
- `~/projects/forge/scripts/sync-emm.mjs` (NEW)
- `~/projects/forge-client-obsidian/scripts/sync-engine-bundle.mjs` (MODIFY)
- `~/projects/forge-client-obsidian/scripts/build-release-zip.mjs` (MODIFY — drift preflight)

Phase 2:
- `~/projects/forge/forge/core/executor.py` (MODIFY)
- `~/projects/forge/forge/core/snippet_registry.py` (MODIFY — expose `facet_form`)
- `~/projects/forge/tests/core/test_e_minus_minus_integration.py` (NEW)
- `~/projects/forge-moda/canonical_demo.md` (NEW)
- `~/projects/forge-moda/forge.toml` (BUMP version per the new cc-prompt-queue rule)
- `~/projects/forge-client-obsidian/assets/vaults/forge-moda/canonical_demo.md` (mirror)
- `~/projects/forge-client-obsidian/assets/vaults/forge-moda/forge.toml` (mirror)
- `~/projects/forge-client-obsidian/manifest.json` — `{CURRENT} → {NEXT_PATCH}` placeholder.
- `~/projects/forge-client-obsidian/INSTALL.md` — version pin update.

## Out of scope

- Migration affordance ("Canonicalize this snippet" command) — Stage 3.
- Bulk migration of bundled forge-moda / forge-music snippets — Stage 4.
- Free-English default flip — Stage 5.
- Changes to E-- itself. If integration surfaces an E-- bug, capture in `forge-moda-bootstrap/e-minus-minus-feedback.md` per the protocol's cross-project handoff shape. Do NOT edit `~/projects/e--/` files.
- Constitution clause additions/changes. B5/B6/B7 stay as-is; the `facet_form: canonical` opt-in fits within the Mission preamble's existing language without B-series changes.
- `/generate` server changes. Free-English path untouched.

## Don'ts

- **Don't ship without Phase 1 investigation.** Pyodide compatibility is the load-bearing risk; static-read E-- source first.
- **Don't make `facet_form: canonical` the default.** Stage 2 is opt-in only.
- **Don't add `{{ slot }}` resolution wiring if it's more than ~20 lines.** Defer to a follow-up drain; document in §2.
- **Don't edit E-- source.** Bug reports go via the handoff file; E-- cowork fixes; sync script re-pulls.
- **Don't bump versions concretely** — use `{CURRENT} → {NEXT_PATCH}` placeholder.
- **Don't skip the forge-moda forge.toml bump** per the new cc-prompt-queue rule.
- **Don't batch feedback at end of multi-phase drain.**

## Report when done

Standard §0–§3 with two-phase structure:

- **§0** — manifest before/after for plugin, forge.toml before/after for forge-moda, commit SHAs (Phase 1 + Phase 2 in each affected repo), push, tag, release URL, SHA round-trip, line counts. Include the E-- vendor pin VERSION file contents.
- **§1.1** — TDD test cases (7-8 above + any CC extras).
- **§1.2** — Phase 1 investigation findings: E-- version + SHA pinned; entry-point function signature; Pyodide compatibility verdict; engine-bundle pipeline integration approach.
- **§1.3** — Phase 2 fix: cited line-number diffs in `executor.py` and `snippet_registry.py`.
- **§1.4** — Post-fix verbatim test output. Include the experimental snippet's compute output (the deterministic Python from `Do [[print]]("Canonical form works.").`).
- **§1.5** — Full `pytest -q` (forge) + `npm test` (forge-client-obsidian).
- **§2** — Surprises during integration. Specifically: whether `{{ slot }}` wiring was in or out (and why). Whether the Pyodide bundle size grew meaningfully (E-- is ~1500 LOC of pure Python — should add <100KB). Any quirk in calling E-- from inside the engine's existing Python flow.
- **§3** — User-side smoke per cc-prompt-queue.md 6a/6b. Paste-able commands for file-existence + version-pin verification. UI prose for the actual Forge-click test of the experimental snippet.

---

## §6 — RESOLVED-QUESTIONS ADDENDUM (added 2026-06-05 post-Phase-1-abort)

CC's Phase 1 investigation surfaced an architectural ambiguity the original prompt missed: the engine does NOT call `/generate`; the **plugin** does. Without a plugin-side gate on `facet_form: canonical`, the engine-side `facet_form: canonical` handling never fires end-to-end because the plugin's `/generate` call writes LLM-generated Python BEFORE the engine sees the snippet.

### §6.1 — Architecture choice: Option (A) — plugin gates `/generate` + engine does in-memory E-- transpile

The plugin's Forge-click handler (`main.ts:1385-1405`) currently:

```typescript
// pseudocode of current flow
if (getEditMode(fm) === 'python') {
  await this.runSnippet(...);
  return;
}
const ok = await this.generate(...);
if (!ok) return;
await this.runSnippet(...);
```

The Phase 2 amendment adds a `facet_form: canonical` branch BEFORE the `/generate` call:

```typescript
// new pseudocode
if (getEditMode(fm) === 'python') {
  await this.runSnippet(...);
  return;
}
if (getFacetForm(fm) === 'canonical') {
  // E-- compile happens inside the engine at runtime; skip /generate entirely
  await this.runSnippet(...);
  return;
}
const ok = await this.generate(...);
if (!ok) return;
await this.runSnippet(...);
```

The engine-side change (in `executor.py`) handles the missing-Python-facet case for `facet_form: canonical` snippets by calling `forge.e_minus_minus.transpile(english_body)` to produce Python at runtime, then executing the result in-memory. The Python facet is NOT written back to the `.md` file — the English (canonical E--) facet is the source of truth.

### §6.2 — Plugin-side files to add to Phase 2 "Files to modify"

In addition to the engine-side files already listed in the original §"Files likely to touch":

- `~/projects/forge-client-obsidian/src/main.ts` — add the `facet_form: canonical` branch in the Forge-click handler (the pseudo-code above). ~10-15 lines.
- `~/projects/forge-client-obsidian/src/facet-form-core.ts` — NEW pure-core helper. Function `getFacetForm(frontmatter): 'canonical' | 'free' | undefined`. Tests in sibling `.test.ts`. Pure-core extraction No. 18.
- `~/projects/forge-client-obsidian/src/facet-form-core.test.ts` — NEW. Standard TDD shape: 4-5 cases (absent → undefined, `facet_form: canonical` → `'canonical'`, `facet_form: free` → `'free'`, malformed → undefined, idempotent).

### §6.3 — TDD test cases extended

Add to the engine-side test cases:

8. (Plugin-side, via mock or scratch test): `getFacetForm({facet_form: 'canonical'})` → `'canonical'`.
9. (Plugin-side): `getFacetForm({})` → `undefined`.
10. (Plugin-side): `getFacetForm({facet_form: 'unknown'})` → `undefined` (defensive — unknown values fall through to the `/generate` path).
11. (Integration test, if possible): a snippet with `facet_form: canonical` Forge-clicks through the FULL plugin → engine path; Python facet is NOT written to the `.md` file post-execution; output rendered.

### §6.4 — E-- version pin: latest (head of `~/projects/e--/` at drain time)

Pin to whatever HEAD shows when CC starts the re-drain. Re-verify the version string from `~/projects/e--/docs/spec.md` H1 and the git SHA from `~/projects/e--/.git/`. Update the VERSION file accordingly (e.g., 0.1.7 + the corresponding SHA). No reason to chase older versions.

### §6.5 — Ship-both-or-Phase-1-only: ship both in v0.2.55+

Phase 1 alone delivers no user-visible value (E-- bundled but unused). Phase 2 with the corrected plugin gate is small enough to ship in the same drain. Ship both in one release.

### §6.6 — Out-of-scope follow-up flagged for tracking

CC's §5 noted a `forge-music.bak.0.3.0/` scanning gate issue (chip auto-discovery scans stale backup dirs). NOT load-bearing for Stage-1+Stage-2; will be addressed in a follow-up chip-palette polish drain. Don't fix in this drain.

### §6.7 — Welcome.md interaction note

The queued `2026-06-05-1145-welcome-md-canonical-entry-point-at-vault-root.md` prompt uses **free English** for welcome.md (NOT `facet_form: canonical`). So welcome.md does NOT depend on Stage-1+Stage-2 shipping. Both prompts can ship independently.

### §6.8 — Next drain steps

1. Move this prompt from `prompts/questions/` back to top-level `prompts/` to re-fire.
2. CC re-drains. Phase 1 work (investigation + vendoring + sync script + drift detection) is already done in CC's head per the prior abort's §1 — should be fast to reproduce + commit.
3. Phase 2 work picks up Option (A) per §6.1, adds the plugin-side files per §6.2, extends the test cases per §6.3.
4. Ships as one release with both phases.
