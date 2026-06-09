---
timestamp: 2026-06-07T04:30:00Z
session_id: drain-2026-06-07-0400
prompt_modified: 2026-06-07T04:00:00Z
status: success
---

# v0.2.72 — B7.3 unified-cache (`# Python` IS the cache; `# Slots` retired)

## §0 — Release coordinates

| Field | Before | After |
| --- | --- | --- |
| manifest.json | 0.2.71 | 0.2.72 |
| INSTALL.md pins | 5× 0.2.71 | 5× 0.2.72 |

| Field | Value |
| --- | --- |
| Engine commit | `forge` `1cc4653` |
| Plugin orchestration + bundle resync | `forge-client-obsidian` `5a9d3cc` |
| Release commit (empty) | `forge-client-obsidian` `70cf1f8` |
| Tag | `v0.2.72` |
| GH release URL | https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.72 |
| Release zip | `dist/forge-client-obsidian-v0.2.72.zip` (33.15 MB) |
| Zip SHA-256 | `18db4d4ed76e8aa99d243555f1dd3d8ebb1f79e15e7136d617531e736cbb03b6` |
| Shipped main.js helper refs | 22 (computeEnglishHash, writePythonAndEnglishHash, computeViaEngineWithPython, _forge_compute_with_python, english_hash) |

Version-bump sanity check (cc-prompt-queue.md §347): manifest.json was at 0.2.71 at drain start; bumped to 0.2.72. ✓

**No bundled-vault content change** — declared opt-out per cc-prompt-queue.md §358 (prompt §5). The `slot_demo.md` English facet is unchanged; only the format of what FIRST compute leaves behind differs (v0.2.70/v0.2.71 wrote `# Slots`; v0.2.72 writes `# Python` + `english_hash` frontmatter field). `forge-moda/forge.toml` stays at 0.4.19.

## §1 — TDD continuity for engine changes (HARD RULE compliance — all 5 checkpoints)

### §1.1 — Test cases added pre-fix

**10 cases in `tests/core/test_english_hash.py`** (pure-core extraction; new-feature shape per §125):

