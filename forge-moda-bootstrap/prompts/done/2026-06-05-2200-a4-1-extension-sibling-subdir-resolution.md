# A4.1 extension — sibling-subdir resolution within the caller's vault

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end. Recent amendments include 6a/6b paste-able-commands (2026-06-05), bundled-vault forge.toml bump rule (2026-06-05), and the sharpened pre-drain re-read mandate (2026-06-05). The constitution amendment this prompt implements landed in V2a v8 — re-read constitution A4.1 before writing any code.

## Scope

Implement the V2a v8 A4.1 extension: extend the engine's bare-ID resolver to probe **sibling subdirs of the caller's vault** as Probe 2 in the ordered probe sequence. Forge-music v0.3.9 percussion-lab decomposition (commit `489ce7d`) is blocked on this — Murmuration in `forge-music/percussion/` calls `context.compute("solitary")` to a snippet in `forge-music/percussion_lab/`, which v0.3.9 cannot resolve because the current A4.1 only probes the caller's own subdir.

The amended A4.1 (constitution V2a v8) defines the resolver behavior:
1. Caller's own directory: `{caller_vault}/{caller_dir}/{bare_id}` — match wins.
2. **NEW**: Sibling subdirs of the caller's vault: `{caller_vault}/*/{bare_id}` excluding caller's own. Exactly-one match wins. Two-or-more matches raises `AmbiguousSnippetResolutionError(bare_id, [candidates...])`.
3. Fall through to A4 resolution order.

