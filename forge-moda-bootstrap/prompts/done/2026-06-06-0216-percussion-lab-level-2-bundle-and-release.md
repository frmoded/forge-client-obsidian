<!-- author: forge-music-cowork
     second-pass review: not requested — straightforward Level-2 bundle of already-committed forge-music content
     focus: ship forge-music v0.3.9 (percussion_lab decomposition) to cohort vaults via plugin release v0.2.60 -->

# Percussion Lab — Level-2 bundle + plugin release v0.2.60

## Scope

Ship forge-music v0.3.9 (the percussion_lab decomposition of Murmuration) to cohort vaults via a plugin release. Both prerequisites that previously blocked this drain are now in place:

- **A4.1 extension shipped in plugin v0.2.57** (`f3bbf89` in forge engine). Cross-subdir bare-reference resolution within a single vault now works in the bundled-library-subdir distribution shape per constitution V2a v8. Murmuration's `context.compute("solitary")` resolves correctly to `forge-music/percussion_lab/solitary`.
- **`_instrument_key` percMapPitch fix in forge `08db2ed`**, already carried into the plugin bundle by forge-core's v0.2.58 engine-bundle re-sync (verified: source `forge/forge/music/lib.py` is byte-equal to bundled `forge-client-obsidian/assets/engine/forge/music/lib.py`). closed_hihat / open_hihat no longer collide during `sequence()` / `voices()` merging.

This drain syncs forge-music vault content (source → bundle), bumps plugin patch version, builds + smokes + tags + releases.

## Files to modify

All paths absolute.

### Sync (bundle mirror)

Sync `forge-music/` source vault content INTO `forge-client-obsidian/assets/vaults/forge-music/`. The bundled vault is currently at v0.3.8 (monolithic Murmuration, no percussion_lab/); source is at v0.3.9 (decomposed Murmuration, 9 percussion_lab files). Specifically:

- `forge-client-obsidian/assets/vaults/forge-music/forge.toml` — bump bundled `version = "0.3.8"` → `version = "0.3.9"` (matches source).
- `forge-client-obsidian/assets/vaults/forge-music/percussion/murmuration.md` — replace with source version (decomposed orchestrator + bare-basename Dependencies block).
- `forge-client-obsidian/assets/vaults/forge-music/percussion_lab/` — NEW directory; copy all 9 files from `forge-music/percussion_lab/`:
  - `README.md`
  - `solitary.md`
  - `companions.md`
  - `gathering.md`
  - `swarming.md`
  - `peak.md`
  - `dispersing.md`
  - `threading.md`
  - `resting.md`

### Plugin manifest

- `forge-client-obsidian/manifest.json` — bump `"version": "0.2.59"` → `"version": "0.2.60"`.
- `forge-client-obsidian/INSTALL.md` — replace `v0.2.59` → `v0.2.60` references (sed replace-all).

### NOT modified (explicit)

- `forge-music/` source vault — already at v0.3.9; nothing to change. This drain only mirrors source into the plugin bundle.
- `forge/forge/music/lib.py` and engine source — already current and already in bundle (verified byte-equal).
- `forge-client-obsidian/assets/engine/forge/` — engine bundle is already in sync per forge-core's v0.2.58 work. CC should NOT run `sync-engine-bundle` (engine is current); however CC SHOULD verify byte-equality as a preflight check.
- The constitution.
- `forge-client-obsidian/src/*` — no plugin code changes in this drain. (B7.2 wikilink interception shipped in v0.2.58/59; A4.1 in v0.2.57. Both are in the current code path.)
- Any forge-music content beyond what was already committed at v0.3.9.
- forge-moda content and its bundle mirror — out of scope for this music-domain release.

## Why

The percussion_lab decomposition has been validated in Path A (forge-music source vault directly) per the 2026-06-04-2228 preview drain smoke. Behavior preservation is confirmed by `test_murmuration_after_refactor_matches_pre_refactor_structure`. The artifact is artistically right (user verified "promot" after smoking) and structurally sound.

Level-2 bundles it into the plugin so cohort users (who consume forge-music via the bundled-library-subdir distribution per A5.3) get the decomposed Murmuration + the 8 reusable section snippets. Once shipped:

