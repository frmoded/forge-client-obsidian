---
timestamp: 2026-06-05T11:30:00Z
session_id: claude-code-drain-stage1-stage2-emm
prompt_modified: 2026-06-05T11:30:00Z
status: aborted
disposition: questions
---

# Feedback — 2026-06-05-1130 Stage 1 + Tiny Stage 2 E-- integration

**Status:** aborted → routed to `prompts/questions/`. No code changes landed; no commits made; nothing in any repo is dirty. State unchanged from drain start.

## §1 — Phase 1 investigation findings (read-only)

### §1.1 — E-- vendor target (prompt §Phase1.Tasks.1)

Verified `~/projects/e--/src/` layout:

| File | Lines |
|---|---|
| `ast_nodes.py` | 128 |
| `emitter.py` | 131 |
| `errors.py` | 25 |
| `lexer.py` | 292 |
| `normalizer.py` | 265 |
| `parser.py` | 390 |
| `resolver.py` | 127 |
| `transpiler.py` | 132 |
| **Total** | **1490** |

No `__init__.py` exists in `src/`. 8 source files + `__pycache__/` (ignored).

### §1.2 — E-- version pin (prompt §Phase1.Tasks.1)

**Discrepancy from prompt.** Prompt says "Pin to E-- version 0.1.6". Actual:

- `~/projects/e--/docs/spec.md` H1 reads `Version: 0.1.7 (draft)`.
- Most recent commit `e73cd0f` (subject: `[2026-06-04-2228-keyword-arguments] core: keyword arguments at call sites (spec §4.1)`) plus a sibling docs commit `d2b557c` (`docs(spec): v0.1.7 additive — keyword arguments at call sites`).
- HEAD SHA: `e73cd0f054aa87008d0c4987f32e3efbd9ba31b1`.

The E-- repo is past 0.1.6; the source-of-truth pin should be 0.1.7 (or specifically the 0.1.7-as-of-`e73cd0f` shape). Decision is the user's — proceed with 0.1.7-as-implemented, or pin at 0.1.6 by checking out an older E-- SHA before vendoring.

### §1.3 — E-- public API (prompt §Phase1.Tasks.2)

`transpiler.py:39-45`:

```python
def transpile(source: str, resolve_slot=None) -> str:
    """Transpile canonical E-- source to Python source text."""
    if resolve_slot is None:
        resolve_slot = _default_resolver
    tokens = tokenize(source)
    program = parse(tokens)
    return emit(program, resolve_slot)
```