What this prompt does NOT do:
- Change A4 resolution semantics (vault-walk order via declared deps).
- Add cross-vault sibling resolution (siblings are within the caller's vault only).
- Touch qualified-reference handling (per A4, qualified IDs dispatch unchanged).
- Add a `chip:` frontmatter override or any UI surface — purely engine resolution.
- Bundle forge-music v0.3.9 into the plugin (that's forge-music's Level-2 drain, which unblocks once this ships).

## Why

Per V2a v8 constitution rationale: authors commonly refactor a single subdir into content + lab clusters. Without Probe 2, every cross-cluster call must be qualified, OR every lab snippet must live in the same directory as its caller. Both raise the cost of intra-vault composability — counter to the Mission's "composable" property.

Concrete blocker: forge-music v0.3.9 percussion-lab Level-2 (plugin bundle + plugin release) is waiting for this. Until shipped, the percussion_lab decomposition exists in the source repo but cannot ship to cohort vaults — they'd hit `SnippetResolutionError` on every Murmuration play.

## Files likely to touch

Engine-side:
- **`~/projects/forge/forge/core/snippet_registry.py`** — primary resolver location. Find where the caller-scoped A4.1 probe is implemented (probably around `resolve_bare_id` or equivalent); add Probe 2 after it. Tests in `forge/tests/core/test_snippet_registry.py` or sibling.
- **`~/projects/forge/forge/core/exceptions.py`** — new `AmbiguousSnippetResolutionError` (or whatever the existing exception module names; CC reads to confirm).
- **`~/projects/forge/tests/core/test_a4_1_extension.py`** (NEW or extend existing) — TDD cases.

Plugin-side: nothing. The engine's resolver is what runs inside Pyodide; the plugin doesn't override it.

Bundle:
- **`~/projects/forge-client-obsidian/scripts/sync-engine-bundle.mjs`** — should pick up the changed `forge/forge/core/` files automatically. Verify drift detection clean.
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

(No forge-moda or forge-music forge.toml bumps. The resolver is engine code; bundled vault content is unchanged.)

## Files to read first (for accuracy)

- `~/projects/forge/docs/specs/constitution.md` — re-read end-to-end per the protocol re-read rule. A4.1 is now V2a v8; old A4.1 was V2a v5 (single-directory probe only).
- `~/projects/forge/forge/core/snippet_registry.py` — current resolver implementation. Find the existing A4.1 caller-scoped probe; the new Probe 2 sits between it and the A4 fall-through.
- `~/projects/forge/forge/core/exceptions.py` — see what's there; pick or add the right place for `AmbiguousSnippetResolutionError`.
- `~/projects/forge-music/forge.toml` (current 0.3.9) + `~/projects/forge-music/percussion/murmuration.md` (the bare reference Probe 2 must resolve).

## Implementation notes

### Probe 2 shape (pseudocode)

```python
def resolve_bare_id(bare_id: str, caller_qualified_id: str, registry: SnippetRegistry) -> str:
    # Probe 1 (existing A4.1): caller's own directory.
    caller_vault, caller_dir = parse_caller_subdir(caller_qualified_id)
    probe_1 = f"{caller_vault}/{caller_dir}/{bare_id}" if caller_dir else None
    if probe_1 and registry.contains(probe_1):
        return probe_1

    # Probe 2 (NEW V2a v8): sibling subdirs within caller's vault.
    if caller_vault:
        sibling_matches = [
            f"{caller_vault}/{sibling_dir}/{bare_id}"
            for sibling_dir in registry.subdirs_of(caller_vault)
            if sibling_dir != caller_dir
            and registry.contains(f"{caller_vault}/{sibling_dir}/{bare_id}")
        ]
        if len(sibling_matches) == 1:
            return sibling_matches[0]
        if len(sibling_matches) >= 2:
            raise AmbiguousSnippetResolutionError(bare_id, sibling_matches)

    # Probe 3 (existing A4 fall-through): walk vault dependency order.
    return resolve_via_a4(bare_id, registry)
```

The exact API of `registry.subdirs_of(vault)` and `registry.contains(qualified_id)` depends on the existing snippet_registry shape. CC reads to confirm; renames as needed.

### Tests — TDD discipline

`test_a4_1_extension.py` (NEW or extension of existing test file):

1. **Probe 1 still wins when caller's own dir has the snippet.** `solitary` in BOTH `forge-music/percussion/` and `forge-music/percussion_lab/`; caller is `forge-music/percussion/murmuration` → resolves to `forge-music/percussion/solitary` (probe 1 wins, probe 2 not consulted).

2. **Probe 2 finds exactly-one sibling.** `solitary` ONLY in `forge-music/percussion_lab/`; caller is `forge-music/percussion/murmuration` → resolves to `forge-music/percussion_lab/solitary` via probe 2.

3. **Probe 2 raises ambiguity for 2+ siblings.** `solitary` in `forge-music/percussion_lab/` AND `forge-music/percussion_b/`; caller is `forge-music/percussion/murmuration` → raises `AmbiguousSnippetResolutionError("solitary", ["forge-music/percussion_b/solitary", "forge-music/percussion_lab/solitary"])`. Error message names both candidates so author can qualify.

4. **Probe 2 falls through to A4 when no sibling matches.** `solitary` doesn't exist anywhere in `forge-music`; caller is `forge-music/percussion/murmuration` → A4 fall-through fires (probably raises `SnippetResolutionError` since `solitary` isn't anywhere).

5. **Probe 2 respects caller's own dir exclusion.** `solitary` in `forge-music/percussion/`; caller is `forge-music/percussion/murmuration` → resolves via probe 1 (which excludes the existing logic from being affected). Verify probe 2 NEVER probes the caller's own dir.

