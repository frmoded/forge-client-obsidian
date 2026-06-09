---
timestamp: 2026-06-05T22:00:00Z
session_id: claude-code-drain-a4-1-extension-v0.2.57
prompt_modified: 2026-06-05T22:00:00Z
status: success
---

# Feedback — 2026-06-05-2200 A4.1 extension (sibling-subdir resolution) — v0.2.57

## §0 — Release coordinates

**Manifest:** `forge-client-obsidian/manifest.json` 0.2.56 → 0.2.57 (pre-bumped; SKIP_BUMP path — **seventh clean release** through v0.2.51's release.sh fix).

**Commits (commit-directly-to-main per memory rule):**

| Repo | SHA | Subject |
|---|---|---|
| forge | `f3bbf89` | `[…a4-1-extension-sibling-subdir-resolution] A4.1 extension — Probe 2 sibling-subdir resolution within caller's vault` |
| forge-client-obsidian | `0115e4d` | `v0.2.57 — engine bundle sync for A4.1 Probe 2 (sibling-subdir resolution)` |
| forge-client-obsidian | (empty `Release v0.2.57`) | tag points here |

**No forge-music or forge-moda touches** (per prompt — A4.1 is engine code; bundled vault content unchanged).

**Tag + release:**
- Tag `v0.2.57` pushed to `origin/main`.
- GH release: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.57>
- 4 assets (main.js, manifest.json, styles.css, `forge-client-obsidian-v0.2.57.zip` 34 MB).
- Zip SHA-256: `bcb1d58caf22b4ebbdff88aad2895b79ff3f84409ca7028fde5d623b9eb52288`
- install-latest.sh round-trip into smoke vault: clean.

**Line counts of changed files:**

| File | Lines | Note |
|---|---|---|
| `forge/forge/core/exceptions.py` | +25 | `AmbiguousSnippetResolutionError` |
| `forge/forge/core/graph_resolver.py` | +18 | Probe 2 block in `_lookup` |
| `forge/forge/core/snippet_registry.py` | +28 | `find_in_sibling_subdirs` helper |
| `forge/tests/core/test_a4_1_extension.py` | 273 | NEW. 9 TDD cases. |
| `forge-client-obsidian/assets/engine/forge/core/{3 files}` | bundle | mirrored from forge/. |
| `forge-client-obsidian/manifest.json` | 10 | version bump. |
| `forge-client-obsidian/INSTALL.md` | (5 pin replacements) | v0.2.56 → v0.2.57. |

## §1.1 — TDD test cases (9 per prompt)

1. **`test_probe_1_wins_when_caller_dir_has_the_snippet`** — Probe 1 wins when caller's own dir has the bare_id, even when siblings also have it.
2. **`test_probe_2_finds_exactly_one_sibling`** — Founding percussion_lab case: bare in sibling only, Probe 2 returns it.
3. **`test_probe_2_raises_ambiguity_for_two_or_more_siblings`** — `AmbiguousSnippetResolutionError` lists both candidates.
4. **`test_probe_2_falls_through_to_a4_when_no_sibling_matches`** — No siblings, no caller-dir match → `SnippetResolutionError` via A4 fall-through.
5. **`test_probe_2_excludes_caller_own_dir`** — Probe 2 does NOT double-count caller's own dir as a sibling.
6. **`test_probe_2_does_not_cross_vaults`** — Cross-vault subdir snippet NOT reachable; Probe 2 stays within caller's vault. Final result `SnippetResolutionError` because A4's `get_bare` only finds vault-root entries (not subdir entries in other vaults).
7. **`test_qualified_reference_skips_probes_entirely`** — Caller passes `forge-music/percussion_lab/solitary` qualified → direct dispatch.
8. **`test_resolution_is_idempotent`** — Same call twice → same result.
9. **`test_forge_music_v0_3_9_percussion_lab_integration`** — Production-shape regression. All 8 percussion_lab sections (solitary, companions, gathering, swarming, peak, dispersing, threading, resting) resolve via Probe 2 from `forge-music/percussion/murmuration`.

## §1.2 — Pre-fix verbatim test output

Collection-time `ImportError`:

```
ImportError while importing test module '/Users/odedfuhrmann/projects/forge/tests/core/test_a4_1_extension.py'.
Hint: make sure your test modules/packages have valid Python names.
Traceback:
  ...
tests/core/test_a4_1_extension.py:23: in <module>
    from forge.core.exceptions import SnippetResolutionError, AmbiguousSnippetResolutionError
E   ImportError: cannot import name 'AmbiguousSnippetResolutionError' from 'forge.core.exceptions'
=========================== short test summary info ============================
ERROR tests/core/test_a4_1_extension.py
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
=============================== 1 error in 0.07s ===============================
```

Standard pure-core extraction startup failure — helper module and exception don't exist yet.

## §1.3 — Fix landed (cited diffs)

### `forge/forge/core/exceptions.py` — new exception

```python
+class AmbiguousSnippetResolutionError(Exception):
+  """Raised by A4.1 Probe 2 (V2a v8) when a bare reference resolves to
+  two or more sibling subdirs in the caller's vault. ..."""
+
+  def __init__(self, reference: str, candidates: list):
+    self.reference = reference
+    # Stored sorted for deterministic error messages and test stability.
+    self.candidates = sorted(candidates)
+    super().__init__(self._format_message())
+
+  def _format_message(self) -> str:
+    pretty = ", ".join(self.candidates)
+    return (
+      f"Bare reference '{self.reference}' is ambiguous across sibling "
+      f"subdirs of the caller's vault. Candidates: {pretty}. "
+      f"Qualify the reference to choose one."
+    )
```

### `forge/forge/core/snippet_registry.py` — new helper

```python
+  def find_in_sibling_subdirs(
+      self, vault_name: str, caller_dir: str, bare_id: str,
+  ) -> list:
+    """Probe 2 helper for A4.1's V2a v8 extension. ..."""
+    snippets = self._vaults.get(vault_name, {})
+    matches = []
+    for bare in snippets.keys():
+      if "/" not in bare:
+        continue  # vault-root snippet, not a sibling-subdir candidate
+      head, _, tail = bare.partition("/")
+      if tail != bare_id:
+        continue  # different bare_id under this subdir
+      if head == caller_dir:
+        continue  # caller's own dir — Probe 1 territory
+      matches.append(bare)
+    matches.sort()
+    return matches
```

### `forge/forge/core/graph_resolver.py` — Probe 2 inserted between Probe 1 and fall-through

```python
     if caller_id is not None and "/" in caller_id:
       caller_vault, caller_bare = caller_id.split("/", 1)
       if "/" in caller_bare:
         caller_dir = caller_bare.rsplit("/", 1)[0]
+        # Probe 1 (V2a v5 A4.1): caller's own directory.
         sibling = self._registry.get_in_vault(caller_vault, f"{caller_dir}/{snippet_id}")
         if sibling is not None:
           return sibling
+        # Probe 2 (V2a v8 A4.1 extension): sibling subdirs within the
+        # caller's vault, excluding the caller's own dir already
+        # probed above. ...
+        candidates = self._registry.find_in_sibling_subdirs(
+            caller_vault, caller_dir, snippet_id)
+        if len(candidates) == 1:
+          return self._registry.get_in_vault(caller_vault, candidates[0])
+        if len(candidates) >= 2:
+          raise AmbiguousSnippetResolutionError(
+              snippet_id,
+              [f"{caller_vault}/{rel_id}" for rel_id in candidates])
     return self._registry.get_bare(snippet_id)
```

## §1.4 — Post-fix verbatim test output

```
tests/core/test_a4_1_extension.py::test_probe_1_wins_when_caller_dir_has_the_snippet PASSED [ 11%]
tests/core/test_a4_1_extension.py::test_probe_2_finds_exactly_one_sibling PASSED [ 22%]
tests/core/test_a4_1_extension.py::test_probe_2_raises_ambiguity_for_two_or_more_siblings PASSED [ 33%]
tests/core/test_a4_1_extension.py::test_probe_2_falls_through_to_a4_when_no_sibling_matches PASSED [ 44%]
tests/core/test_a4_1_extension.py::test_probe_2_excludes_caller_own_dir PASSED [ 55%]
tests/core/test_a4_1_extension.py::test_probe_2_does_not_cross_vaults PASSED [ 66%]
tests/core/test_a4_1_extension.py::test_qualified_reference_skips_probes_entirely PASSED [ 77%]
tests/core/test_a4_1_extension.py::test_resolution_is_idempotent PASSED  [ 88%]
tests/core/test_a4_1_extension.py::test_forge_music_v0_3_9_percussion_lab_integration PASSED [100%]

============================== 9 passed in 0.07s ===============================
```

All 9 pass.

### Python REPL probe-2 demonstration

Direct invocation against a tmpdir fixture matching forge-music v0.3.9's shape:

```python
>>> from forge.core.snippet_registry import SnippetRegistry
>>> from forge.core.graph_resolver import GraphResolver
>>> registry = SnippetRegistry()
>>> registry.scan(authoring_root)  # tmpdir with forge-music/percussion + percussion_lab
>>> resolver = GraphResolver(registry)
>>> hit = resolver.resolve("solitary",
...     caller_id="forge-music/percussion/murmuration")
>>> hit["snippet_id"]
'forge-music/percussion_lab/solitary'
```

The exact same call shape Murmuration's Python facet makes — resolves to `forge-music/percussion_lab/solitary` via Probe 2.

## §1.5 — Full suites + drift preflight

**`pytest -q`** (forge):
```
======================= 531 passed, 1 warning in 59.85s ========================
```
522 baseline + 9 new = 531/531 pass.

**`npm test`** (plugin):
```
ℹ tests 310
ℹ pass 310
ℹ fail 0
```
Unchanged — A4.1 is engine code; plugin tests unaffected.

**Engine-bundle drift preflight** (during `npm run sync-engine-bundle`):
```
=== sync-engine-bundle ===
Source: /Users/odedfuhrmann/projects/forge/forge
Bundle: /Users/odedfuhrmann/projects/forge-client-obsidian/assets/engine/forge

[copy]   forge/core/exceptions.py
[copy]   forge/core/graph_resolver.py
[copy]   forge/core/snippet_registry.py

Synced 3 new/changed, kept 25 already-current, deleted 0 orphans.
```

Bundle now matches source. Subsequent `npm run build` ran the drift check (via build-release-zip.mjs's preflight) and reported `Engine-bundle drift check: clean.` Release zip uploaded.

## §2 — Surprises during implementation

**Snippet-registry API surface vs the prompt's pseudocode.** The prompt described `registry.subdirs_of(vault)` + `registry.contains(qualified_id)` as the helper hooks; the actual `SnippetRegistry` has `_vaults: dict[str, dict[str, dict]]` and `get_in_vault(vault, bare_id)`. I named the new helper `find_in_sibling_subdirs(vault_name, caller_dir, bare_id)` — single-purpose for Probe 2 rather than a more general `subdirs_of`. Smaller surface, no need to expose internal `_vaults` shape. Returns a sorted list directly so Probe 2 can `len()` it and use indices for both the unique-match and ambiguity cases.

**Test fixture setup needed valid `forge.toml`.** First test run hit `read_manifest` parse failure because my stub `forge.toml` only had `name` + `version`; the dataclass requires `description` and accepts optional `domains`. Added both — fixed in one edit. Worth noting because the existing test suite probably has the same fixture pattern; if other tests start exercising library-vault scanning, they'll need the same fields.

**Cross-vault test (test 6) had to be revised.** My first version asserted A4 fall-through finds the cross-vault subdir snippet. That was wrong: `get_bare` walks `_order` and looks for bare keys at vault roots, NOT inside subdirs. A subdir snippet in another vault is unreachable bare. Revised the test to assert `SnippetResolutionError` — which is the correct enforcement of the "don't cross vaults" rule from prompt §Don'ts. The revised test better expresses the invariant: Probe 2 vault-scoped + A4 vault-root-scoped means cross-vault subdir bare refs are simply unreachable. Authors must qualify.

**`AmbiguousSnippetResolutionError` doesn't collide.** No existing exception in `forge/core/exceptions.py` by that name; verified by reading the (small) module before adding. Subclasses `Exception` directly (not `SnippetResolutionError`) because the failure mode is genuinely different — "too many matches" vs "no matches" — and callers may want to distinguish.

**Probe 2 stays inside the existing `if caller_id ... if "/" in caller_bare:` block.** Both new and old probes only fire when the caller is in a subdir (caller_dir is non-empty). A vault-root caller has no siblings to probe by definition. The structural placement preserves the v0.2.26 semantics for non-qualified callers (root-level snippet authoring) byte-for-byte.

**`AmbiguousSnippetResolutionError.candidates` stored sorted.** Deterministic order matters for tests (set comparison in test 3 already tolerates order; error message comparison would fail without sort). Side benefit: error messages display candidates in alphabetical order, which is easier for the user to scan.

**Seventh clean release.sh run.** v0.2.51's release.sh fix continues to deliver. Pre-bumped manifest → SKIP_BUMP path → empty Release commit → tag → push → zip → upload → install-latest.sh round-trip. Zero CC manual orchestration steps.

**Bundle sync caught the bundle-needs-update path correctly.** When the engine's `forge/core/*.py` changed, `sync-engine-bundle` reported `Synced 3 new/changed` + `kept 25 already-current`. The plugin's existing `isInScope` predicate (engine-bundle-drift-core.ts) already covers all of `forge/core/`; no script modifications needed.

## §3 — User-side smoke checklist

Per cc-prompt-queue.md 6a (paste-able commands) + 6b (CC validates before writing).

### Pre-conditions

- v0.2.57 plugin installed at `~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/` (verified via install-latest.sh round-trip during this drain).
- forge-music v0.3.9 (the percussion_lab content) is **NOT bundled** in v0.2.57 (the Level-2 drain that bundles it is queued separately — A4.1 is the prerequisite, but v0.2.57 only ships the resolver, not the content).

### Test A — A4.1 Probe 2 lives in the bundled engine (30 sec)

Verify the bundled `forge/core/graph_resolver.py` has the Probe 2 block:

```
grep -c "Probe 2" ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/assets/engine/forge/core/graph_resolver.py
```

Expected output:

```
2
```

(One in the inline doc comment, one in the `# Probe 2 (V2a v8 ...)` annotation in the code body.)

```
grep -c "AmbiguousSnippetResolutionError" ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/assets/engine/forge/core/exceptions.py
```

Expected output:

```
1
```

(The new exception class definition.)

Pass: both files present in the bundle with the v0.2.57 changes.

### Test B — pytest direct probe-2 demonstration (1 min, optional)

If you have a forge repo checkout locally:

```
cd ~/projects/forge && .venv/bin/pytest tests/core/test_a4_1_extension.py -v
```

Expected: `9 passed`.

Pass: 9/9 — the resolver behaves correctly when invoked directly.

### Test C — existing Forge-clicks still work (regression, 2 min)

Probe 2 is additive; existing snippet calls (vault-root snippets, caller-dir siblings) must still work.

1. Open Obsidian on `~/forge-vaults/smoke-v0.2.13`.
2. Cmd+P → "Reload app without saving" (picks up v0.2.57).
3. Open `forge-moda/create_water_particles.md` (existing free-English snippet with a Python facet).
4. Click the **Forge** button.
5. **Expected**: snippet executes as before; Forge Output panel shows whatever it normally would (or proceeds through /generate if needed). No new errors related to resolution.

```
grep -c "facet_form\|chip:" ~/forge-vaults/smoke-v0.2.13/forge-moda/create_water_particles.md
```

Expected: matches existing frontmatter (no new flags introduced).

Pass: existing snippet executes without regression.

### Test D — DEFERRED: forge-music v0.3.9 percussion_lab full validation

This validation depends on forge-music v0.3.9 being bundled into the plugin's `assets/vaults/forge-music/` AND the smoke vault having forge-music in its domains. **NEITHER condition is true today** — v0.2.57 only ships the resolver, not the content. The percussion_lab end-to-end (`Forge-click forge-music/percussion/murmuration.md` → renders multi-section percussion score) requires the **Level-2 drain** that bundles forge-music v0.3.9 alongside this resolver. That drain is queued separately.

When the Level-2 drain ships:
- It will bundle forge-music v0.3.9 (commit `489ce7d`) into the plugin's `assets/vaults/forge-music/`.
- It will bump the plugin minor or patch as appropriate.
- The smoke at that time will include: install, reload, forge.toml drift auto re-extract, open Murmuration, Forge-click, verify multi-section render, verify console log shows Probe 2 firing (e.g. `forge.core.graph_resolver` resolved `solitary` → `forge-music/percussion_lab/solitary`).

### Failure modes to watch for

- **Test A**: greps return 0 → bundle is stale (the install-latest.sh didn't actually unpack the new zip). Re-run install-latest.sh and check the SHA-256 round-trip.
- **Test C**: regression in existing snippets → Probe 2 might be incorrectly firing for callers that don't have subdir structure. Check console for `AmbiguousSnippetResolutionError` or unexpected `SnippetResolutionError`. The new Probe 2 should be gated on `caller_id` having `/` AND `caller_bare` also having `/` (i.e. caller is in a subdir). If those gates fail, Probe 2 should be silent.

### End-state cleanup

None. v0.2.57 is purely additive; no temp files written.

---

**Audit-trail close:** prompt moves to `prompts/done/`. Drain stops; queue empty after this prompt.

**Standing followups (now 4, was 5 — A4.1 closed):**
1. forge-music v0.3.9 Level-2 bundle drain (now unblocked — A4.1 shipped).
2. forge-music v2 `_chips.md` — their lane.
3. forge-music.bak.0.3.0/ scanning gate — future chip-palette polish drain.
4. Stage 3+ E-- migration roadmap.
5. (cc) glue-to-pure-core audit candidates.