`_default_resolver` raises `NotImplementedError`. Pipeline: `tokenize → parse → emit`. For slot-free canonical sources (Stage 2's only commitment), `resolve_slot=None` works and no API key required.

### §1.4 — Pyodide compatibility (prompt §Phase1.Tasks.3)

`requirements.txt` lists only `anthropic`. Top-level imports across the 8 source files:

- Stdlib only: `ast`, `argparse`, `dataclasses`, `json`, `os`, `sys`, `typing`, `__future__.annotations`.
- Internal: bare names — `from lexer import tokenize`, `from errors import EmmSyntaxError`, `from ast_nodes import ...`, etc. (NOT package-relative.)
- Anthropic client is constructed lazily inside `resolver.make_anthropic_resolver()` and `normalizer.make_normalizer()` — top-level imports of those files do NOT touch the anthropic package.

**Pyodide verdict**: source is safe to vendor and import. Anthropic is only required if `{{ }}` slot resolution fires at runtime — the prompt explicitly excludes this from Stage 2 ("Don't add `{{ slot }}` resolution wiring if it's more than ~20 lines"), so no Anthropic dep is needed for the experimental snippet path.

**One mechanical adjustment required for vendoring**: the bare-name imports (`from lexer import tokenize`) only work when `src/` is on `sys.path`. As `forge.e_minus_minus` package members, they must convert to relative (`from .lexer import tokenize`) or absolute (`from forge.e_minus_minus.lexer import tokenize`). Breaks byte-equality with the upstream source, but the prompt's "byte-equal where possible" is conditional. Documenting in §2 when the work resumes.

### §1.5 — Forge engine layout (prompt §Phase1.Tasks.4)

`~/projects/forge/forge/` layout:

```
__init__.py
api/
builtins/
config.py
core/
  __init__.py
  dependencies.py
  exceptions.py
  executor.py
  graph_resolver.py
  llm.py
  llm_prompts.py
  logic.py
  manifest.py
  registry.py
  serialization.py
  snapshots.py
  snippet_registry.py
installer/
moda/
music/
sdk/
```

`forge/e_minus_minus/` as a sibling to `core/`, `moda/`, `music/` is the natural shape. Matches the prompt's prediction.

### §1.6 — Engine-bundle pipeline integration (prompt §Phase1.Tasks.5)

`~/projects/forge-client-obsidian/scripts/sync-engine-bundle.mjs` — pure-Phase-1 follow-up. Not yet read in this investigation; the question for §2.2 below makes that read more useful when the work resumes.

## §2 — The blocking design ambiguity (Phase 2 integration point)

### §2.1 — What the prompt assumes

> `~/projects/forge/forge/core/executor.py` — modify the action snippet execution path. **Where today it calls `/generate`** for snippets without a Python facet, the new logic checks `facet_form: canonical` first. If set, call `forge.e_minus_minus.transpile(english_facet_body)` → use the returned Python string as the "Python facet" for the rest of execution. If absent or `facet_form: free`, current `/generate` path.

### §2.2 — What the code actually does (refuting the prompt's premise)

`forge/core/executor.py:161-164`:

```python
if snippet_type == "action":
  code = extract_python(snippet["body"])
  if code is None:
    raise ValueError(f"no Python heading in snippet '{snippet_id}'")
```

**The engine does NOT call `/generate`.** When the Python facet is missing, the engine raises `ValueError`. There is no LLM call here; the engine is pure Python that runs inside Pyodide and cannot make HTTP requests.

`/generate` is **plugin-side**. `~/projects/forge-client-obsidian/src/main.ts:1385-1405` shows the Forge-button handler:

```typescript
const fm = this.app.metadataCache.getFileCache(view.file)?.frontmatter;
if (getEditMode(fm) === 'python') {
  // skip /generate, run as-is
  await this.runSnippet('Forge failed during execution');
  return;
}
const ok = await this.generate('Forge failed during generation');
if (!ok) return;
await this.runSnippet('Forge failed during execution');
```

The plugin's `generate()` POSTs the snippet inventory to the hosted `/generate` service; the response Python facet gets written back to the `.md` file; THEN the engine runs the snippet (which now has a Python facet on disk).

### §2.3 — Why this matters for the design

If we follow the prompt's literal instruction and modify executor.py to transpile via E-- when `facet_form: canonical`, **the engine-side change won't fire end-to-end** because:

1. User clicks Forge on a `facet_form: canonical` snippet (no Python facet yet).
2. Plugin's `forge()` handler checks edit_mode — not 'python', so proceeds to `generate()`.
3. Plugin POSTs to hosted `/generate` → LLM generates Python → plugin writes Python back to `.md`.
4. Plugin's `runSnippet()` calls executor.py → executor sees Python facet (LLM-generated) → uses LLM Python, NOT E-- output.

The engine's E-- code path never runs because the plugin's /generate call always wins.

For the engine-side change to actually fire, **one of these has to happen**:

- **(A) Plugin gates the /generate call** on `facet_form`. When canonical, skip /generate; plugin's runSnippet calls executor; executor sees no Python facet AND `facet_form: canonical` → transpiles via E--. *Requires plugin-side code changes the prompt doesn't list.*
- **(B) Plugin calls a new `transpile-via-engine` path** when `facet_form: canonical`. Plugin invokes the engine's E-- transpile directly (without going through the hosted /generate), writes the result back, then runs. *Requires a new engine API surface + plugin-side wiring the prompt doesn't list.*
- **(C) Engine has a brand-new entry point** that bypasses the Python-facet-required gate. The plugin calls it for canonical snippets. *Same shape as (B); architecturally cleaner.*
- **(D) User edits `edit_mode: python` manually** on canonical snippets to bypass /generate. Engine still needs the E-- transpile step (because there's still no Python facet on disk). *Forces user friction; not viable for Stage 2's "opt-in works on a fresh snippet" goal.*

The prompt's deliverables list (Phase 2 §Files-likely-to-touch) names only engine-side files (`executor.py`, `snippet_registry.py`, tests, experimental snippet, version bumps). No plugin file is listed. So either:

- The prompt's intent is engine-only AND assumes a follow-up plugin drain — in which case `facet_form: canonical` ships in v0.2.55 but doesn't actually fire end-to-end until the plugin gate ships in v0.2.56+. The experimental snippet won't validate end-to-end.
- The prompt intends a plugin change too but omitted it from the deliverables list.
- There's a path I'm missing.

## §3 — Questions for the user

1. **E-- version pin** — pin to 0.1.7-as-of-`e73cd0f` (latest), or check out an older E-- SHA to match the prompt's literal "0.1.6"?

2. **Architecture choice** — which integration shape do you want?
   - **(A)** Engine change + plugin gate on /generate (small plugin change, ~10 lines in main.ts). Ships end-to-end working in v0.2.55.
   - **(B)** Engine change + plugin gates BOTH /generate AND adds a new plugin call into the engine's E-- transpile (larger plugin change, new engine surface). Cleaner separation; future Stage 4 migration easier.
   - **(C)** Engine change only; ship v0.2.55 without the experimental snippet's end-to-end firing; next drain adds the plugin gate.
   - **(D)** Use existing `edit_mode: python` semantics — canonical snippets manually marked `edit_mode: python` skip /generate; engine still needs the E-- transpile step. (Friction but no plugin change.)

3. **Phase 1 ship-now-or-defer** — Phase 1 (vendor E--, VERSION pin, sync script, drift detection) is mechanical and independent of the Phase 2 architecture choice. Ship Phase 1 as v0.2.55 now and queue Phase 2 separately once architecture is resolved? Or hold Phase 1 until Phase 2 design lands so they ship together?

4. **forge-music.bak.0.3.0/ scanning gate** (carryover from v0.2.48 §4.8 lurking-state). Not in this prompt's scope, but worth resolving alongside if the user is queuing a Stage-2 design pass — a tiny gate in main.ts:libraryDirNames skipping `.bak.` substring would silence the auto-discovery scan of stale backups.

## §4 — Standing state at drain stop

- **No commits in any repo.** Working trees unchanged from drain start.
- **No tags, no releases.** Plugin still at v0.2.54.
- **forge-moda/forge.toml** version unchanged (the new bundled-content rule isn't triggered without code changes).
- **E-- source** read-only, untouched in `~/projects/e--/`.
- **Test suite** unchanged at 292/292 pass (verified at end of v0.2.54).

When the questions above are answered and the prompt moves back to `prompts/`, the next drain picks up exactly where this one stopped (with §1's investigation findings as a head-start).

## §5 — Lurking items not load-bearing for the questions

- The two-prompt sequence on the queue (this one + `2026-06-05-1145-welcome-md-canonical-entry-point-at-vault-root.md`) — the second prompt may depend on this one's `facet_form: canonical` integration (welcome.md is a canonical-form example per the prompt's description). I have NOT read the second prompt past the first 40 lines, but if welcome.md is canonical-form, it transitively blocks on the questions above. Worth noting before queuing more drains that assume Stage 2 has landed.

---

**Audit-trail close:** prompt moves to `prompts/questions/`. Drain stops per protocol rule "Stop the drain immediately if a prompt lands in failed/ or questions/." No code changes shipped; nothing dirty in any repo.


---

# RETRY (2026-06-05 post-§6-resolution): v0.2.55 ships both Phases

---

timestamp: 2026-06-05T12:00:00Z
session_id: claude-code-drain-stage1-stage2-emm-retry
prompt_modified: 2026-06-05T11:30:00Z (after §6 ADDENDUM)
status: success

---

User resolved all §3 questions via the §6 RESOLVED-QUESTIONS ADDENDUM and moved the prompt back to `prompts/`. This retry executes Option (A) per §6.1 and ships both phases in v0.2.55.

## §0 — Release coordinates

**Manifest:** `forge-client-obsidian/manifest.json` 0.2.54 → 0.2.55 (pre-bumped; release.sh SKIP_BUMP path handled it — **fifth clean release** through v0.2.51's release.sh fix).

**Commits (commit-directly-to-main per memory rule):**

| Repo | SHA | Subject |
|---|---|---|
| forge | `dad1d6d` | `[…stage-1-and-tiny-stage-2-e-minus-minus-integration] Stage 1 + tiny Stage 2 — vendor E--, opt-in facet_form: canonical` |
| forge-moda | `a6ca5ca` | `[…stage-1-and-tiny-stage-2-e-minus-minus-integration] Add canonical_demo.md — first forge-moda snippet in E-- canonical form` |
| forge-client-obsidian | `401fb6c` | `v0.2.55 — Stage 1 + tiny Stage 2 E-- integration: opt-in facet_form: canonical` (work commit) |
| forge-client-obsidian | `06c34ee` | `Release v0.2.55` (empty release commit; tag points here) |

**forge-moda/forge.toml:** 0.4.16 → 0.4.17 (bundled-vault-content rule).
**E-- vendor pin:** 0.1.7 (HEAD `e73cd0f054aa87008d0c4987f32e3efbd9ba31b1`).

**Tag + release:**
- Tag `v0.2.55` pushed to `origin/main`.
- GH release: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.55>
- Release assets: main.js, manifest.json, styles.css, `forge-client-obsidian-v0.2.55.zip` (34 MB).
- Zip SHA-256: `d926cdc1cfbf3ed9bc4b1f03ad51131f441c6c29de4cfbc133b51ceb29ad8ffc`
- install-latest.sh round-trip into smoke vault: clean.

**VERSION file contents** (`forge/forge/e_minus_minus/VERSION`):
```
e-- version: 0.1.7
e-- git SHA: e73cd0f054aa87008d0c4987f32e3efbd9ba31b1
synced: 2026-06-05
notes: sync via scripts/sync-emm.mjs
```

**Line counts of changed files:**

| File | Lines | Note |
|---|---|---|
| `forge/forge/e_minus_minus/__init__.py` | 33 | NEW. Exposes `transpile` + 3 Emm* exceptions. |
| `forge/forge/e_minus_minus/{8 source files}` | 1490 | NEW (mirrored). Bare→relative import rewrite ONLY change vs upstream. |
| `forge/forge/e_minus_minus/VERSION` | 4 | NEW. Pin metadata. |
| `forge/forge/core/executor.py` | +49 | `resolve_action_code` helper + ForgeContext.compute swap. |
| `forge/scripts/sync-emm.mjs` | 152 | NEW. Idempotent upstream→vendor sync with bare-name import rewrite. |
| `forge/tests/core/test_e_minus_minus_integration.py` | 187 | NEW. 9 TDD cases. |
| `forge-client-obsidian/src/facet-form-core.ts` | 49 | NEW. Pure-core extraction #20. |
| `forge-client-obsidian/src/facet-form-core.test.ts` | 73 | NEW. 9 TDD cases. |
| `forge-client-obsidian/src/main.ts` | +13 | forge() handler `getFacetForm` gate. |
| `forge-client-obsidian/src/pyodide-host.ts` | +7 -1 | `_forge_run_snippet` uses `resolve_action_code`. |
| `forge-client-obsidian/assets/engine/forge/e_minus_minus/{9 files}` | bundle | mirrored from `forge/forge/e_minus_minus/`. |
| `forge-client-obsidian/assets/vaults/forge-moda/canonical_demo.md` | 14 | bundle mirror of forge-moda snippet. |
| `forge-moda/canonical_demo.md` | 14 | NEW. Stage 2 experimental snippet. |
| `forge-moda/forge.toml` | (v 0.4.16 → 0.4.17) | bundled-vault-content rule. |

## §1.1 — TDD test cases (9 engine + 9 plugin)

**Engine-side** (`forge/tests/core/test_e_minus_minus_integration.py`):
1. Python facet present → returns verbatim.
2. `facet_form: canonical` + valid English → transpile + wrap in `def compute(context):`.
3. `facet_form: canonical` + missing `# English` → ValueError with snippet_id.
4. `facet_form: canonical` + invalid E-- syntax → ValueError with EmmSyntaxError chained via `from`.
5. `facet_form: free` (no Python facet) → returns None (legacy path).
6. No facet_form key → returns None (legacy path).
7. Idempotent rider: same body twice → same output.
8. End-to-end via `exec_python`: canonical snippet → captured stdout contains expected output.
9. Vendored package importable + `transpile()` callable end-to-end.

**Plugin-side** (`forge-client-obsidian/src/facet-form-core.test.ts`):
1. undefined frontmatter → undefined.
2. null frontmatter → undefined.
3. empty object → undefined.
4. `facet_form: 'canonical'` → 'canonical'.
5. `facet_form: 'free'` → 'free'.
6. Unknown value (string typo / uppercase / number / boolean) → undefined (defensive default to /generate path).
7. Non-object input → undefined.
8. Idempotent.
9. Other frontmatter fields ignored (only facet_form drives routing).

## §1.2 — Phase 1 investigation findings (carried from the abort run)

Per §1 of the original feedback above. Updated pin: 0.1.7 (HEAD `e73cd0f`) per §6.4. **No surprises from the prior investigation; everything proceeded as the abort run had mapped out.**

## §1.3 — Phase 2 fix (cited line-number diffs)

### Engine: `forge/forge/core/executor.py`

Added `resolve_action_code(snippet)` (new function ~37 lines):

```python
def resolve_action_code(snippet):
  code = extract_python(snippet["body"])
  if code is not None:
    return code
  facet_form = snippet["meta"].get("facet_form")
  if facet_form != "canonical":
    return None
  from forge.e_minus_minus import transpile, EmmSyntaxError
  english = extract_section(snippet["body"], "English")
  snippet_id = snippet.get("snippet_id", "<unknown>")
  if english is None:
    raise ValueError(
      f"facet_form: canonical snippet '{snippet_id}' has no English heading")
  try:
    transpiled = transpile(english.strip())
  except EmmSyntaxError as e:
    raise ValueError(
      f"E-- syntax error in canonical snippet '{snippet_id}': {e}") from e
  indented = "\n".join("    " + line for line in transpiled.split("\n"))
  return f"def compute(context):\n{indented}"
```

`ForgeContext.compute` line 161-164 swap:

```diff
 if snippet_type == "action":
-  code = extract_python(snippet["body"])
+  code = resolve_action_code(snippet)
   if code is None:
     raise ValueError(f"no Python heading in snippet '{snippet_id}'")
```

### Plugin: `forge-client-obsidian/src/main.ts:1402-1411`

```diff
   if (getEditMode(fm) === 'python') {
     // ... existing logic ...
     await this.runSnippet('Forge failed during execution');
     return;
   }
+  if (getFacetForm(fm) === 'canonical') {
+    console.log(`Forge: skipping /generate, ${view.file.basename} is in canonical E-- mode`);
+    await this.runSnippet('Forge failed during execution');
+    return;
+  }
   const ok = await this.generate('Forge failed during generation');
```

### Plugin: `forge-client-obsidian/src/pyodide-host.ts` (inline Python block, `_forge_run_snippet`)

```diff
-from forge.core.executor import extract_python, exec_python, extract_section
+from forge.core.executor import extract_python, exec_python, extract_section, resolve_action_code

 ...

 if snippet_type == "action":
-    code = extract_python(snip["body"])
+    # v0.2.55: resolve_action_code returns either the cached Python
+    # facet OR transpiles via E-- for facet_form: canonical snippets.
+    code = resolve_action_code(snip)
```

## §1.4 — Post-fix verbatim test output

**Engine** (`forge/.venv/bin/pytest tests/core/test_e_minus_minus_integration.py -v`):

```
tests/core/test_e_minus_minus_integration.py::test_python_facet_present_returns_verbatim PASSED [ 11%]
tests/core/test_e_minus_minus_integration.py::test_canonical_facet_form_transpiles_via_emm PASSED [ 22%]
tests/core/test_e_minus_minus_integration.py::test_canonical_facet_form_missing_english_raises PASSED [ 33%]
tests/core/test_e_minus_minus_integration.py::test_canonical_facet_form_invalid_emm_raises_value_error PASSED [ 44%]
tests/core/test_e_minus_minus_integration.py::test_facet_form_free_returns_none_legacy_behavior PASSED [ 55%]
tests/core/test_e_minus_minus_integration.py::test_no_facet_form_key_returns_none_legacy_behavior PASSED [ 66%]
tests/core/test_e_minus_minus_integration.py::test_canonical_facet_form_idempotent PASSED [ 77%]
tests/core/test_e_minus_minus_integration.py::test_forge_context_compute_executes_canonical_snippet PASSED [ 88%]
tests/core/test_e_minus_minus_integration.py::test_emm_module_importable_from_forge_e_minus_minus PASSED [100%]
========================= 9 passed, 1 warning in 0.23s =========================
```

End-to-end exec output (test 8): captured stdout contains `"e2e canonical"` — confirms the `def compute(context): print("e2e canonical")` wrapping + execution.

**Experimental snippet deterministic compile**:

```
$ python3 -c "from forge.e_minus_minus import transpile; print(transpile('Do [[print]](\"Canonical form works.\").'))"
print("Canonical form works.")
```

After resolve_action_code wrapping the output for exec is:
```python
def compute(context):
    print("Canonical form works.")
```

**Plugin** (extract):

```
✔ getFacetForm: idempotent (same input → same output) (0.036625ms)
✔ getFacetForm: other frontmatter fields are ignored (0.402416ms)
ℹ tests 301
ℹ pass 301
ℹ fail 0
```

## §1.5 — Full suites

```
forge:                 522 passed, 1 warning in 52.12s
forge-client-obsidian: 301 passed (was 292; +9 from facet-form-core)
```

## §2 — Surprises

**`{{ slot }}` resolution wiring**: OUT of this drain per prompt §Don'ts. The canonical_demo.md doesn't use slots; the default `_default_resolver` raises NotImplementedError only when a slot fires at transpile time. For Stage 2's scope, no need to wire Anthropic.

**E-- bundle size growth**: ~50KB on disk (1490 lines / 8 files of pure Python). Below the 100KB target. Pyodide bundle's `total: 37.87 MB` is dominated by `pyodide` (14.63 MB) + `wheels` (22.76 MB); the e_minus_minus/ subdirectory is rounding error.

**`def compute(context):` wrapping added late in the drain.** E-- emits bare statements; the engine's `_find_entrypoint` contract (B-series, executor.py:519-526) requires a `def compute` function. Without wrapping, canonical snippets would resolve to bare code that exec_python rejects. Added `indented + "def compute(context):\n<indented>"` shape in resolve_action_code. Updated test #2 to assert the wrapped form; test #8 (end-to-end exec) caught the issue immediately when initially written without the wrapping. **The Stage-3+ roadmap may move this wrapping into E--'s emitter** — for v0.2.55 it lives at the resolve_action_code call boundary in the engine.

**Bundle re-sync gotcha hit twice.** Test boot-up against the v0.2.55-engine-with-`resolve_action_code` initially failed with `ImportError: cannot import name 'resolve_action_code' from 'forge.core.executor'` because the bundle had the v0.2.54 executor.py. Re-ran `npm run sync-engine-bundle` → tests pass. Hit the same gotcha after the wrapping-fix edit; the workflow is `edit forge/core/executor.py → sync-engine-bundle → test`. Considered automating the sync as a pretest hook but doesn't fit this drain's scope.

**Bare-name imports in upstream E--.** Upstream uses `from lexer import tokenize` etc., relying on src/ being sys.path[0] at runtime. As a vendored package (`forge.e_minus_minus`), Python's import system requires package-relative form (`from .lexer import ...`). The sync-emm.mjs script applies this transformation on every sync — idempotent, mechanical, regex-based. The ONLY deviation from byte-equal mirror.

**E-- spec H1 says "Version: 0.1.7 (draft)".** Per §6.4 instruction, pinned to whatever HEAD reports — 0.1.7 with SHA `e73cd0f`. The "(draft)" qualifier is upstream's own status note; not our concern.

**`forge-client-obsidian/scripts/sync-engine-bundle.mjs` and `build-release-zip.mjs` needed NO modifications.** The existing `isInScope` predicate (engine-bundle-drift-core.ts:51) only excludes specific top-level dirs (`api`, `installer`, `sdk`, `builtins`, `__pycache__`, `tests`). `e_minus_minus/` is not in the exclusion set, so it's automatically picked up. Saved a couple hundred lines of bundle-script edits.

**Fifth clean release.sh run.** v0.2.51's release.sh fix continues to pay off. Pre-bumped manifest, SKIP_BUMP path, zip upload, install round-trip — zero CC manual orchestration steps.

## §3 — User-side smoke checklist

Per protocol 6a (paste-able commands) + 6b (CC validates before writing).

### Pre-conditions

- v0.2.55 plugin installed at `~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/` (verified via install-latest.sh round-trip during this drain).
- Smoke vault has forge-moda extracted (existing from prior drains).

### Test A — VERSION pin file shipped + correct (30 sec)

```
cat ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/assets/engine/forge/e_minus_minus/__init__.py | head -5
```

Expected output: a docstring starting with `"""E-- vendored into Forge`.

```
ls ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/assets/engine/forge/e_minus_minus/
```

Expected: 8 .py files + `__init__.py`. (The VERSION file lives only at `~/projects/forge/forge/e_minus_minus/VERSION`; bundle ships only `.py` files per the existing isInScope filter.)

```
grep version ~/projects/forge/forge/e_minus_minus/VERSION
```

Expected:

```
e-- version: 0.1.7
```

Pass: vendored E-- + VERSION pin both present.

### Test B — canonical_demo.md extracted to vault on reload (1 min)

1. Open Obsidian on `~/forge-vaults/smoke-v0.2.13`.
2. Cmd+P → "Reload app without saving" (picks up v0.2.55; triggers auto re-extract via v0.2.38 drift detection on forge-moda's 0.4.16 → 0.4.17 bump).
3. Open Developer Tools with `Cmd+Opt+I`. In Console tab look for: `Forge: forge-moda drift detected (extracted 0.4.16 → bundled 0.4.17); backing up + re-extracting`.

In Terminal:

```
ls ~/forge-vaults/smoke-v0.2.13/forge-moda/canonical_demo.md
```

Expected output (no error):

```
~/forge-vaults/smoke-v0.2.13/forge-moda/canonical_demo.md
```

Pass: drift log + canonical_demo.md visible. (If the drift log doesn't fire, the auto re-extract didn't engage — re-check forge-moda's `forge.toml` version in both bundle and extracted locations:)

```
grep version ~/forge-vaults/smoke-v0.2.13/forge-moda/forge.toml
grep version ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/assets/vaults/forge-moda/forge.toml
```

Both should show `version = "0.4.17"`.

### Test C — Forge-click canonical_demo.md → prints to output (2 min)

1. In Obsidian, open `forge-moda/canonical_demo.md` from the file tree.
2. Click the **Forge** button at the top of the editor (or Cmd+P → "Forge: Forge active snippet").
3. Open Developer Tools console.
4. **Expected console log**: `Forge: skipping /generate, canonical_demo.md is in canonical E-- mode`
5. **Expected Forge Output panel**: a single entry showing stdout `Canonical form works.` and no LLM-generated Python (the .md file's `# English` section stays as the source of truth; no `# Python` heading gets written).

In Terminal (verifies no Python facet was written by /generate):

```
grep -c "^# Python" ~/forge-vaults/smoke-v0.2.13/forge-moda/canonical_demo.md
```

Expected: `0` (no Python heading written back).

Pass: stdout shows "Canonical form works." + console log confirms /generate skipped + .md still has no Python facet.

### Test D — free-English snippets unaffected (1 min)

Regression check: existing free-English snippets continue through /generate.

1. Open `forge-moda/create_water_particles.md` (existing free-English snippet).
2. Forge-click it.
3. **Expected**: existing behavior — /generate fires, Python facet written back to `.md` (or already present from a prior click), snippet executes.
4. **Expected console**: NO "skipping /generate, ... in canonical E-- mode" line for this snippet.

```
grep facet_form ~/forge-vaults/smoke-v0.2.13/forge-moda/create_water_particles.md
```

Expected: no match (free-English snippets don't declare facet_form).

Pass: existing free-English path works unchanged.

### Test E — invalid canonical syntax produces a clear error (1 min)

Edit `~/forge-vaults/smoke-v0.2.13/forge-moda/canonical_demo.md`. Change the body to:

```
# English

Do [[print]]("no terminator")
```

(Removed the trailing period.)

Save. Forge-click. Open Console.

**Expected**: a Notice on the Forge button click reading `Forge failed during execution: ...` and a detailed log in the console mentioning `E-- syntax error in canonical snippet 'canonical_demo': ...`. The error does NOT fall through to the /generate path (it should NOT call out to the LLM service).

Revert the edit (re-add the period or restore from git):

```
git checkout -- ~/forge-vaults/smoke-v0.2.13/forge-moda/canonical_demo.md 2>/dev/null
```

(or manually re-add the period).

Pass: clear error message, no LLM fall-through.

### Failure modes to watch for

- **Test B**: drift log missing → `forge-moda/forge.toml` versions don't actually differ. Check both files per the paste-able command above.
- **Test C**: stdout missing → `resolve_action_code` either didn't import or didn't wrap. Check console for ImportError mentioning `resolve_action_code` (means bundle is stale on this install — re-run install-latest.sh).
- **Test C**: a `# Python` block APPEARS in canonical_demo.md after the Forge-click → the plugin's gate didn't fire (getFacetForm bug). Check console for "skipping /generate" log; if absent, the gate isn't matching.
- **Test E**: error message reads "no Python heading" instead of "E-- syntax error" → `facet_form: canonical` not in frontmatter (typo in the edited file).

### End-state cleanup

- Delete the test edit on canonical_demo.md if you haven't already.
- Optional: delete `~/forge-vaults/smoke-v0.2.13/forge-moda.bak.0.4.16/` (the backup created by the drift re-extract — kept for archeology, can be removed once Test C confirms the new version works).

## §4 — Standing followups (unchanged after this drain)

1. forge-music v2 `_chips.md` — their lane.
2. percussion-lab PREVIEW disposition (forge-music + forge uncommitted) — your call.
3. forge-music.bak.0.3.0/ scanning gate (chip auto-discovery scans stale backup dirs) — out of scope per §6.6; future chip-palette polish drain.
4. Stage 3+ E-- migration: move `def compute(context):` wrapping into E--'s emitter; add `{{ slot }}` resolver wiring; canonicalize-this-snippet command.
5. (cc) glue-to-pure-core audit candidates flagged across the v0.2.4x arc.

---

**Audit-trail close:** prompt moves to `prompts/done/`. Drain processed retry per protocol on-retry-append rule. Welcome.md prompt (the second in the queue) remains in `prompts/` for the next drain.