- Murmuration in cohort vaults plays identically (behavior preserved end-to-end).
- The 8 section snippets become available for chip-discovery (forge-core's plumbing in v0.2.58+ should auto-discover them — verification step in user-side smoke).
- A composer in a cohort vault can author a sister piece composed of the percussion_lab vocabulary.

The forge-music release stream advances: v0.3.8 was Murmuration-with-mark_dynamics; v0.3.9 is Murmuration-decomposed. Plugin advances v0.2.59 → v0.2.60 to carry it.

## Implementation steps

### 1. Verify preconditions

- `cd /Users/odedfuhrmann/projects/forge-music && git log --oneline -3` — confirm HEAD is the wikilink-fix commit (`a86d517`) or later; tag `v0.3.9` exists.
- `cd /Users/odedfuhrmann/projects/forge && git log --oneline -3` — confirm HEAD includes `08db2ed` (`_instrument_key` percMapPitch fix).
- `cd /Users/odedfuhrmann/projects/forge-client-obsidian && git log --oneline -5` — confirm HEAD is at or after `9735459 Release v0.2.59` and the working tree is clean.
- Byte-equality preflight: `diff /Users/odedfuhrmann/projects/forge/forge/music/lib.py /Users/odedfuhrmann/projects/forge-client-obsidian/assets/engine/forge/music/lib.py` should produce no output (already byte-equal).

### 2. Sync forge-music vault content

CC uses the existing vault-bundle-sync mechanism if one exists; otherwise performs the file operations directly (cp + manual diff verification). Sequence:

a. Copy `/Users/odedfuhrmann/projects/forge-music/percussion/murmuration.md` over `forge-client-obsidian/assets/vaults/forge-music/percussion/murmuration.md`. Verify byte-equal after copy.

b. Update `forge-client-obsidian/assets/vaults/forge-music/forge.toml` so `version = "0.3.9"`.

c. Create `forge-client-obsidian/assets/vaults/forge-music/percussion_lab/` and copy all 9 files from `forge-music/percussion_lab/`. After copy: verify `diff -r forge-music/percussion_lab/ forge-client-obsidian/assets/vaults/forge-music/percussion_lab/` produces no output.

d. Confirm no other files in the bundled vault changed (forge-music/blues/, percussion/loom.md, etc., should be untouched). `diff -r` of source vs bundle for those subdirs should pass.

### 3. Plugin manifest + INSTALL.md

- `forge-client-obsidian/manifest.json` → `"version": "0.2.60"`.
- `forge-client-obsidian/INSTALL.md` → `v0.2.59` → `v0.2.60` (sed -i replace-all). Verify other version references didn't sneak in (only the one INSTALL.md).

### 4. Build the release zip

Run the existing release-zip build script (likely `npm run build-release-zip` or similar — CC discovers from package.json). Output: `forge-client-obsidian/dist/forge-client-obsidian-v0.2.60.zip`.

Compute SHA256 and log.

### 5. Clean-vault smoke (HARD RULE per the cowork protocol for release-shipping prompts)

In a fresh temp directory (e.g., `/tmp/forge-music-v0.2.60-smoke/`):

a. Unzip the release artifact.

b. Verify install structure:
   - Top-level `forge-client-obsidian/` directory exists with `manifest.json`, `main.js`, `styles.css`.
   - `forge-client-obsidian/assets/engine/forge/music/lib.py` is byte-equal to the source engine `forge/forge/music/lib.py`.
   - `forge-client-obsidian/assets/vaults/forge-music/forge.toml` reads `version = "0.3.9"`.
   - `forge-client-obsidian/assets/vaults/forge-music/percussion_lab/` exists with all 9 files (`README.md` + 8 section snippets).
   - `forge-client-obsidian/assets/vaults/forge-music/percussion/murmuration.md` is the DECOMPOSED orchestrator (`grep -c 'context.compute' ...` returns exactly 8 — one per section call).
   - `forge-client-obsidian/assets/vaults/forge-music/percussion/murmuration.md` Dependencies block uses bare wikilinks (`grep '\[\[solitary\]\]' ...` finds a match; `grep '\[\[\.\./percussion_lab/' ...` finds NO matches).

c. Confirm the bundled engine + bundled vault check out per the SHA + structure expectations.

### 6. Commit + tag + push + release

- `cd forge-client-obsidian && git add manifest.json INSTALL.md assets/vaults/forge-music/`. Explicit paths only.
- `git commit -m "[2026-06-06-0216-percussion-lab-level-2-bundle-and-release] v0.2.60 — bundle forge-music v0.3.9 (percussion_lab decomposition)"`. Body: brief — mentions the prerequisite A4.1 + percMapPitch fix were already shipped in prior releases; this drain carries the vault content into the bundle.
- `git tag v0.2.60`.
- `git push origin main --tags`.
- `gh release create v0.2.60` with release zip attached. Title: "v0.2.60 — forge-music v0.3.9 percussion_lab decomposition". Body: short — what shipped, why, and the engine fixes from v0.2.57/58 that made it possible.

Verify GH release lands and SHA round-trips against the local zip.

### 7. Tests

- `cd /Users/odedfuhrmann/projects/forge && pytest -q` — full forge suite. Expected: 539 passing (no test changes in this drain). Confirms the bundled engine matches.
- `cd /Users/odedfuhrmann/projects/forge-client-obsidian && npm test` — full plugin suite. Report pass count.

Both should pass at current baseline; this drain doesn't add tests, just bundles already-tested content.

## Out of scope

- DO NOT modify forge-music source vault (it's already at v0.3.9; this drain doesn't bump forge-music further).
- DO NOT modify forge engine source.
- DO NOT touch the constitution.
- DO NOT touch forge-moda content or its bundle mirror.
- DO NOT modify plugin source code (`forge-client-obsidian/src/*`) — the A4.1 resolver path and B7.2 wikilink interception are already shipped in current plugin code.
- DO NOT add the chip-discovery patches (forge-core's lane; if they ship in a separate plugin release, that's independent of this drain).
- DO NOT refactor percussion_lab/*.md to drop the 7-parts-always boilerplate — that's a future forge-music cleanup drain.
- DO NOT bump forge.toml in forge-music source (it's already at v0.3.9; only the BUNDLED forge.toml gets updated to mirror source).
- DO NOT touch forge-music's `.forge/` or `.obsidian/` (those are the user's pre-existing untracked items per the Level-1 promote feedback).

## Report when done

Write feedback to `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-0216-percussion-lab-level-2-bundle-and-release.md`:

0. **Scope-respect checklist.**
   - ✓ forge-music source unchanged.
   - ✓ forge engine source unchanged.
   - ✓ Only forge-client-obsidian touched (bundle vault content + manifest + INSTALL.md).
   - ✓ No plugin code changes.
1. **Preconditions verified** — git heads + byte-equality preflight result.
2. **Bundle sync** — what was copied; byte-equal verification per file/directory; before/after on bundled forge.toml version.
3. **Manifest + INSTALL.md** — diff before/after.
4. **Release zip** — path, size, SHA256.
5. **Clean-vault smoke** — paste raw `ls` / `grep` output proving all the structure checks from step 5.
6. **Commit + tag + push** — SHA, tag name, GH Release URL, SHA round-trip from `gh release view --json assets`.
7. **Tests** — forge suite pass count, plugin suite pass count.
8. **Surprises / deviations** — anything that diverged from the prompt.
9. **Standing followups updated** — drop "Level-2 bundle drain"; carry forward the others.

## Don'ts

- Don't sync the engine bundle (`sync-engine-bundle`) — engine is already in sync. CC could run it as a no-op verification (expect zero changes), but should NOT commit any changes it produces. If `sync-engine-bundle` reports drift, STOP and ROUTE TO QUESTIONS — the prompt's premise is wrong; we'd need to investigate.
- Don't bump forge-music source vault.
- Don't add tests in this drain — it's a bundle/release, not a content/code change.
- Don't ship the chip-discovery fixes for percussion_lab here — those are forge-core's drain to design and ship; they may or may not be ready.
- Don't force-push or rewrite tags.
- Don't sign tags unless the repo's existing convention does.
- Don't `git add .` — explicit paths only.