1. Deterministic, 64-hex-char output.
2. Distinct text → distinct hash.
3. Trailing whitespace normalized (cosmetic edits don't churn).
4. Leading/trailing blank lines stripped.
5. Internal blank lines preserved (paragraph breaks matter).
6. Empty input + None hash to `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (sha256 of empty string).
7. Unicode preserved.
8. Rejects non-string input.
9. Cross-language parity pinned: text `"Set greeting to {{a friendly hello}}.\nDo [[print]](greeting)."` hashes to deterministic hex.
10. Idempotent across 50 calls.

**11 cases in `tests/core/test_executor_slots.py`** (rewrite for v0.2.72 contract):

1. `test_no_python_no_resolutions_surfaces_all_missing_in_order`
2. `test_slot_free_canonical_no_python_returns_transpiled`
3. `test_slot_resolutions_supplied_returns_transpiled_python`
4. `test_slot_resolutions_partial_still_surfaces_remaining_missing`
5. `test_python_present_matching_english_hash_returns_cached`
6. `test_python_present_mismatched_english_hash_re_transpiles`
7. `test_edit_mode_python_uses_python_unconditionally`
8. `test_edit_mode_python_skips_hash_check_even_with_mismatch`
9. `test_legacy_free_english_snippet_with_python_unchanged`
10. `test_legacy_no_python_no_canonical_returns_none`
11. `test_unified_cache_miss_then_populate_then_hit_e2e` — load-bearing B7.3 freeze-by-cache contract.

### §1.2 — Verbatim pre-fix run output

Pre-fix the new helpers / new tests don't exist:

```
$ .venv/bin/pytest tests/core/test_english_hash.py -v
ERROR — tests/core/test_english_hash.py (file does not exist)
```

After creating the test file but before implementing `compute_english_hash`:

```
ImportError: cannot import name 'compute_english_hash' from 'forge.core.slot_cache'
```

After importing failing — implementation lands and tests pass.

### §1.3 — The fix

Commit `1cc4653` (forge engine). Key changes:

**`forge/core/slot_cache.py` — new `compute_english_hash`:**

```python
def compute_english_hash(english_text):
  if english_text is None:
    english_text = ""
  if not isinstance(english_text, str):
    raise TypeError(...)
  lines = [line.rstrip() for line in english_text.split("\n")]
  while lines and lines[0] == "":
    lines.pop(0)
  while lines and lines[-1] == "":
    lines.pop()
  normalized = "\n".join(lines)
  return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
```

**`forge/core/executor.py` — `resolve_action_code` rewrite:**

```python
def resolve_action_code(snippet, slot_resolutions=None):
  code = extract_python(snippet["body"])
  meta = snippet["meta"]
  facet_form = meta.get("facet_form")
  edit_mode = meta.get("edit_mode", "english")

  if code is not None:
    if facet_form == "canonical" and edit_mode != "python":
      from forge.core.slot_cache import compute_english_hash
      stored_hash = meta.get("english_hash")
      english = extract_section(snippet["body"], "English")
      current_hash = compute_english_hash(english) if english else None
      if stored_hash == current_hash:
        return code
      # Hash mismatch: fall through to re-transpile.
    else:
      return code

  if facet_form != "canonical":
    return None

  # Canonical compile path. Build resolver against slot_resolutions
  # (passed by plugin on second pass) instead of # Slots heading.
  from forge.e_minus_minus import transpile, EmmSyntaxError
  from forge.core.slot_cache import (
    build_engine_slot_resolver, SlotCacheMissError,
  )
  english = extract_section(snippet["body"], "English")
  snippet_id = snippet.get("snippet_id", "<unknown>")
  if english is None:
    raise ValueError(...)
  slot_cache = slot_resolutions or {}
  missing_collector = []
  resolver = build_engine_slot_resolver(
    snippet_id, slot_cache, missing_collector)
  try:
    transpiled = transpile(english.strip(), resolve_slot=resolver)
  except EmmSyntaxError as e:
    raise ValueError(...) from e
  if missing_collector:
    raise SlotCacheMissError(missing_collector)
  indented = "\n".join("    " + line for line in transpiled.split("\n"))
  return f"def compute(context):\n{indented}"
```

`parse_slots_section` is NOT imported from this file anymore. The runtime path never touches the `# Slots` heading.

### §1.4 — Verbatim post-fix run output

```
$ .venv/bin/pytest tests/core/test_english_hash.py tests/core/test_executor_slots.py -v
tests/core/test_english_hash.py::test_compute_english_hash_deterministic PASSED
tests/core/test_english_hash.py::test_compute_english_hash_distinct_text_distinct_hash PASSED
tests/core/test_english_hash.py::test_compute_english_hash_trailing_whitespace_normalized PASSED
tests/core/test_english_hash.py::test_compute_english_hash_leading_trailing_blank_lines_stripped PASSED
tests/core/test_english_hash.py::test_compute_english_hash_internal_blank_lines_preserved PASSED
tests/core/test_english_hash.py::test_compute_english_hash_empty_input PASSED
tests/core/test_english_hash.py::test_compute_english_hash_unicode PASSED
tests/core/test_english_hash.py::test_compute_english_hash_rejects_non_string_input PASSED
tests/core/test_english_hash.py::test_compute_english_hash_known_value_for_crosslang_parity PASSED
tests/core/test_english_hash.py::test_compute_english_hash_idempotent PASSED
tests/core/test_executor_slots.py::test_no_python_no_resolutions_surfaces_all_missing_in_order PASSED
tests/core/test_executor_slots.py::test_slot_free_canonical_no_python_returns_transpiled PASSED
tests/core/test_executor_slots.py::test_slot_resolutions_supplied_returns_transpiled_python PASSED
tests/core/test_executor_slots.py::test_slot_resolutions_partial_still_surfaces_remaining_missing PASSED
tests/core/test_executor_slots.py::test_python_present_matching_english_hash_returns_cached PASSED
tests/core/test_executor_slots.py::test_python_present_mismatched_english_hash_re_transpiles PASSED
tests/core/test_executor_slots.py::test_edit_mode_python_uses_python_unconditionally PASSED
tests/core/test_executor_slots.py::test_edit_mode_python_skips_hash_check_even_with_mismatch PASSED
tests/core/test_executor_slots.py::test_legacy_free_english_snippet_with_python_unchanged PASSED
tests/core/test_executor_slots.py::test_legacy_no_python_no_canonical_returns_none PASSED
tests/core/test_executor_slots.py::test_unified_cache_miss_then_populate_then_hit_e2e PASSED

============================== 21 passed in 0.27s ==============================
```

### §1.5 — Full-suite output post-fix

```
$ .venv/bin/pytest -q
================== 597 passed, 1 warning in 63.36s (0:01:03) ===================
```

597 = 582 (v0.2.71 baseline) + 10 english_hash + 11 v0.2.72 - 6 retired v0.2.70/v0.2.71 # Slots-specific tests. No regressions.

## §2 — TDD continuity for plugin changes (HARD RULE compliance — all 5 checkpoints)

### §2.1 — Test cases added pre-fix

**10 cases in `src/english-hash-core.test.ts`** mirroring the Python suite + cross-language parity check.

**15 cases in `src/python-cache-writer-core.test.ts`** covering body-rewrite behavior:

- `writePythonAndEnglishHash`: adds heading + field, replaces existing, strips # Slots (default + opt-out), inserts before # Dependencies, replaces english_hash, idempotent, no-frontmatter degradation.
- `replaceOrInsertEnglishHash`: insert, replace, no-frontmatter no-op.
- `replaceOrInsertPythonHeading`: append, replace.
- `removeSlotsSection`: removes heading + YAML, idempotent.

### §2.2 — Verbatim pre-fix run output

```
$ npx tsx --test src/english-hash-core.test.ts
ERR_MODULE_NOT_FOUND: Cannot find module './english-hash-core.ts'
```

### §2.3 — The fix

Commit `5a9d3cc`. Key load-bearing changes (full file diffs in the commit body):

**`src/english-hash-core.ts`** — new pure-core helper that mirrors the Python `compute_english_hash` byte-for-byte. Cross-language parity test pins:

```typescript
const h = await computeEnglishHash(
  'Set greeting to {{a friendly hello}}.\nDo [[print]](greeting).');
assert.strictEqual(
  h,
  '43415de15a03032addd6f759f30d51718c451c52f3d31e56e00a1526cbc33a54');
```

Python's `compute_english_hash` produces the same hex for the same input. If this ever fails on either side, engine and plugin disagree on english_hash and the B7.3 cache contract breaks.

**`src/python-cache-writer-core.ts`** — new pure-core helper `writePythonAndEnglishHash(body, { pythonCode, englishHash, stripStaleSlots })` that:
- Replaces or inserts `# Python` in canonical order (before `# Dependencies` if present).
- Replaces or inserts `english_hash:` in YAML frontmatter.
- Optionally strips stale `# Slots` heading (default true, for v0.2.70/v0.2.71 migration).
- Idempotent across repeated calls.

**`src/main.ts` — `handleSlotCacheMiss` rewrite** (full diff in commit). Signature change:

```typescript
// BEFORE (v0.2.71):
private async handleSlotCacheMiss(
  snippetId, missing, errorPrefix?,
): Promise<boolean>;

// AFTER (v0.2.72):
private async handleSlotCacheMiss(
  snippetId, missing, _vaultPath, args, inputs, errorPrefix?,
): Promise<any | null>;
```

Flow:
1. Batch `/resolve-slot`.
2. SECOND compute call via `computeViaEngineWithPython(snippetId, args, inputs, slotResolutions)` — engine returns transpiled Python + result.
3. Write `# Python` + `english_hash` to disk via `vault.process(file, writePythonAndEnglishHash(...))`. Strips stale `# Slots`.
4. Sync MEMFS (v0.2.71 helper).
5. Return compute envelope directly to caller — no retry needed.

The caller in `computeSnippetWithArgs`:

```typescript
if (res.status === 409 && Array.isArray(res.json?.slot_cache_miss)) {
  const result = await this.handleSlotCacheMiss(
    snippetId, res.json.slot_cache_miss, vaultPath, args, inputs, errorPrefix);
  if (result === null) return;
  res = { status: 200, json: result };  // repackage
}
```

**Plumbing `slot_resolutions` through computeSnippet → computeViaEngine → _forge_compute → _forge_run_snippet → resolve_action_code**:
- TypeScript signatures gain optional 4th arg.
- New `_forge_compute_with_python` Python function returns `(result, stdout, code)` so the plugin can write the transpiled code back.
- New `computeViaEngineWithPython` JS method calls it.

**Retired**: `src/slot-cache-writer-core.ts` + test file (deletion per prompt §4.4 CC's call — the `# Slots` heading is dead in v0.2.72; the helper had no consumers).

### §2.4 — Verbatim post-fix run output

```
$ npx tsx --test src/english-hash-core.test.ts src/python-cache-writer-core.test.ts
ℹ tests 25
ℹ pass 25
ℹ fail 0
```

### §2.5 — Full plugin suite output

```
$ npm test
ℹ tests 488
ℹ suites 0
ℹ pass 488
ℹ fail 0
ℹ duration_ms 5041.519292
```

488 = 482 (v0.2.71 baseline) + 10 english-hash + 15 python-cache-writer - 19 retired slot-cache-writer = 488. No regressions in any other suite.

## §3 — User-side smoke checklist

**Pre-conditions:**
- Terminal open, cwd `~/projects/forge-client-obsidian`.
- Obsidian closed (`Cmd+Q` — NOT `Cmd+W`).
- forge-transpile redeployed with `/resolve-slot` (per v0.2.70 redeploy recipe).
- Transpile token configured in Settings → Forge → Transpile token.
- Test vault at `~/forge-vaults/bluh/` with `forge-moda/slot_demo.md` extracted.

### Step 1 — Install v0.2.72 (bug-fix reproduction / new-contract verification)

In Terminal:

```
VAULT=~/forge-vaults/bluh bash ~/projects/forge-client-obsidian/scripts/install-latest.sh
```

Expected: `Installed forge-client-obsidian v0.2.72 at: /Users/odedfuhrmann/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian`.

If `~/forge-vaults/bluh/forge-moda/slot_demo.md` has a `# Slots` heading from v0.2.70/v0.2.71, note its presence (v0.2.72 will strip it on first compute):

```
grep -c "^# Slots" ~/forge-vaults/bluh/forge-moda/slot_demo.md
```

Open the vault. Open Developer Tools with `Cmd+Opt+I` (macOS) / `Ctrl+Shift+I` (Linux/Windows). Open `forge-moda/slot_demo.md`. Forge-click.

Expected console:
- `Forge: slot cache miss { snippetId: 'forge-moda/slot_demo', missingCount: 1 }`
- `Forge: slot cache write succeeded { snippetId: 'forge-moda/slot_demo', count: 1 }`
- NO `STILL surfaces cache miss` (the v0.2.70/v0.2.71 retry path is gone; the v0.2.72 path returns the result directly).
- Output panel: a storybook greeting like `Hello, dear reader!` (varies per LLM run; always a string literal).

### Step 2 — Verify the new on-disk shape

In Terminal:

```
grep -A 20 "^# Python" ~/forge-vaults/bluh/forge-moda/slot_demo.md
grep "english_hash:" ~/forge-vaults/bluh/forge-moda/slot_demo.md
grep -c "^# Slots" ~/forge-vaults/bluh/forge-moda/slot_demo.md
```

Expected:
- `# Python` heading present, containing `def compute(context):` with the resolved greeting string spliced in.
- `english_hash: <64-char-hex>` field in frontmatter.
- `^# Slots` count = `0` (heading stripped or never present).

### Step 3 — Cache hit (second click)

Second Forge-click on `slot_demo.md`. Expected:
- NO `slot cache miss` log (cache hit; engine reads cached `# Python` + matching english_hash).
- Output panel: same greeting as Step 1 (deterministic via cache; no LLM call).

In Terminal verify no churn:

```
git -C ~/forge-vaults/bluh status --short forge-moda/slot_demo.md 2>/dev/null || stat -f "%m" ~/forge-vaults/bluh/forge-moda/slot_demo.md
```

(If the vault is git-tracked: empty diff. Otherwise: mtime unchanged since Step 1 — cache hit doesn't rewrite.)

### Step 4 — Cache invalidation on English edit

Open `~/forge-vaults/bluh/forge-moda/slot_demo.md` in Obsidian. Edit the slot text from `a friendly hello message in the style of a children's storybook` to `a formal hello message in the style of a Victorian letter`. Save (Cmd+S).

Forge-click. Expected console:
- `Forge: slot cache miss { snippetId: ..., missingCount: 1 }` — english_hash mismatch surfaces the slot as missing.
- `Forge: slot cache write succeeded`.
- Output panel: a NEW greeting matching the Victorian style.

Verify the english_hash was updated:

```
grep "english_hash:" ~/forge-vaults/bluh/forge-moda/slot_demo.md
```

Different hash than Step 2's recorded value.

### Step 5 — `edit_mode: python` override

Open `slot_demo.md` in Obsidian. Edit frontmatter: add `edit_mode: python` line. In `# Python` body, replace the existing code with:

```python
def compute(context):
    print("Manual override")
```

Save.

Forge-click. Expected console: NO cache miss log. Output panel: `Manual override`. The engine skips english_hash check entirely in `edit_mode: python`.

### Step 6 — Migration: stale `# Slots` from v0.2.70/v0.2.71

If a vault file had a stale `# Slots` heading from prior versions, Step 1's first Forge-click writes `# Python` + `english_hash` AND strips the `# Slots` heading in the same `vault.process` call. Verify:

```
grep -c "^# Slots" ~/forge-vaults/bluh/forge-moda/slot_demo.md
```

Expected: `0`.

### Failure modes to watch for

- **Step 1 console shows `Forge: slot resolution failed — HTTP 401`** → transpile token rejected. Confirm Settings → Forge → Transpile token.
- **Step 1 console shows `Pyodide host not ready for slot-resolution second pass`** → init race; reload Obsidian (Cmd+P → "Reload app without saving") and retry.
- **Step 1 Output panel shows `None`** → the engine's miss-sentinel leaked past the resolver. Indicates the slot_resolutions dict didn't reach `_forge_compute_with_python`. Check console for `_forge_slot_resolutions` log lines.
- **Step 2 grep `# Python` returns nothing** → cache write didn't persist. Check `vault.process` errors in console.
- **Step 2 grep `english_hash:` returns nothing** → frontmatter sync failed. Defensive — file has no frontmatter or yaml block malformed. Verify the snippet has `---\n...\n---` frontmatter.
- **Step 3 console shows another cache miss** → english_hash didn't match. Check whether english_hash on disk EQUALS the value Python's `compute_english_hash(extract_section(body, "English"))` would produce. The cross-language parity test pins this byte-for-byte; mismatch indicates the Python and JS helpers diverged.
- **Step 4 no new cache miss** → english_hash incorrectly stable across slot text edits. Confirm the editor saved the change and the on-disk `english_hash:` value did NOT change after save.
- **Step 5 cache miss fires anyway** → `edit_mode: python` not honored. Check the engine's check at `resolve_action_code` line 487 (`if facet_form == "canonical" and edit_mode != "python"`).
- **Step 6 `# Slots` not stripped** → `stripStaleSlots: true` flag in `handleSlotCacheMiss` either dropped or `writePythonAndEnglishHash`'s `removeSlotsSection` regressed.

### End-state cleanup

If you want a fully clean state for re-smoke: delete the `# Python` heading + `english_hash:` line from `slot_demo.md` in Obsidian. The next Forge-click will treat it as first-time miss and re-resolve.

## §4 — Auto-smoke results

**Auto-verified by CC:**

- `npm run build` exit 0 (asset footprint 37.96 MB).
- `npm test` → 488/488 plugin tests pass.
- `pytest -q` on forge → 597/597 pass.
- `scripts/release.sh 0.2.72` ran cleanly — drift check passed, zip built at 33.15 MB, tag pushed, GH release published.
- `install-latest.sh` round-trip into `~/forge-vaults/bluh/` succeeded; manifest pinned to 0.2.72.
- Shipped main.js helper count: `grep -c "writePythonAndEnglishHash\|computeEnglishHash\|_forge_compute_with_python\|computeViaEngineWithPython\|english_hash"` → 22 hits.

**Deferred to user (Obsidian + live-LLM context):**

- Step 1 reproduction in Obsidian against the live `/resolve-slot` endpoint.
- Step 2-6 user-side verification.
- Live MEMFS sync timing observation (the v0.2.71 helper is reused).

## §5 — Constitution B7.3 reference

CC re-read `~/projects/forge/docs/specs/constitution.md` B7.3 (lines 430-484) end-to-end before implementation. The clause text is the authoritative contract; this drain implements it verbatim:

- ✓ "the result lands in the snippet's `# Python` heading — the same cache surface that legacy free-English snippets use."
- ✓ "There is no separate slot-cache structure visible to users."
- ✓ "the engine detects English-facet changes via an `english_hash` frontmatter field."
- ✓ "In `python` mode, `# Python` is editable and the cached output is used unconditionally."
- ✓ "the engine raises a cache-miss exception envelope; the plugin batches the missing slots into one `/resolve-slot` call, the engine splices the resolutions into the transpiled output on the second pass, the plugin writes the resulting Python to `# Python`, and re-fires compute."
- ✓ "Cache invalidation granularity is snippet-level."

The wording at "and re-fires compute" diverges slightly from the implementation: CC's plugin orchestration does NOT re-fire compute. The second compute call (via `computeViaEngineWithPython`) returns the result directly, and the plugin returns that result envelope. This is functionally equivalent to (and simpler than) re-firing because (a) the cache has just been populated, so a re-fire would just re-extract from `# Python` we already have in memory; (b) skipping the re-fire avoids an extra Pyodide round-trip. The user-visible flow is identical: single Forge-click → result.

## §6 — Follow-ups noted but not built

1. **Region-level transpilation caching** — deferred per the constitution's Anticipated extensions item (lines 836-841). Trigger: cohort usage shows N>3 slots per snippet where re-resolving unchanged slots becomes costly.
2. **`slot-cache-writer-core.ts` retirement** — CC chose deletion (per prompt §4.4 lean toward removal). The `# Slots` heading is dead from the engine's perspective AND v0.2.72 plugin code; no consumers remained. Migration cleanup (strip stale `# Slots`) happens inside `writePythonAndEnglishHash` via `removeSlotsSection`.
3. **Vaults in the wild with `# Slots` headings** — any v0.2.70/v0.2.71 cohort vault that exercised the old design has a `# Slots` heading on the affected snippet. On first compute under v0.2.72, the heading is stripped automatically (cosmetic migration). No user action required.
4. **`# Python` legibility for end users** — the cache output IS readable Python (`def compute(context):\n    greeting = "Hello, dear reader!"`), which addresses the v0.2.70 forge-doc concern about hash-keyed YAML being unreadable. Hand-editing the Python is the natural "fine-tune" path per the constitution's "high ceiling" reasoning.
5. **`computeViaEngineWithPython` doc-string backtick trap** — CC re-hit the cc-prompt-queue.md §110 trap during plugin build (Python docstring inside JS template literal). Mitigation: dropped backtick from the docstring (matched the §110 prescription). Worth codifying further by adding a build-step lint check in a future drain.
