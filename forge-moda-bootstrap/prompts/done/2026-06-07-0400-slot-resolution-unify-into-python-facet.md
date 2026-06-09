# v0.2.72 — Unify slot-resolution cache into `# Python` facet (drop `# Slots` heading)

**Date queued**: 2026-06-07
**Driver**: forge-core (Oded)
**Target plugin version**: bump per placeholder — `{CURRENT} → {NEXT_PATCH}` (expected `0.2.71 → 0.2.72`). Read `~/projects/forge-client-obsidian/manifest.json` first per cc-prompt-queue.md §347; pause and flag if not at 0.2.71.

## §0 — Why this prompt exists

The v0.2.70 design landed a user-facing `# Slots` heading as the slot-resolution cache. Driver-side review concluded this was the wrong layer: the slot mechanism is an internal compilation detail; surfacing it as a separate cache structure that students see violates the Mission's "low floor" property and forge-doc's chapter-9 authoring contract (forge-doc flagged the legibility concern — hash-keyed YAML rows can't be hand-edited meaningfully).

The constitutional rewrite of B7.3 (commit just landed in `~/projects/forge/docs/specs/constitution.md`) describes the new contract: **`# Python` IS the cache.** The same heading that legacy free-English snippets use via `/generate` becomes the cache surface for canonical E-- snippets with slot resolutions spliced in. There is no separate `# Slots` heading; the hash-keyed bookkeeping that links a slot text to its resolution lives transiently in memory during transpile and is never persisted as a user-facing artifact.

This drain implements that contract. Single end-to-end ship: engine wiring + plugin orchestration + back-compat handling for any v0.2.70/v0.2.71 vaults with `# Slots` still on disk + smoke + release.

## §1 — The new contract (read this first)

For canonical-form snippets (`facet_form: canonical`):

**Cache only when the cache pays for itself** (clarified per forge-doc's chapter-1-8 verification, 2026-06-07-0445 message): slot-FREE canonical snippets continue transpiling fresh on every compute and DO NOT persist `# Python` — E-- transpile is deterministic, fast, and free, so caching adds file noise without saving cost. Only slot-BEARING canonical snippets persist `# Python`. The plugin write-back path runs only when slot resolution was involved (cache miss flow); slot-free canonical computes never trigger a `# Python` write. This preserves the chapter-1-8 student experience (no `# Python` headings in their files) and makes chapter 9's `# Python` appearance pedagogically meaningful (it shows up precisely when an LLM answer needs to be remembered).

1. **`# Python` is the cache** for slot-bearing canonical snippets. When present and `english_hash` in frontmatter matches the current English-facet hash, the engine uses `# Python` directly. No transpile, no slot resolution, no LLM call. For slot-free canonical snippets, `# Python` is never written; the engine transpiles fresh on every compute.

2. **English-facet hash detects invalidation.** When `# Python` is written, the plugin also writes an `english_hash: <sha256-hex>` field to frontmatter. On subsequent compute, the engine recomputes the hash of the current English facet and compares. Hash mismatch → re-transpile + re-resolve all slots.

3. **Cache miss flow (first compute or after English edit):**
   - Engine transpiles English → raises `SlotCacheMissError(missing)` if any `{{ }}` slots can't be resolved (since there's no in-band cache to consult).
   - Plugin batches `missing` into one `POST /resolve-slot`.
   - Plugin sends the resolutions BACK to the engine for a second transpile pass via a new `slot_resolutions` parameter.
   - Engine transpiles with the resolver hitting the passed dict for every slot → returns full Python source.
   - Plugin writes the Python to the snippet's `# Python` heading AND writes `english_hash` to frontmatter in one `vault.process` call.
   - Plugin re-fires compute → engine sees `# Python` + matching `english_hash` → uses it.

4. **Override path:** user sets `edit_mode: python` → `# Python` becomes editable → engine uses whatever is in `# Python` directly, skips the english_hash check. Identical to legacy free-English snippets' `edit_mode: python` semantics — students learn one convention, not two.

5. **Migration from v0.2.70/v0.2.71 `# Slots` heading:** the engine MUST NOT parse `# Slots` (it's dead). The plugin's `# Python` write-back can OPTIONALLY strip any pre-existing `# Slots` heading from the snippet body as part of the same `vault.process` write — clean migration for any cohort vaults that already exercised the old design. This is cosmetic; leaving the `# Slots` heading in place is harmless (just ignored).

6. **Cache invalidation granularity is snippet-level** per B7.3. Editing any character of `# English` triggers full re-transpile. Region-level invalidation is a deliberate non-commitment per the new Anticipated extensions item — see constitution.

## §2 — Investigation phase (skipped — design already finalized)

Per cc-prompt-queue.md §80 (investigation-opt-out): the design is fully specified in §1 of this prompt + the constitution's B7.3 rewrite. CC executes; no upfront investigation commit needed. If CC discovers the design is wrong mid-implementation, STOP and route to `questions/`.

CC's first action: read `~/projects/forge/docs/specs/constitution.md` B7.3 (~line 430) end-to-end. This is the authoritative contract; this prompt summarizes for context.

## §3 — Engine changes

Files: `~/projects/forge/forge/core/executor.py`, `~/projects/forge/forge/core/slot_cache.py`.

### §3.1 — `resolve_action_code` rewrite

Current shape (post-v0.2.70):
```python
def resolve_action_code(snippet):
  code = extract_python(snippet["body"])
  if code is not None:
    return code  # legacy path — already-cached Python
  if facet_form != "canonical": return None
  # ... E-- transpile path with slot_cache from # Slots heading ...
```

New shape:
```python
def resolve_action_code(snippet, slot_resolutions=None):
  """When slot_resolutions is None: first pass.
     When provided: second pass with resolutions inline."""
  code = extract_python(snippet["body"])
  if code is not None:
    # # Python present → use it.
    # For canonical snippets in edit_mode=english, verify english_hash
    # matches; if not, IGNORE the cached # Python and re-transpile.
    if facet_form == "canonical" and edit_mode != "python":
      stored_hash = snippet["meta"].get("english_hash")
      english = extract_section(snippet["body"], "English")
      current_hash = compute_english_hash(english) if english else None
      if stored_hash != current_hash:
        # Hash mismatch — fall through to transpile path.
        pass
      else:
        return code
    else:
      return code
  if facet_form != "canonical":
    return None
  # E-- transpile path. Build resolver from slot_resolutions (passed
  # in on second pass) instead of from a # Slots heading.
  from forge.e_minus_minus import transpile, EmmSyntaxError
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
  # Wrap and return.
  indented = "\n".join("    " + line for line in transpiled.split("\n"))
  return f"def compute(context):\n{indented}"
```

Two API changes:
- Adds `slot_resolutions: dict[cache_key, python_expr] | None = None` parameter.
- Adds `english_hash` check before returning cached `# Python` for canonical snippets in `edit_mode: english`.

### §3.2 — New helper: `compute_english_hash`

In `~/projects/forge/forge/core/slot_cache.py` (or new file `english_hash.py` — CC's call). Pure-core, testable.

```python
def compute_english_hash(english_text: str) -> str:
  """Stable hash of an English facet for cache invalidation.
  Normalizes whitespace (trim trailing whitespace per line, strip
  leading/trailing blank lines) so cosmetic edits don't churn the
  hash. Returns hex sha256.

  Determinism is a HARD requirement — same inputs MUST produce same
  output across Python versions and platforms.
  """
```

Whitespace normalization: trim trailing whitespace per line, strip leading/trailing blank lines, preserve internal blank lines (paragraph breaks matter). Cross-language parity required — plugin computes the same hash from JS-side via a parallel helper at `src/english-hash-core.ts`. Pin via hardcoded-expectation cross-language test like v0.2.70's slot cache key test.

### §3.3 — Drop `# Slots` parsing from the execute path

`parse_slots_section` in `slot_cache.py` can stay (back-compat; tolerant null no-op for any caller that imports it). But `resolve_action_code` MUST NOT call it. The `# Slots` heading is dead from the engine's perspective.

Optional: add a deprecation comment in `parse_slots_section` noting it's no longer wired into the runtime path.

### §3.4 — TDD for engine changes

5 new test cases in `~/projects/forge/tests/core/test_executor_slots.py` (extending the existing file):

1. **`# Python` + matching english_hash → cache hit, no transpile call.** Stub transpile + assert NOT called.
2. **`# Python` + mismatched english_hash → re-transpile.** First pass returns `SlotCacheMissError`.
3. **`# Python` absent + slot_resolutions=None → first pass, surfaces missing.**
4. **`# Python` absent + slot_resolutions provided → second pass, returns Python.**
5. **`edit_mode: python` + `# Python` present → use it, skip hash check.** No english_hash needed.

Verify the legacy free-English path still works (regression check).

TDD failing-first per cc-prompt-queue.md §57: write the 5 tests, capture failing output, implement, re-run, full suite.

Engine suite baseline: 582 (post-v0.2.71). New baseline: 582 + 5 + (compute_english_hash unit tests, ~5 cases) + (any retired tests if `# Slots`-specific tests come out) = ~592 target.

## §4 — Plugin changes

Files: `~/projects/forge-client-obsidian/src/main.ts`, `~/projects/forge-client-obsidian/src/slot-cache-writer-core.ts` (or replace with new helper), `~/projects/forge-client-obsidian/src/server.ts`.

### §4.1 — `handleSlotCacheMiss` rewrite

Current shape (post-v0.2.71): receives missing slots → calls `/resolve-slot` → writes `# Slots` heading via `mergeSlotCacheUpdates` → syncs MEMFS → returns true → caller retries `computeSnippet`.

New shape: receives missing slots → calls `/resolve-slot` → makes a SECOND `computeSnippet` call with the resolutions inline → engine returns full Python → plugin writes Python to `# Python` + english_hash to frontmatter via `vault.process` → syncs MEMFS → returns true → caller can short-circuit retry (since the cache was just populated and the result is already in hand).

Cleaner control flow: instead of plugin retrying via the engine, the plugin does the round-trip and gets the result directly.

Sketch:

```typescript
private async handleSlotCacheMiss(
  snippetId: string,
  missing: SlotRequestPayload[],
  vaultPath: string,
  args: unknown[],
  inputs: Record<string, unknown>,
  errorPrefix?: string,
): Promise<ComputeResult | null> {
  // 1. Batch /resolve-slot. (Same as v0.2.70/v0.2.71.)
  const resolved = await resolveSlotsAlpha(...);
  if (failed) return null;

  // 2. Build slot_resolutions dict for the second compute call.
  const slotResolutions: Record<string, string> = {};
  for (const r of resolved.json.responses) {
    slotResolutions[r.cache_key] = r.python_expr;
  }

  // 3. Second compute call with slot_resolutions inline. Engine
  //    returns transpiled Python (and the compute result).
  const res = await computeSnippet(
    this.settings.serverUrl, vaultPath, snippetId, args, inputs,
    { slotResolutions });

  if (res.status !== 200) {
    // Slot resolutions didn't satisfy; defensive abort.
    return null;
  }

  // 4. Engine includes the transpiled Python in the response.
  //    Plugin writes # Python heading + english_hash to frontmatter.
  const python = res.json?.python;
  const englishHash = res.json?.english_hash;
  if (python && englishHash) {
    const file = locateSnippetFile(snippetId);
    if (file) {
      await this.app.vault.process(file, (body) =>
        writePythonAndEnglishHash(body, python, englishHash));
      // Sync MEMFS (same v0.2.71 pattern).
      try {
        const pyodideHost = getPyodideHost();
        if (pyodideHost) {
          const host = await pyodideHost.getInstance();
          const fresh = await this.app.vault.read(file);
          await host.syncUserVaultFile(file.path, fresh);
        }
      } catch (e) { console.warn(...); }
    }
  }

  return res.json;
}
```

The `computeSnippet` server-side endpoint accepts a new optional `slot_resolutions` field in the request body. The engine plumbs it through to `resolve_action_code(snippet, slot_resolutions=...)`.

### §4.2 — New pure-core helper: `writePythonAndEnglishHash`

Replace or extend `slot-cache-writer-core.ts`. Pure-core extraction. Takes a snippet body + Python string + english_hash + optional strip-stale-slots flag → returns the updated body with `# Python` heading written (or replaced) AND `english_hash:` in frontmatter (or replaced) AND optionally any pre-existing `# Slots` heading removed.

Test cases:
- Empty body + Python + hash → body with frontmatter + `# Python` + `english_hash`.
- Body with existing `# Python` → replace, preserve other sections.
- Body with existing `# Slots` heading → strip it AND write new `# Python`.
- Body with existing `english_hash:` in frontmatter → replace it.
- Body with `# English` + `# Dependencies` → write `# Python` between them in canonical order.
- Idempotency: same call twice → same output.

### §4.3 — `english-hash-core.ts` pure-core helper

Parallel to engine's `compute_english_hash`. Cross-language byte-for-byte parity test against Python helper (hardcoded expectation).

### §4.4 — `slot-cache-writer-core.ts` retirement

The `mergeSlotCacheUpdates` function (writing `# Slots` heading) is no longer called by production code. Two options:

- **Delete the file entirely** + its test file. Clean removal.
- **Keep the file marked deprecated** with a comment block noting v0.2.72 retirement. Tests stay green; nothing imports it.

CC's call. I lean toward deletion since `# Slots` is not part of the new contract; keeping the file invites confusion.

### §4.5 — TDD for plugin changes

For `handleSlotCacheMiss` rewrite: the test surface is more integration than unit because the plumbing crosses three layers (compute → /resolve-slot → vault.process). Following the same pattern as v0.2.71 hotfix: extract the load-bearing logic to pure-core helpers (`writePythonAndEnglishHash`, optionally a `handle-slot-miss-orchestration-core.ts`) and test those.

Plugin suite baseline: 482 (post-v0.2.71). New baseline: ~482 + new helper tests (~15) - retired `mergeSlotCacheUpdates` tests (~19 if file deleted) = ~478 target if we delete + add the new helpers.

If CC keeps `slot-cache-writer-core.ts` for back-compat: count stays at 482 + new tests = ~497.

## §5 — Bundled slot_demo fixture

The English facet of `~/projects/forge-moda/slot_demo.md` is unchanged (the slot syntax `{{...}}` is unchanged). What changes is what the FIRST compute leaves behind:

- v0.2.70/v0.2.71: leaves `# Slots` heading with hash→python_expr entry.
- v0.2.72: leaves `# Python` heading with full transpiled Python + `english_hash:` field in frontmatter.

No fixture change needed. The fixture's bundled `forge-moda/forge.toml` doesn't need a version bump (no fixture content changed). Per cc-prompt-queue.md §358 opt-out: declare explicitly in §0 of feedback: "no bundled-vault content change; English source identical to v0.2.71; only the compile-time artifact format changes."

## §6 — Release ship

Per cc-prompt-queue.md §339:

1. Bump `~/projects/forge-client-obsidian/manifest.json` per placeholder.
2. NO `~/projects/forge-moda/forge.toml` bump (per §5).
3. `scripts/release.sh` per current automation. Should be seventeenth consecutive clean run.
4. Tag pushed, GH release published, zip SHA reported.

No forge-transpile redeploy needed — server-side unchanged. The `/resolve-slot` endpoint contract is identical; only the plugin's use of the response changes.

## §7 — User-side smoke checklist (CC writes post-implementation)

Pre-conditions: install v0.2.72; vault has any prior slot_demo state (or fresh).

Step 1 (bug-fix reproduction / new-contract verification): open `slot_demo.md`. If it has a `# Slots` heading from v0.2.70/v0.2.71, note its presence (will be stripped on first compute under §4.2 strip-stale-slots option). Forge-click. Expected console:
- `Forge: slot cache miss { snippetId: 'forge-moda/slot_demo', missingCount: 1 }`
- `Forge: slot cache write succeeded { snippetId: 'forge-moda/slot_demo', count: 1 }`
- NO `STILL surfaces cache miss` (the defensive abort from v0.2.71).
- Output panel: storybook greeting.

Step 2 (verify the new on-disk shape): in Terminal:
```
grep -A 20 "^# Python" ~/forge-vaults/<vault>/forge-moda/slot_demo.md
grep "english_hash:" ~/forge-vaults/<vault>/forge-moda/slot_demo.md
grep -c "^# Slots" ~/forge-vaults/<vault>/forge-moda/slot_demo.md
```

Expected: `# Python` heading present with `def compute(context):` body containing the resolved greeting string literal. `english_hash:` field in frontmatter. `# Slots` heading count = 0.

Step 3 (cache hit): second Forge-click. Expected console: NO cache miss log. Output panel: same greeting. Deterministic, no LLM call.

Step 4 (cache invalidation on English edit): edit slot text → save → Forge-click. Expected: cache miss again (english_hash mismatch), re-resolve, new Python written, new english_hash written. Output: new greeting matching new style.

Step 5 (edit_mode python override): change frontmatter `edit_mode: python`, hand-edit `# Python` body to `def compute(context):\n    print("Manual override")\n`. Save. Forge-click. Expected: Output panel shows `Manual override`. No cache miss (mode-skip).

Step 6 (back-compat for legacy v0.2.70 # Slots heading): start with a vault file that has a stale `# Slots` heading from v0.2.70/v0.2.71. Forge-click. Verify the # Slots heading is stripped and replaced with # Python.

Failure modes section keyed by step. Include the v0.2.71 stack trace fragment as a regression canary.

## §8 — Auto-smoke CC must run

1. `npm run build` exit 0.
2. `npm test` — new baseline TBD. All green.
3. `pytest -q` on forge engine — ~592 target. All green.
4. `scripts/release.sh` clean.
5. Clean-vault smoke per cc-prompt-queue.md §296.
6. Live LLM round-trip per §7 Step 1 (defer to user if Anthropic key unavailable in sandbox).

## §9 — Feedback file shape

Per cc-prompt-queue.md §30-46 + §66-74 (mixed bug-fix + new-feature shape):

- Header block.
- §0 — release coordinates (manifest before/after, commit hashes, tag, GH URL, zip SHA, line counts). Explicit declaration: "no bundled-vault content change."
- §1 — TDD continuity for engine changes (5 checkpoints + cross-language hash parity result).
- §2 — TDD continuity for plugin changes (5 checkpoints).
- §3 — User-side smoke checklist per §7.
- §4 — Auto-smoke results (auto-verified vs deferred-to-user split).
- §5 — Constitution B7.3 reference (CC re-reads to confirm contract; reports any drift from the rewrite landed before this drain).
- §6 — Follow-ups noted but not built: (i) `slot-cache-writer-core.ts` retirement decision (kept deprecated vs deleted — note CC's choice); (ii) region-level caching deferred per Anticipated extensions; (iii) any v0.2.70/v0.2.71 vaults in the wild may have `# Slots` headings that get stripped on first compute under v0.2.72 (cosmetic).

Post the same report in chat per cc-prompt-queue.md §43.

## §10 — Self-contained context for CC

- **Constitution B7.3 (authoritative contract):** `~/projects/forge/docs/specs/constitution.md` (~line 430). Just rewritten before this drain queues. Read end-to-end.
- **Anticipated extensions item on region-level caching:** same file, search "Region-level transpilation caching." This is the deferred direction; do NOT implement region-level in this drain.
- **v0.2.70 design doc (for context):** `~/projects/forge/docs/investigations/slot-resolution-design.md`. Read but note: the cache-shape sections (§B) are SUPERSEDED by this drain.
- **v0.2.70/v0.2.71 prior work** (what we're replacing): `prompts/feedback/2026-06-07-0200-slot-resolution-phase-2-implementation.md`, `prompts/feedback/2026-06-07-0300-slot-cache-write-memfs-sync-hotfix.md`.
- **Pure-core convention:** cc-prompt-queue.md §86-118.
- **TDD discipline:** cc-prompt-queue.md §57-118.
- **The new "Assert cannot only with concrete error" HARD RULE** (forge-core protocol): `~/projects/forge-moda-bootstrap/cowork-forge-protocol.md` — search "Assert \"cannot\"". Applies to all assertions in this drain's feedback and chat output.

## §11 — Acceptance criteria

- Engine's `resolve_action_code` accepts optional `slot_resolutions` parameter; uses passed dict for resolver lookup; raises `SlotCacheMissError` on first pass when slots present and no resolutions provided.
- Engine reads `english_hash` from frontmatter; on cached `# Python` + matching hash, returns cached Python without transpile. On mismatch, falls through to transpile.
- Plugin's `handleSlotCacheMiss` rewritten: after `/resolve-slot`, makes second `computeSnippet` call with `slot_resolutions` inline; writes returned Python to `# Python` + `english_hash` to frontmatter; syncs MEMFS; returns the compute result directly to caller.
- `# Slots` heading neither written nor read by production code.
- Cross-language hash parity for `english_hash` verified (Python + TypeScript helpers).
- All tests green (engine + plugin suites).
- v0.2.72 released cleanly via release.sh.
- Smoke checklist §7 ready for user-side reproduction.
- Feedback per §9 shape.

If implementation surfaces an architectural problem (the design in §1 doesn't actually compose), STOP and route to `questions/`. Don't speculatively patch the design mid-drain.