6. **Cross-vault siblings NOT probed.** `solitary` in `forge-moda/percussion_lab/` (different vault); caller is `forge-music/percussion/murmuration` → probe 2 does NOT find `forge-moda/percussion_lab/solitary` (not the caller's vault). Falls through to A4.

7. **Qualified reference unaffected.** Caller calls `context.compute("forge-music/percussion_lab/solitary")` (already qualified) → dispatches directly to A4-style qualified resolution; probes 1+2 skipped entirely.

8. **Idempotent**: resolving the same bare_id twice yields equal result.

9. **Forge-music v0.3.9 integration**: load the actual `forge-music/` vault into a test fixture, simulate Murmuration's `context.compute("solitary")` call → resolves to `forge-music/percussion_lab/solitary` (the actual production path). Regression test that this resolver change unblocks v0.3.9 specifically.

### Pre-fix verbatim output requirement

Per cc-prompt-queue.md TDD discipline (HARD RULE): write failing tests FIRST, run them, capture verbatim output in §1.2 of the feedback. Test 9 (forge-music integration) MUST fail pre-fix with `SnippetResolutionError("solitary" not found in caller's directory)` or equivalent. The post-fix output (in §1.4) shows it resolving cleanly.

### Out-of-bundle drift check

After the engine change lands and the bundle sync runs, the engine-bundle-drift preflight (per v0.2.30 work) should be clean. Verify in §1.5.

## Tests

### Auto-verifiable by CC

- `pytest -q` in forge → expect `X/X` with ~9 new tests.
- `npm test` in forge-client-obsidian → unchanged (no plugin code changes).
- Engine-bundle drift preflight clean at release time.
- Clean-vault smoke for the new resolver behavior:
  - Build release zip.
  - Install to a fresh test vault with both forge-moda + forge-music declared in domains.
  - Drop a tiny test setup mirroring the percussion_lab scenario.
  - Boot Pyodide; invoke the resolver via a CLI-style script; assert probe 2 fires correctly.
  - Tear down.

CC may also run a direct Python REPL against the test vault (like v0.2.30's freeze investigation pattern) to confirm probe 2 fires in production-shape conditions.

### Deferred to user (CC writes §3 per 6a/6b)

Per cc-prompt-queue.md 6a/6b: paste-able commands for file-state checks; UI prose for Forge-click verification.

§3 user-side smoke exercises:

1. Install v0.X.X via BRAT → forge-installer in a vault with forge-music declared.
2. After install, ensure forge-music v0.3.9 (the percussion_lab version) is extracted. The plugin's v0.2.38 auto re-extract should fire on the forge.toml version bump.
3. Forge-click `forge-music/percussion/murmuration.md`. Expected: renders a multi-section percussion score (NOT a `SnippetResolutionError`).
4. Open `forge-music/percussion_lab/solitary.md`. Forge-click it directly. Expected: renders the solitary section only.
5. Verify `forge-music/blues/song.md` still Forge-clicks correctly (regression — probe 1 still works for the legacy case).

Failure modes section + end-state cleanup per protocol.

## Out of scope

- Bundling forge-music v0.3.9 into the plugin (forge-music's Level-2 drain — separate, unblocks after this ships).
- Changing the chip palette's discovery scope (it follows libraryDirNames; doesn't touch resolution).
- A "Canonicalize all bare references in this snippet" tool. Future polish.
- Optimizing the sibling-walk for vaults with many subdirs. Premature; profile first.

## Don'ts

- **Don't change qualified-reference handling.** A4 paths stay; only Probe 2 is new.
- **Don't make Probe 2 probe nested subdirs** (e.g., `forge-music/foo/bar/snippet`). Sibling subdirs are one level deep, matching caller's depth.
- **Don't make Probe 2 probe across vaults.** `forge-music/percussion/murmuration` calling `solitary` does NOT find `forge-moda/percussion_lab/solitary`.
- **Don't change the caller's-own-dir-wins semantic.** Probe 1 is the tie-breaker; probe 2 doesn't override it.
- **Don't bump versions concretely** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **Don't batch feedback at end of multi-phase drain.**

## Report when done

Standard §0–§3 per cc-prompt-queue.md:

- **§0** — manifest before/after for plugin, commit SHAs for forge + plugin, push, tag, release URL, SHA round-trip, line counts. No forge-music or forge-moda touches.
- **§1.1** — TDD test cases (9 above + any CC extras).
- **§1.2** — pre-fix verbatim test output (test 9 + others fail because probe 2 doesn't exist).
- **§1.3** — fix landed: cited line-number diffs in snippet_registry.py + any exception module changes.
- **§1.4** — post-fix verbatim test output (all 9 pass) + the Python REPL probe-2 demonstration.
- **§1.5** — full `pytest -q` (forge) + `npm test` (plugin) + drift preflight output.
- **§2** — surprises during implementation. Specifically: the actual snippet_registry.py API CC found vs the pseudocode shape; any edge cases the 9 tests didn't anticipate; any concerns about the exception name `AmbiguousSnippetResolutionError` collision with existing exceptions.
- **§3** — user-side smoke checklist per cc-prompt-queue.md 6a/6b.
